// CASH FLOW PAGE DATA — Marcello's live-review rebuild, 2026-08-03.
// Extended 2026-08-03 (fix-19, 2nd round): the CEO's mandate is a manager's
// read of the statement — "where cash comes in, where it goes out, in human
// words" — not a second accounting rebuild. Every new figure below is an
// ADDITIVE view of the SAME warehouse totals already computed by
// v_cashflow_statement_monthly; nothing here changes a top-level number.
//
// Page-agnostic aggregation layer for the Cash Flow screen, mirroring how
// `useKpiHeaderData` feeds the Economics KPI circles: reads the SAME global
// controls every aligned screen reads (`useAlignment` — window preset,
// Comparison [PY|Budget]) and the cash-flow warehouse views already wired
// into the app (`useCashflowMonthly`, `useBalanceSheet`, `useBankBalances`,
// `useCashflowBudgetComparison`, `useWorkingCapitalMonthly`).
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
//   - Cash POSITION (the circle, opening/closing anchors, and every
//     working-capital / fixed-asset / equity balance used to derive a drill
//     delta below) is a STOCK at a point in time — pro-rating a balance by
//     elapsed days is meaningless, so it is never scaled.
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
//
// ---------------------------------------------------------------------
// fix-19 drill sourcing (2026-08-03) — what's real, what's derived, why:
//
//   Cash IN  ("Cash collected from customers") — v_collections_monthly
//   (payment allocations to invoices, kind='received'): a real, itemized
//   direct-cash-receipts ledger, independent of the GL-indirect CFS view.
//
//   Cash OUT ("Cash paid out") — the raw Qoyod payments log (qoyod_payments,
//   kind='paid') is RLS-gated to service_role only (migration 025) — the
//   frontend's `authenticated` session cannot read it at all, and no
//   itemized-outflow warehouse view exists (verified empirically 2026-08-03:
//   every direct query from an authenticated session returns zero rows).
//   So "Cash paid out" is DERIVED so the two lines tie to the operating
//   total EXACTLY, by construction: cash out = cash in − operating cash flow
//   (displayed as a negative, i.e. cash in + cash out = operating cash flow).
//   The sub-note says so plainly — never presented as itemized.
//
//   Working-capital explosion — v_working_capital_monthly (receivables /
//   inventory / payables balances, SAME account-code ranges the CFS view's
//   OP_WC bucket uses: 1103%/1104%/2010-2013%). A window's delta on each
//   balance (end anchor − start-1 anchor, same anchor pattern as the cash
//   circle) reconstructs each component's cash contribution. The CFS view's
//   OP_WC bucket ALSO includes the VAT control accounts (20269/20270), which
//   v_working_capital_monthly does not carry — the residual
//   (operating_wc_change − reconstructed AR/Inv/AP) is exactly that VAT
//   movement, verified empirically to the cent across the full 2021-2026
//   history before shipping. Shown as its own honestly-labeled line, never
//   folded silently into receivables or payables.
//
//   Investing (capex) / Financing (equity, intercompany) drills —
//   v_balance_sheet_monthly (already fetched by this hook for the cash
//   anchors) carries per-line monthly balances at exactly the granularity
//   the warehouse exposes to `authenticated`: two fixed-asset lines
//   (A_PPE, A_OFA), the six real equity accounts (E_CAPITAL, E_OWN_*,
//   E_RE_BOOKS, E_UNMAPPED fallback) and the two intercompany lines
//   (IC_1108001, IC_1108002). A window's delta on each line's dr-signed
//   balance reconstructs that line's contribution to investing_cash_flow /
//   financing_equity / financing_intercompany EXACTLY — verified empirically
//   to the cent across the full history before shipping (see
//   `bsLineContribution` below for the one formula that holds for all three).
//   No raw ledger-line query is used anywhere on this page (qoyod_accounts /
//   qoyod_journal_entry_lines are not readable by `authenticated` either —
//   verified empirically the same way).
//
//   v_balance_sheet_monthly stops at the last CLOSED month (by its own
//   contract) — a window reaching into the still-open current month has no
//   drill detail for investing/financing yet (the top-level total from
//   v_cashflow_statement_monthly still shows, live). Handled the same way
//   the rest of this page handles an open month: a plain note, never a
//   fabricated zero.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAlignment, type ComparisonMode } from "@/contexts/AlignmentContext";
import { computeMtdProration, type Win, type MtdProration } from "@/data/alignment";
import { monthKey, monthKeyLabel, shiftMonthKey } from "@/data/liveData";
import {
  useCashflowMonthly, useBalanceSheet, useBankBalances, useCashflowBudgetComparison,
  useWorkingCapitalMonthly,
  type CashflowMonthRow, type CashflowBudgetRow, type BankBalanceRow, type BalanceSheetRow,
  type WorkingCapitalMonthRow,
} from "@/data/statementsLive";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";
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

// ------------------------------------------------------- customer receipts
//
// v_collections_monthly (migration 032): payment allocations to invoices
// from RECEIVED payments — a real, itemized direct-cash-receipts figure,
// already granted to `authenticated`. This is the ONLY direct-cash-in/out
// read path the warehouse exposes to the frontend (raw qoyod_payments is
// RLS service-role-only — verified empirically, see file header).
interface CollectionsMonthRow {
  period_month: string;
  collections_sar: number | null;
}

const useCollectionsMonthly = () =>
  useQuery({
    queryKey: ["v_collections_monthly"],
    queryFn: async (): Promise<CollectionsMonthRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("v_collections_monthly")
        .select("period_month,collections_sar")
        .order("period_month", { ascending: true })
        .limit(1000);
      if (error) throw toFriendlyError(error);
      return (data ?? []) as CollectionsMonthRow[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
  });

/** Sums collections over a window; null only when NOT ONE month in the
 * window has a collections row at all (absent ≠ zero). */
const sumCollections = (rows: CollectionsMonthRow[] | undefined, w: Win): number | null => {
  if (!rows) return null;
  let sum = 0;
  let any = false;
  for (const r of rows) {
    const k = monthKey(r.period_month);
    if (!inWin(k, w)) continue;
    if (r.collections_sar !== null) { sum += r.collections_sar; any = true; }
  }
  return any ? sum : null;
};

// --------------------------------------------------- working-capital drill

interface WcStock { receivables: number; inventory: number; payables: number }

const wcStockAt = (rows: WorkingCapitalMonthRow[] | undefined, k: string): WcStock | null => {
  if (!rows) return null;
  const row = rows.find((r) => monthKey(r.period_month) === k);
  if (!row) return null;
  return { receivables: n(row.receivables), inventory: n(row.inventory), payables: n(row.payables) };
};

interface WcDelta { dAr: number | null; dInv: number | null; dAp: number | null }

/** Balance delta across the window (end anchor − start-1 anchor) — same
 * anchor pattern the cash-position circle already uses. A stock difference,
 * never pro-rated (see file header). */
const wcDelta = (rows: WorkingCapitalMonthRow[] | undefined, w: Win): WcDelta => {
  const start = wcStockAt(rows, shiftMonthKey(w.startKey, -1));
  const end = wcStockAt(rows, w.endKey);
  if (!start || !end) return { dAr: null, dInv: null, dAp: null };
  return {
    dAr: end.receivables - start.receivables,
    dInv: end.inventory - start.inventory,
    dAp: end.payables - start.payables,
  };
};

const arContribution = (d: WcDelta): number | null => (d.dAr === null ? null : -d.dAr);
const invContribution = (d: WcDelta): number | null => (d.dInv === null ? null : -d.dInv);
const apContribution = (d: WcDelta): number | null => (d.dAp === null ? null : d.dAp);

/** The residual (VAT-control-account timing) that makes AR+Inv+AP tie
 * exactly to operating_wc_change — verified empirically to be exactly the
 * VAT movement, to the cent, across the full 2021-2026 history. */
const vatResidual = (wcChange: number, d: WcDelta): number | null => {
  const ar = arContribution(d); const inv = invContribution(d); const ap = apContribution(d);
  if (ar === null || inv === null || ap === null) return null;
  return wcChange - (ar + inv + ap);
};

// --------------------------------------------------- investing/financing drill
//
// v_balance_sheet_monthly line codes this drill reads (all real, all already
// fetched by `useBalanceSheet` for the cash anchors — no extra query):
//   Investing  — A_PPE ("Property, plant & equipment"), A_OFA ("Capital
//                 works & other fixed assets")
//   Equity     — E_CAPITAL, E_OWN_30202..30205, E_RE_BOOKS, E_UNMAPPED
//   Intercompany — IC_1108001 ("Hospital Jeddah New"), IC_1108002 ("Family Office")
const bsSignedAt = (rows: BalanceSheetRow[], k: string, lineCode: string): number | null => {
  const row = rows.find((r) => monthKey(r.month) === k && r.line_code === lineCode);
  if (!row) return null;
  // dr-signed reconstruction: the view flips sign to present Liabilities/
  // Equity as natural positives; undoing that flip recovers the dr-signed
  // ledger balance, whose window delta ties to the CFS view's ledger-mv
  // formula EXACTLY (verified to the cent across the full 2021-2026 history).
  return row.section === "Assets" ? row.amount : -row.amount;
};

/** One line's contribution to its CFS bucket over the window = −Δ(dr-signed
 * balance). The SAME formula holds for investing (capex), financing-equity
 * and financing-intercompany — only the line codes differ. Null when either
 * anchor month is missing from v_balance_sheet_monthly (pre-ledger horizon,
 * or the window reaches into the still-open month the BS view doesn't emit
 * yet — never a fabricated zero). */
const bsLineContribution = (rows: BalanceSheetRow[], w: Win, lineCode: string): number | null => {
  const start = bsSignedAt(rows, shiftMonthKey(w.startKey, -1), lineCode);
  const end = bsSignedAt(rows, w.endKey, lineCode);
  if (start === null || end === null) return null;
  return -(end - start);
};

export interface DrillItem {
  key: string;
  label: string;
  actual: number | null;
  comparison: number | null;
  explainer?: string;
}

const INVESTING_LINES: Array<{ code: string; label: string }> = [
  { code: "A_PPE", label: "Property, plant & equipment" },
  { code: "A_OFA", label: "Capital works & other fixed assets" },
];
const EQUITY_LINES: Array<{ code: string; label: string }> = [
  { code: "E_CAPITAL", label: "Share capital" },
  { code: "E_OWN_30202", label: "Shareholder current account — Mrs. Arwa" },
  { code: "E_OWN_30203", label: "Shareholder current account — Dr. Hamed" },
  { code: "E_OWN_30204", label: "Shareholder current account — Dr. Khaled" },
  { code: "E_OWN_30205", label: "Shareholder current account — Madam Arij" },
  { code: "E_RE_BOOKS", label: "Retained earnings (per books)" },
  { code: "E_UNMAPPED", label: "Other owner movements" },
];
// Family Office (IC_1108002) sits under Financing/intercompany here because
// that is how v_cashflow_statement_monthly's OWN split works (financing_
// intercompany = code LIKE '1108%') — moving it would break the cent-tie.
// The Balance Sheet page (fix-20, same day) reclassifies this SAME balance
// as "equity-equivalent" for its managerial read — a presentation choice on
// that page only, no view change. Cross-referenced here so the two pages
// don't read as contradictory.
const INTERCO_LINES: Array<{ code: string; label: string; explainer?: string }> = [
  {
    code: "IC_1108002", label: "Family Office",
    explainer: "Classified here as intercompany, matching the cash-flow statement's own split. The Balance Sheet page treats this same balance as equity-equivalent for a managerial read — two lenses on one number, per Marcello's 2026-08-03 decision.",
  },
  { code: "IC_1108001", label: "Hospital Jeddah New" },
];

const DRILL_EPSILON = 0.5;

/** Builds the named-item drill for one bucket: only lines with REAL
 * (non-zero) movement in the actual window OR the comparison window are
 * shown — "no clutter" — never a fabricated zero for an inactive line.
 * `cmpFraction` mirrors the MTD pro-ration already applied to the parent
 * row's comparison total (`scaleCfAgg`) — without it, a partial-month
 * comparison would show FULL prior-year-month figures on the child rows
 * while the parent shows the pro-rated total, so children would no longer
 * sum to their own parent. */
const buildBsDrill = (
  bsRows: BalanceSheetRow[], win: Win, cmpWin: Win | null, lines: Array<{ code: string; label: string; explainer?: string }>,
  cmpFraction: number | null,
): DrillItem[] => {
  const items: DrillItem[] = [];
  for (const { code, label, explainer } of lines) {
    const actual = bsLineContribution(bsRows, win, code);
    const cmpRaw = cmpWin ? bsLineContribution(bsRows, cmpWin, code) : null;
    const comparison = cmpRaw !== null && cmpFraction !== null ? cmpRaw * cmpFraction : cmpRaw;
    const hasActivity = (actual !== null && Math.abs(actual) >= DRILL_EPSILON) || (comparison !== null && Math.abs(comparison) >= DRILL_EPSILON);
    if (hasActivity) items.push({ key: code, label, actual, comparison, explainer });
  }
  return items;
};

// --------------------------------------------------------------- exports

export interface CashFlowLineRow {
  key: string;
  label: string;
  /** Null = genuinely no data for this window (never a fabricated zero —
   * "absent ≠ zero" is a hard rule everywhere else in this cockpit). */
  actual: number | null;
  comparison: number | null;
  comparisonUnavailableReason?: string;
  /** Mirrors `comparisonUnavailableReason` for the ACTUAL column — used by
   * the drill rows, where a "—" can come from a genuinely missing anchor
   * month (e.g. the still-open month) rather than "no data posted at all". */
  actualUnavailableReason?: string;
  indent: 0 | 1 | 2;
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
  /** Plain-language tooltip — "no naked jargon anywhere on the page"
   * (Marcello, fix-19 mandate). Shown via a small info icon next to the
   * label. */
  explainer?: string;
  /** Fixed cash-direction styling (azure "in" / red "out") for the
   * manager's cash-in/cash-out view — independent of the delta-vs-
   * comparison tone used everywhere else on this table. */
  flow?: "in" | "out";
  /** A short caption rendered as its own line ABOVE this row, with no
   * numeric columns — used once, to mark the accounting (indirect-method)
   * reconciliation as an alternate lens on the SAME operating-cash-flow
   * total shown just above, not an additional amount. */
  captionAbove?: string;
  /** A small persistent note under the label (not hidden in a tooltip) —
   * used for the one row whose figure is derived rather than itemized. */
  subNote?: string;
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
  /** Distinct months actually present in the CF fact rows. No longer used to
   * filter the WindowPicker's month list (2026-08-03: the shared selector
   * now lists every calendar month/quarter regardless of data — see
   * `AlignmentChrome`'s `WindowPicker` — an unfed one shows the page's own
   * "—" empty state instead of being hidden from the picker). Kept for any
   * other data-presence checks on this page. */
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
  const { data: wcRows, isLoading: wcLoading } = useWorkingCapitalMonthly();
  const { data: collectionsRows, isLoading: collectionsLoading } = useCollectionsMonthly();

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

  // ---------------------------------------------- manager's cash-in/out view
  const cashInActualRaw = useMemo(() => sumCollections(collectionsRows, win), [collectionsRows, win]);
  const cashInPriorRaw = useMemo(() => sumCollections(collectionsRows, py), [collectionsRows, py]);
  const cashInPrior = cashInPriorRaw !== null && mtdPro ? cashInPriorRaw * mtdPro.fraction : cashInPriorRaw;

  // Cash out is DERIVED so the two lines tie to Operating Cash Flow EXACTLY
  // (cash in + cash out = operating cash flow, cash out shown negative) —
  // see file header for why an itemized figure isn't available.
  const cashOutActual = cashInActualRaw !== null && !noActualData ? -(cashInActualRaw - actualAgg.operatingCashFlow) : null;
  const cashOutPrior = cashInPrior !== null && !noPriorData ? -(cashInPrior - priorAgg.operatingCashFlow) : null;

  // ---------------------------------------------------- working-capital drill
  const wcDeltaActual = useMemo(() => wcDelta(wcRows, win), [wcRows, win]);
  const wcDeltaPriorRaw = useMemo(() => wcDelta(wcRows, py), [wcRows, py]);
  const wcDeltaPrior = useMemo(() => (mtdPro
    ? {
        dAr: wcDeltaPriorRaw.dAr === null ? null : wcDeltaPriorRaw.dAr * mtdPro.fraction,
        dInv: wcDeltaPriorRaw.dInv === null ? null : wcDeltaPriorRaw.dInv * mtdPro.fraction,
        dAp: wcDeltaPriorRaw.dAp === null ? null : wcDeltaPriorRaw.dAp * mtdPro.fraction,
      }
    : wcDeltaPriorRaw), [wcDeltaPriorRaw, mtdPro]);

  // ------------------------------------------------- investing/financing drill
  const bsRowsAvail = useMemo(() => (bsData?.available ? bsData.rows : []), [bsData]);
  const cmpFraction = mtdPro ? mtdPro.fraction : null;
  const investingDrill = useMemo(
    () => (bsData?.available ? buildBsDrill(bsRowsAvail, win, isBudgetMode ? null : py, INVESTING_LINES, cmpFraction) : []),
    [bsData, bsRowsAvail, win, py, isBudgetMode, cmpFraction],
  );
  const equityDrill = useMemo(
    () => (bsData?.available ? buildBsDrill(bsRowsAvail, win, isBudgetMode ? null : py, EQUITY_LINES, cmpFraction) : []),
    [bsData, bsRowsAvail, win, py, isBudgetMode, cmpFraction],
  );
  const intercoDrill = useMemo(
    () => (bsData?.available ? buildBsDrill(bsRowsAvail, win, isBudgetMode ? null : py, INTERCO_LINES, cmpFraction) : []),
    [bsData, bsRowsAvail, win, py, isBudgetMode, cmpFraction],
  );
  // The BS view stops at the last CLOSED month — a window reaching past that
  // has no drill detail yet for investing/financing (the top-level total
  // above is still live from the CFS view). Detected by the end anchor being
  // unavailable while the start-1 anchor IS available (i.e. genuinely an
  // open-month gap, not simply "before the ledger horizon").
  const bsDrillUnavailableReason = !bsData?.available
    ? "Detail arrives with the balance-sheet view."
    : (bsSignedAt(bsRowsAvail, win.endKey, "A_PPE") === null && bsSignedAt(bsRowsAvail, shiftMonthKey(win.startKey, -1), "A_PPE") !== null)
      ? "Line-by-line detail arrives once this month closes — the balance-sheet view that carries it stops at the last closed month. The total above is live."
      : null;

  // Same open-month gap, for the working-capital explosion (v_working_
  // capital_monthly may not carry a row for the still-open current month
  // yet either) — the parent "Change in working capital" total above still
  // comes from the CFS view and stays live either way.
  const wcDrillUnavailableReason = !wcRows
    ? "Detail arrives with the working-capital view."
    : (wcStockAt(wcRows, win.endKey) === null && wcStockAt(wcRows, shiftMonthKey(win.startKey, -1)) !== null)
      ? "Line-by-line detail arrives once this month closes — the working-capital view that carries it stops at the last posted month. The total above is live."
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
      explainer: "Cash generated (or used) by the day-to-day business — members, clients, suppliers, staff.",
    });
    if (!isBudgetMode) {
      out.push({
        key: "operating.cashin", parentKey: "operating", label: "Cash collected from customers",
        actual: noActualData ? null : cashInActualRaw,
        comparison: noPriorData ? null : cashInPrior,
        indent: 1, expandable: false, flow: "in",
        explainer: "Real payments received from members and clients this window — straight from the payment log, not an accounting estimate.",
      });
      out.push({
        key: "operating.cashout", parentKey: "operating", label: "Cash paid out",
        actual: noActualData ? null : cashOutActual,
        comparison: noPriorData ? null : cashOutPrior,
        indent: 1, expandable: false, flow: "out",
        explainer: "Everything that left the bank for the business — suppliers, payroll, day-to-day running costs.",
        subNote: "Derived from the accounting ledger (cash in − this = operating cash flow) — a line-by-line supplier/payroll breakdown isn't available in the warehouse yet; it arrives once the bank feed is connected.",
      });

      out.push({
        key: "operating.result", parentKey: "operating", label: "Accounting profit before non-cash costs",
        actual: actualOr(actualAgg.operatingResult), comparison: cmp("operatingResult", null),
        indent: 1, expandable: false,
        captionAbove: "The same total, from the accounting ledger:",
        explainer: "Revenue booked minus costs booked, before depreciation — the accounting starting point for the reconciliation below.",
      });
      out.push({
        key: "operating.wc", parentKey: "operating", label: "Change in working capital",
        actual: actualOr(actualAgg.operatingWcChange), comparison: cmp("operatingWcChange", null),
        indent: 1, expandable: true,
        explainer: "Cash tied up or freed by customers paying late, suppliers being paid later, or stock sitting on the shelf.",
      });
      out.push({
        key: "operating.wc.ar", parentKey: "operating.wc", label: "Change in customer receivables",
        actual: noActualData ? null : arContribution(wcDeltaActual),
        comparison: noPriorData ? null : arContribution(wcDeltaPrior),
        indent: 2, expandable: false,
        explainer: "Cash trapped in unpaid invoices — negative means customers owe more than before; positive means they've paid down what they owed.",
        actualUnavailableReason: !noActualData && arContribution(wcDeltaActual) === null ? (wcDrillUnavailableReason ?? undefined) : undefined,
      });
      out.push({
        key: "operating.wc.ap", parentKey: "operating.wc", label: "Change in supplier payables",
        actual: noActualData ? null : apContribution(wcDeltaActual),
        comparison: noPriorData ? null : apContribution(wcDeltaPrior),
        indent: 2, expandable: false,
        explainer: "Cash held onto by paying suppliers later — positive means more cash kept in hand than before.",
        actualUnavailableReason: !noActualData && apContribution(wcDeltaActual) === null ? (wcDrillUnavailableReason ?? undefined) : undefined,
      });
      out.push({
        key: "operating.wc.inv", parentKey: "operating.wc", label: "Change in inventory",
        actual: noActualData ? null : invContribution(wcDeltaActual),
        comparison: noPriorData ? null : invContribution(wcDeltaPrior),
        indent: 2, expandable: false,
        explainer: "Cash tied up in stock sitting on the shelf — negative means more stock was bought than sold down.",
        actualUnavailableReason: !noActualData && invContribution(wcDeltaActual) === null ? (wcDrillUnavailableReason ?? undefined) : undefined,
      });
      out.push({
        key: "operating.wc.vat", parentKey: "operating.wc", label: "VAT timing",
        actual: noActualData ? null : vatResidual(actualAgg.operatingWcChange, wcDeltaActual),
        comparison: noPriorData ? null : vatResidual(priorAgg.operatingWcChange, wcDeltaPrior),
        indent: 2, expandable: false,
        explainer: "Movement in VAT collected from members/clients and owed to ZATCA — a timing difference, not part of receivables or payables.",
        actualUnavailableReason: !noActualData && vatResidual(actualAgg.operatingWcChange, wcDeltaActual) === null ? (wcDrillUnavailableReason ?? undefined) : undefined,
      });
      out.push({
        key: "operating.da", parentKey: "operating", label: "Depreciation add-back (non-cash)",
        actual: actualOr(actualAgg.operatingDaNoncash), comparison: cmp("operatingDaNoncash", null),
        indent: 1, expandable: false,
        explainer: "An accounting cost that never moves cash — added back so the total reflects real cash, not bookkeeping.",
      });
    }

    out.push({
      key: "investing", label: "Investing cash flow", actual: actualOr(actualAgg.investingCashFlow),
      comparison: cmp("investingCashFlow", "investingBudget"),
      indent: 0, expandable: !isBudgetMode, emphasis: true,
      explainer: "Money spent on or recovered from long-term assets — buildings, arenas, vehicles, equipment.",
    });
    if (!isBudgetMode) {
      if (investingDrill.length > 0) {
        for (const item of investingDrill) {
          out.push({
            key: `investing.${item.key}`, parentKey: "investing", label: item.label,
            actual: item.actual, comparison: item.comparison,
            indent: 1, expandable: false,
            actualUnavailableReason: item.actual === null ? (bsDrillUnavailableReason ?? undefined) : undefined,
          });
        }
      } else {
        out.push({
          key: "investing.empty", parentKey: "investing",
          label: bsDrillUnavailableReason ? "Detail not available yet" : "No fixed-asset activity this window",
          actual: null, comparison: null, indent: 1, expandable: false,
          actualUnavailableReason: bsDrillUnavailableReason ?? "Nothing posted to a fixed-asset account this window.",
        });
      }
    }

    out.push({
      key: "financing", label: "Financing cash flow", actual: actualOr(actualAgg.financingCashFlow),
      comparison: cmp("financingCashFlow", "financingBudget"),
      indent: 0, expandable: !isBudgetMode, emphasis: true,
      explainer: "Money moved with the owners and related entities — capital, shareholder current accounts, intercompany transfers.",
    });
    if (!isBudgetMode) {
      out.push({
        key: "financing.equity", parentKey: "financing", label: "Owner & capital movements",
        actual: actualOr(actualAgg.financingEquity), comparison: cmp("financingEquity", null),
        indent: 1, expandable: true,
        explainer: "Capital injections, share capital, and the shareholders' current accounts.",
      });
      if (equityDrill.length > 0) {
        for (const item of equityDrill) {
          out.push({
            key: `financing.equity.${item.key}`, parentKey: "financing.equity", label: item.label,
            actual: item.actual, comparison: item.comparison, indent: 2, expandable: false, explainer: item.explainer,
            actualUnavailableReason: item.actual === null ? (bsDrillUnavailableReason ?? undefined) : undefined,
          });
        }
      } else {
        out.push({
          key: "financing.equity.empty", parentKey: "financing.equity",
          label: bsDrillUnavailableReason ? "Detail not available yet" : "No owner/capital movement this window",
          actual: null, comparison: null, indent: 2, expandable: false,
          actualUnavailableReason: bsDrillUnavailableReason ?? "No shareholder or capital account moved this window.",
        });
      }

      out.push({
        key: "financing.intercompany", parentKey: "financing", label: "Family Office & related-entity movements",
        actual: actualOr(actualAgg.financingIntercompany), comparison: cmp("financingIntercompany", null),
        indent: 1, expandable: true,
        explainer: "Transfers with the Family Office and the Hospital Jeddah New entity.",
      });
      if (intercoDrill.length > 0) {
        for (const item of intercoDrill) {
          out.push({
            key: `financing.intercompany.${item.key}`, parentKey: "financing.intercompany", label: item.label,
            actual: item.actual, comparison: item.comparison, indent: 2, expandable: false, explainer: item.explainer,
            actualUnavailableReason: item.actual === null ? (bsDrillUnavailableReason ?? undefined) : undefined,
          });
        }
      } else {
        out.push({
          key: "financing.intercompany.empty", parentKey: "financing.intercompany",
          label: bsDrillUnavailableReason ? "Detail not available yet" : "No intercompany movement this window",
          actual: null, comparison: null, indent: 2, expandable: false,
          actualUnavailableReason: bsDrillUnavailableReason ?? "Nothing moved with a related entity this window.",
        });
      }
    }

    out.push({
      key: "other", label: "Other cash flow", actual: actualOr(actualAgg.otherCashFlow),
      comparison: isBudgetMode ? null : cmp("otherCashFlow", null),
      comparisonUnavailableReason: isBudgetMode && budgetAvailableForWin ? "No budget line for other cash flow." : undefined,
      indent: 0, expandable: false,
      explainer: "Smaller items outside the categories above — prepaid expenses, staff advances, and similar.",
    });

    out.push({
      key: "net", label: "Net change in cash", actual: actualOr(actualAgg.netCashFlow),
      comparison: cmp("netCashFlow", "netBudget"),
      indent: 0, expandable: false, subtotal: true, emphasis: true,
      explainer: "Everything above, added together — how much the bank balance actually moved this window.",
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
  }, [
    actualAgg, priorAgg, budgetAgg, isBudgetMode, budgetAvailableForWin, noActualData, noPriorData, win, openingActual, openingComparison, closingActual, closingComparison,
    cashInActualRaw, cashInPrior, cashOutActual, cashOutPrior, wcDeltaActual, wcDeltaPrior, wcDrillUnavailableReason, investingDrill, equityDrill, intercoDrill, bsDrillUnavailableReason,
  ]);

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
    isLoading: cfLoading || bsLoading || bankLoading || budgetLoading || wcLoading || collectionsLoading,
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
