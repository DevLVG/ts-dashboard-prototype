const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SUPABASE_URL = "https://vaivysetsmtsxnxnhefk.supabase.co";
const SERVICE_KEY = fs.readFileSync(path.join(os.homedir(), ".claude", ".supabase_trio_service_key"), "utf8").trim();
const ORIGIN = process.env.QA_ORIGIN || "http://localhost:4327";
const OUT_DIR = path.join(os.homedir(), "Work/Trio-Sporting/CLEVER/Cockpit/deliverables/review-fixes-2026-08-04/fix-27-bs-budget");

async function getAuthHash(email) {
  const genRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const genData = await genRes.json();
  const actionLink = genData.action_link || genData.properties?.action_link;
  const verifyRes = await fetch(actionLink, { redirect: "manual" });
  const location = verifyRes.headers.get("location");
  return location.slice(location.indexOf("#") + 1);
}

async function runViewport(browser, hash, width, height, tag) {
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const issues = [];
  page.on("console", (msg) => { if (msg.type() === "error") issues.push(msg.text()); });
  page.on("pageerror", (err) => issues.push("pageerror: " + err.message));

  await page.goto(`${ORIGIN}/balance#${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // Click Budget toggle
  await page.locator('button:has-text("Budget")').first().click();
  await page.waitForTimeout(1200);

  const bodyText = await page.locator("body").innerText();
  const bodyTextLower = bodyText.toLowerCase();
  const explainerVisible = bodyTextLower.includes("budget horizon starts jul '26");
  // Table column headers render through a CSS uppercase transform, which
  // Chromium's innerText reflects — compare case-insensitively.
  const actualLabelVisible = bodyTextLower.includes("actual — last close");
  const planLabelVisible = /plan — aug '26/i.test(bodyText);
  const zeroWordCount = (bodyText.match(/\bSAR 0\b/g) || []).length;

  const circleAria = await page.locator('[role="img"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));

  console.log(`--- ${tag} (${width}x${height}) ---`);
  console.log("Explainer on-screen:", explainerVisible);
  console.log('"Actual — last close" label present:', actualLabelVisible);
  console.log('"Plan — Aug \'26" label present:', planLabelVisible);
  console.log("Fabricated 'SAR 0' occurrences:", zeroWordCount);
  console.log("Circle aria-labels:", JSON.stringify(circleAria, null, 2));
  console.log("Console/page issues:", JSON.stringify(issues));

  await page.screenshot({ path: path.join(OUT_DIR, `budget-mode-${tag}-${width}.png`), fullPage: true });

  await context.close();
  return { explainerVisible, actualLabelVisible, planLabelVisible, zeroWordCount, issues };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();

  // Fresh magic-link hash PER context — reusing one hash across two
  // browser contexts intermittently breaks the second session (refresh
  // token rotates on first use), a test-script artifact, not a product bug.
  const hash1 = await getAuthHash("marcello.piccardo@leveredge.pro");
  const r1440 = await runViewport(browser, hash1, 1440, 1100, "desktop");
  const hash2 = await getAuthHash("marcello.piccardo@leveredge.pro");
  const r390 = await runViewport(browser, hash2, 390, 900, "mobile");

  const pass = r1440.explainerVisible && r1440.actualLabelVisible && r1440.planLabelVisible && r1440.zeroWordCount === 0
    && r390.explainerVisible && r390.actualLabelVisible && r390.planLabelVisible && r390.zeroWordCount === 0
    && r1440.issues.length === 0 && r390.issues.length === 0;

  console.log("\n=== OVERALL:", pass ? "PASS" : "FAIL", "===");

  await browser.close();
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
