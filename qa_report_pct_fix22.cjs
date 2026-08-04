// QA for fix-22 (Report Δ% sign-flip/near-zero artifact guard, owner-audit
// recheck 2026-08-04): regenerate the TTM PDF (the exact window the recheck
// caught "GROSS MARGIN +2,984,269 · +1026.2%" on, PY loss -> profit) and an
// MTD PDF via the real Generate PDF button on the dev server, plus a
// screenshot of the /report on-screen preview. Mirrors the fix-21 QA script
// pattern (qa_report_v2_fix21.cjs).
const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SUPABASE_URL = "https://vaivysetsmtsxnxnhefk.supabase.co";
const SERVICE_KEY = fs.readFileSync(path.join(os.homedir(), ".claude", ".supabase_trio_service_key"), "utf8").trim();
const DEV_ORIGIN = "http://localhost:8080";
const OUT_DIR = path.join(os.homedir(), "Work/Trio-Sporting/CLEVER/Cockpit/deliverables/review-fixes-2026-08-03/fix-22-report-pct");

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

async function setComparison(page, label) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(1500);
}

async function runScenario(browser, hash, scenario) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1600 }, acceptDownloads: true });
  const page = await context.newPage();
  const issues = [];
  page.on("console", (msg) => { if (msg.type() === "error") issues.push(msg.text()); });
  page.on("pageerror", (err) => issues.push("pageerror: " + err.message));

  await page.goto(`${DEV_ORIGIN}/report#${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  await setWindow(page, scenario.windowOption);
  await setComparison(page, scenario.comparisonLabel);
  await page.waitForTimeout(1500);
  await page.waitForSelector('text=Preview —', { timeout: 20000 }).catch(() => {});

  const bodyText = await page.locator("main").innerText().catch(() => "");
  fs.writeFileSync(path.join(OUT_DIR, `${scenario.slug}-body.txt`), bodyText);

  await page.screenshot({ path: path.join(OUT_DIR, `${scenario.slug}-preview-1440.png`), fullPage: true });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.getByRole("button", { name: "Generate PDF" }).click(),
  ]);
  const pdfPath = path.join(OUT_DIR, `${scenario.slug}.pdf`);
  await download.saveAs(pdfPath);
  await page.waitForTimeout(500);

  await context.close();
  return { scenario: scenario.slug, pdfPath, bodyHasArtifactPct: /\+\d{3,}\.\d%/.test(bodyText), issues };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const hash = await getAuthHash("marcello.piccardo@leveredge.pro");

  const scenarios = [
    { slug: "ttm-vs-py", windowOption: "Last 12 months", comparisonLabel: "Versus Previous Year" },
    { slug: "mtd-vs-py", windowOption: "Month to date", comparisonLabel: "Versus Previous Year" },
  ];

  const results = [];
  for (const scenario of scenarios) {
    console.log(`Running scenario: ${scenario.slug}`);
    const r = await runScenario(browser, hash, scenario);
    results.push(r);
    console.log(`  -> saved ${r.pdfPath}`);
    console.log(`  -> on-screen body 3+ digit artifact pct present: ${r.bodyHasArtifactPct}`);
    if (r.issues.length) console.log(`  -> console/page issues: ${JSON.stringify(r.issues)}`);
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, "run-log.json"), JSON.stringify(results, null, 2));
  console.log("DONE");
}

main().catch((err) => { console.error(err); process.exit(1); });
