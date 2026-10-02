const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SUPABASE_URL = "https://vaivysetsmtsxnxnhefk.supabase.co";
const SERVICE_KEY = fs.readFileSync(path.join(os.homedir(), ".claude", ".supabase_trio_service_key"), "utf8").trim();
const PROD_ORIGIN = "https://clever.leveredge.pro";
const OUT_DIR = path.join(os.homedir(), "Work/Trio-Sporting/CLEVER/Cockpit/deliverables/review-fixes-2026-08-03/fix-19-cashflow-drill");

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
  const issues = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1400 } });
  const page = await context.newPage();
  page.on("console", (msg) => { if (msg.type() === "error") issues.push(msg.text()); });
  page.on("pageerror", (err) => issues.push("pageerror: " + err.message));
  await page.goto(`${PROD_ORIGIN}/cash#${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT_DIR, "PROD-01-default.png"), fullPage: true });

  const collapsed = () => page.locator("table button:has(svg.lucide-chevron-right)");
  for (let i = 0; i < 30; i++) {
    const count = await collapsed().count();
    if (count === 0) break;
    await collapsed().first().click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, "PROD-02-expanded.png"), fullPage: true });

  const bodyText = await page.locator("body").innerText();
  const hasBanner = bodyText.includes("Data completeness — certified figures are as-booked");
  const hasCashIn = bodyText.includes("Cash collected from customers");
  const hasCashOut = bodyText.includes("Cash paid out");
  const hasWcExplosion = bodyText.includes("Change in customer receivables") && bodyText.includes("VAT timing");
  const hasInvestingDrill = bodyText.includes("Property, plant & equipment") || bodyText.includes("Capital works & other fixed assets");
  const hasFinancingDrill = bodyText.includes("Shareholder current account") || bodyText.includes("Family Office");

  console.log(JSON.stringify({
    hasOldBanner_shouldBeFalse: hasBanner,
    hasCashIn_shouldBeTrue: hasCashIn,
    hasCashOut_shouldBeTrue: hasCashOut,
    hasWcExplosion_shouldBeTrue: hasWcExplosion,
    hasInvestingDrill_shouldBeTrue: hasInvestingDrill,
    hasFinancingDrill_shouldBeTrue: hasFinancingDrill,
    consoleIssues: issues,
  }, null, 2));

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
