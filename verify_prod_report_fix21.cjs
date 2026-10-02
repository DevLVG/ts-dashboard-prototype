// Production live-verification for fix-21 (Report PDF v2) — generates ONE
// real PDF from the live production deployment (not localhost) to confirm
// the shipped build behaves identically to the dev-server QA run.
const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SUPABASE_URL = "https://vaivysetsmtsxnxnhefk.supabase.co";
const SERVICE_KEY = fs.readFileSync(path.join(os.homedir(), ".claude", ".supabase_trio_service_key"), "utf8").trim();
const PROD_ORIGIN = "https://ts-dashboard-prototype.vercel.app";
const OUT_DIR = path.join(os.homedir(), "Work/Trio-Sporting/CLEVER/Cockpit/deliverables/review-fixes-2026-08-03/fix-21-report-v2");

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
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const hash = await getAuthHash("marcello.piccardo@leveredge.pro");
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 }, acceptDownloads: true });
  const page = await context.newPage();
  const issues = [];
  page.on("console", (msg) => { if (msg.type() === "error") issues.push(msg.text()); });
  page.on("pageerror", (err) => issues.push("pageerror: " + err.message));

  await page.goto(`${PROD_ORIGIN}/report#${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const h1 = await page.locator("h1").first().textContent().catch(() => null);
  console.log("Prod page H1:", h1);

  await page.screenshot({ path: path.join(OUT_DIR, "00-prod-live-verify-preview.png"), fullPage: true });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.getByRole("button", { name: "Generate PDF" }).click(),
  ]);
  const pdfPath = path.join(OUT_DIR, "00-prod-live-verify.pdf");
  await download.saveAs(pdfPath);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT_DIR, "00-prod-live-verify-after-generate.png"), fullPage: true });

  await browser.close();

  console.log("Saved:", pdfPath);
  console.log("Console/page issues:", issues.length ? JSON.stringify(issues) : "none");
}

main().catch((err) => { console.error(err); process.exit(1); });
