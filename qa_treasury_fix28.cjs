const { chromium } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SUPABASE_URL = "https://vaivysetsmtsxnxnhefk.supabase.co";
const SERVICE_KEY = fs.readFileSync(path.join(os.homedir(), ".claude", ".supabase_trio_service_key"), "utf8").trim();
const DEV_ORIGIN = "http://localhost:5199";
const OUT_DIR = path.join(os.homedir(), "Work/Trio-Sporting/CLEVER/Cockpit/deliverables/review-fixes-2026-08-04/fix-28-treasury-align");

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
  await page.goto(`${DEV_ORIGIN}/treasury#${hash}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  return { context, page, issues };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const hash = await getAuthHash("marcello.piccardo@leveredge.pro");

  // ---------------------------------------------------- desktop 1440x900
  {
    const { context, page, issues } = await newPage(browser, hash, { width: 1440, height: 900 });

    // Full desk screenshot
    await page.screenshot({ path: path.join(OUT_DIR, "01-desktop-full-desk.png"), fullPage: true });

    // Circles close-up
    const circlesHeading = page.getByText("Receivables", { exact: true }).first();
    await circlesHeading.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, "02-desktop-circles.png") });

    // Extract circle numbers via text content of the two side cards
    const bodyText = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.join(OUT_DIR, "page-text-1440.txt"), bodyText);

    // DSO / DPO cards
    const dsoHeading = page.getByText("DSO — DAYS SALES OUTSTANDING", { exact: false }).first();
    await dsoHeading.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, "03-desktop-dso-dpo.png") });

    // Two-column receivables/payables
    const recvHeading = page.getByRole("heading", { name: "RECEIVABLES AGING" }).first();
    await recvHeading.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, "04-desktop-two-column.png"), fullPage: false });

    // Customer lines table — look for B2C Aggregated row
    const custHeading = page.getByRole("heading", { name: "CUSTOMER LINES — DEBTORS" }).first();
    await custHeading.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT_DIR, "05-desktop-customer-lines.png") });

    // Legacy pool tab (compact summary)
    const legacyTab = page.getByRole("tab", { name: /Legacy pool/i }).first();
    if (await legacyTab.count() > 0) {
      await legacyTab.click();
      await page.waitForSelector("text=LEGACY POOL — SUMMARY", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT_DIR, "06-desktop-legacy-compact.png") });
      const frozenChipCompact = page.getByText("Frozen", { exact: true }).first();
      await frozenChipCompact.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(OUT_DIR, "06b-desktop-legacy-compact-rows.png") });

      const openBtn = page.getByRole("button", { name: /Open full worksheet/i }).first();
      if (await openBtn.count() > 0) {
        await openBtn.click();
        await page.waitForTimeout(900);
        await page.screenshot({ path: path.join(OUT_DIR, "07-desktop-legacy-expanded.png") });
        const table = page.locator("table").filter({ hasText: "Debtor" }).first();
        await table.scrollIntoViewIfNeeded().catch(() => {});
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(OUT_DIR, "07b-desktop-legacy-expanded-rows.png") });
      }
    }

    fs.writeFileSync(path.join(OUT_DIR, "console-issues-1440.json"), JSON.stringify(issues, null, 2));
    await context.close();
  }

  // ---------------------------------------------------- mobile 390 width
  {
    const { context, page, issues } = await newPage(browser, hash, { width: 390, height: 844 });
    await page.screenshot({ path: path.join(OUT_DIR, "08-mobile-full-desk.png"), fullPage: true });
    fs.writeFileSync(path.join(OUT_DIR, "console-issues-390.json"), JSON.stringify(issues, null, 2));
    await context.close();
  }

  await browser.close();
  console.log("QA screenshots + text captured in", OUT_DIR);
}

main().catch((err) => { console.error(err); process.exit(1); });
