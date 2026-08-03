// CASH FLOW PAGE DATA — Marcello's live-review rebuild, 2026-08-03.
//
// Page-agnostic aggregation layer for the Cash Flow screen, mirroring how
// `useKpiHeaderData` feeds the Economics KPI circles: reads the SAME global
// controls every aligned screen reads (`useAlignment` — window preset,
// Comparison [PY|Budget]) and the cash-flow warehouse views already wired
// into the app (`useCashflowMonthly`, `useBalanceSheet`, `useBankBalances`,
// `useCashflowBudgetComparison`). Nothing here invents a new toggle or a
// rival data path.
//
// Scope is intentionally NOT read here: v_cashflow_statement_monthly has no
// recurrence dimension (unlike the P&L basis rows), so "Only Recurring"
// has no honest meaning on this page — the Scope toggle is omitted from the
// Cash Flow screen for that reason (Marcello: "Scope where meaningful").
//
// Stock vs flow discipline (why some values are pro-rated on MTD and some
// are not):
//   - The 5 statement rows (Operating / Investing / Financing / Other /
//     Net change) are FLOWS over the window — on Month-to-date they get the
//     same elapsed-day pro-ration as the Economics table (`computeMtdProration`),
//     applied to the comparison only, never the actual.
//   - Cash POSITION (the circle, opening/closing anchors) is a STOCK at a
//     point in time — pro-rating a balance by elapsed days is meaningless,
//     so it is never scaled.
//
// Budget-CF honesty rule (Marcello, live-review spec): the cash-flow budget
// only carries real investing/financing lines from the month the forward
// budget version starts — before that, v_cashflow_budget_comparison exists
// only as an EBITDA-proxy on the operating line (no investing/financing
// budget at all). The boundary is DERIVED from the fetched rows (first month
// with a non-null investing_budget or financing_budget) — never hardcoded.
// Any window that starts before that boundary shows "—" for the WHOLE
// Budget comparison (never a mixed proxy+real blend, which would misstate
// the data).
import { useMemo } from "react";
import { useAlignment, type ComparisonMode } from "@/contexts/AlignmentContext";
import { computeMtdProration, type Win, type MtdProration } from "@/data/alignment";
import { monthKey, monthKeyLabel, shiftMonthKey } from "@/data/liveData";
import {
  useCashflowMonthly, useBalanceSheet, useBankBalances, useCashflowBudgetComparison,
  type CashflowMonthRow, type CashflowBudgetRow, type BankBalanceRow,
} from "@/data/statementsLive";
import { fmtSAR } from "@/lib/format";

const n = (v: number | null | undefined): number => v ?? 0;
const inWin = (k: string, w: Win): boolean => k >= w.startKey && k <= w.endKey;

// ------------------------------------------------------------- cash position

export interface CashPoint {
  value: number | null;
  /** True when this figure is the LIVE bank sync total (the window's end is
   * today's still-open month) rather than a historical BS-view book-cash
   * snapshot. */
  isLive: boolean;
  unavailableReason?: string;
}

// ------------------------------------------------------------------ flows

/** One window's worth of cash-flow-statement figures, summed from the
 * monthly view. Null fields in the source rows are treated as a financial
 * zero (no line items posted that section that month) — the same convention
 * the view's own consumers already use. */
interface CfWindowAgg {
  operatingResult: number;
  operatingWcChange: number;
  operatingDaNoncash: number;
  operatingCashFlow: number;
  investingCashFlow: number;
  financingEquity: number;
  financingIntercompany: number;
  financingCashFlow: number;
  otherCashFlow: number;
  netCashFlow: number;
  /** How many distinct months of the window actually have a fact row. Zero
   * means the window is entirely outside the CF horizon (e.g. an MTD/YTD
   * window reaching into a month the ledger hasn't closed yet) — the flow
   * rows must then show "—", never a fabricated "0" (absent ≠ zero). */
  monthsCovered: number;
}

const emptyCfAgg = (): CfWindowAgg => ({
  operatingResult: 0, operatingWcChange: 0, operatingDaNoncash: 0, operatingCashFlow: 0,
  investingCashFlow: 0, financingEquity: 0, financingIntercompany: 0, financingCashFlow: 0,
  otherCashFlow: 0, netCashFlow: 0, monthsCovered: 0,
});

const sumCfWindow = (rows: CashflowMonthRow[] | undefined, w: Win): CfWindowAgg => {
  const out = emptyCfAgg();
  if (!rows) return out;
  const covered = new Set<string>();
  for (const r of rows) {
    const k = monthKey(r.period_month);
    if (!inWin(k, w)) continue;
    covered.add(k);
    out.operatingResult += n(r.operating_result);
    out.operatingWcChange += n(r.operating_wc_change);
    out.operatingDaNoncash += n(r.operating_da_noncash);
    out.operatingCashFlow += n(r.operating_cash_flow);
    out.investingCashFlow += n(r.investing_cash_flow);
    out.financingEquity += n(r.financing_equity);
    out.financingIntercompany += n(r.financing_intercompany);
    out.financingCashFlow += n(r.financing_cash_flow);
    out.otherCashFlow += n(r.other_cash_flow);
    out.netCashFlow += n(r.net_cash_flow);
  }
  out.monthsCovered = covered.size;
  return out;
};

const scaleCfAgg = (a: CfWindowAgg, fraction: number): CfWindowAgg => ({
  operatingResult: a.operatingResult * fraction,
  operatingWcChange: a.operatingWcChange * fraction,
  operatingDaNoncash: a.operatingDaNoncash * fraction,
  operatingCashFlow: a.operatingCashFlow * fraction,
  investingCashFlow: a.investingCashFlow * fraction,
  financingEquity: a.financingEquity * fraction,
  financingIntercompany: a.financingIntercompany * fraction,
  financingCashFlow: a.financingCashFlow * fraction,
  otherCashFlow: a.otherCashFlow * fraction,
  netCashFlow: a.netCashFlow * fraction,
  monthsCovered: a.monthsCovered,
});

// ------------------------------------------------------------------ budget

interface CfBudgetWindowAgg {
  operatingBudget: number | null;
  investingBudget: number | null;
  financingBudget: number | null;
  netBudget: number | null;
}

/** Sums each budget field over the window, keeping a field `null` only when
 * EVERY row in the window has it null (no budget line at all) — never a
 * fabricated zero for a field that genuinely doesn't exist yet. */
const sumCfBudgetWindow = (rows: CashflowBudgetRow[] | undefined, w: Win): CfBudgetWindowAgg => {
  const out: CfBudgetWindowAgg = { operatingBudget: null, investingBudget: null, financingBudget: null, netBudget: null };
  if (!rows) return out;
  const seen = { op: false, inv: false, fin: false, net: false };
  for (const r of rows) {
    const k = monthKey(r.period_month);
    if (!inWin(k, w)) continue;
    if (r.operating_budget !== null) { out.operatingBudget = (out.operatingBudget ?? 0) + r.operating_budget; seen.op = true; }
    if (r.investing_budget !== null) { out.investingBudget = (out.investingBudget ?? 0) + r.investing_budget; seen.inv = true; }
    if (r.financing_budget !== null) { out.financingBudget = (out.financingBudget ?? 0) + r.financing_budget; seen.fin = true; }
    if (r.net_budget !== null) { out.netBudget = (out.netBudget ?? 0) + r.net_budget; seen.net = true; }
  }
  return out;
};

const scaleCfBudgetAgg = (a: CfBudgetWindowAgg, fraction: number): CfBudgetWindowAgg => ({
  operatingBudget: a.operatingBudget === null ? null : a.operatingBudget * fraction,
  investingBudget: a.investingBudget === null ? null : a.investingBudget * fraction,
  financingBudget: a.financingBudget === null ? null : a.financingBudget * fraction,
  netBudget: a.netBudget === null ? null : a.netBudget * fraction,
});

// ------------------------------------------------------------ bank split

export interface BankSplitAccount {
  code: string;
  name: string;
  balance: number;
}

export interface BankSplitData {
  accounts: BankSplitAccount[];
  total: number | null;
  asOfIso: string | null;
  /** True when the freshest sync is more than 36h old — the bank feed is a
   * known open item with the client (manual/periodic sync), so a stale badge
   * is expected occasionally, never hidden. */
  stale: boolean;
}

// --------------------------------------------------------------- exports

export interface CashFlowLineRow {
  key: string;
  label: string;
  /** Null = genuinely no data for this window (never a fabricated zero —
   * "absent ≠ zero" is a hard rule everywhere else in this cockpit). */
  actual: number | null;
  comparison: number | null;
  comparisonUnavailableReason?: string;
  indent: 0 | 1;
  expandable: boolean;
  /** Set on child rows only — the Table component shows them exclusively
   * when this parent key is in its local `expanded` set (same click-to-
   * explode UX as the Economics table). Absent on top-level rows. */
  parentKey?: string;
  subtotal?: boolean;
  emphasis?: boolean;
  /** Anchor rows (Opening/Closing cash) are stocks, not flows — flagged so
   * the table can skip the MTD pro-ration hint on them. */
  isStock?: boolean;
}

export interface CashFlowPageData {
  isLoading: boolean;
  isError: boolean;
  comparisonMode: ComparisonMode;
  comparisonLabel: string;
  windowName: string;
  winLabelText: string;
  mtdProrated: boolean;
  mtdHint: MtdProration | null;
  /** Distinct months actually present in the CF fact rows — feeds the
   * WindowPicker's month list so it never offers a month with no data,
   * same honesty rule the Economics table applies via `factMonths`. */
  factMonths: string[];

  // ---- the big circle ----
  circleActual: CashPoint;
  circleComparison: CashPoint;

  // ---- bank split (always live, independent of the window) ----
  bankSplit: BankSplitData;
  bankSplitNote: string | null;

  // ---- table ----
  rows: CashFlowLineRow[];
  budgetCapNote: string | null;
  actualDataNote: string | null;
}

export const useCashFlowPageData = (): CashFlowPageData => {
  const { win, py, preset, todayKey, comparisonMode, windowName, winLabelText } = useAlignment();
  const { data: cfRows, isLoading: cfLoading, isError: cfError } = useCashflowMonthly();
  const { data: bsData, isLoading: bsLoading } = useBalanceSheet();
  const { data: bankRows, isLoading: bankLoading } = useBankBalances();
  const { data: budgetRows, isLoading: budgetLoading } = useCashflowBudgetComparison();

  const mtdPro = useMemo(() => (preset === "MTD" ? computeMtdProration(todayKey) : null), [preset, todayKey]);
  const factMonths = useMemo(
    () => (cfRows ? [...new Set(cfRows.map((r) => monthKey(r.period_month)))].sort() : []),
    [cfRows],
  );

  // -------------------------------------------------- book cash by month
  const bookCashByMonth = useMemo(() => {
    const map = new Map<string, number>();
    if (!bsData?.available) return map;
    for (const r of bsData.rows) {
      if (r.section !== "Assets") continue;
      if (!/cash|bank|petty/i.test(r.line_item)) continue;
      const k = monthKey(r.month);
      map.set(k, (map.get(k) ?? 0) + r.amount);
    }
    return map;
  }, [bsData]);

  const liveBankTotal = useMemo(
    () => (bankRows && bankRows.length > 0 ? bankRows.reduce((s, r) => s + n(r.current_balance), 0) : null),
    [bankRows],
  );
  const bankAsOfIso = useMemo(() => {
    if (!bankRows || bankRows.length === 0) return null;
    return bankRows.reduce((max, r) => (r.last_synced > max ? r.last_synced : max), bankRows[0].last_synced);
  }, [bankRows]);
  const bankStale = useMemo(() => {
    if (!bankAsOfIso) return false;
    const ageMs = Date.now() - new Date(bankAsOfIso).getTime();
    return ageMs > 36 * 60 * 60 * 1000;
  }, [bankAsOfIso]);

  /** Cash position AT the end of month `k` — live bank sync if `k` is
   * today's still-open month, else the book-cash snapshot from the BS view. */
  const cashAtEnd = (k: string): CashPoint => {
    if (k === todayKey) {
      return liveBankTotal !== null
        ? { value: liveBankTotal, isLive: true }
        : { value: null, isLive: true, unavailableReason: "Bank balances not yet synced." };
    }
    const v = bookCashByMonth.get(k);
    return v !== undefined
      ? { value: v, isLive: false }
      : { value: null, isLive: false, unavailableReason: `No book-cash figure for ${monthKeyLabel(k)}.` };
  };

  // -------------------------------------------------------- budget horizon
  const budgetHorizonStart = useMemo(() => {
    if (!budgetRows) return null;
    let earliest: string | null = null;
    for (const r of budgetRows) {
      if (r.investing_budget === null && r.financing_budget === null) continue;
      const k = monthKey(r.period_month);
      if (!earliest || k < earliest) earliest = k;
    }
    return earliest;
  }, [budgetRows]);

  const budgetAvailableForWin = budgetHorizonStart !== null && win.startKey >= budgetHorizonStart;

  /** Cumulative budgeted cash AT the end of month `k` — the last actual
   * book-cash anchor at the horizon start, walked forward by budgeted net
   * cash flow. Null before the horizon (no CF budget exists yet) or when the
   * anchor itself is unavailable. */
  const budgetCashAtEnd = (k: string): number | null => {
    if (!budgetHorizonStart || k < budgetHorizonStart || !budgetRows) return null;
    const anchor = cashAtEnd(shiftMonthKey(budgetHorizonStart, -1));
    if (anchor.value === null) return null;
    let sum = 0;
    for (const r of budgetRows) {
      const rk = monthKey(r.period_month);
      if (rk < budgetHorizonStart || rk > k) continue;
      sum += n(r.net_budget);
    }
    return anchor.value + sum;
  };

  // ------------------------------------------------------------- circle
  const comparisonLabel = comparisonMode === "BUDGET" ? "Budget" : "Previous Year";

  const circleActual = cashAtEnd(win.endKey);
  const circleComparison: CashPoint = useMemo(() => {
    if (comparisonMode === "BUDGET") {
      if (!budgetAvailableForWin) {
        return {
          value: null, isLive: false,
          unavailableReason: budgetHorizonStart
            ? `No cash-flow budget exists before ${monthKeyLabel(budgetHorizonStart)}.`
            : "No cash-flow budget loaded yet.",
        };
      }
      const v = budgetCashAtEnd(win.endKey);
      return v === null
        ? { value: null, isLive: false, unavailableReason: "Budgeted cash position unavailable for this window." }
        : { value: v, isLive: false };
    }
    return cashAtEnd(shiftMonthKey(win.endKey, -12));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonMode, win.endKey, budgetAvailableForWin, budgetHorizonStart, bookCashByMonth, liveBankTotal, todayKey, budgetRows]);

  // -------------------------------------------------------------- rows
  const actualAgg = useMemo(() => sumCfWindow(cfRows, win), [cfRows, win]);
  const priorAggRaw = useMemo(() => sumCfWindow(cfRows, py), [cfRows, py]);
  const priorAgg = useMemo(() => (mtdPro ? scaleCfAgg(priorAggRaw, mtdPro.fraction) : priorAggRaw), [priorAggRaw, mtdPro]);

  const budgetAggRaw = useMemo(() => sumCfBudgetWindow(budgetRows, win), [budgetRows, win]);
  const budgetAgg = useMemo(() => (mtdPro ? scaleCfBudgetAgg(budgetAggRaw, mtdPro.fraction) : budgetAggRaw), [budgetAggRaw, mtdPro]);

  const isBudgetMode = comparisonMode === "BUDGET";
  const budgetCapNote = isBudgetMode && !budgetAvailableForWin
    ? `No cash-flow budget exists for ${windowName}${budgetHorizonStart ? ` — Budget comparison is available from ${monthKeyLabel(budgetHorizonStart)} forward.` : "."}`
    : isBudgetMode
      ? "Detail limited to budget granularity — the cash-flow budget has no component-level split for Operating/Financing. Switch to Previous Year for full component detail."
      : null;

  const openingActual = cashAtEnd(shiftMonthKey(win.startKey, -1));
  const closingActual = circleActual;
  const openingComparison: CashPoint = comparisonMode === "BUDGET"
    ? (budgetAvailableForWin
        ? { value: budgetCashAtEnd(shiftMonthKey(win.startKey, -1)), isLive: false }
        : { value: null, isLive: false })
    : cashAtEnd(shiftMonthKey(py.startKey, -1));
  const closingComparison = circleComparison;

  // A window with ZERO covered fact months (e.g. an MTD/YTD window reaching
  // into a month the CF warehouse view hasn't posted yet) has no honest
  // basis for a flow figure at all — "—", never a fabricated "0" (absent ≠
  // zero, the same rule `fmtOrDash` enforces everywhere else in this
  // cockpit). A window that covers AT LEAST ONE month sums normally: an
  // individual null field within a covered month is the view's own "nothing
  // posted this section" signal, a genuine zero.
  const noActualData = actualAgg.monthsCovered === 0;
  const noPriorData = priorAggRaw.monthsCovered === 0;
  const actualDataNote = noActualData
    ? `No cash-flow data posted yet for ${windowName} — the flow lines below show "—" until the close.`
    : null;

  const rows: CashFlowLineRow[] = useMemo(() => {
    const actualOr = (v: number): number | null => (noActualData ? null : v);
    const cmp = (kind: keyof CfWindowAgg | null, budgetField: keyof CfBudgetWindowAgg | null): number | null => {
      if (isBudgetMode) {
        if (!budgetAvailableForWin || !budgetField) return null;
        return budgetAgg[budgetField];
      }
      if (noPriorData || !kind) return null;
      return priorAgg[kind] as number;
    };
    const out: CashFlowLineRow[] = [];

    out.push({
      key: "operating", label: "Operating cash flow", actual: actualOr(actualAgg.operatingCashFlow),
      comparison: cmp("operatingCashFlow", "operatingBudget"),
      indent: 0, expandable: !isBudgetMode, emphasis: true,
    });
    if (!isBudgetMode) {
      out.push({ key: "operating.result", parentKey: "operating", label: "Operating result", actual: actualOr(actualAgg.operatingResult), comparison: cmp("operatingResult", null), indent: 1, expandable: false });
      out.push({ key: "operating.wc", parentKey: "operating", label: "Working-capital change", actual: actualOr(actualAgg.operatingWcChange), comparison: cmp("operatingWcChange", null), indent: 1, expandable: false });
      out.push({ key: "operating.da", parentKey: "operating", label: "D&A add-back (non-cash)", actual: actualOr(actualAgg.operatingDaNoncash), comparison: cmp("operatingDaNoncash", null), indent: 1, expandable: false });
    }

    out.push({
      key: "investing", label: "Investing cash flow", actual: actualOr(actualAgg.investingCashFlow),
      comparison: cmp("investingCashFlow", "investingBudget"),
      indent: 0, expandable: false, emphasis: true,
    });

    out.push({
      key: "financing", label: "Financing cash flow", actual: actualOr(actualAgg.financingCashFlow),
      comparison: cmp("financingCashFlow", "financingBudget"),
      indent: 0, expandable: !isBudgetMode, emphasis: true,
    });
    if (!isBudgetMode) {
      out.push({ key: "financing.equity", parentKey: "financing", label: "Financing — equity", actual: actualOr(actualAgg.financingEquity), comparison: cmp("financingEquity", null), indent: 1, expandable: false });
      out.push({ key: "financing.intercompany", parentKey: "financing", label: "Financing — intercompany", actual: actualOr(actualAgg.financingIntercompany), comparison: cmp("financingIntercompany", null), indent: 1, expandable: false });
    }

    out.push({
      key: "other", label: "Other cash flow", actual: actualOr(actualAgg.otherCashFlow),
      comparison: isBudgetMode ? null : cmp("otherCashFlow", null),
      comparisonUnavailableReason: isBudgetMode && budgetAvailableForWin ? "No budget line for other cash flow." : undefined,
      indent: 0, expandable: false,
    });

    out.push({
      key: "net", label: "Net change in cash", actual: actualOr(actualAgg.netCashFlow),
      comparison: cmp("netCashFlow", "netBudget"),
      indent: 0, expandable: false, subtotal: true, emphasis: true,
    });

    out.push({
      key: "opening", label: `Opening cash (${monthKeyLabel(shiftMonthKey(win.startKey, -1))})`,
      actual: openingActual.value, comparison: openingComparison.value,
      comparisonUnavailableReason: openingActual.unavailableReason ?? openingComparison.unavailableReason,
      indent: 0, expandable: false, isStock: true,
    });
    out.push({
      key: "closing", label: `Closing cash (${monthKeyLabel(win.endKey)})`,
      actual: closingActual.value, comparison: closingComparison.value,
      comparisonUnavailableReason: closingActual.unavailableReason ?? closingComparison.unavailableReason,
      indent: 0, expandable: false, subtotal: true, emphasis: true, isStock: true,
    });

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualAgg, priorAgg, budgetAgg, isBudgetMode, budgetAvailableForWin, noActualData, noPriorData, win, openingActual, openingComparison, closingActual, closingComparison]);

  // --------------------------------------------------------- bank split
  const bankSplit: BankSplitData = useMemo(() => {
    const accounts: BankSplitAccount[] = (bankRows ?? [])
      .map((r: BankBalanceRow) => ({ code: r.qoyod_account_code, name: r.qoyod_account_name, balance: n(r.current_balance) }))
      .sort((a, b) => b.balance - a.balance);
    return { accounts, total: liveBankTotal, asOfIso: bankAsOfIso, stale: bankStale };
  }, [bankRows, liveBankTotal, bankAsOfIso, bankStale]);

  // Only worth a note when the live snapshot and the selected window's close
  // actually DIFFER — ties exactly (the common case: window ends on the
  // latest closed month) needs no caveat at all (Marcello: "pulito, minimal").
  const bankSplitNote = win.endKey !== todayKey && closingActual.value !== null && liveBankTotal !== null && Math.abs(liveBankTotal - closingActual.value) >= 0.5
    ? `Live snapshot, independent of the selected window. For ${monthKeyLabel(win.endKey)} close, book cash was ${fmtSAR(closingActual.value)} SAR.`
    : null;

  return {
    isLoading: cfLoading || bsLoading || bankLoading || budgetLoading,
    isError: cfError,
    comparisonMode, comparisonLabel, windowName, winLabelText,
    mtdProrated: mtdPro !== null,
    mtdHint: mtdPro,
    factMonths,
    circleActual, circleComparison,
    bankSplit, bankSplitNote,
    rows, budgetCapNote, actualDataNote,
  };
};
