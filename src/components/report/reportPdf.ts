// BRANDED PDF GENERATOR — Trio Sporting cockpit "Report" section.
//
// v2 (2026-08-03, second-round fix squad — Marcello's live-review PDF v2
// mandate). Full rework of the v1 generator:
//
//   1. WHITE, print-friendly background (was the cockpit's dark charcoal
//      theme — spec: "no dark theme in the PDF").
//   2. Trio Sporting BRAND style (champagne gold #C9AD75 / black / cream,
//      Bebas Neue display + Nunito text, the three-bar "Since 1990" logo) —
//      NOT the cockpit's own charcoal chrome. Fonts and the logo are properly
//      EMBEDDED (see `registerFonts`/`loadLogo`), not left to jsPDF's core
//      Helvetica.
//   3. A single CONTINUOUS content flow (`Flow` + `ensureSpace`) replaces v1's
//      "one `doc.addPage()` per statement" layout. v1 forced Economics / Cash
//      Flow / Balance Sheet onto separate fresh pages regardless of how
//      little content was left on the previous page or how short the next
//      section was — the root cause of the "one row of content then
//      emptiness" / half-empty-page defect Marcello flagged. Sections now
//      flow one after another on the same page whenever there's room, and a
//      page break is only forced when the NEXT block genuinely doesn't fit —
//      tight, professional pagination, no orphaned headers, no half-empty
//      pages.
//   4. Organic content (task item 6): the Economics table drops its
//      Comparison/Change/Change% columns entirely for a pre-budget window
//      (no fabricated dash-filled columns); Cash Flow's tiles/chart/table
//      only render when the warehouse actually has rows for the window
//      (otherwise an honest one-line empty state); the Watch Items block
//      only appears when a real, data-driven flag exists.
//   5. Executive commentary (task item 4) opens every section — see
//      `./reportCommentary`, deterministic and grounded in the same
//      `ReportSnapshot` the tables render from.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReportSnapshot, ReportPeriodKind } from "./reportData";
import { fmtSAR, fmtDeltaSAR, fmtDeltaPct, fmtOrDash, comparePct } from "@/lib/format";
import { buildEconomicsCommentary, buildCashFlowCommentary, buildBalanceSheetCommentary, buildWatchItems } from "./reportCommentary";
import bebasUrl from "@/assets/fonts/BebasNeue-Regular.ttf?url";
import nunitoRegUrl from "@/assets/fonts/Nunito-Regular.ttf?url";
import nunitoSemiUrl from "@/assets/fonts/Nunito-SemiBold.ttf?url";
import nunitoBoldUrl from "@/assets/fonts/Nunito-Bold.ttf?url";

/** jsPDF's core Helvetica font is WinAnsi-encoded (~Latin-1) — no glyph for
 * the Unicode MINUS SIGN (U+2212) `fmtDeltaPct` uses. The embedded Nunito/
 * Bebas TTFs carry their own cmap and may not cover it (or the RIGHTWARDS
 * ARROW U+2192 `data/alignment.ts`'s `winLabel`/`resolveWindow` use for
 * multi-month ranges, e.g. quarter/YTD/TTM cover labels) either — a glyph
 * jsPDF can't find is silently DROPPED, not boxed, which is how a real QA
 * run turned "Q2 2026 (Apr '26→Jun '26)" into "Q2 2026 (Apr '26Jun '26)"
 * with the separator just gone. Route every delta-percent / period-label /
 * free-text string through this before handing it to jsPDF. */
const pdfSafe = (s: string): string => s.replace(/−/g, "-").replace(/→/g, "–");
const fmtDeltaPctPdf = (v: number): string => pdfSafe(fmtDeltaPct(v));

// ------------------------------------------------------------------ palette
// Trio Sporting brand kit (Brand-Assets/TS Branding Principles.pdf) +
// Marcello's 2026-08-03 refinement to a champagne gold: #C9AD75 / black /
// cream. White page background throughout — print-friendly, no dark theme.
const WHITE: [number, number, number] = [255, 255, 255];
const CREAM: [number, number, number] = [247, 241, 228]; // card/tile fills
const ROW_ALT: [number, number, number] = [251, 247, 240]; // barely-there alt row
const SUBTOTAL_FILL: [number, number, number] = [238, 226, 199]; // deeper cream, subtotal rows
const BLACK: [number, number, number] = [20, 18, 15]; // near-black ink (print-soft, not pure #000)
const GOLD: [number, number, number] = [201, 173, 117]; // #C9AD75 champagne gold — fills, rules, rings
const GOLD_DEEP: [number, number, number] = [163, 122, 61]; // darker gold — small text on white (contrast-safe)
const MUTED: [number, number, number] = [104, 94, 78]; // warm gray-brown secondary ink
const BORDER: [number, number, number] = [225, 211, 182]; // soft gold-tinted hairline
const SUCCESS: [number, number, number] = [27, 122, 92]; // positive delta
const DESTRUCTIVE: [number, number, number] = [176, 48, 48]; // negative delta
const AMBER: [number, number, number] = [150, 100, 20]; // honesty-note ink
const AMBER_FILL: [number, number, number] = [252, 238, 212]; // honesty-note fill

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP_Y = 46; // first usable y on a content page, below the running header + rule
const BOTTOM_LIMIT = PAGE_H - 24; // leave room for the footer + page number

const toneColor = (delta: number | null): [number, number, number] =>
  delta === null || Math.abs(delta) < 0.5 ? MUTED : delta > 0 ? SUCCESS : DESTRUCTIVE;

// ------------------------------------------------------------------ helpers

const pad = (n: number): string => String(n).padStart(2, "0");

const nowStamp = (): { display: string; file: string } => {
  const d = new Date();
  const display = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const file = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return { display, file };
};

const slug = (s: string): string => s.replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");

const REPORT_KIND_TITLE: Record<ReportPeriodKind, string> = {
  MTD: "Month-to-Date Report",
  YTD: "Year-to-Date Report",
  TTM: "Last 12 Months Report",
  MONTH: "Monthly Report",
  QUARTER: "Quarterly Report",
};

/** Load a Vite-bundled asset URL as a PNG data URL + its natural aspect
 * ratio, so the logo can be embedded via jsPDF's addImage. */
const LOGO_MAX_DIM = 360;

export const loadLogo = (url: string): Promise<{ dataUrl: string; aspect: number } | null> =>
  new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const scale = Math.min(1, LOGO_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ dataUrl: canvas.toDataURL("image/png"), aspect: img.naturalWidth / img.naturalHeight });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

// -------------------------------------------------------------- font embedding

interface Logo { dataUrl: string; aspect: number }
interface FontSet { display: string; body: string; boldOk: boolean; semiOk: boolean }

const arrayBufferToBase64 = (buf: ArrayBuffer): string => {
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
};

const loadFontBase64 = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return arrayBufferToBase64(await res.arrayBuffer());
  } catch {
    return null;
  }
};

/** Embeds Bebas Neue (display) + Nunito Regular/SemiBold/Bold (text) as real
 * PDF fonts (task: "embed fonts/logo properly in the PDF") — not left to
 * jsPDF's core Helvetica. Falls back gracefully to Helvetica if a fetch
 * fails (offline asset, blocked network) so PDF generation never hard-fails
 * for a cosmetic reason. */
const registerFonts = async (doc: jsPDF): Promise<FontSet> => {
  const [bebas, nunitoReg, nunitoSemi, nunitoBold] = await Promise.all([
    loadFontBase64(bebasUrl), loadFontBase64(nunitoRegUrl), loadFontBase64(nunitoSemiUrl), loadFontBase64(nunitoBoldUrl),
  ]);
  const fonts: FontSet = { display: "helvetica", body: "helvetica", boldOk: false, semiOk: false };
  if (bebas) {
    doc.addFileToVFS("BebasNeue-Regular.ttf", bebas);
    doc.addFont("BebasNeue-Regular.ttf", "Bebas", "normal");
    fonts.display = "Bebas";
  }
  if (nunitoReg) {
    doc.addFileToVFS("Nunito-Regular.ttf", nunitoReg);
    doc.addFont("Nunito-Regular.ttf", "Nunito", "normal");
    fonts.body = "Nunito";
  }
  if (fonts.body === "Nunito" && nunitoBold) {
    doc.addFileToVFS("Nunito-Bold.ttf", nunitoBold);
    doc.addFont("Nunito-Bold.ttf", "Nunito", "bold");
    fonts.boldOk = true;
  }
  if (fonts.body === "Nunito" && nunitoSemi) {
    doc.addFileToVFS("Nunito-SemiBold.ttf", nunitoSemi);
    doc.addFont("Nunito-SemiBold.ttf", "Nunito", "semibold");
    fonts.semiOk = true;
  }
  return fonts;
};

type Weight = "normal" | "semibold" | "bold";

/** Resolves a (font family, jsPDF style) pair for a requested weight,
 * degrading gracefully if a weight file didn't register (still same family
 * where possible) or if Nunito itself fell back to Helvetica (real bold). */
const bodyFontOf = (fonts: FontSet, weight: Weight): [string, string] => {
  if (fonts.body !== "Nunito") return ["helvetica", weight === "normal" ? "normal" : "bold"];
  if (weight === "bold") return ["Nunito", fonts.boldOk ? "bold" : "normal"];
  if (weight === "semibold") return ["Nunito", fonts.semiOk ? "semibold" : "normal"];
  return ["Nunito", "normal"];
};

const setDisplay = (doc: jsPDF, fonts: FontSet, size: number, color: [number, number, number]): void => {
  doc.setFont(fonts.display, "normal");
  doc.setFontSize(size);
  doc.setTextColor(...color);
};

const setBody = (doc: jsPDF, fonts: FontSet, size: number, color: [number, number, number], weight: Weight = "normal"): void => {
  const [fam, style] = bodyFontOf(fonts, weight);
  doc.setFont(fam, style);
  doc.setFontSize(size);
  doc.setTextColor(...color);
};

// ------------------------------------------------------------------ chrome

const drawFooter = (doc: jsPDF, fonts: FontSet, entity: string, periodShort: string, comparisonLabel: string, generatedDisplay: string): void => {
  const y = PAGE_H - 14;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y - 4, PAGE_W - MARGIN, y - 4);
  setBody(doc, fonts, 7, MUTED);
  doc.text(`${entity} — CFO Cockpit · ${periodShort} · vs ${comparisonLabel} · Generated ${generatedDisplay}`, MARGIN, y);
};

/** Persistent chrome painter for the WHOLE statement flow (pages 2+) — a
 * single instance shared by every manual page break AND every autoTable
 * `willDrawPage`/`didDrawPage` callback, guarded by a page-indexed set so a
 * table that spans several pages never repaints over content already on
 * that page (see the `Flow` doc comment below for why BOTH hooks matter).
 * Unlike v1 (a new painter per statement, with the section name in the
 * running header), the header here is constant across the flow — sections
 * now render inline as content blocks (`drawSectionOpener`) so they can
 * share a physical page instead of each claiming its own. */
const makeChrome = (
  doc: jsPDF, fonts: FontSet, logo: Logo | null, entity: string,
  kindTitle: string, periodShort: string, comparisonLabel: string, generatedDisplay: string,
) => {
  const painted = new Set<number>();
  return () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageNo = (doc.internal as any).getCurrentPageInfo().pageNumber as number;
    if (painted.has(pageNo)) return;
    painted.add(pageNo);
    doc.setFillColor(...WHITE);
    doc.rect(0, 0, PAGE_W, PAGE_H, "F");
    let x = MARGIN;
    if (logo) {
      const h = 9;
      const w = h * logo.aspect;
      doc.addImage(logo.dataUrl, "PNG", x, 8, w, h);
      x += w + 4;
    }
    setDisplay(doc, fonts, 11, BLACK);
    doc.text("TRIO SPORTING", x, 13);
    setBody(doc, fonts, 6.5, MUTED);
    doc.text("CFO Cockpit — Management Control", x, 17.5);

    setBody(doc, fonts, 7.5, MUTED, "semibold");
    doc.text(`${kindTitle.toUpperCase()} · ${periodShort} · vs ${comparisonLabel}`, PAGE_W - MARGIN, 13, { align: "right" });

    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.7);
    doc.line(MARGIN, 22, PAGE_W - MARGIN, 22);

    drawFooter(doc, fonts, entity, periodShort, comparisonLabel, generatedDisplay);
  };
};

/** Amber "honesty badge" note box — open-period / not-yet-available caveats. */
const drawOpenNote = (doc: jsPDF, fonts: FontSet, x: number, y: number, w: number, text: string): number => {
  const padding = 3;
  setBody(doc, fonts, 7.5, AMBER, "bold");
  const lines = doc.splitTextToSize(text, w - padding * 2) as string[];
  const boxH = lines.length * 3.8 + padding * 2;
  doc.setFillColor(...AMBER_FILL);
  doc.setDrawColor(...AMBER);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, boxH, 1.5, 1.5, "FD");
  doc.text(lines, x + padding, y + padding + 2.8);
  return y + boxH;
};

const valueFontSize = (formatted: string): number => {
  if (formatted.length <= 8) return 11;
  if (formatted.length <= 11) return 9;
  return 7.5;
};

/** Three KPI "circles" (Revenue / Gross Margin / EBITDA reported) — cream
 * fill, gold/success/destructive ring by tone, the big number set in Bebas
 * Neue for display punch. Cover-page only in v2 (v1 duplicated this on the
 * Economics page too — redundant once sections flow inline). */
const drawKpiRow = (
  doc: jsPDF, fonts: FontSet, kpi: ReportSnapshot["kpi"], comparisonLabel: string,
  centerX: number, topY: number, totalWidth: number,
): number => {
  const items: { label: string; row: ReportSnapshot["kpi"]["revenue"] }[] = [
    { label: "Revenue", row: kpi.revenue },
    { label: "Gross Margin", row: kpi.grossMargin },
    { label: "EBITDA (reported)", row: kpi.ebitda },
  ];
  const r = 16;
  const gap = (totalWidth - items.length * r * 2) / (items.length - 1);
  let x = centerX - totalWidth / 2 + r;
  const circleCenterY = topY + r + 6;

  for (const item of items) {
    // owner-audit #14 (2026-08-04): item.row.actual can be null (not yet
    // posted for this window) — this is exactly the headline that used to
    // print a fabricated "100.0% of revenue"/identical-to-revenue EBITDA
    // circle on an open month. Render "—" and grey it out instead of
    // computing a delta against a missing figure.
    const notPosted = item.row.actual === null;
    const deltaAbs = item.row.actual === null || item.row.comparison === null ? null : item.row.actual - item.row.comparison;
    // comparePct (not pctChange): 2026-08-04, owner-audit recheck fix-22 —
    // same guard as the Economics table below / PerformanceAnalysis.tsx on
    // /performance (owner-audit #7): a sign-flip or near-zero comparison
    // base renders "—", never a +1026.2%-style artifact on the cover-page
    // KPI circles.
    const deltaPct = item.row.actual === null || item.row.comparison === null ? null : comparePct(item.row.actual, item.row.comparison);
    const tone = notPosted ? MUTED : toneColor(deltaAbs);

    setBody(doc, fonts, 7, MUTED, "semibold");
    doc.text(item.label.toUpperCase(), x, topY, { align: "center" });

    doc.setDrawColor(...tone);
    doc.setLineWidth(1.2);
    doc.setFillColor(...CREAM);
    doc.circle(x, circleCenterY, r, "FD");

    const valueStr = fmtOrDash(item.row.actual);
    setDisplay(doc, fonts, valueFontSize(valueStr), notPosted ? MUTED : BLACK);
    doc.text(valueStr, x, circleCenterY + 1.5, { align: "center" });
    setBody(doc, fonts, 5.5, MUTED);
    doc.text(notPosted ? "not yet posted" : "SAR", x, circleCenterY + 5.6, { align: "center" });

    const deltaStr = deltaAbs === null ? "—" : `${fmtDeltaSAR(deltaAbs)}${deltaPct !== null ? ` · ${fmtDeltaPctPdf(deltaPct)}` : ""}`;
    setBody(doc, fonts, 7, tone, "bold");
    doc.text(deltaStr, x, circleCenterY + r + 6, { align: "center" });
    setBody(doc, fonts, 6, MUTED);
    doc.text(`vs ${comparisonLabel}`, x, circleCenterY + r + 10, { align: "center" });

    x += r * 2 + gap;
  }
  return circleCenterY + r + 14;
};

// -------------------------------------------------------------- content flow

/** Replaces v1's "one `doc.addPage()` per statement" layout. `y` is the
 * running cursor on the CURRENT page; `ensureSpace` forces a page break
 * (repainting chrome, resetting `y`) only when the next block genuinely
 * doesn't fit in what's left — the fix for orphaned headers and half-empty
 * pages (see file header comment).
 *
 * BUG FOUND DURING QA (2026-08-03): a long table's OWN internal pagination
 * (e.g. Liabilities' Intercompany/Adjustments groups spilling onto a second
 * page) was silently erasing its own continuation rows. Root cause: jsPDF-
 * autotable's `didDrawPage` hook fires via `callEndPageHooks` — called when
 * LEAVING a page mid-table (before `nextPage()`, so it repaints the OLD
 * page — harmless, already-painted no-op) AND ONE FINAL TIME after the
 * table's very last row, for whatever page it ended on. That page is a
 * continuation page jsPDF-autotable created internally via `nextPage()`
 * WITHOUT ever calling `willDrawPage` through this code — so it was never
 * marked painted, and the final `didDrawPage` call paints a fresh white
 * background + header OVER the rows autoTable had just finished drawing
 * there. Every `autoTable()` call below hooks BOTH `willDrawPage` (fires
 * before a new page's content — the correct time to paint chrome) AND
 * `didDrawPage` (kept for the already-painted-page no-op case) to the same
 * idempotent, page-indexed painter, so a continuation page is always
 * painted BEFORE its rows land on it, never after. */
interface Flow { doc: jsPDF; y: number; chrome: () => void }

const ensureSpace = (flow: Flow, needed: number): void => {
  if (flow.y + needed > BOTTOM_LIMIT) {
    flow.doc.addPage();
    flow.chrome();
    flow.y = TOP_Y;
  }
};

const FULL_PAGE_H = BOTTOM_LIMIT - TOP_Y;

/** BUG FOUND DURING QA (2026-08-03): a variable-length, data-driven block
 * (a Balance Sheet section) that almost — but doesn't quite — fit in what's
 * left on the page would start there anyway, then spill its LAST one or two
 * rows onto a fresh page via autoTable's own pagination — leaving that next
 * page 90%+ blank (the exact "half-empty page" complaint, just relocated to
 * the tail of a section instead of its head). Plain `ensureSpace` doesn't
 * catch this because it only breaks when the block would overflow the
 * CURRENT page, not when a small overflow could be avoided by giving it a
 * fresh one. This variant breaks EARLY only when doing so would let the
 * WHOLE block fit on a fresh page (`trueHeight <= FULL_PAGE_H`) — never for
 * a block long enough to span multiple pages regardless (breaking early
 * there would just waste whatever room was already left, recreating the
 * problem one page earlier). */
const ensureSpaceNoSpillover = (flow: Flow, trueHeight: number): void => {
  const remaining = BOTTOM_LIMIT - flow.y;
  if (trueHeight > remaining && trueHeight <= FULL_PAGE_H) {
    flow.doc.addPage();
    flow.chrome();
    flow.y = TOP_Y;
  }
};

/** Standalone section header (title + gold tab, optional subtitle) — used
 * where the caller has ALREADY reserved room for header+content together
 * (e.g. `drawWatchItems`, whose own `ensureSpace` covers the whole block), so
 * this function's own (idempotent) `ensureSpace` call just confirms the
 * space already fits. NOT used directly by the three main statements — see
 * `drawSectionOpener` below for why. */
const drawSectionHeader = (flow: Flow, fonts: FontSet, title: string, subtitle?: string): void => {
  ensureSpace(flow, subtitle ? 18 : 13);
  const { doc } = flow;
  doc.setFillColor(...GOLD);
  doc.rect(MARGIN, flow.y, 3, 8, "F");
  setDisplay(doc, fonts, 15, BLACK);
  doc.text(title.toUpperCase(), MARGIN + 6, flow.y + 6.5);
  flow.y += 11;
  if (subtitle) {
    setBody(doc, fonts, 8.5, MUTED, "semibold");
    doc.text(subtitle, MARGIN + 6, flow.y);
    flow.y += 7;
  }
};

/** BUG FOUND DURING QA (2026-08-03): drawing the section header and its
 * commentary as two independently-paginated blocks let `ensureSpace` decide
 * there was JUST enough room for the header alone, then break the page
 * before the commentary — an orphaned header stranded at the bottom of a
 * page with its own analysis pushed to the next. Section header + subtitle +
 * executive commentary (task item 4) are now ONE atomic block: total height
 * is computed up front and reserved with a SINGLE `ensureSpace` call, so the
 * header can never be separated from the commentary that opens its section. */
const drawSectionOpener = (flow: Flow, fonts: FontSet, title: string, sentences: string[], subtitle?: string): void => {
  const { doc } = flow;
  const headerH = 11 + (subtitle ? 7 : 0);
  let lines: string[] = [];
  let commentaryH = 0;
  if (sentences.length > 0) {
    setBody(doc, fonts, 9, BLACK);
    lines = doc.splitTextToSize(pdfSafe(sentences.join("  ")), CONTENT_W - 8) as string[];
    commentaryH = lines.length * 4.6 + 8 + 7; // cream box + gap after
  }
  ensureSpace(flow, headerH + commentaryH);

  doc.setFillColor(...GOLD);
  doc.rect(MARGIN, flow.y, 3, 8, "F");
  setDisplay(doc, fonts, 15, BLACK);
  doc.text(title.toUpperCase(), MARGIN + 6, flow.y + 6.5);
  flow.y += 11;
  if (subtitle) {
    setBody(doc, fonts, 8.5, MUTED, "semibold");
    doc.text(subtitle, MARGIN + 6, flow.y);
    flow.y += 7;
  }

  if (sentences.length > 0) {
    const boxH = lines.length * 4.6 + 8;
    doc.setFillColor(...CREAM);
    doc.roundedRect(MARGIN, flow.y, CONTENT_W, boxH, 2, 2, "F");
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, flow.y, MARGIN, flow.y + boxH);
    setBody(doc, fonts, 9, BLACK);
    doc.text(lines, MARGIN + 5, flow.y + 6, { lineHeightFactor: 1.35 });
    flow.y += boxH + 7;
  }
};

const findCfLine = (cf: ReportSnapshot["cashFlow"], label: string): number => cf.lines.find((l) => l.label === label)?.value ?? 0;

/** Cash-flow bridge — thin horizontal bars from a common zero baseline,
 * positive/negative tone (not a dual-axis chart, one measure: SAR amount by
 * cash-flow stage), direct value labels (dataviz skill: thin marks, direct
 * labels for a small dataset, no legend needed for 4 self-labelled rows). */
const drawCashBridgeChart = (flow: Flow, fonts: FontSet, cf: ReportSnapshot["cashFlow"]): void => {
  const rows = [
    { label: "Operating", value: findCfLine(cf, "Operating cash flow") },
    { label: "Investing", value: findCfLine(cf, "Investing cash flow") },
    { label: "Financing", value: findCfLine(cf, "Financing cash flow") },
    { label: "Net cash flow", value: findCfLine(cf, "Net cash flow") },
  ];
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const rowH = 11;
  const needed = rows.length * rowH + 14;
  ensureSpace(flow, needed);
  const { doc } = flow;
  setBody(doc, fonts, 7.5, MUTED, "semibold");
  doc.text("CASH FLOW BRIDGE (SAR)", MARGIN, flow.y);
  flow.y += 6;

  const labelW = 30;
  const barHalfW = (CONTENT_W - labelW - 44) / 2;
  const zeroX = MARGIN + labelW + barHalfW;
  const topY = flow.y;
  for (const r of rows) {
    setBody(doc, fonts, 8, BLACK, r.label === "Net cash flow" ? "bold" : "normal");
    doc.text(r.label, MARGIN, flow.y + 3.6);
    const w = (Math.abs(r.value) / maxAbs) * barHalfW;
    const tone = Math.abs(r.value) < 1 ? MUTED : r.value >= 0 ? SUCCESS : DESTRUCTIVE;
    doc.setFillColor(...tone);
    if (w > 0.3) doc.roundedRect(r.value >= 0 ? zeroX : zeroX - w, flow.y, w, 5.5, 1, 1, "F");
    setBody(doc, fonts, 7.5, tone, "bold");
    doc.text(pdfSafe(fmtDeltaSAR(r.value)), r.value >= 0 ? zeroX + w + 2 : zeroX - w - 2, flow.y + 4.2, {
      align: r.value >= 0 ? "left" : "right",
    });
    flow.y += rowH;
  }
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(zeroX, topY - 2, zeroX, flow.y - rowH + 6);
  flow.y += 4;
};

const drawCashTiles = (flow: Flow, fonts: FontSet, cf: ReportSnapshot["cashFlow"]): void => {
  const tileH = 26;
  ensureSpace(flow, tileH + 6);
  const { doc } = flow;
  const tileW = (CONTENT_W - 12) / 3;
  const tiles: { label: string; value: string; hint: string; goldValue?: boolean }[] = [
    { label: "OPENING BOOK CASH", value: fmtOrDash(cf.openingBookCash), hint: "Balance-sheet cash & bank, as booked" },
    { label: "CLOSING BOOK CASH", value: fmtOrDash(cf.closingBookCash), hint: "As booked — not yet bank-confirmed" },
    {
      label: "LIVE BANK & CASH POSITION",
      value: fmtOrDash(cf.liveBankTotal),
      hint: cf.lastSynced ? `Qoyod sync · ${cf.lastSynced}` : "Qoyod sync",
      goldValue: true,
    },
  ];
  tiles.forEach((t, i) => {
    const x = MARGIN + i * (tileW + 6);
    doc.setFillColor(...CREAM);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, flow.y, tileW, tileH, 1.5, 1.5, "FD");
    setBody(doc, fonts, 6.3, MUTED, "semibold");
    doc.text(doc.splitTextToSize(t.label, tileW - 6) as string[], x + 3, flow.y + 6);
    setDisplay(doc, fonts, 12.5, t.goldValue ? GOLD_DEEP : BLACK);
    doc.text(t.value, x + 3, flow.y + 16.5);
    setBody(doc, fonts, 5.6, MUTED);
    doc.text(doc.splitTextToSize(t.hint, tileW - 6) as string[], x + 3, flow.y + 21.5);
  });
  flow.y += tileH + 8;
};

// ============================================================ page builders

const drawCover = (
  doc: jsPDF, fonts: FontSet, logo: Logo | null, snapshot: ReportSnapshot,
  kindTitle: string, entity: string, generatedDisplay: string,
): void => {
  doc.setFillColor(...WHITE);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  if (logo) {
    const w = 46;
    const h = w / logo.aspect;
    doc.setFillColor(...CREAM);
    doc.roundedRect(PAGE_W / 2 - w / 2 - 12, 38, w + 24, h + 22, 4, 4, "F");
    doc.addImage(logo.dataUrl, "PNG", (PAGE_W - w) / 2, 49, w, h);
  }

  setDisplay(doc, fonts, 12, GOLD_DEEP);
  doc.text("CFO COCKPIT — MANAGEMENT CONTROL", PAGE_W / 2, 118, { align: "center" });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(PAGE_W / 2 - 30, 124, PAGE_W / 2 + 30, 124);

  setDisplay(doc, fonts, 13, BLACK);
  doc.text(kindTitle.toUpperCase(), PAGE_W / 2, 137, { align: "center" });
  setDisplay(doc, fonts, 27, BLACK);
  doc.text(pdfSafe(snapshot.period.label), PAGE_W / 2, 150, { align: "center" });
  setBody(doc, fonts, 10.5, MUTED, "semibold");
  doc.text(`Versus ${snapshot.comparisonLabel}`, PAGE_W / 2, 157, { align: "center" });

  let y = 165;
  if (snapshot.period.isOpen) {
    y = drawOpenNote(
      doc, fonts, PAGE_W / 2 - 75, y, 150,
      "Includes an open period — revenue is live, but supplier bills and other costs may not be fully posted yet.",
    ) + 8;
  } else {
    y += 6;
  }

  drawKpiRow(doc, fonts, snapshot.kpi, snapshot.comparisonLabel, PAGE_W / 2, y + 2, 162);

  drawFooter(doc, fonts, entity, snapshot.period.shortLabel, snapshot.comparisonLabel, generatedDisplay);
};

const drawEconomicsTable = (flow: Flow, fonts: FontSet, snapshot: ReportSnapshot): void => {
  const { doc } = flow;
  const rows = snapshot.macroRows;
  // Organic content (task item 6): a pre-budget window has NO comparison
  // figure for any line — showing three dash-filled columns is worse than
  // showing none, so the table drops straight to a 2-column Actual view.
  const skipComparisonCols = snapshot.comparisonMode === "BUDGET" && !!snapshot.budgetNaNote;
  const [bodyFam, bodyStyle] = bodyFontOf(fonts, "normal");
  const [boldFam, boldStyle] = bodyFontOf(fonts, "bold");

  const head = skipComparisonCols
    ? [["Line item", "This window"]]
    : [["Line item", "This window", snapshot.comparisonLabel, "Change", "Change %"]];
  // owner-audit #14 (2026-08-04): r.actual can be null (not yet posted for
  // this window) — fmtOrDash (not fmtSAR) so a not-yet-booked cost line
  // prints "—", never a fabricated 0 that summed into a 100%-margin EBITDA.
  const body = rows.map((r) => {
    if (skipComparisonCols) return [r.label, fmtOrDash(r.actual)];
    const deltaAbs = r.actual === null || r.comparison === null ? null : r.actual - r.comparison;
    // comparePct (not pctChange): 2026-08-04, owner-audit recheck fix-22 —
    // same guard as the KPI circles above.
    const deltaPct = r.actual === null || r.comparison === null ? null : comparePct(r.actual, r.comparison);
    return [
      r.label,
      fmtOrDash(r.actual),
      fmtOrDash(r.comparison),
      deltaAbs === null ? "—" : fmtDeltaSAR(deltaAbs),
      deltaPct === null ? "—" : fmtDeltaPctPdf(deltaPct),
    ];
  });

  ensureSpace(flow, 28);
  autoTable(doc, {
    startY: flow.y,
    margin: { left: MARGIN, right: MARGIN, top: TOP_Y, bottom: 24 },
    head,
    body,
    styles: { font: bodyFam, fontStyle: bodyStyle as "normal" | "bold", fillColor: WHITE, textColor: BLACK, lineColor: BORDER, lineWidth: 0.1, fontSize: 8, cellPadding: 1.8, valign: "middle" },
    headStyles: { font: fonts.display, fontStyle: "normal", fillColor: GOLD, textColor: BLACK, fontSize: 9 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: skipComparisonCols
      ? { 0: { cellWidth: CONTENT_W * 0.6 }, 1: { halign: "right" } }
      : { 0: { cellWidth: CONTENT_W * 0.36 }, 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const r = rows[data.row.index];
      if (!r) return;
      if (r.subtotal) {
        data.cell.styles.font = boldFam;
        data.cell.styles.fontStyle = boldStyle as "normal" | "bold";
        data.cell.styles.fillColor = SUBTOTAL_FILL;
      }
      if (r.emphasis && (data.column.index === 0 || data.column.index === 1)) data.cell.styles.textColor = GOLD_DEEP;
      if (!skipComparisonCols && (data.column.index === 3 || data.column.index === 4)) {
        const deltaAbs = r.actual === null || r.comparison === null ? null : r.actual - r.comparison;
        data.cell.styles.textColor = toneColor(deltaAbs);
      }
    },
    willDrawPage: flow.chrome,
    didDrawPage: flow.chrome,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  flow.y = ((doc as any).lastAutoTable?.finalY ?? flow.y) + 8;
};

const drawCashFlowTable = (flow: Flow, fonts: FontSet, snapshot: ReportSnapshot): void => {
  const { doc } = flow;
  const cf = snapshot.cashFlow;
  const [bodyFam, bodyStyle] = bodyFontOf(fonts, "normal");
  const [boldFam, boldStyle] = bodyFontOf(fonts, "bold");
  const body = cf.lines.map((l) => [l.label, l.value < 0 ? `(${fmtSAR(-l.value)})` : fmtSAR(l.value)]);

  ensureSpace(flow, 28);
  autoTable(doc, {
    startY: flow.y,
    margin: { left: MARGIN, right: MARGIN, top: TOP_Y, bottom: 24 },
    head: [["Line item", snapshot.period.shortLabel]],
    body,
    styles: { font: bodyFam, fontStyle: bodyStyle as "normal" | "bold", fillColor: WHITE, textColor: BLACK, lineColor: BORDER, lineWidth: 0.1, fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { font: fonts.display, fontStyle: "normal", fillColor: GOLD, textColor: BLACK, fontSize: 9.5 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: { 1: { halign: "right" } },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const src = cf.lines[data.row.index];
      if (!src) return;
      if (src.emphasis) {
        data.cell.styles.font = boldFam;
        data.cell.styles.fontStyle = boldStyle as "normal" | "bold";
        data.cell.styles.fillColor = SUBTOTAL_FILL;
      }
      if (data.column.index === 1 && src.value < 0) data.cell.styles.textColor = DESTRUCTIVE;
    },
    willDrawPage: flow.chrome,
    didDrawPage: flow.chrome,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  flow.y = ((doc as any).lastAutoTable?.finalY ?? flow.y) + 6;

  setBody(doc, fonts, 7, MUTED);
  const note = doc.splitTextToSize(
    "Indirect method: Operating = operating result + working-capital change + D&A add-back. Book cash = balance-sheet cash & bank lines at month end.",
    CONTENT_W,
  ) as string[];
  ensureSpace(flow, note.length * 3.6 + 4);
  doc.text(note, MARGIN, flow.y);
  flow.y += note.length * 3.6 + 8;
};

const drawBalanceSheetSection = (
  flow: Flow, fonts: FontSet, title: string, data: ReportSnapshot["balanceSheet"]["assets"], snapshot: ReportSnapshot,
): void => {
  const { doc } = flow;
  const [bodyFam, bodyStyle] = bodyFontOf(fonts, "normal");
  const [boldFam, boldStyle] = bodyFontOf(fonts, "bold");
  const bs = snapshot.balanceSheet;

  const body: (string | number)[][] = [];
  const rowMeta: { bold?: boolean; emphasis?: boolean }[] = [];
  for (const g of data.groups) {
    body.push([g.subsection.toUpperCase(), "", "", ""]);
    rowMeta.push({ bold: true });
    for (const t of g.lines) {
      body.push([
        `  ${t.row.line_item}${t.row.is_adjustment ? " [ADJ]" : ""}`,
        fmtSAR(t.row.amount),
        t.pm === null ? "—" : fmtSAR(t.pm),
        t.py === null ? "—" : fmtSAR(t.py),
      ]);
      rowMeta.push({});
    }
    body.push([`Total ${g.subsection}`, fmtSAR(g.total), g.pmTotal === null ? "—" : fmtSAR(g.pmTotal), g.pyTotal === null ? "—" : fmtSAR(g.pyTotal)]);
    rowMeta.push({ bold: true });
  }
  body.push([`TOTAL ${title.toUpperCase()}`, fmtSAR(data.total), data.pmTotal === null ? "—" : fmtSAR(data.pmTotal), data.pyTotal === null ? "—" : fmtSAR(data.pyTotal)]);
  rowMeta.push({ bold: true, emphasis: true });

  // Full estimated table height (all rows + the mini-title above it) — used
  // by `ensureSpaceNoSpillover` to give the WHOLE section a fresh page
  // whenever that avoids stranding its last row or two on an otherwise-blank
  // continuation page; a genuinely oversized section (longer than one full
  // page) is left to flow naturally instead of forcing an early break that
  // would just waste whatever room remains here (see helper's doc comment).
  // Per-row figure (6.2mm) calibrated against the ACTUAL rendered row
  // spacing at fontSize 7.5/cellPadding 1.4 (measured ~5.85mm/row from a
  // real generated PDF) plus a safety margin — an underestimate here is what
  // let a 2-row spillover slip through during QA.
  const estimate = body.length * 6.2 + 12;
  ensureSpaceNoSpillover(flow, estimate);
  setDisplay(doc, fonts, 11, GOLD_DEEP);
  doc.text(title.toUpperCase(), MARGIN, flow.y + 4);
  flow.y += 8;

  autoTable(doc, {
    startY: flow.y,
    margin: { left: MARGIN, right: MARGIN, top: TOP_Y, bottom: 24 },
    head: [[title.toUpperCase(), `As at (${snapshot.asAtLabel})`, `Prior month (${bs.pmLabel})`, `PY (${bs.pyLabel})`]],
    body,
    styles: { font: bodyFam, fontStyle: bodyStyle as "normal" | "bold", fillColor: WHITE, textColor: BLACK, lineColor: BORDER, lineWidth: 0.1, fontSize: 7.5, cellPadding: 1.4 },
    headStyles: { font: fonts.display, fontStyle: "normal", fillColor: GOLD, textColor: BLACK, fontSize: 8.5 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const meta = rowMeta[data.row.index];
      if (meta?.bold) {
        data.cell.styles.font = boldFam;
        data.cell.styles.fontStyle = boldStyle as "normal" | "bold";
        data.cell.styles.fillColor = SUBTOTAL_FILL;
      }
      if (meta?.emphasis) data.cell.styles.textColor = GOLD_DEEP;
    },
    willDrawPage: flow.chrome,
    didDrawPage: flow.chrome,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  flow.y = ((doc as any).lastAutoTable?.finalY ?? flow.y) + 8;
};

const drawBalanceCheck = (flow: Flow, fonts: FontSet, snapshot: ReportSnapshot): void => {
  const { doc } = flow;
  const bs = snapshot.balanceSheet;
  const text = bs.isBalanced
    ? `Balanced — Assets ${fmtSAR(bs.assets.total)} = Liabilities ${fmtSAR(bs.liabilities.total)} + Equity ${fmtSAR(bs.equity.total)}`
    : `Balance check delta: SAR ${fmtSAR(Math.abs(bs.checkDelta))} (Assets ${fmtSAR(bs.assets.total)} vs L+E ${fmtSAR(bs.liabilities.total + bs.equity.total)})`;
  const lines = doc.splitTextToSize(text, CONTENT_W) as string[];
  ensureSpace(flow, lines.length * 4.8 + 6);
  setBody(doc, fonts, 9, bs.isBalanced ? SUCCESS : AMBER, "bold");
  doc.text(lines, MARGIN, flow.y + 4);
  flow.y += lines.length * 4.8 + 8;
};

/** ORGANIC block (task item 6) — only rendered when `items` is non-empty. */
const drawWatchItems = (flow: Flow, fonts: FontSet, items: string[]): void => {
  if (items.length === 0) return;
  const { doc } = flow;
  const bodyLines = items.map((it) => doc.splitTextToSize(`•  ${pdfSafe(it)}`, CONTENT_W - 8) as string[]);
  const totalLines = bodyLines.reduce((s, l) => s + l.length, 0);
  ensureSpace(flow, totalLines * 4.6 + 20);
  drawSectionHeader(flow, fonts, "Watch Items");
  setBody(doc, fonts, 8.5, AMBER);
  for (const l of bodyLines) {
    doc.text(l, MARGIN + 2, flow.y + 4);
    flow.y += l.length * 4.6 + 2;
  }
  flow.y += 4;
};

// ==================================================================== entry

export const generateReportPdf = async (
  snapshot: ReportSnapshot,
  logoUrl: string,
  entity = "Trio Sporting Club",
): Promise<string> => {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const [fonts, logo] = await Promise.all([registerFonts(doc), loadLogo(logoUrl)]);
  const { display, file } = nowStamp();
  const kindTitle = REPORT_KIND_TITLE[snapshot.period.kind];

  drawCover(doc, fonts, logo, snapshot, kindTitle, entity, display);

  doc.addPage();
  const chrome = makeChrome(doc, fonts, logo, entity, kindTitle, snapshot.period.shortLabel, snapshot.comparisonLabel, display);
  chrome();
  const flow: Flow = { doc, y: TOP_Y, chrome };

  // ECONOMICS — always present.
  drawSectionOpener(flow, fonts, "Economics", buildEconomicsCommentary(snapshot));
  drawEconomicsTable(flow, fonts, snapshot);

  // CASH FLOW — always present (task: "ensure it renders with real data").
  // Organic: if the warehouse has no rows for this window, an honest one-line
  // empty state stands in for the tiles/chart/table rather than a table of
  // fabricated zeroes.
  drawSectionOpener(flow, fonts, "Cash Flow", buildCashFlowCommentary(snapshot));
  if (snapshot.cashFlow.hasData) {
    drawCashTiles(flow, fonts, snapshot.cashFlow);
    drawCashBridgeChart(flow, fonts, snapshot.cashFlow);
    drawCashFlowTable(flow, fonts, snapshot);
  }

  // BALANCE SHEET — as-of the window end (or the nearest published month).
  drawSectionOpener(flow, fonts, "Balance Sheet", buildBalanceSheetCommentary(snapshot), `As at ${snapshot.asAtLabel}`);
  if (snapshot.balanceSheet.available) {
    drawBalanceSheetSection(flow, fonts, "Assets", snapshot.balanceSheet.assets, snapshot);
    drawBalanceSheetSection(flow, fonts, "Liabilities", snapshot.balanceSheet.liabilities, snapshot);
    drawBalanceSheetSection(flow, fonts, "Equity", snapshot.balanceSheet.equity, snapshot);
    drawBalanceCheck(flow, fonts, snapshot);
  }

  // WATCH ITEMS — organic, only when a real, data-driven flag exists.
  drawWatchItems(flow, fonts, buildWatchItems(snapshot));

  // Final pass: page numbers, now that the total is known.
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    setBody(doc, fonts, 7.5, MUTED);
    doc.text(`Page ${i} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 14, { align: "right" });
  }

  const filename = `Trio-Sporting_${slug(kindTitle)}_${slug(snapshot.period.shortLabel)}_${file}.pdf`;
  doc.save(filename);
  return filename;
};
