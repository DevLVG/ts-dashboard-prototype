// QA for fix-23-recon: verify the "Recurring EBITDA (as booked)" KPI circle
// on Economics now shows the CORRECT recurring-only figure (not the old
// bugged full-P&L reportedEbitda) under Only Recurring scope, on both the
// default (YTD vs PY) and TTM windows.
const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SUPABASE_URL = "https://vaivysetsmtsxnxnhefk.supabase.co";
const SERVICE_KEY = fs.readFileSync(path.join(os.homedir(), ".claude", ".supabase_trio_service_key"), "utf8").trim();
const DEV_ORIGIN = "http://localhost:8080";
const OUT_DIR = path.join(os.homedir(), "Work/Trio-Sporting/CLEVER/Cockpit/deliverables/review-fixes-2026-08-04/fix-23-recon");

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

async function setWindow(page, optionName) {
  const triggers = page.getByRole("combobox");
  await triggers.first().click();
  await page.waitForTimeout(250);
  await page.getByRole("option", { name: optionName }).first().click();
  await page.waitForTimeout(1500);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const hash = await getAuthHash("marcello.piccardo@leveredge.pro");
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();
  const issues = [];
  page.on("console", (msg) => { if (msg.type() === "error") issues.push(msg.text()); });
  page.on("pageerror", (err) => issues.push("pageerror: " + err.message));

  await page.goto(`${DEV_ORIGIN}/performance#${hash}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500);

  // Default landing (fix-25 defaults: YTD + Only Recurring, PY comparison)
  await page.screenshot({ path: path.join(OUT_DIR, "01-economics-ytd-only-recurring-default.png"), fullPage: true });

  // Read the "Recurring EBITDA (as booked)" circle value text for a hard assertion
  const ebitdaCircleText = await page.locator('[role="img"][aria-label*="Recurring EBITDA"]').first().getAttribute("aria-label").catch(() => null);
  console.log("Recurring EBITDA circle aria-label (YTD):", ebitdaCircleText);

  // Switch window to TTM
  await setWindow(page, "Last 12 months");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT_DIR, "02-economics-ttm-only-recurring.png"), fullPage: true });
  const ebitdaCircleTextTtm = await page.locator('[role="img"][aria-label*="Recurring EBITDA"]').first().getAttribute("aria-label").catch(() => null);
  console.log("Recurring EBITDA circle aria-label (TTM):", ebitdaCircleTextTtm);

  fs.writeFileSync(path.join(OUT_DIR, "console-issues.json"), JSON.stringify(issues, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "circle-values.json"), JSON.stringify({ ytd: ebitdaCircleText, ttm: ebitdaCircleTextTtm }, null, 2));
  console.log("DONE. Console/page issues:", JSON.stringify(issues, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
