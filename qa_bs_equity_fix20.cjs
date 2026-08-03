const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SUPABASE_URL = "https://vaivysetsmtsxnxnhefk.supabase.co";
const SERVICE_KEY = fs.readFileSync(path.join(os.homedir(), ".claude", ".supabase_trio_service_key"), "utf8").trim();
const DEV_ORIGIN = "http://localhost:5199";
const OUT_DIR = path.join(os.homedir(), "Work/Trio-Sporting/CLEVER/Cockpit/deliverables/review-fixes-2026-08-03/fix-20-bs-equity");

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

async function newPage(browser, hash, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const issues = [];
  page.on("console", (msg) => { if (msg.type() === "error") issues.push(msg.text()); });
  page.on("pageerror", (err) => issues.push("pageerror: " + err.message));
  await page.goto(`${DEV_ORIGIN}/balance#${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  return { context, page, issues };
}

async function setComparison(page, label) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(700);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const hash = await getAuthHash("marcello.piccardo@leveredge.pro");
  const allIssues = [];

  for (const viewport of [{ name: "1440", w: 1440, h: 1200 }, { name: "390", w: 390, h: 950 }]) {
    const { context, page, issues } = await newPage(browser, hash, { width: viewport.w, height: viewport.h });

    // 1. Default load (Today -> last close Jun'26, Same Date Last Year) — the
    //    two new Equity subtotals ("Equity (statutory)" / "Equity incl.
    //    shareholder advances") + the reduced "Total Liabilities".
    await page.screenshot({ path: path.join(OUT_DIR, `01-default-today-py-${viewport.name}.png`), fullPage: true });

    // 2. Start of Year comparison
    await setComparison(page, "Start of Year");
    await page.screenshot({ path: path.join(OUT_DIR, `02-startofyear-${viewport.name}.png`), fullPage: true });

    // 3. Budget comparison (Jun'26 has no derived budget row — honest "—",
    //    unchanged pre-existing limitation; confirms regroup doesn't break it)
    await setComparison(page, "Budget");
    await page.screenshot({ path: path.join(OUT_DIR, `03-budget-dash-${viewport.name}.png`), fullPage: true });

    // 4. Back to PY, expand the new "Shareholder advances (equity-equivalent)"
    //    subsection row to show the Family Office line explicitly.
    await setComparison(page, "Same Date Last Year");
    const advanceToggle = page.getByText("Shareholder advances (equity-equivalent)").locator("..").locator("button").first();
    if (await advanceToggle.count() > 0) {
      await advanceToggle.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: path.join(OUT_DIR, `04-shareholder-advances-exploded-${viewport.name}.png`), fullPage: true });

    // 5. Hover the Equity circle to capture its value tooltip (statutory vs
    //    managerial breakdown) — desktop viewport only (hover has no mobile
    //    equivalent; 390 QA instead confirms the circle+table render intact).
    if (viewport.name === "1440") {
      const equityCircle = page.getByRole("img", { name: /^Equity:/ });
      await equityCircle.hover();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT_DIR, `05-equity-circle-tooltip-${viewport.name}.png`) });
    }

    if (issues.length > 0) allIssues.push({ viewport: viewport.name, issues });
    await context.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, "console-issues.json"), JSON.stringify(allIssues, null, 2));
  console.log("DONE. Console/page issues:", JSON.stringify(allIssues, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
