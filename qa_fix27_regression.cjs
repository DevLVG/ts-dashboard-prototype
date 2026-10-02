const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SUPABASE_URL = "https://vaivysetsmtsxnxnhefk.supabase.co";
const SERVICE_KEY = fs.readFileSync(path.join(os.homedir(), ".claude", ".supabase_trio_service_key"), "utf8").trim();
const ORIGIN = "http://localhost:4327";
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

async function main() {
  const browser = await chromium.launch();
  const hash = await getAuthHash("marcello.piccardo@leveredge.pro");
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const issues = [];
  page.on("pageerror", (err) => issues.push("pageerror: " + err.message));
  await page.goto(`${ORIGIN}/balance#${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // 1. Default PY_DATE mode — unaffected, should show normal Same Date Last Year comparison
  let bodyText = await page.locator("body").innerText();
  console.log("1. Default (Same Date Last Year) — no Budget explainer shown:", !bodyText.includes("Budget horizon starts"));
  console.log("   Circle count:", await page.locator('[role="img"]').count());

  // 2. Start of Year
  await page.locator('button:has-text("Start of Year")').click();
  await page.waitForTimeout(800);
  bodyText = await page.locator("body").innerText();
  console.log("2. Start of Year — no Budget explainer shown:", !bodyText.includes("Budget horizon starts"));

  // 3. Budget + explicit past month BEFORE horizon (not Today) -> honest dash, no fallback
  await page.locator('button:has-text("Budget")').click();
  await page.waitForTimeout(800);
  // open the As-of dropdown and pick the earliest available month
  await page.locator('button:has-text("Today")').first().click();
  await page.waitForTimeout(300);
  const options = await page.locator('[role="option"]').allTextContents();
  console.log("3. As-of options available:", JSON.stringify(options));
  // pick the LAST option in the list (oldest month, sorted descending after Today)
  await page.locator('[role="option"]').last().click();
  await page.waitForTimeout(1000);
  bodyText = await page.locator("body").innerText();
  const circleAria = await page.locator('[role="img"]').evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  console.log("   Selected historical month + Budget -> circle aria-labels:", JSON.stringify(circleAria, null, 2));
  console.log('   Shows "No Budget available" reason (honest dash, no fallback for explicit past month):', bodyText.includes("No Budget available for"));
  console.log('   Explainer present (genuinely-unavailable variant):', bodyText.includes("Budget horizon starts Jul '26 → Dec '27"));
  console.log("   Zero fabricated 'SAR 0':", (bodyText.match(/\bSAR 0\b/g) || []).length === 0);

  await page.screenshot({ path: path.join(OUT_DIR, "regression-historical-month-budget-1440.png"), fullPage: true });
  console.log("Page errors:", JSON.stringify(issues));

  await context.close();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
