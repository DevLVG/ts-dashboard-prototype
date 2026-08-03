// REPORT DATA — Trio Sporting CFO cockpit "Report" section (fix-6-report,
// live-review spec 2026-08-03).
//
// Consolidates ONE snapshot (Economics + Cash Flow + Balance Sheet) for a
// chosen reporting period — Monthly / Quarterly / Yearly, picked
// independently of the global window-preset selector — into the shape both
// the on-screen preview and the branded PDF consume.
//
// NOTHING NEW IS INVENTED: every figure is produced by the SAME pure
// aggregation functions the live Economics/Cash Flow/Balance Sheet screens
// already call (`aggregatePL` / `aggregateBudgetWindow` from data/alignment,
// the balance-sheet PM/PY grouping from BalanceSheetLive, the cash-flow line
// set from CashFlowStatementLive) — just windowed to the report's own
// period instead of the global preset. The active Comparison toggle
// (PY | Budget, global + persisted) decides the comparison column, per
// Marcello's spec: "the P&L macro table for the window with the active
// comparison".
import { useMemo } from "react";
import { useAlignment, type ComparisonMode } from "@/contexts/AlignmentContext";
import {
  useBasisRows, aggregatePL, aggregateBudgetWindow, pyWin, factMonths,
  lastCompleteFromBasis, type Win, type PLAgg, type BudgetAgg,
} from "@/data/alignment";
import {
  useBudgetMonthly, monthKey, monthKeyLabel, shiftMonthKey, endOfMonthLabel,
  LAST_CLOSED_MONTH_FALLBACK,
} from "@/data/liveData";
import {
  useCashflowMonthly, useBalanceSheet, useBankBalances,
  type CashflowMonthRow, type BalanceSheetRow, type BalanceSheetResult, type BankBalanceRow,
} from "@/data/statementsLive";

// ------------------------------------------------------------ period model

export type ReportKind = "monthly" | "quarterly" | "yearly";

export interface ReportPeriodOption {
  id: string; // "M:2026-06" | "Q:2026-2" | "Y:2026"
  label: string; // "June 2026" | "Q2 2026 (Apr–Jun)" | "2026 YTD (Jan–Aug)"
  shortLabel: string; // compact form for PDF footers/columns
  win: Win;
  /** Reaches past the last CLOSED month — honesty badge (spec §0.3 pattern). */
  isOpen: boolean;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const fullMonthLabel = (key: string): string => {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};

const shortMonthName = (key: string): string => monthKeyLabel(key).split(" ")[0];

const quarterOfMonth = (key: string): number => Math.floor((Number(key.slice(5, 7)) - 1) / 3) + 1;
const quarterStartKey = (year: string, q: number): string => `${year}-${String((q - 1) * 3 + 1).padStart(2, "0")}`;
const quarterEndKey = (year: string, q: number): string => `${year}-${String((q - 1) * 3 + 3).padStart(2, "0")}`;

/** Every CLOSED-first month present in the live rows, newest first, plus the
 * current open month if it has synced (revenue posts live). */
export const buildMonthlyOptions = (months: string[], lastComplete: string): ReportPeriodOption[] =>
  [...months].reverse().map((m) => ({
    id: `M:${m}`,
    label: fullMonthLabel(m),
    shortLabel: monthKeyLabel(m),
    win: { startKey: m, endKey: m },
    isOpen: m > lastComplete,
  }));

/** Calendar quarters (Jan–Mar / Apr–Jun / Jul–Sep / Oct–Dec) — the fiscal
 * (June-start) quarter concept was dropped from the cockpit 2026-08-03
 * (see PerformanceAnalysis commit "calendar quarters — drop fiscal-year
 * concept"); Report follows the same convention. */
export const buildQuarterlyOptions = (months: string[], lastComplete: string): ReportPeriodOption[] => {
  const seen = new Set<string>();
  const opts: ReportPeriodOption[] = [];
  for (const m of months) {
    const year = m.slice(0, 4);
    const q = quarterOfMonth(m);
    const qid = `${year}-${q}`;
    if (seen.has(qid)) continue;
    seen.add(qid);
    const startKey = quarterStartKey(year, q);
    const endKey = quarterEndKey(year, q);
    opts.push({
      id: `Q:${qid}`,
      label: `Q${q} ${year} (${shortMonthName(startKey)}–${shortMonthName(endKey)})`,
      shortLabel: `Q${q} '${year.slice(-2)}`,
      win: { startKey, endKey },
      isOpen: endKey > lastComplete,
    });
  }
  return opts.reverse();
};

/** Calendar years present in the data, newest first. The current calendar
 * year is a YTD window (Jan → today), carrying the open-period badge —
 * exactly Marcello's "Yearly (2026 YTD)" example. Past years are the full
 * Jan–Dec window. */
export const buildYearlyOptions = (months: string[], lastComplete: string, todayKey: string): ReportPeriodOption[] => {
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  const currentYear = todayKey.slice(0, 4);
  return years.reverse().map((y) => {
    const isCurrent = y === currentYear;
    const endKey = isCurrent ? todayKey : `${y}-12`;
    const startKey = `${y}-01`;
    return {
      id: `Y:${y}`,
      label: isCurrent ? `${y} YTD (Jan–${shortMonthName(endKey)})` : `${y} (Full year)`,
      shortLabel: isCurrent ? `${y} YTD` : y,
      win: { startKey, endKey },
      isOpen: endKey > lastComplete,
    };
  });
};

export const buildPeriodOptions = (
  kind: ReportKind,
  months: string[],
  lastComplete: string,
  todayKey: string,
): ReportPeriodOption[] => {
  if (kind === "monthly") return buildMonthlyOptions(months, lastComplete);
  if (kind === "quarterly") return buildQuarterlyOptions(months, lastComplete);
  return buildYearlyOptions(months, lastComplete, todayKey);
};

/** Default selection: the newest CLOSED period where one exists (spec:
 * "from CLOSED months where possible"), else the newest available (open,
 * carrying the honesty badge). */
export const defaultOptionFor = (options: ReportPeriodOption[]): ReportPeriodOption | null => {
  if (options.length === 0) return null;
  return options.find((o) => !o.isOpen) ?? options[0];
};

/** Month list + closed-month anchor, shared by every report-kind picker. */
export const useReportMonths = () => {
  const { todayKey } = useAlignment();
  const { data: basisData } = useBasisRows();
  const months = useMemo(() => factMonths(basisData?.rows), [basisData]);
  const lastComplete = useMemo(
    () => lastCompleteFromBasis(basisData?.rows) ?? LAST_CLOSED_MONTH_FALLBACK,
    [basisData],
  );
  return { months, lastComplete, todayKey };
};

// -------------------------------------------------------------- macro rows

export interface MacroRow {
  key: string;
  label: string;
  actual: number;
  comparison: number | null;
  subtotal?: boolean;
  emphasis?: boolean;
}

const MACRO_DEFS: { key: string; label: string; subtotal?: boolean; emphasis?: boolean }[] = [
  { key: "Revenue", label: "Gross revenue" },
  { key: "COGS", label: "Cost of goods sold" },
  { key: "GrossMargin", label: "Gross margin", subtotal: true },
  { key: "OPEX-GA", label: "General & administrative" },
  { key: "OPEX-MS", label: "Marketing & sales" },
  { key: "OPEX-People", label: "People" },
  { key: "OpexTotal", label: "Total operating expenses", subtotal: true },
  { key: "EBITDA5", label: "EBITDA", subtotal: true, emphasis: true },
  { key: "Project-Costs", label: "Project costs" },
  { key: "EBITDAReported", label: "EBITDA (reported)", subtotal: true },
  { key: "D&A", label: "Depreciation & amortization" },
  { key: "EBIT", label: "EBIT", subtotal: true },
  { key: "NON-OP", label: "Non-operating items" },
  { key: "NetResult", label: "Net income", subtotal: true, emphasis: true },
];

const macroActualValue = (key: string, a: PLAgg): number => {
  switch (key) {
    case "Revenue": return a.revenue;
    case "COGS": return a.cogs;
    case "GrossMargin": return a.grossMargin;
    case "OPEX-GA": return a.opexGa;
    case "OPEX-MS": return a.opexMs;
    case "OPEX-People": return a.opexPeople;
    case "OpexTotal": return a.opex;
    case "EBITDA5": return a.ebitda5;
    case "Project-Costs": return a.projectCosts;
    case "EBITDAReported": return a.ebitdaReported;
    case "D&A": return a.da;
    case "EBIT": return a.ebit;
    case "NON-OP": return a.nonOp;
    case "NetResult": return a.netResult;
    default: return 0;
  }
};

/** Budget value for a macro row key — null where budget_2026 structurally
 * doesn't reach (mirrors PerformanceAnalysis.tsx's own budgetValueFor). */
const macroBudgetValue = (key: string, b: BudgetAgg | null): number | null => {
  if (!b) return null;
  switch (key) {
    case "Revenue": return b.revenue;
    case "COGS": return b.cogs;
    case "GrossMargin": return b.revenue + b.cogs;
    case "OPEX-GA": return b.opexGa;
    case "OPEX-MS": return b.opexMs;
    case "OPEX-People": return b.opexPeople;
    case "OpexTotal": return b.opexGa + b.opexMs + b.opexPeople;
    case "EBITDA5": return b.ebitdaAll;
    default: return null;
  }
};

export const buildMacroRows = (
  actual: PLAgg,
  comparisonMode: ComparisonMode,
  priorYear: PLAgg,
  budget: BudgetAgg | null,
): MacroRow[] =>
  MACRO_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    actual: macroActualValue(d.key, actual),
    comparison: comparisonMode === "BUDGET" ? macroBudgetValue(d.key, budget) : macroActualValue(d.key, priorYear),
    subtotal: d.subtotal,
    emphasis: d.emphasis,
  }));

// ----------------------------------------------------------- cash flow

export interface CashFlowSnapshotLine { label: string; value: number; emphasis?: boolean }

export interface CashFlowSnapshot {
  lines: CashFlowSnapshotLine[];
  openingBookCash: number | null;
  closingBookCash: number | null;
  liveBankTotal: number | null;
  lastSynced: string | null;
  windowRows: CashflowMonthRow[];
}

const CF_LINE_DEFS: { label: string; value: (r: CashflowMonthRow) => number | null; emphasis?: boolean }[] = [
  { label: "Operating result", value: (r) => r.operating_result },
  { label: "Working-capital change", value: (r) => r.operating_wc_change },
  { label: "D&A add-back (non-cash)", value: (r) => r.operating_da_noncash },
  { label: "Operating cash flow", value: (r) => r.operating_cash_flow, emphasis: true },
  { label: "Investing cash flow", value: (r) => r.investing_cash_flow, emphasis: true },
  { label: "Financing — equity", value: (r) => r.financing_equity },
  { label: "Financing — intercompany", value: (r) => r.financing_intercompany },
  { label: "Financing cash flow", value: (r) => r.financing_cash_flow, emphasis: true },
  { label: "Other cash flow", value: (r) => r.other_cash_flow },
  { label: "Net cash flow", value: (r) => r.net_cash_flow, emphasis: true },
];

export const buildCashFlowSnapshot = (
  cfRows: CashflowMonthRow[] | undefined,
  bsRows: BalanceSheetRow[] | undefined,
  bankRows: BankBalanceRow[] | undefined,
  win: Win,
): CashFlowSnapshot => {
  const inWin = (k: string) => k >= win.startKey && k <= win.endKey;
  const windowRows = (cfRows ?? []).filter((r) => inWin(monthKey(r.period_month)));
  const sum = (f: (r: CashflowMonthRow) => number | null) => windowRows.reduce((s, r) => s + (f(r) ?? 0), 0);
  const lines = CF_LINE_DEFS.map((d) => ({ label: d.label, value: sum(d.value), emphasis: d.emphasis }));

  const bookCashByMonth = new Map<string, number>();
  for (const r of bsRows ?? []) {
    if (r.section !== "Assets") continue;
    if (!/cash|bank|petty/i.test(r.line_item)) continue;
    const k = monthKey(r.month);
    bookCashByMonth.set(k, (bookCashByMonth.get(k) ?? 0) + r.amount);
  }
  const openKey = shiftMonthKey(win.startKey, -1);
  const openingBookCash = bookCashByMonth.has(openKey) ? bookCashByMonth.get(openKey)! : null;
  const closingBookCash = bookCashByMonth.has(win.endKey) ? bookCashByMonth.get(win.endKey)! : null;
  const liveBankTotal = bankRows && bankRows.length > 0 ? bankRows.reduce((s, r) => s + r.current_balance, 0) : null;
  const lastSynced = bankRows && bankRows.length > 0 ? bankRows[0].last_synced.slice(0, 10) : null;

  return { lines, openingBookCash, closingBookCash, liveBankTotal, lastSynced, windowRows };
};

// -------------------------------------------------------------- balance sheet

export interface BsLineTriple { row: BalanceSheetRow; pm: number | null; py: number | null }
export interface BsGroupOut { subsection: string; lines: BsLineTriple[]; total: number; pmTotal: number | null; pyTotal: number | null }
export interface BsSectionOut { groups: BsGroupOut[]; total: number; pmTotal: number | null; pyTotal: number | null }

const EMPTY_SECTION: BsSectionOut = { groups: [], total: 0, pmTotal: null, pyTotal: null };

const compMap = (rows: BalanceSheetRow[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(`${r.section}|${r.subsection}|${r.line_item}`, (m.get(`${r.section}|${r.subsection}|${r.line_item}`) ?? 0) + r.amount);
  return m;
};

const groupSection = (
  monthRows: BalanceSheetRow[],
  pmMap: Map<string, number>,
  pyMap: Map<string, number>,
  pmAvailable: boolean,
  pyAvailable: boolean,
  section: BalanceSheetRow["section"],
): BsSectionOut => {
  const rows = monthRows.filter((r) => r.section === section);
  const map = new Map<string, BsLineTriple[]>();
  for (const r of rows) {
    const key = `${r.section}|${r.subsection}|${r.line_item}`;
    const list = map.get(r.subsection) ?? [];
    list.push({ row: r, pm: pmAvailable ? pmMap.get(key) ?? 0 : null, py: pyAvailable ? pyMap.get(key) ?? 0 : null });
    map.set(r.subsection, list);
  }
  const groups: BsGroupOut[] = [...map.entries()].map(([subsection, lines]) => ({
    subsection,
    lines,
    total: lines.reduce((s, t) => s + t.row.amount, 0),
    pmTotal: pmAvailable ? lines.reduce((s, t) => s + (t.pm ?? 0), 0) : null,
    pyTotal: pyAvailable ? lines.reduce((s, t) => s + (t.py ?? 0), 0) : null,
  }));
  return {
    groups,
    total: groups.reduce((s, g) => s + g.total, 0),
    pmTotal: pmAvailable ? groups.reduce((s, g) => s + (g.pmTotal ?? 0), 0) : null,
    pyTotal: pyAvailable ? groups.reduce((s, g) => s + (g.pyTotal ?? 0), 0) : null,
  };
};

export interface BalanceSheetSnapshot {
  available: boolean;
  asAtKey: string | null;
  /** True when the window's end month has no published balance sheet yet
   * (e.g. a YTD window reaching into the current month) and this snapshot
   * fell back to the latest month that DOES have one, inside the window —
   * never fabricates a zeroed statement for a month that simply hasn't
   * closed (spec: "absent ≠ zero"). */
  fellBackFrom: string | null;
  assets: BsSectionOut;
  liabilities: BsSectionOut;
  equity: BsSectionOut;
  checkDelta: number;
  isBalanced: boolean;
  pmLabel: string;
  pyLabel: string;
}

const NOT_AVAILABLE: BalanceSheetSnapshot = {
  available: false, asAtKey: null, fellBackFrom: null,
  assets: EMPTY_SECTION, liabilities: EMPTY_SECTION, equity: EMPTY_SECTION,
  checkDelta: 0, isBalanced: true, pmLabel: "—", pyLabel: "—",
};

/** As-at = the last month IN THE WINDOW that actually has a published
 * balance sheet (mirrors BalanceSheetLive's own PM/PY comparative logic,
 * just anchored to the report's period instead of a free month picker). A
 * window whose end reaches past the latest published month (e.g. a YTD
 * report run mid-month) falls back to the newest available month at or
 * before the window end, rather than rendering a fabricated all-zero
 * statement for a month that hasn't closed yet. */
export const buildBalanceSheetSnapshot = (bsData: BalanceSheetResult | undefined, win: Win): BalanceSheetSnapshot => {
  if (!bsData || !bsData.available || bsData.rows.length === 0) return NOT_AVAILABLE;

  const monthsWithData = [...new Set(bsData.rows.map((r) => monthKey(r.month)))].sort();
  const candidateMonths = monthsWithData.filter((m) => m <= win.endKey);
  if (candidateMonths.length === 0) return NOT_AVAILABLE;
  const asAtKey = candidateMonths[candidateMonths.length - 1];
  const fellBackFrom = asAtKey !== win.endKey ? win.endKey : null;

  const rowsFor = (key: string) => bsData.rows.filter((r) => monthKey(r.month) === key);
  const monthRows = rowsFor(asAtKey).sort((a, b) => a.sort_order - b.sort_order);
  const pmKey = shiftMonthKey(asAtKey, -1);
  const pyKey = shiftMonthKey(asAtKey, -12);
  const pmRows = rowsFor(pmKey);
  const pyRows = rowsFor(pyKey);
  const pmMap = compMap(pmRows);
  const pyMap = compMap(pyRows);
  const pmAvailable = pmRows.length > 0;
  const pyAvailable = pyRows.length > 0;

  const assets = groupSection(monthRows, pmMap, pyMap, pmAvailable, pyAvailable, "Assets");
  const liabilities = groupSection(monthRows, pmMap, pyMap, pmAvailable, pyAvailable, "Liabilities");
  const equity = groupSection(monthRows, pmMap, pyMap, pmAvailable, pyAvailable, "Equity");
  const checkDelta = assets.total - (liabilities.total + equity.total);

  return {
    available: true,
    asAtKey,
    fellBackFrom,
    assets, liabilities, equity,
    checkDelta,
    isBalanced: Math.abs(checkDelta) < 1,
    pmLabel: pmKey ? monthKeyLabel(pmKey) : "—",
    pyLabel: pyKey ? monthKeyLabel(pyKey) : "—",
  };
};

// --------------------------------------------------------------- snapshot

export interface ReportSnapshot {
  isLoading: boolean;
  hasError: boolean;
  period: ReportPeriodOption;
  comparisonMode: ComparisonMode;
  comparisonLabel: string;
  macroRows: MacroRow[];
  kpi: { revenue: MacroRow; grossMargin: MacroRow; ebitda: MacroRow };
  budgetNaNote: string | null;
  cashFlow: CashFlowSnapshot;
  balanceSheet: BalanceSheetSnapshot;
  lastComplete: string;
  asAtLabel: string;
}

export const useReportSnapshot = (period: ReportPeriodOption | null): ReportSnapshot | null => {
  const { comparisonMode } = useAlignment();
  const { data: basisData, isLoading: l1, isError: e1 } = useBasisRows();
  const { data: budgetRows, isLoading: l2, isError: e2 } = useBudgetMonthly();
  const { data: cfRows, isLoading: l3, isError: e3 } = useCashflowMonthly();
  const { data: bsData, isLoading: l4, isError: e4 } = useBalanceSheet();
  const { data: bankRows, isLoading: l5 } = useBankBalances();

  const rows = basisData?.rows;
  const lastComplete = useMemo(() => lastCompleteFromBasis(rows) ?? LAST_CLOSED_MONTH_FALLBACK, [rows]);

  return useMemo(() => {
    if (!period) return null;
    const win = period.win;
    const py = pyWin(win);
    const actual = aggregatePL(rows, "STRICT", win);
    const priorYear = aggregatePL(rows, "STRICT", py);
    const budgetRaw = aggregateBudgetWindow(budgetRows, win);
    const macroRows = buildMacroRows(actual, comparisonMode, priorYear, budgetRaw);
    const find = (k: string) => macroRows.find((r) => r.key === k)!;
    const budgetNaNote = comparisonMode === "BUDGET" && !budgetRaw ? `No approved budget exists for ${period.label}.` : null;
    const cashFlow = buildCashFlowSnapshot(cfRows, bsData?.rows, bankRows, win);
    const balanceSheet = buildBalanceSheetSnapshot(bsData, win);

    return {
      isLoading: l1 || l2 || l3 || l4 || l5,
      hasError: e1 || e2 || e3 || e4,
      period,
      comparisonMode,
      comparisonLabel: comparisonMode === "BUDGET" ? "Budget" : "Previous Year",
      macroRows,
      kpi: { revenue: find("Revenue"), grossMargin: find("GrossMargin"), ebitda: find("EBITDAReported") },
      budgetNaNote,
      cashFlow,
      balanceSheet,
      lastComplete,
      // The balance sheet's own as-at (which may fall back to the latest
      // published month within the window) is the correct anchor for its
      // label — never the window's raw end, which can reach into a month
      // the statement hasn't published yet.
      asAtLabel: endOfMonthLabel(balanceSheet.asAtKey ?? win.endKey),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as ReportSnapshot;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, rows, budgetRows, cfRows, bsData, bankRows, comparisonMode, l1, l2, l3, l4, l5, e1, e2, e3, e4, lastComplete]);
};
