const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SUPABASE_URL = "https://vaivysetsmtsxnxnhefk.supabase.co";
const SERVICE_KEY = fs.readFileSync(path.join(os.homedir(), ".claude", ".supabase_trio_service_key"), "utf8").trim();
const DEV_ORIGIN = "http://localhost:8080";
const OUT_DIR = path.join(os.homedir(), "Work/Trio-Sporting/CLEVER/Cockpit/deliverables/review-fixes-2026-08-04/fix-26-cash");

// Text that must NEVER appear again on this page — the removed accounting-
// ledger reconciliation block (fix-26, order 1).
const BANNED_STRINGS = [
  "the same total, from the accounting ledger",
  "Accounting profit before non-cash costs",
  "Change in working capital",
  "Change in customer receivables",
  "Change in supplier payables",
  "Change in inventory",
  "VAT timing",
  "Depreciation add-back",
];

const EPSILON = 0.5;

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
  await page.goto(`${DEV_ORIGIN}/cash#${hash}`, { waitUntil: "load", timeout: 60000 });
  await page.getByRole("combobox").first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(1500);
  return { context, page, issues };
}

async function selectWindow(page, label) {
  await page.getByRole("combobox").first().click();
  await page.waitForTimeout(200);
  await page.getByRole("option", { name: label, exact: false }).first().click();
  await page.waitForTimeout(900);
}

async function expandAll(page) {
  // Click only COLLAPSED chevrons (chevron-right icon) — clicking an already
  // -expanded row's chevron TOGGLES it back closed, which caused an infinite
  // expand/collapse loop when this naively clicked every button every round.
  // Expanding a parent reveals new child chevrons (e.g. Financing -> Owner &
  // capital -> named lines), so this repeats until none remain collapsed.
  for (let round = 0; round < 6; round++) {
    const collapsed = await page.locator("table tbody button:has(svg.lucide-chevron-right)").all();
    if (collapsed.length === 0) break;
    for (const b of collapsed) {
      try {
        await b.scrollIntoViewIfNeeded({ timeout: 2000 });
        await b.click({ timeout: 3000 });
        await page.waitForTimeout(150);
      } catch { /* element shifted after a sibling expanded this round — next round catches it */ }
    }
  }
  await page.waitForTimeout(300);
}

/** Reads every row's data-row-key / data-parent-key / data-actual /
 * data-comparison straight from the DOM (added in CashFlowTable.tsx
 * specifically for this check) and verifies, for every parent that has at
 * least one rendered child, that the children's actual values sum to the
 * parent's actual value, and likewise for comparison — both to the cent
 * (well inside SAR 0.50 tolerance for the residual mechanism's own
 * threshold). */
async function checkDecomposition(page, windowLabel) {
  const rows = await page.locator("table tbody tr[data-row-key]").evaluateAll((trs) =>
    trs.map((tr) => ({
      key: tr.getAttribute("data-row-key"),
      parentKey: tr.getAttribute("data-parent-key") || null,
      actual: tr.getAttribute("data-actual"),
      comparison: tr.getAttribute("data-comparison"),
    })),
  );

  const byKey = new Map(rows.map((r) => [r.key, r]));
  const childrenByParent = new Map();
  for (const r of rows) {
    if (!r.parentKey) continue;
    if (!childrenByParent.has(r.parentKey)) childrenByParent.set(r.parentKey, []);
    childrenByParent.get(r.parentKey).push(r);
  }

  const results = [];
  for (const [parentKey, children] of childrenByParent.entries()) {
    const parent = byKey.get(parentKey);
    if (!parent) continue;
    for (const col of ["actual", "comparison"]) {
      const parentRaw = parent[col];
      if (parentRaw === null || parentRaw === "") continue; // parent itself "—", nothing to reconcile
      const parentVal = Number(parentRaw);
      const childVals = children.map((c) => c[col]);
      const anyChildGap = childVals.some((v) => v === null || v === "");
      if (anyChildGap) {
        results.push({ windowLabel, parentKey, col, status: "CHILD_GAP", detail: `parent=${parentVal}, children=${JSON.stringify(childVals)}` });
        continue;
      }
      const sum = childVals.reduce((s, v) => s + Number(v), 0);
      const drift = sum - parentVal;
      results.push({
        windowLabel, parentKey, col,
        status: Math.abs(drift) < EPSILON ? "OK" : "BREAK",
        detail: `parent=${parentVal.toFixed(2)}, childrenSum=${sum.toFixed(2)}, drift=${drift.toFixed(2)}`,
      });
    }
  }
  return results;
}

async function checkBannedStrings(page, windowLabel) {
  const bodyText = await page.locator("body").innerText();
  const hits = BANNED_STRINGS.filter((s) => bodyText.includes(s));
  return hits.map((s) => ({ windowLabel, bannedString: s }));
}

async function runWindow(page, viewportName, presetLabel, fileTag) {
  await selectWindow(page, presetLabel);
  await expandAll(page);
  await page.screenshot({ path: path.join(OUT_DIR, `${fileTag}-${viewportName}.png`), fullPage: true });
  const decomposition = await checkDecomposition(page, `${presetLabel} (${viewportName})`);
  const banned = await checkBannedStrings(page, `${presetLabel} (${viewportName})`);
  return { decomposition, banned };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const hash = await getAuthHash("marcello.piccardo@leveredge.pro");
  const allIssues = [];
  const allDecomposition = [];
  const allBanned = [];

  for (const viewport of [{ name: "1440", w: 1440, h: 1000 }, { name: "390", w: 390, h: 844 }]) {
    const { context, page, issues } = await newPage(browser, hash, { width: viewport.w, height: viewport.h });

    const windows = [
      { label: "Year to date", tag: "01-ytd" },
      { label: "Month to date", tag: "02-mtd" },
      { label: "Jun '26", tag: "03-closed-month-jun26" }, // last closed month
      { label: "Last 12 months", tag: "04-ttm" },
    ];

    for (const w of windows) {
      const { decomposition, banned } = await runWindow(page, viewport.name, w.label, w.tag);
      allDecomposition.push(...decomposition);
      allBanned.push(...banned);
    }

    if (issues.length > 0) allIssues.push({ viewport: viewport.name, issues });
    await context.close();
  }

  await browser.close();

  const breaks = allDecomposition.filter((r) => r.status !== "OK");
  fs.writeFileSync(path.join(OUT_DIR, "decomposition-check.json"), JSON.stringify(allDecomposition, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "banned-strings-check.json"), JSON.stringify(allBanned, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "console-issues.json"), JSON.stringify(allIssues, null, 2));

  console.log(`Decomposition checks: ${allDecomposition.length} total, ${breaks.length} NOT OK.`);
  if (breaks.length > 0) console.log("BREAKS:", JSON.stringify(breaks, null, 2));
  console.log(`Banned-string hits (ledger block should be fully gone): ${allBanned.length}`);
  if (allBanned.length > 0) console.log("BANNED HITS:", JSON.stringify(allBanned, null, 2));
  console.log("Console/page issues:", JSON.stringify(allIssues, null, 2));

  if (breaks.length > 0 || allBanned.length > 0) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
