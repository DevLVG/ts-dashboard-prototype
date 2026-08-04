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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const hash = await getAuthHash("marcello.piccardo@leveredge.pro");

  // Single context/session throughout — realistic cold (first nav, empty
  // page cache) -> warm (same session, plain reload) sequence, mobile
  // viewport (390px) since that's where the ~20s cold load was previously
  // observed.
  const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const page = await context.newPage();
  const reqTimings = [];
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("v_balance_sheet_monthly") || url.includes("v_budget_balance_sheet_monthly") || url.includes("bank_balances")) {
      reqTimings.push({ phase: currentPhase, url: url.split("?")[0].split("/").pop(), status: res.status() });
    }
  });

  let currentPhase = "cold";
  const t0 = Date.now();
  await page.goto(`${ORIGIN}/balance#${hash}`, { waitUntil: "networkidle", timeout: 45000 });
  const coldToNetworkIdleMs = Date.now() - t0;

  const tBudget0 = Date.now();
  await page.locator('button:has-text("Budget")').first().click();
  await page.waitForTimeout(1500);
  const coldBudgetClickMs = Date.now() - tBudget0;

  currentPhase = "warm";
  const t1 = Date.now();
  await page.reload({ waitUntil: "networkidle", timeout: 45000 });
  const warmToNetworkIdleMs = Date.now() - t1;

  const tBudget1 = Date.now();
  await page.locator('button:has-text("Budget")').first().click();
  await page.waitForTimeout(1500);
  const warmBudgetClickMs = Date.now() - tBudget1;

  const result = {
    origin: ORIGIN,
    viewport: "390x900 (mobile)",
    cold: { toNetworkIdleMs: coldToNetworkIdleMs, budgetClickToSettleMs: coldBudgetClickMs },
    warm: { toNetworkIdleMs: warmToNetworkIdleMs, budgetClickToSettleMs: warmBudgetClickMs },
    dataRequests: reqTimings,
    measuredAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(result, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "perf-timing.json"), JSON.stringify(result, null, 2));

  await context.close();
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
