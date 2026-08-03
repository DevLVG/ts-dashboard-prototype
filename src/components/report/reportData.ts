// REPORT DATA — Trio Sporting CFO cockpit "Report" section.
//
// Consolidates ONE snapshot (Economics + Cash Flow + Balance Sheet + revenue
// family drivers) for a chosen reporting period into the shape both the
// on-screen preview and the branded PDF consume.
//
// v2 (2026-08-03, second-round fix squad — Marcello's live-review PDF v2
// mandate): the period is now sourced from the SAME global window preset
// (`useAlignment().preset` — MTD / YTD / TTM / a calendar month / a calendar
// quarter) and the SAME global comparison toggle (PY | Budget) that Economics
// and Cash Flow already use — see `periodFromPreset` below and
// `@/components/chrome/AlignmentChrome`'s `WindowPicker` / `ComparisonToggle`,
// which ReportPage.tsx now mounts directly. This replaces the report's own
// bespoke Monthly/Quarterly/Yearly period model (which offered a DIFFERENT
// set of windows than the rest of the cockpit — the live-review complaint
// "same filters as Economics").
//
// NOTHING NEW IS INVENTED: every figure is produced by the SAME pure
// aggregation functions the live Economics/Cash Flow/Balance Sheet screens
// already call (`aggregatePL` / `aggregateBudgetWindow` from data/alignment,
// the balance-sheet PM/PY grouping, the cash-flow line set) — just windowed
// to the report's own period. The revenue-family driver breakdown
// (`buildFamilyMoves`) reuses `aggregateBudgetWindow`'s existing `bu` filter
// and the same `BasisRow.bu` dimension the Economics MoA-family drill (fix-18)
// already trusts — no new aggregation semantics, just a different grouping of
// rows already being fetched.
import { useMemo } from "react";
import { useAlignment, type ComparisonMode } from "@/contexts/AlignmentContext";
import {
  useBasisRows, aggregatePL, aggregateBudgetWindow, pyWin, resolveWindow, windowIncludesOpenMonths,
  lastCompleteFromBasis, type Win, type PLAgg, type BudgetAgg, type BasisRow, type WindowPresetId,
} from "@/data/alignment";
import {
  useBudgetMonthly, monthKey, monthKeyLabel, shiftMonthKey, endOfMonthLabel,
  LAST_CLOSED_MONTH_FALLBACK,
} from "@/data/liveData";
import { buFamilyName } from "@/data/moaTree";
import {
  useCashflowMonthly, useBalanceSheet, useBankBalances,
  type CashflowMonthRow, type BalanceSheetRow, type BalanceSheetResult, type BankBalanceRow,
} from "@/data/statementsLive";

// ------------------------------------------------------------ period model

/** Coarse shape of the active window — drives the PDF cover title ("Monthly
 * Report" / "Quarterly Report" / …) and compact labels. Derived from the
 * SAME `WindowPresetId` the global selector produces — see
 * `periodKindFromPreset`. */
export type ReportPeriodKind = "MTD" | "YTD" | "TTM" | "MONTH" | "QUARTER";

export interface ReportPeriodOption {
  id: string; // the raw WindowPresetId ("MTD" | "YTD" | "TTM" | "M:2026-06" | "Q:2")
  label: string; // resolveWindow's own name — IDENTICAL text to what Economics/Cash Flow show for this preset
  shortLabel: string; // compact form for PDF footers/filenames
  win: Win;
  kind: ReportPeriodKind;
  /** Reaches past the last CLOSED month — honesty badge (spec §0.3 pattern). */
  isOpen: boolean;
}

const quarterOfMonth = (key: string): number => Math.floor((Number(key.slice(5, 7)) - 1) / 3) + 1;

export const periodKindFromPreset = (preset: WindowPresetId): ReportPeriodKind => {
  if (preset === "MTD") return "MTD";
  if (preset === "YTD") return "YTD";
  if (preset === "TTM") return "TTM";
  if (preset.startsWith("Q:")) return "QUARTER";
  return "MONTH"; // "M:YYYY-MM" and any other fallback resolveWindow itself falls back to TTM for
};

const shortLabelFor = (kind: ReportPeriodKind, win: Win, todayKey: string): string => {
  if (kind === "MONTH") return monthKeyLabel(win.startKey);
  if (kind === "QUARTER") return `Q${quarterOfMonth(win.startKey)} '${win.startKey.slice(2, 4)}`;
  if (kind === "MTD") return `MTD ${monthKeyLabel(todayKey)}`;
  if (kind === "YTD") return `YTD ${win.endKey.slice(0, 4)}`;
  return `TTM ${monthKeyLabel(win.endKey)}`;
};

/** Build the report's period option straight from the GLOBAL window preset
 * (same `resolveWindow` call Economics/Cash Flow make) — the single source
 * of truth for "what window is active" everywhere in the cockpit. */
export const periodFromPreset = (
  preset: WindowPresetId,
  lastComplete: string,
  todayKey: string,
): ReportPeriodOption => {
  const { win, name } = resolveWindow(preset, lastComplete, todayKey);
  const kind = periodKindFromPreset(preset);
  return {
    id: preset,
    label: name,
    shortLabel: shortLabelFor(kind, win, todayKey),
    win,
    kind,
    isOpen: windowIncludesOpenMonths(win, lastComplete),
  };
};

/** The last CLOSED month, data-driven (costs materially posted) — shared by
 * the report snapshot and by `periodFromPreset`'s honesty-badge check. Kept
 * independent of `useAlignment().lastComplete` (which some other page's data
 * host sets) since Report is a standalone route — it computes its own from
 * the same basis rows it already fetches, exactly as before. */
export const useReportLastComplete = (): string => {
  const { data: basisData } = useBasisRows();
  return useMemo(() => lastCompleteFromBasis(basisData?.rows) ?? LAST_CLOSED_MONTH_FALLBACK, [basisData]);
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

// ------------------------------------------------------ revenue family movers

/** Which BU ("family") moved the revenue line, and by how much — grounds the
 * executive commentary's "top drivers of the revenue delta" clause in real
 * per-family aggregates instead of an invented qualitative claim. Reuses
 * `aggregateBudgetWindow`'s existing `bu` filter for the Budget comparison, and
 * the same `BasisRow.bu` dimension the Economics MoA-family drill (fix-18)
 * already groups by for PY. Sorted by |delta| descending; families with no
 * comparison figure (Budget doesn't cover this BU/window) are dropped rather
 * than shown as a fabricated zero move. */
export interface FamilyMove {
  bu: string;
  name: string;
  actual: number;
  comparison: number;
  delta: number;
}

const NOISE_FLOOR_SAR = 1; // guards against reporting rounding dust as a "mover"

export const buildFamilyMoves = (
  rows: BasisRow[] | undefined,
  budgetRows: Parameters<typeof aggregateBudgetWindow>[0],
  win: Win,
  comparisonMode: ComparisonMode,
): FamilyMove[] => {
  const sumByBu = (w: Win): Map<string, number> => {
    const out = new Map<string, number>();
    for (const r of rows ?? []) {
      if (r.section !== "Revenue") continue;
      const k = monthKey(r.period_month);
      if (k < w.startKey || k > w.endKey) continue;
      const key = r.bu ?? "OTHER";
      out.set(key, (out.get(key) ?? 0) + r.amount_sar);
    }
    return out;
  };

  const actualByBu = sumByBu(win);
  const comparisonByBu = new Map<string, number | null>();
  if (comparisonMode === "BUDGET") {
    for (const bu of actualByBu.keys()) {
      const b = aggregateBudgetWindow(budgetRows, win, bu);
      comparisonByBu.set(bu, b ? b.revenue : null);
    }
  } else {
    const pyByBu = sumByBu(pyWin(win));
    for (const bu of actualByBu.keys()) comparisonByBu.set(bu, pyByBu.has(bu) ? pyByBu.get(bu)! : null);
  }

  const moves: FamilyMove[] = [];
  for (const [bu, actual] of actualByBu.entries()) {
    const comparison = comparisonByBu.get(bu) ?? null;
    if (comparison === null) continue; // absent comparison ≠ a zero move — drop, don't fabricate
    const delta = actual - comparison;
    if (Math.abs(delta) < NOISE_FLOOR_SAR) continue;
    moves.push({ bu, name: buFamilyName(bu), actual, comparison, delta });
  }
  return moves.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
};

// ----------------------------------------------------------- cash flow

export interface CashFlowSnapshotLine { label: string; value: number; emphasis?: boolean }

export interface CashFlowSnapshot {
  lines: CashFlowSnapshotLine[];
  openingBookCash: number | null;
  closingBookCash: number | null;
  liveBankTotal: number | null;
  lastSynced: string | null;
  windowRows: CashflowMonthRow[];
  /** True only when the warehouse has actually published cash-flow rows for
   * at least one month in the window — "absent ≠ zero" (spec pattern used
   * elsewhere in this cockpit): an empty window renders an honest empty
   * state in the PDF rather than a table of zeroes that looks like a
   * genuine (if flat) statement. */
  hasData: boolean;
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

  return { lines, openingBookCash, closingBookCash, liveBankTotal, lastSynced, windowRows, hasData: windowRows.length > 0 };
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
  familyMoves: FamilyMove[];
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
    const familyMoves = buildFamilyMoves(rows, budgetRows, win, comparisonMode);
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
      familyMoves,
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
