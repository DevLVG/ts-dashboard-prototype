const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SUPABASE_URL = "https://vaivysetsmtsxnxnhefk.supabase.co";
const SERVICE_KEY = fs.readFileSync(path.join(os.homedir(), ".claude", ".supabase_trio_service_key"), "utf8").trim();
const DEV_ORIGIN = "http://localhost:8080";
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

async function newPage(browser, hash, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const issues = [];
  page.on("console", (msg) => { if (msg.type() === "error") issues.push(msg.text()); });
  page.on("pageerror", (err) => issues.push("pageerror: " + err.message));
  await page.goto(`${DEV_ORIGIN}/cash#${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  return { context, page, issues };
}

async function selectWindow(page, label) {
  await page.getByRole("combobox").first().click();
  await page.waitForTimeout(200);
  await page.getByRole("option", { name: label, exact: false }).first().click();
  await page.waitForTimeout(900);
}

async function setComparison(page, mode) {
  const label = mode === "BUDGET" ? "Versus Budget" : "Versus Previous Year";
  await page.getByRole("button", { name: label }).click();
  await page.waitForTimeout(900);
}

async function expandAll(page) {
  // Repeatedly click the FIRST still-collapsed chevron (lucide-chevron-right)
  // and re-query after every click — a positional snapshot (`.all()` once,
  // then click by index) is unsafe here because expanding a row inserts new
  // rows/buttons ABOVE later ones, shifting every subsequent index and
  // causing clicks to land on the wrong toggle. Nested expand (operating ->
  // operating.wc -> ar/ap/inv/vat; financing.equity/intercompany -> named
  // accounts) requires this to run until truly nothing collapsed remains.
  const collapsed = () => page.locator("table button:has(svg.lucide-chevron-right)");
  for (let i = 0; i < 30; i++) {
    const count = await collapsed().count();
    if (count === 0) break;
    await collapsed().first().click();
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(250);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const hash = await getAuthHash("marcello.piccardo@leveredge.pro");
  const allIssues = [];

  for (const viewport of [{ name: "1440", w: 1440, h: 1400 }, { name: "390", w: 390, h: 1400 }]) {
    const { context, page, issues } = await newPage(browser, hash, { width: viewport.w, height: viewport.h });

    // 1. Default load (TTM, PY) — banner check + collapsed structure
    await page.screenshot({ path: path.join(OUT_DIR, `01-default-ttm-py-${viewport.name}.png`), fullPage: true });

    // 2. Expand everything — cash in/out, WC explosion, investing/financing drills
    await expandAll(page);
    await page.screenshot({ path: path.join(OUT_DIR, `02-ttm-py-expanded-${viewport.name}.png`), fullPage: true });

    // 3. A single closed month (Jun '26) — full tie-check window, expanded
    await selectWindow(page, "Jun '26");
    await expandAll(page);
    await page.screenshot({ path: path.join(OUT_DIR, `03-month-jun26-expanded-${viewport.name}.png`), fullPage: true });

    // 4. Month-to-date (current open month) — cash in/out + drills with
    // open-month honesty notes
    await selectWindow(page, "Month to date");
    await expandAll(page);
    await page.screenshot({ path: path.join(OUT_DIR, `04-mtd-expanded-${viewport.name}.png`), fullPage: true });

    // 5. YTD
    await selectWindow(page, "Year to date");
    await expandAll(page);
    await page.screenshot({ path: path.join(OUT_DIR, `05-ytd-expanded-${viewport.name}.png`), fullPage: true });

    // 6. Budget comparison mode — operating/investing/financing collapse to
    // flat rows (no cash-in/out, no WC explosion, no named drills) by design
    await setComparison(page, "BUDGET");
    await page.screenshot({ path: path.join(OUT_DIR, `06-budget-mode-${viewport.name}.png`), fullPage: true });

    // back to PY for cleanliness of next viewport pass
    await setComparison(page, "PY");

    if (issues.length > 0) allIssues.push({ viewport: viewport.name, issues });
    await context.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT_DIR, "console-issues.json"), JSON.stringify(allIssues, null, 2));
  console.log("DONE. Console/page issues:", JSON.stringify(allIssues, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
