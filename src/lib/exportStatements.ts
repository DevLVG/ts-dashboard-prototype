// AUDIT-READY STATEMENT EXPORT — client-side, ZERO new dependencies.
//
// Serialises the statement the user is CURRENTLY LOOKING AT (P&L / Balance
// Sheet / Cash Flow) to a CSV that opens directly in Excel / Numbers / Sheets,
// stamped with an audit header: entity, period/window, basis, structure, the
// live Supabase data source, data-as-of and a generation timestamp (local +
// UTC). Numbers are exported RAW — machine values, 2-dp, absent = blank (never
// a fake zero) — so the file is summable and ties cell-for-cell to the figures
// on screen.
//
// WHY CSV here (and not a real .xlsx): CSV needs no package, no bundler change
// and no network — it is the safe, self-contained increment. A branded
// multi-tab .xlsx workbook and a print-to-PDF "board pack" are a larger
// frontend build, specced separately (see the task hand-off to Davide).
import { comparePct } from "@/lib/format";
import { monthKey, monthKeyLabel } from "@/data/liveData";

// ------------------------------------------------------------- audit stamp

export interface StampMeta {
  entity: string;
  statement: string; // human title, e.g. "Profit & Loss — TTM"
  period: string; // window / as-at label
  basis?: string;
  structure?: string; // P&L view label (As booked / Management)
  businessUnit?: string;
  currency?: string; // default "SAR"
  source: string; // the live Supabase view(s)
  dataAsOf?: string;
}

type Cell = string | number | null | undefined;
type Row = Cell[];

// ------------------------------------------------------------- low-level CSV

const round2 = (n: number): number => {
  const r = Math.round((n + Number.EPSILON) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

/** RFC-4180 cell: numbers become plain machine values, absent stays blank
 * (absent ≠ zero), and anything with a comma / quote / newline is quoted. */
const cell = (c: Cell): string => {
  if (c === null || c === undefined) return "";
  const s = typeof c === "number" ? (Number.isFinite(c) ? String(round2(c)) : "") : String(c);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const toCsv = (rows: Row[]): string => rows.map((r) => r.map(cell).join(",")).join("\r\n");

const pad = (n: number): string => String(n).padStart(2, "0");

const stamps = () => {
  const d = new Date();
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fileStamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return { local, iso: d.toISOString(), fileStamp };
};

const slug = (s: string): string => s.replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");

/** Trigger a browser download of `text` as a UTF-8 CSV (BOM so Excel reads it
 * with the right encoding). Pure DOM — no library, no network. */
const triggerDownload = (filename: string, text: string): void => {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const headerBlock = (m: StampMeta): { rows: Row[]; fileStamp: string } => {
  const t = stamps();
  const rows: Row[] = [[m.entity], ["CFO Cockpit — C/LEVER (management control)"], [m.statement], [], ["Period", m.period]];
  if (m.structure) rows.push(["Structure", m.structure]);
  if (m.basis) rows.push(["Basis", m.basis]);
  if (m.businessUnit) rows.push(["Business unit", m.businessUnit]);
  rows.push(["Currency", m.currency ?? "SAR"]);
  rows.push(["Data source", m.source]);
  if (m.dataAsOf) rows.push(["Data as of", m.dataAsOf]);
  rows.push(["Generated (local)", t.local]);
  rows.push(["Generated (UTC)", t.iso]);
  rows.push([]);
  return { rows, fileStamp: t.fileStamp };
};

export interface StatementExport {
  meta: StampMeta;
  columns: string[];
  rows: Row[];
  notes?: string[];
}

/** Assemble the stamped CSV (header block → columns → rows → notes) and
 * download it. The single public entry point used by every statement screen. */
export const exportStatementCsv = (s: StatementExport): void => {
  const { rows: head, fileStamp } = headerBlock(s.meta);
  const body: Row[] = [...head, s.columns, ...s.rows];
  if (s.notes && s.notes.length > 0) {
    body.push([], ["Notes"]);
    for (const n of s.notes) body.push([n]);
  }
  const fname = `${slug(s.meta.entity)}_${slug(s.meta.statement)}_${fileStamp}.csv`;
  triggerDownload(fname, toCsv(body));
};

// =============================================================== P&L builder

export interface PnlExportRow {
  label: string;
  indent?: boolean;
  invert?: boolean; // a higher value is BAD (cost lines) — magnitude % semantics
  badge?: string;
  actual: number | null;
  budget: number | null;
  py: number | null;
}

/** Serialise the P&L matrix exactly as the on-screen table computes it:
 * Actual · Budget · Δ Budget (SAR + %) · PY · Δ PY (SAR + %). Δ% uses the SAME
 * `comparePct` the table uses (sign-aware, magnitude for cost rows). */
export const buildPnlExport = (args: { displayRows: PnlExportRow[]; meta: StampMeta; notes?: string[] }): StatementExport => {
  const columns = ["Line", "Actual", "Budget", "Delta Budget", "Delta Budget %", "PY", "Delta PY", "Delta PY %"];
  const rows: Row[] = args.displayRows.map((r) => {
    const label = `${r.indent ? "    " : ""}${r.label}${r.badge ? ` [${r.badge}]` : ""}`;
    const dBud = r.actual !== null && r.budget !== null ? r.actual - r.budget : null;
    const dBudPct = r.actual !== null && r.budget !== null ? comparePct(r.actual, r.budget, r.invert) : null;
    const dPy = r.actual !== null && r.py !== null ? r.actual - r.py : null;
    const dPyPct = r.actual !== null && r.py !== null ? comparePct(r.actual, r.py, r.invert) : null;
    return [label, r.actual, r.budget, dBud, dBudPct, r.py, dPy, dPyPct];
  });
  return { meta: args.meta, columns, rows, notes: args.notes };
};

// ==================================================== Balance-Sheet builder

interface BsLine {
  row: { line_item: string; is_adjustment: boolean; note: string | null; amount: number };
  pm: number | null;
  py: number | null;
}
interface BsGroup {
  subsection: string;
  lines: BsLine[];
  total: number;
  pmTotal: number | null;
  pyTotal: number | null;
}
interface BsSection {
  groups: BsGroup[];
  total: number;
  pmTotal: number | null;
  pyTotal: number | null;
}

/** Serialise the balance sheet section-by-section: every line + its subsection
 * total + section total, the PM / PY comparatives, and the balance check. */
export const buildBalanceSheetExport = (args: {
  sections: { title: string; data: BsSection }[];
  asAtLabel: string;
  pmLabel: string;
  pyLabel: string;
  checkDelta: number;
  isBalanced: boolean;
  meta: StampMeta;
  notes?: string[];
}): StatementExport => {
  const columns = ["Section", "Subsection", "Line", `As at (${args.asAtLabel})`, `Prior month (${args.pmLabel})`, `PY (${args.pyLabel})`];
  const rows: Row[] = [];
  for (const sec of args.sections) {
    for (const g of sec.data.groups) {
      for (const l of g.lines) {
        const label = `${l.row.line_item}${l.row.is_adjustment ? " [ADJ]" : ""}`;
        rows.push([sec.title, g.subsection, label, l.row.amount, l.pm, l.py]);
      }
      rows.push([sec.title, g.subsection, `Total ${g.subsection}`, g.total, g.pmTotal, g.pyTotal]);
    }
    rows.push([sec.title, "", `TOTAL ${sec.title.toUpperCase()}`, sec.data.total, sec.data.pmTotal, sec.data.pyTotal]);
    rows.push([]);
  }
  rows.push([
    "Check",
    "",
    args.isBalanced ? "Balanced (Assets = Liabilities + Equity)" : "OUT OF BALANCE: Assets - (Liabilities + Equity)",
    args.isBalanced ? 0 : args.checkDelta,
    null,
    null,
  ]);
  return { meta: args.meta, columns, rows, notes: args.notes };
};

// ======================================================= Cash-Flow builder

/** Serialise the monthly cash-flow statement (one column per month in the
 * window), the book-cash-at-month-end row, and the working-capital block. */
export const buildCashFlowExport = (args: {
  windowRows: { period_month: string }[];
  lines: { label: string; indent?: boolean; value: (r: never) => number }[];
  bookCashByMonth: Map<string, number>;
  wcRows?: { period_month: string; receivables: number | null; inventory: number | null; payables: number | null; net_working_capital: number | null }[] | null;
  windowSize: number;
  meta: StampMeta;
  notes?: string[];
}): StatementExport => {
  const keys = args.windowRows.map((r) => monthKey(r.period_month));
  const columns = ["Line", ...keys.map((k) => monthKeyLabel(k))];
  const rows: Row[] = [];
  for (const line of args.lines) {
    rows.push([`${line.indent ? "    " : ""}${line.label}`, ...args.windowRows.map((r) => line.value(r as never))]);
  }
  rows.push(["Book cash (end of month)", ...keys.map((k) => (args.bookCashByMonth.has(k) ? args.bookCashByMonth.get(k)! : null))]);

  if (args.wcRows && args.wcRows.length > 0) {
    const wc = args.wcRows.slice(-args.windowSize);
    const wcKeys = wc.map((r) => monthKey(r.period_month));
    rows.push([]);
    rows.push(["WORKING CAPITAL"]);
    rows.push(["Line", ...wcKeys.map((k) => monthKeyLabel(k))]);
    rows.push(["    Receivables", ...wc.map((r) => r.receivables ?? null)]);
    rows.push(["    Inventory", ...wc.map((r) => r.inventory ?? null)]);
    rows.push(["    Payables", ...wc.map((r) => (r.payables === null || r.payables === undefined ? null : -Math.abs(r.payables)))]);
    rows.push(["Net working capital", ...wc.map((r) => r.net_working_capital ?? null)]);
  }
  return { meta: args.meta, columns, rows, notes: args.notes };
};
