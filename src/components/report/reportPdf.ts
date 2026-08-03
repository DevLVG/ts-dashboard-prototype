// BRANDED PDF GENERATOR — Trio Sporting cockpit "Report" section.
//
// Pure client-side, vector PDF (jsPDF + jsPDF-AutoTable — the ONE new
// dependency this feature adds; both are officially co-designed, MIT-
// licensed, and together avoid rasterising the live DOM: every page is
// drawn fresh from the SAME aggregated figures the on-screen preview uses
// (see reportData.ts), so the PDF can never silently drift from what the
// screen shows, and the text stays crisp/selectable at any zoom (no
// html2canvas screenshot artifacts, no font-loading race conditions).
//
// House style: charcoal background (#141414, the cockpit's dark-mode
// --background), gold accents (#CFB881, --gold), off-white body text
// (#F0ECE6, --foreground) — the same HSL tokens as src/index.css, converted
// to RGB once here since jsPDF draws in RGB. Vector text uses Helvetica
// (jsPDF's built-in core font) rather than the app's Bebas Neue/Nunito web
// fonts — embedding a custom TTF is a fair increment but out of scope for
// this pass; brand identity carries through color, logo, layout and the
// gold/charcoal palette instead.
import jsPDF from "jspdf";
import autoTable, { type CellHookData } from "jspdf-autotable";
import type { ReportSnapshot, MacroRow, ReportKind } from "./reportData";
import { fmtSAR, fmtDeltaSAR, fmtDeltaPct, fmtOrDash, pctChange } from "@/lib/format";

/** jsPDF's core Helvetica font is WinAnsi-encoded (~Latin-1) — it has no
 * glyph for the Unicode MINUS SIGN (U+2212) fmtDeltaPct uses (correct in the
 * browser, which renders any Unicode) or for the Greek Δ some column
 * headers borrow. Route every delta-percent string and header through this
 * before handing it to jsPDF so negative percentages print a plain
 * hyphen-minus instead of a missing-glyph box. */
const pdfSafe = (s: string): string => s.replace(/−/g, "-");
const fmtDeltaPctPdf = (v: number): string => pdfSafe(fmtDeltaPct(v));

// ------------------------------------------------------------------ palette
// Converted from src/index.css HSL custom properties (dark theme, the
// cockpit's default and the one this report is styled after).
const CHARCOAL: [number, number, number] = [20, 20, 20]; // --background 0 0% 8%
const CARD: [number, number, number] = [30, 30, 30]; // --card 0 0% 12%
const ROW_ALT: [number, number, number] = [25, 25, 25];
const SUBTOTAL_FILL: [number, number, number] = [42, 40, 32];
const BORDER: [number, number, number] = [60, 60, 60]; // --border 0 0% 20% (lightened for print legibility)
const GOLD: [number, number, number] = [207, 184, 129]; // --gold 42 45% 66%
const GOLD_TEXT_ON: [number, number, number] = [20, 20, 20]; // --gold-foreground
const FOREGROUND: [number, number, number] = [240, 236, 230]; // --foreground 36 25% 92%
const MUTED: [number, number, number] = [178, 168, 152]; // --muted-foreground 36 18% 70%
const SUCCESS: [number, number, number] = [54, 183, 226]; // --success 195 75% 55%
const DESTRUCTIVE: [number, number, number] = [224, 82, 82]; // --destructive 0 70% 60%
const AMBER: [number, number, number] = [235, 173, 74]; // open-period honesty badge
const AMBER_FILL: [number, number, number] = [46, 37, 20];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;

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

/** Load a Vite-bundled asset URL as a PNG data URL + its natural aspect
 * ratio, so the logo can be embedded via jsPDF's addImage. Browser-only
 * (fetch + Image), same runtime the rest of the cockpit already assumes. */
// The logo is only ever placed at a few mm tall in the PDF (a running
// header mark + one cover-page mark) — downscaling before embedding keeps
// the file a fair size (jsPDF embeds the raw pixel data it's given, not
// the display size) without any visible loss at print resolution.
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

const kindLabel = (kind: ReportKind): string =>
  kind === "monthly" ? "Monthly Report" : kind === "quarterly" ? "Quarterly Report" : "Yearly Report";

// ------------------------------------------------------------------- shapes

const paintPage = (doc: jsPDF) => {
  doc.setFillColor(...CHARCOAL);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");
};

const drawFooter = (doc: jsPDF, entity: string, periodShort: string, generatedDisplay: string) => {
  const y = PAGE_H - 12;
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y - 4, PAGE_W - MARGIN, y - 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`${entity} — CFO Cockpit · ${periodShort} · Generated ${generatedDisplay}`, MARGIN, y);
};

interface Logo { dataUrl: string; aspect: number }

/** Full page chrome (background + running header + footer) — called once
 * per PHYSICAL page via a page-indexed guard so a table that spans several
 * pages (or several tables sharing one page) never repaints over content
 * that already exists on that page. */
const makeChromePainter = (doc: jsPDF, logo: Logo | null, entity: string, title: string, sub: string, periodShort: string, generatedDisplay: string) => {
  const painted = new Set<number>();
  return () => {
    // getCurrentPageInfo() is a real jsPDF runtime method not covered by
    // this version's bundled .d.ts — cast rather than widen the public type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageNo = (doc.internal as any).getCurrentPageInfo().pageNumber as number;
    if (painted.has(pageNo)) return;
    painted.add(pageNo);
    paintPage(doc);
    let x = MARGIN;
    if (logo) {
      const h = 8;
      const w = h * logo.aspect;
      doc.addImage(logo.dataUrl, "PNG", x, 9, w, h);
      x += w + 4;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...FOREGROUND);
    doc.text("TRIO SPORTING", x, 13.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text("CFO Cockpit — Management Control", x, 17.5);

    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.line(MARGIN, 23, PAGE_W - MARGIN, 23);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...GOLD);
    doc.text(title, MARGIN, 32);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...FOREGROUND);
    doc.text(sub, MARGIN, 38);

    drawFooter(doc, entity, periodShort, generatedDisplay);
  };
};

/** Amber "honesty badge" note box — mirrors the in-app OpenMonthsBadge /
 * CompletenessBanner tone (amber border+fill, never color-alone: always
 * carries the explanatory text). Returns the Y just below the box. */
const drawOpenNote = (doc: jsPDF, x: number, y: number, w: number, text: string): number => {
  const padding = 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const lines = doc.splitTextToSize(text, w - padding * 2) as string[];
  const boxH = lines.length * 3.6 + padding * 2;
  doc.setFillColor(...AMBER_FILL);
  doc.setDrawColor(...AMBER);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, w, boxH, 1.5, 1.5, "FD");
  doc.setTextColor(...AMBER);
  doc.text(lines, x + padding, y + padding + 2.6);
  return y + boxH;
};

const valueFontSize = (formatted: string): number => {
  if (formatted.length <= 8) return 10;
  if (formatted.length <= 11) return 8.5;
  return 7;
};

/** Three KPI "circles" (Revenue / Gross Margin / EBITDA reported) — the
 * PDF's vector equivalent of the on-screen KpiCircles component. Same color
 * rule: delta positive -> azure (--success), negative -> red (--destructive),
 * text-carried (never color-alone). Returns the bottom Y used. */
const drawKpiRow = (
  doc: jsPDF,
  kpi: ReportSnapshot["kpi"],
  comparisonLabel: string,
  centerX: number,
  topY: number,
  totalWidth: number,
): number => {
  const items: { label: string; row: MacroRow }[] = [
    { label: "Revenue", row: kpi.revenue },
    { label: "Gross Margin", row: kpi.grossMargin },
    { label: "EBITDA (reported)", row: kpi.ebitda },
  ];
  const r = 15;
  const gap = (totalWidth - items.length * r * 2) / (items.length - 1);
  let x = centerX - totalWidth / 2 + r;
  const circleCenterY = topY + r + 5;

  for (const item of items) {
    const deltaAbs = item.row.comparison === null ? null : item.row.actual - item.row.comparison;
    const deltaPct = item.row.comparison === null ? null : pctChange(item.row.actual, item.row.comparison);
    const tone = toneColor(deltaAbs);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(item.label.toUpperCase(), x, topY, { align: "center" });

    doc.setDrawColor(...tone);
    doc.setLineWidth(1.1);
    doc.setFillColor(...CARD);
    doc.circle(x, circleCenterY, r, "FD");

    const valueStr = fmtSAR(item.row.actual);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(valueFontSize(valueStr));
    doc.setTextColor(...FOREGROUND);
    doc.text(valueStr, x, circleCenterY, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...MUTED);
    doc.text("SAR", x, circleCenterY + 4.2, { align: "center" });

    const deltaStr = deltaAbs === null ? "—" : `${fmtDeltaSAR(deltaAbs)}${deltaPct !== null ? ` · ${fmtDeltaPctPdf(deltaPct)}` : ""}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...tone);
    doc.text(deltaStr, x, circleCenterY + r + 6, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...MUTED);
    doc.text(`vs ${comparisonLabel}`, x, circleCenterY + r + 10, { align: "center" });

    x += r * 2 + gap;
  }
  return circleCenterY + r + 14;
};

// -------------------------------------------------------------- table hooks

const boldSubtotalRow = (rows: { subtotal?: boolean; emphasis?: boolean }[]) => (data: CellHookData) => {
  if (data.section !== "body") return;
  const src = rows[data.row.index];
  if (!src) return;
  if (src.subtotal) {
    data.cell.styles.fontStyle = "bold";
    data.cell.styles.fillColor = SUBTOTAL_FILL;
  }
  if (src.emphasis && (data.column.index === 0 || data.column.index === 1)) {
    data.cell.styles.textColor = GOLD;
  }
};

// ============================================================ page builders

const drawCoverPage = (doc: jsPDF, snapshot: ReportSnapshot, kind: ReportKind, logo: Logo | null, entity: string, generatedDisplay: string) => {
  paintPage(doc);
  if (logo) {
    const w = 42;
    const h = w / logo.aspect;
    doc.addImage(logo.dataUrl, "PNG", (PAGE_W - w) / 2, 44, w, h);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...FOREGROUND);
  doc.text("TRIO SPORTING", PAGE_W / 2, 100, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text("CFO Cockpit — Management Control", PAGE_W / 2, 107, { align: "center" });

  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.8);
  doc.line(PAGE_W / 2 - 30, 114, PAGE_W / 2 + 30, 114);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...GOLD);
  doc.text(kindLabel(kind).toUpperCase(), PAGE_W / 2, 128, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(23);
  doc.setTextColor(...FOREGROUND);
  doc.text(snapshot.period.label, PAGE_W / 2, 140, { align: "center" });

  let y = 150;
  if (snapshot.period.isOpen) {
    y = drawOpenNote(
      doc, PAGE_W / 2 - 75, y, 150,
      "Includes an open period — revenue is live, but supplier bills and other costs may not be fully posted yet.",
    ) + 8;
  } else {
    y += 8;
  }

  drawKpiRow(doc, snapshot.kpi, snapshot.comparisonLabel, PAGE_W / 2, y + 4, 150);

  drawFooter(doc, entity, snapshot.period.shortLabel, generatedDisplay);
};

const drawEconomicsPage = (doc: jsPDF, snapshot: ReportSnapshot, logo: Logo | null, entity: string, generatedDisplay: string) => {
  doc.addPage();
  const sub = `${snapshot.period.label} · vs ${snapshot.comparisonLabel}${snapshot.period.isOpen ? " · includes an open period" : ""}`;
  const chrome = makeChromePainter(doc, logo, entity, "ECONOMICS", sub, snapshot.period.shortLabel, generatedDisplay);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startPage = (doc.internal as any).getCurrentPageInfo().pageNumber as number;

  const rows = snapshot.macroRows;
  const body = rows.map((r) => {
    const deltaAbs = r.comparison === null ? null : r.actual - r.comparison;
    const deltaPct = r.comparison === null ? null : pctChange(r.actual, r.comparison);
    return [
      r.label,
      fmtSAR(r.actual),
      fmtOrDash(r.comparison),
      deltaAbs === null ? "—" : fmtDeltaSAR(deltaAbs),
      deltaPct === null ? "—" : fmtDeltaPctPdf(deltaPct),
    ];
  });

  autoTable(doc, {
    startY: 78,
    margin: { left: MARGIN, right: MARGIN, top: 46, bottom: 24 },
    head: [["Line item", "This window", snapshot.comparisonLabel, "Change", "Change %"]],
    body,
    styles: { fillColor: CARD, textColor: FOREGROUND, lineColor: BORDER, lineWidth: 0.1, fontSize: 8, cellPadding: 1.8, valign: "middle" },
    headStyles: { fillColor: GOLD, textColor: GOLD_TEXT_ON, fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: {
      0: { cellWidth: CONTENT_W * 0.38 },
      1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
    },
    didParseCell: (data) => {
      boldSubtotalRow(rows)(data);
      if (data.section === "body" && (data.column.index === 3 || data.column.index === 4)) {
        const r = rows[data.row.index];
        const deltaAbs = r.comparison === null ? null : r.actual - r.comparison;
        data.cell.styles.textColor = toneColor(deltaAbs);
      }
    },
    didDrawPage: chrome,
  });

  if (snapshot.budgetNaNote) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable?.finalY ?? 78;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(...AMBER);
    doc.text(snapshot.budgetNaNote, MARGIN, finalY + 6);
  }

  doc.setPage(startPage);
  drawKpiRow(doc, snapshot.kpi, snapshot.comparisonLabel, PAGE_W / 2, 50, 170);
};

const drawCashFlowPage = (doc: jsPDF, snapshot: ReportSnapshot, logo: Logo | null, entity: string, generatedDisplay: string) => {
  doc.addPage();
  const sub = `${snapshot.period.label}${snapshot.period.isOpen ? " · includes an open period" : ""}`;
  const chrome = makeChromePainter(doc, logo, entity, "CASH FLOW", sub, snapshot.period.shortLabel, generatedDisplay);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startPage = (doc.internal as any).getCurrentPageInfo().pageNumber as number;
  const cf = snapshot.cashFlow;

  const tileY = 48;
  const tileW = (CONTENT_W - 12) / 3;
  const tiles: { label: string; value: string; hint: string }[] = [
    { label: "OPENING BOOK CASH", value: fmtOrDash(cf.openingBookCash), hint: "Balance-sheet cash & bank, as booked" },
    { label: "CLOSING BOOK CASH", value: fmtOrDash(cf.closingBookCash), hint: "As booked — not yet bank-confirmed" },
    {
      label: "LIVE BANK & CASH POSITION",
      value: fmtOrDash(cf.liveBankTotal),
      hint: cf.lastSynced ? `Qoyod sync · ${cf.lastSynced}` : "Qoyod sync",
    },
  ];
  // NOTE: tiles are drawn AFTER the autoTable() call below (via
  // doc.setPage(startPage)), not here — didDrawPage repaints the FULL page
  // background on this same page as the table renders, which would blot out
  // anything drawn on it beforehand.
  const drawTiles = () => {
    tiles.forEach((t, i) => {
      const x = MARGIN + i * (tileW + 6);
      doc.setFillColor(...CARD);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, tileY, tileW, 28, 1.5, 1.5, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.3);
      doc.setTextColor(...MUTED);
      doc.text(t.label, x + 3, tileY + 6, { maxWidth: tileW - 6 });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.setTextColor(...(i === 2 ? GOLD : FOREGROUND));
      doc.text(t.value, x + 3, tileY + 15);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.6);
      doc.setTextColor(...MUTED);
      doc.text(doc.splitTextToSize(t.hint, tileW - 6) as string[], x + 3, tileY + 20);
    });
  };

  const body = cf.lines.map((l) => [l.label, l.value < 0 ? `(${fmtSAR(-l.value)})` : fmtSAR(l.value)]);

  autoTable(doc, {
    startY: tileY + 34,
    margin: { left: MARGIN, right: MARGIN, top: 46, bottom: 24 },
    head: [["Line item", snapshot.period.shortLabel]],
    body,
    styles: { fillColor: CARD, textColor: FOREGROUND, lineColor: BORDER, lineWidth: 0.1, fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: GOLD, textColor: GOLD_TEXT_ON, fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: { 1: { halign: "right" } },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const src = cf.lines[data.row.index];
      if (!src) return;
      if (src.emphasis) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = SUBTOTAL_FILL;
      }
      if (data.column.index === 1 && src.value < 0) data.cell.styles.textColor = MUTED;
    },
    didDrawPage: chrome,
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = (doc as any).lastAutoTable?.finalY ?? tileY + 34;
  doc.text(
    doc.splitTextToSize(
      "Indirect method: Operating = operating result + working-capital change + D&A add-back. Book cash = balance-sheet cash & bank lines at month end.",
      CONTENT_W,
    ) as string[],
    MARGIN, finalY + 6,
  );

  // Cash-position tiles belong on the section's FIRST page — drawn last (on
  // top of whatever didDrawPage already painted there) so they're never
  // blotted out by the background repaint.
  doc.setPage(startPage);
  drawTiles();
};

const drawBalanceSheetPage = (doc: jsPDF, snapshot: ReportSnapshot, logo: Logo | null, entity: string, generatedDisplay: string) => {
  doc.addPage();
  const bs = snapshot.balanceSheet;
  const sub = bs.available
    ? `As at ${snapshot.asAtLabel}${bs.fellBackFrom ? " — most recent close published within this period" : ""}`
    : snapshot.period.label;
  const chrome = makeChromePainter(doc, logo, entity, "BALANCE SHEET", sub, snapshot.period.shortLabel, generatedDisplay);

  if (!bs.available) {
    chrome();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("The monthly balance-sheet statement is not yet available for this period.", MARGIN, 60);
    return;
  }

  const sections: { title: string; data: typeof bs.assets }[] = [
    { title: "Assets", data: bs.assets },
    { title: "Liabilities", data: bs.liabilities },
    { title: "Equity", data: bs.equity },
  ];

  let cursorY = 46;
  let firstTable = true;
  for (const sec of sections) {
    const body: (string | number)[][] = [];
    const rowMeta: { bold?: boolean }[] = [];
    for (const g of sec.data.groups) {
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
    body.push([`TOTAL ${sec.title.toUpperCase()}`, fmtSAR(sec.data.total), sec.data.pmTotal === null ? "—" : fmtSAR(sec.data.pmTotal), sec.data.pyTotal === null ? "—" : fmtSAR(sec.data.pyTotal)]);
    rowMeta.push({ bold: true });

    autoTable(doc, {
      startY: cursorY,
      margin: { left: MARGIN, right: MARGIN, top: 46, bottom: 24 },
      head: [[sec.title.toUpperCase(), `As at (${snapshot.asAtLabel})`, `Prior month (${bs.pmLabel})`, `PY (${bs.pyLabel})`]],
      body,
      styles: { fillColor: CARD, textColor: FOREGROUND, lineColor: BORDER, lineWidth: 0.1, fontSize: 7.5, cellPadding: 1.4 },
      headStyles: { fillColor: GOLD, textColor: GOLD_TEXT_ON, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: ROW_ALT },
      columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const meta = rowMeta[data.row.index];
        if (meta?.bold) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = SUBTOTAL_FILL;
        }
      },
      didDrawPage: chrome,
    });
    if (firstTable) { chrome(); firstTable = false; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cursorY = ((doc as any).lastAutoTable?.finalY ?? cursorY) + 8;
  }

  // Balance check
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...(bs.isBalanced ? SUCCESS : AMBER));
  const checkText = bs.isBalanced
    ? `Balanced — Assets ${fmtSAR(bs.assets.total)} = Liabilities ${fmtSAR(bs.liabilities.total)} + Equity ${fmtSAR(bs.equity.total)}`
    : `Balance check delta: ${fmtSAR(bs.checkDelta)} SAR (Assets ${fmtSAR(bs.assets.total)} vs L+E ${fmtSAR(bs.liabilities.total + bs.equity.total)})`;
  doc.text(doc.splitTextToSize(checkText, CONTENT_W) as string[], MARGIN, cursorY);
};

// ==================================================================== entry

export const generateReportPdf = async (
  snapshot: ReportSnapshot,
  kind: ReportKind,
  logoUrl: string,
  entity = "Trio Sporting Club",
): Promise<string> => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogo(logoUrl);
  const { display, file } = nowStamp();

  drawCoverPage(doc, snapshot, kind, logo, entity, display);
  drawEconomicsPage(doc, snapshot, logo, entity, display);
  drawCashFlowPage(doc, snapshot, logo, entity, display);
  drawBalanceSheetPage(doc, snapshot, logo, entity, display);

  // Final pass: page numbers, now that the total is known.
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(`Page ${i} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 12, { align: "right" });
  }

  const filename = `Trio-Sporting_${slug(kindLabel(kind))}_${slug(snapshot.period.shortLabel)}_${file}.pdf`;
  doc.save(filename);
  return filename;
};
