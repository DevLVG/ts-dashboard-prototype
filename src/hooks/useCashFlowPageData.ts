// CASH FLOW PAGE DATA — Marcello's live-review rebuild, 2026-08-03.
// Extended 2026-08-03 (fix-19, 2nd round): the CEO's mandate is a manager's
// read of the statement — "where cash comes in, where it goes out, in human
// words" — not a second accounting rebuild. Every new figure below is an
// ADDITIVE view of the SAME warehouse totals already computed by
// v_cashflow_statement_monthly; nothing here changes a top-level number.
//
// fix-26 (2026-08-04, CEO cockpit review): the page was mixing TWO cash-flow
// methodologies at once — the manager statement (cash collected / cash paid
// out) AND, directly below it under "the same total, from the accounting
// ledger", the indirect (GL) reconciliation (accounting profit before
// non-cash costs, change in working capital with its AR/AP/inventory/VAT
// sub-rows, depreciation add-back). ONE method renders now: the manager
// statement only. The ledger reconciliation is NOT deleted — it stays a
// silent INTERNAL invariant computed right here (`operatingResult +
// operatingWcChange + operatingDaNoncash` must equal `operatingCashFlow`,
// to the cent) and asserted every render via `useLedgerTieOutCheck` below,
// which `console.warn`s if it ever breaks. Nothing of it renders. The
// working-capital drill (AR / AP / inventory / VAT timing) that used to
// expand under "Change in working capital" is removed from this page
// entirely, not just hidden — it already lives in Treasury → "Cash &
// Working Capital" (`TreasuryCash.tsx`, its own independent
// `useWorkingCapitalMonthly` call), which is the one place a manager should
// read that insight (Marcello, fix-26 mandate: "do not re-add here").
//
// fix-26 also closes the decomposition gap the CEO flagged ("Investing
// −113,806 with all children —"): every expandable row's children now sum
// to their parent EXACTLY, in both columns, every window, by CONSTRUCTION —
// see `reconcileDrill` below. Named balance-sheet lines (PPE, shareholder
// accounts, intercompany) are shown first; whatever real amount they don't
// explain is surfaced as one honest "Other movements" row rather than left
// as an unexplained gap between a real parent total and all-dash children.
//
// Page-agnostic aggregation layer for the Cash Flow screen, mirroring how
// `useKpiHeaderData` feeds the Economics KPI circles: reads the SAME global
// controls every aligned screen reads (`useAlignment` — window preset,
// Comparison [PY|Budget]) and the cash-flow warehouse views already wired
// into the app (`useCashflowMonthly`, `useBalanceSheet`, `useBankBalances`,
// `useCashflowBudgetComparison`). Does NOT read `useWorkingCapitalMonthly`
// (fix-26, 2026-08-04) — that insight lives only in Treasury now.
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
//   Working-capital explosion — REMOVED from this page 2026-08-04 (fix-26).
//   It rendered under "Change in working capital" as part of the accounting-
//   ledger reconciliation block the CEO asked removed wholesale (two
//   methodologies on one screen). The same insight (receivables / payables /
//   inventory / VAT-timing, from v_working_capital_monthly) lives in
//   Treasury → "Cash & Working Capital" — this page no longer fetches that
//   view at all.
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
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAlignment, type ComparisonMode } from "@/contexts/AlignmentContext";
import { computeMtdProration, type Win, type MtdProration } from "@/data/alignment";
import { monthKey, monthKeyLabel, shiftMonthKey } from "@/data/liveData";
import {
  useCashflowMonthly, useBalanceSheet, useBankBalances, useCashflowBudgetComparison,
  type CashflowMonthRow, type CashflowBudgetRow, type BankBalanceRow, type BalanceSheetRow,
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
  /** fix-26 (2026-08-04): a label (e.g. "Jun 2026") when the live total ties
   * EXACTLY to the last CLOSED month's book-cash snapshot — a real signal,
   * computed from this hook's own two cash anchors, that no bank/cash
   * ledger postings have hit since that close, however fresh the sync
   * timestamp looks. Null when the live total has genuinely moved since. */
  booksUnmovedSince: string | null;
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

// fix-26 (2026-08-04): root cause of the CEO's "Investing −113,806 with all
// children —" complaint. A "to-date" window (YTD, FY to date) ends TODAY —
// but v_balance_sheet_monthly stops at the last CLOSED month, so calling
// `bsLineContribution` with the RAW window's end anchor (e.g. Aug when the
// last closed month is Jun) returns null for EVERY named line, even though
// the CF flow total itself (from v_cashflow_statement_monthly, which simply
// has no rows yet for the still-open months) already, correctly, reflects
// only the closed months. The two data sources were being asked about
// different windows. `capToClosedBs` fixes this by driving the drill off
// the SAME closed-months span the total naturally covers: whatever the
// window's own start is, cap its end at the last closed BS month. Returns
// the ORIGINAL window unchanged when nothing needs capping, and null only
// when the window hasn't closed AT ALL yet (its own start is already past
// the horizon, e.g. Month-to-date on the current month) — in that case the
// caller falls back to the raw window, which correctly yields no drill data
// (the existing "hasn't closed yet" message already covers that case).
const capToClosedBs = (w: Win, lastClosedBsMonth: string | null): Win | null => {
  if (!lastClosedBsMonth) return null;
  if (w.startKey > lastClosedBsMonth) return null;
  return w.endKey <= lastClosedBsMonth ? w : { startKey: w.startKey, endKey: lastClosedBsMonth };
};

export interface DrillItem {
  key: string;
  label: string;
  actual: number | null;
  comparison: number | null;
  explainer?: string;
  actualUnavailableReason?: string;
  comparisonUnavailableReason?: string;
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

// ------------------------------------------------ decomposition invariant
//
// fix-26 (2026-08-04, CEO cockpit review): "any rendered total must equal
// the sum of its rendered children, in the same window" — no more totals
// with all-dash children and no explanation. `reconcileDrill` makes this
// true BY CONSTRUCTION for every expandable row that drills into named
// balance-sheet lines: whatever real amount the named lines above don't
// explain becomes one honest residual row, in EITHER column independently
// (actual and comparison can each have their own gap). If a NAMED line's
// own value is itself unavailable for this window (open month / pre-ledger
// horizon), a clean residual can't be computed — the residual row still
// renders, but flagged "—" with the same reason, rather than silently
// guessing a number.
const RECONCILE_EPSILON = 0.5;

const reconcileDrill = (
  named: DrillItem[],
  parentActual: number | null,
  parentComparison: number | null,
  residualLabel: string,
  residualExplainer: string,
): DrillItem[] => {
  const actualGap = named.some((i) => i.actual === null);
  const comparisonGap = named.some((i) => i.comparison === null);
  const actualSum = named.reduce((s, i) => s + (i.actual ?? 0), 0);
  const comparisonSum = named.reduce((s, i) => s + (i.comparison ?? 0), 0);

  const residualActual = parentActual !== null && !actualGap ? parentActual - actualSum : null;
  const residualComparison = parentComparison !== null && !comparisonGap ? parentComparison - comparisonSum : null;

  const showActual = residualActual !== null && Math.abs(residualActual) >= RECONCILE_EPSILON;
  const showComparison = residualComparison !== null && Math.abs(residualComparison) >= RECONCILE_EPSILON;

  if (!showActual && !showComparison) return named;

  return [
    ...named,
    {
      key: "residual",
      label: residualLabel,
      actual: actualGap ? null : residualActual,
      comparison: comparisonGap ? null : residualComparison,
      explainer: residualExplainer,
      actualUnavailableReason: actualGap ? "One or more named lines above don't have a figure for this window yet, so the remainder can't be isolated honestly — shown as \"—\" rather than guessed." : undefined,
      comparisonUnavailableReason: comparisonGap ? "One or more named lines above don't have a figure for the comparison window yet, so the remainder can't be isolated honestly — shown as \"—\" rather than guessed." : undefined,
    },
  ];
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

  /** fix-26 (2026-08-04, CEO review — "abbiamo meno soldi di quanto avrei
   * voluto, verificalo"): the sync-freshness badge above only proves OUR
   * sync job ran, not that the underlying Qoyod ledger has actually been
   * kept current. When the live bank total ties EXACTLY to the last CLOSED
   * month's book-cash snapshot, that is real evidence no bank/cash JE has
   * posted since that close — both anchors are already fetched by this
   * hook (`bookCashByMonth`, `liveBankTotal`), no extra query needed. */
  const lastClosedBookMonth = useMemo(() => {
    const keys = [...bookCashByMonth.keys()].sort();
    return keys.length > 0 ? keys[keys.length - 1] : null;
  }, [bookCashByMonth]);

  const booksUnmovedSinceMonth = useMemo(() => {
    if (!lastClosedBookMonth || liveBankTotal === null || lastClosedBookMonth === todayKey) return null;
    const lastClosedTotal = bookCashByMonth.get(lastClosedBookMonth);
    if (lastClosedTotal === undefined) return null;
    return Math.abs(liveBankTotal - lastClosedTotal) < 0.5 ? lastClosedBookMonth : null;
  }, [lastClosedBookMonth, liveBankTotal, bookCashByMonth, todayKey]);

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

  // fix-26 (2026-08-04): the accounting-ledger reconciliation (operating
  // result + change in working capital + depreciation add-back = operating
  // cash flow) no longer RENDERS on this page — see file header. It stays a
  // live INTERNAL invariant: every render, both windows are checked to the
  // cent, and any break is surfaced loudly in the console rather than
  // silently drifting. This is a dev/ops signal, not a UI element.
  useEffect(() => {
    const check = (label: string, agg: CfWindowAgg) => {
      if (agg.monthsCovered === 0) return;
      const ledgerTotal = agg.operatingResult + agg.operatingWcChange + agg.operatingDaNoncash;
      const drift = ledgerTotal - agg.operatingCashFlow;
      if (Math.abs(drift) >= 0.5) {
        // eslint-disable-next-line no-console
        console.warn(
          `[CashFlow tie-out] ${label}: accounting-ledger reconstruction (operating result + Δ working capital + D&A add-back = ${ledgerTotal.toFixed(2)}) does not match operating cash flow (${agg.operatingCashFlow.toFixed(2)}) — drift ${drift.toFixed(2)} SAR. This is the invariant the manager statement's "Operating cash flow" total is built on; investigate the warehouse view before trusting this window's figures.`,
        );
      }
    };
    check(`${windowName} (actual)`, actualAgg);
    check(`${windowName} (comparison)`, priorAggRaw);
  }, [actualAgg, priorAggRaw, windowName]);

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

  // ------------------------------------------------- investing/financing drill
  const bsRowsAvail = useMemo(() => (bsData?.available ? bsData.rows : []), [bsData]);
  const cmpFraction = mtdPro ? mtdPro.fraction : null;

  // The last month v_balance_sheet_monthly actually carries — see
  // `capToClosedBs` above for why the drill must anchor here instead of the
  // window's raw (possibly still-open) end.
  const lastClosedBsMonth = useMemo(() => {
    if (bsRowsAvail.length === 0) return null;
    return bsRowsAvail.reduce((max, r) => {
      const k = monthKey(r.month);
      return k > max ? k : max;
    }, monthKey(bsRowsAvail[0].month));
  }, [bsRowsAvail]);

  const investingDrillWin = useMemo(() => capToClosedBs(win, lastClosedBsMonth) ?? win, [win, lastClosedBsMonth]);
  const investingDrillCmpWin = useMemo(
    () => (isBudgetMode ? null : (capToClosedBs(py, lastClosedBsMonth) ?? py)),
    [py, lastClosedBsMonth, isBudgetMode],
  );

  const investingDrill = useMemo(
    () => (bsData?.available ? buildBsDrill(bsRowsAvail, investingDrillWin, investingDrillCmpWin, INVESTING_LINES, cmpFraction) : []),
    [bsData, bsRowsAvail, investingDrillWin, investingDrillCmpWin, cmpFraction],
  );
  const equityDrill = useMemo(
    () => (bsData?.available ? buildBsDrill(bsRowsAvail, investingDrillWin, investingDrillCmpWin, EQUITY_LINES, cmpFraction) : []),
    [bsData, bsRowsAvail, investingDrillWin, investingDrillCmpWin, cmpFraction],
  );
  const intercoDrill = useMemo(
    () => (bsData?.available ? buildBsDrill(bsRowsAvail, investingDrillWin, investingDrillCmpWin, INTERCO_LINES, cmpFraction) : []),
    [bsData, bsRowsAvail, investingDrillWin, investingDrillCmpWin, cmpFraction],
  );
  // Two distinct messages: the window hasn't closed AT ALL yet (its own
  // start is past the last closed BS month — e.g. Month-to-date on the
  // current month: no drill data exists at all), vs. a "to-date" window
  // that's PARTIALLY closed (e.g. YTD reaching into today) — where the
  // drill above now covers the closed portion exactly and only the tail
  // isn't detailed yet.
  const bsDrillUnavailableReason = !bsData?.available
    ? "Detail arrives with the balance-sheet view."
    : !lastClosedBsMonth || win.startKey > lastClosedBsMonth
      ? "Line-by-line detail arrives once this month closes — the balance-sheet view that carries it stops at the last closed month. The total above is live."
      : win.endKey > lastClosedBsMonth
        ? `Detail below covers through ${monthKeyLabel(lastClosedBsMonth)} (the balance-sheet view's last closed month) — the total above already includes the still-open tail, live from the cash-flow view.`
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
      // These two rows tie to their parent EXACTLY by construction (cash out
      // is derived as cash in − operating cash flow — see file header), so
      // no residual row is needed here: the only failure mode is the
      // collections source itself having no data for this window, handled
      // below with an honest reason rather than a silent dash.
      const cashInGapReason = !noActualData && cashInActualRaw === null
        ? "No itemized collections data for this window yet." : undefined;
      const cashInGapReasonCmp = !noPriorData && cashInPrior === null
        ? "No itemized collections data for the comparison window yet." : undefined;
      out.push({
        key: "operating.cashin", parentKey: "operating", label: "Cash collected from customers",
        actual: noActualData ? null : cashInActualRaw,
        comparison: noPriorData ? null : cashInPrior,
        indent: 1, expandable: false, flow: "in",
        explainer: "Real payments received from members and clients this window — straight from the payment log, not an accounting estimate.",
        actualUnavailableReason: cashInGapReason, comparisonUnavailableReason: cashInGapReasonCmp,
      });
      out.push({
        key: "operating.cashout", parentKey: "operating", label: "Cash paid out",
        actual: noActualData ? null : cashOutActual,
        comparison: noPriorData ? null : cashOutPrior,
        indent: 1, expandable: false, flow: "out",
        explainer: "Everything that left the bank for the business — suppliers, payroll, day-to-day running costs.",
        subNote: "Derived from the accounting ledger (cash in − this = operating cash flow) — a line-by-line supplier/payroll breakdown isn't available in the warehouse yet; it arrives once the bank feed is connected.",
        actualUnavailableReason: cashInGapReason, comparisonUnavailableReason: cashInGapReasonCmp,
      });
    }

    const investingActual = actualOr(actualAgg.investingCashFlow);
    const investingComparison = cmp("investingCashFlow", "investingBudget");
    out.push({
      key: "investing", label: "Investing cash flow", actual: investingActual,
      comparison: investingComparison,
      indent: 0, expandable: !isBudgetMode, emphasis: true,
      explainer: "Money spent on or recovered from long-term assets — buildings, arenas, vehicles, equipment.",
    });
    if (!isBudgetMode) {
      const investingReconciled = reconcileDrill(
        investingDrill, investingActual, investingComparison,
        "Other fixed-asset movements",
        "Real movement this window not itemized by name above — the balance-sheet view names the two largest fixed-asset lines individually (property/plant/equipment and capital works); this is everything else the same investing total includes.",
      );
      if (investingReconciled.length > 0) {
        for (const item of investingReconciled) {
          out.push({
            key: `investing.${item.key}`, parentKey: "investing", label: item.label,
            actual: item.actual, comparison: item.comparison, explainer: item.explainer,
            indent: 1, expandable: false,
            actualUnavailableReason: item.actual === null ? (item.actualUnavailableReason ?? bsDrillUnavailableReason ?? undefined) : undefined,
            comparisonUnavailableReason: item.comparison === null ? item.comparisonUnavailableReason : undefined,
          });
        }
      } else {
        // No named line AND no residual needed: either the parent itself is
        // null (genuinely no data — flagged below) or its value is a real,
        // confirmed near-zero (nothing moved) — mirror the parent's OWN
        // value here rather than a hardcoded null, so this row still ties
        // to its parent exactly instead of silently showing "—" next to a
        // real (if tiny) parent figure.
        out.push({
          key: "investing.empty", parentKey: "investing",
          label: bsDrillUnavailableReason ? "Detail not available yet" : "No fixed-asset activity this window",
          actual: investingActual, comparison: investingComparison, indent: 1, expandable: false,
          actualUnavailableReason: investingActual === null ? (bsDrillUnavailableReason ?? "Nothing posted to a fixed-asset account this window.") : undefined,
          comparisonUnavailableReason: investingComparison === null ? (bsDrillUnavailableReason ?? "Nothing posted to a fixed-asset account this comparison window.") : undefined,
        });
      }
    }

    const financingActual = actualOr(actualAgg.financingCashFlow);
    const financingComparison = cmp("financingCashFlow", "financingBudget");
    out.push({
      key: "financing", label: "Financing cash flow", actual: financingActual,
      comparison: financingComparison,
      indent: 0, expandable: !isBudgetMode, emphasis: true,
      explainer: "Money moved with the owners and related entities — capital, shareholder current accounts, intercompany transfers.",
    });
    if (!isBudgetMode) {
      const financingEquityActual = actualOr(actualAgg.financingEquity);
      const financingEquityComparison = cmp("financingEquity", null);
      out.push({
        key: "financing.equity", parentKey: "financing", label: "Owner & capital movements",
        actual: financingEquityActual, comparison: financingEquityComparison,
        indent: 1, expandable: true,
        explainer: "Capital injections, share capital, and the shareholders' current accounts.",
      });
      const equityReconciled = reconcileDrill(
        equityDrill, financingEquityActual, financingEquityComparison,
        "Other owner movements",
        "Real movement this window not itemized by name above — the balance-sheet view names share capital, each shareholder's current account and retained earnings individually; this is everything else the same owner & capital total includes.",
      );
      if (equityReconciled.length > 0) {
        for (const item of equityReconciled) {
          out.push({
            key: `financing.equity.${item.key}`, parentKey: "financing.equity", label: item.label,
            actual: item.actual, comparison: item.comparison, indent: 2, expandable: false, explainer: item.explainer,
            actualUnavailableReason: item.actual === null ? (item.actualUnavailableReason ?? bsDrillUnavailableReason ?? undefined) : undefined,
            comparisonUnavailableReason: item.comparison === null ? item.comparisonUnavailableReason : undefined,
          });
        }
      } else {
        out.push({
          key: "financing.equity.empty", parentKey: "financing.equity",
          label: bsDrillUnavailableReason ? "Detail not available yet" : "No owner/capital movement this window",
          actual: financingEquityActual, comparison: financingEquityComparison, indent: 2, expandable: false,
          actualUnavailableReason: financingEquityActual === null ? (bsDrillUnavailableReason ?? "No shareholder or capital account moved this window.") : undefined,
          comparisonUnavailableReason: financingEquityComparison === null ? (bsDrillUnavailableReason ?? "No shareholder or capital account moved this comparison window.") : undefined,
        });
      }

      const financingIntercoActual = actualOr(actualAgg.financingIntercompany);
      const financingIntercoComparison = cmp("financingIntercompany", null);
      out.push({
        key: "financing.intercompany", parentKey: "financing", label: "Family Office & related-entity movements",
        actual: financingIntercoActual, comparison: financingIntercoComparison,
        indent: 1, expandable: true,
        explainer: "Transfers with the Family Office and the Hospital Jeddah New entity.",
      });
      const intercoReconciled = reconcileDrill(
        intercoDrill, financingIntercoActual, financingIntercoComparison,
        "Other related-entity movements",
        "Real movement this window not itemized by name above — the balance-sheet view names the Family Office and Hospital Jeddah New balances individually; this is everything else the same related-entity total includes.",
      );
      if (intercoReconciled.length > 0) {
        for (const item of intercoReconciled) {
          out.push({
            key: `financing.intercompany.${item.key}`, parentKey: "financing.intercompany", label: item.label,
            actual: item.actual, comparison: item.comparison, indent: 2, expandable: false, explainer: item.explainer,
            actualUnavailableReason: item.actual === null ? (item.actualUnavailableReason ?? bsDrillUnavailableReason ?? undefined) : undefined,
            comparisonUnavailableReason: item.comparison === null ? item.comparisonUnavailableReason : undefined,
          });
        }
      } else {
        out.push({
          key: "financing.intercompany.empty", parentKey: "financing.intercompany",
          label: bsDrillUnavailableReason ? "Detail not available yet" : "No intercompany movement this window",
          actual: financingIntercoActual, comparison: financingIntercoComparison, indent: 2, expandable: false,
          actualUnavailableReason: financingIntercoActual === null ? (bsDrillUnavailableReason ?? "Nothing moved with a related entity this window.") : undefined,
          comparisonUnavailableReason: financingIntercoComparison === null ? (bsDrillUnavailableReason ?? "Nothing moved with a related entity this comparison window.") : undefined,
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
    cashInActualRaw, cashInPrior, cashOutActual, cashOutPrior, investingDrill, equityDrill, intercoDrill, bsDrillUnavailableReason,
  ]);

  // --------------------------------------------------------- bank split
  const bankSplit: BankSplitData = useMemo(() => {
    const accounts: BankSplitAccount[] = (bankRows ?? [])
      .map((r: BankBalanceRow) => ({ code: r.qoyod_account_code, name: r.qoyod_account_name, balance: n(r.current_balance) }))
      .sort((a, b) => b.balance - a.balance);
    return { accounts, total: liveBankTotal, asOfIso: bankAsOfIso, stale: bankStale, booksUnmovedSince: booksUnmovedSinceMonth };
  }, [bankRows, liveBankTotal, bankAsOfIso, bankStale, booksUnmovedSinceMonth]);

  // Only worth a note when the live snapshot and the selected window's close
  // actually DIFFER — ties exactly (the common case: window ends on the
  // latest closed month) needs no caveat at all (Marcello: "pulito, minimal").
  const bankSplitNote = win.endKey !== todayKey && closingActual.value !== null && liveBankTotal !== null && Math.abs(liveBankTotal - closingActual.value) >= 0.5
    ? `Live snapshot, independent of the selected window. For ${monthKeyLabel(win.endKey)} close, book cash was ${fmtSAR(closingActual.value)} SAR.`
    : null;

  return {
    isLoading: cfLoading || bsLoading || bankLoading || budgetLoading || collectionsLoading,
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
