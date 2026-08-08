// KPI HEADER DATA — Marcello's live-review sketch (KPI circles + a current-
// vs-comparison histogram for Revenue / Gross Margin / EBITDA reported).
//
// Page-agnostic on purpose: this hook has NO dependency on any specific
// screen. It reads the same GLOBAL controls every aligned screen reads
// (`useAlignment` — window preset, the Comparison toggle [PY|Budget], the
// Scope toggle [All|Only Recurring]) and the same live data sources the P&L
// matrix and trend charts already use (`useBasisRows`, `useRecurrence`,
// `useBudgetMonthly`), calling the SAME aggregation functions
// (`aggregatePL` / `aggregateRecurring` / `aggregateBudgetWindow`) and the
// SAME MTD pro-ration rule (`computeMtdProration` + `prorateAgg` /
// `prorateRecurring` / `prorateBudget`). Nothing here invents a new data path
// or a rival toggle — whichever page mounts the KPI circles / histogram, the
// figures tie to whatever the P&L table on that page already shows.
//
// Basis: pinned to STRICT everywhere (2026-08-03 decision, see
// AlignmentContext) — there is no basis toggle left to read.
import { useMemo } from "react";
import { useAlignment, type ComparisonMode } from "@/contexts/AlignmentContext";
import {
  useBasisRows, useRecurrence, aggregatePL, aggregateRecurring,
  aggregateBudgetWindow, computeMtdProration, prorateAgg, prorateRecurring,
  prorateBudget, type Win,
} from "@/data/alignment";
import { useBudgetMonthly, monthKey } from "@/data/liveData";
import { comparePct } from "@/lib/format";

export type KpiKey = "revenue" | "grossMargin" | "ebitda";

export interface KpiHeaderMetric {
  key: KpiKey;
  label: string;
  /** The window's actual value on the active scope (SAR, signed) — null when
   * the window is entirely unfed (e.g. a future/not-yet-posted quarter):
   * "absent ≠ zero" (same rule Cash Flow's `useCashFlowPageData` already
   * applies), never a fabricated 0 with a meaningless +/-100% delta. */
  actual: number | null;
  /** The active comparison's value (PY or Budget, whichever the global
   * toggle selects) — null when it genuinely doesn't exist for this window
   * (e.g. Budget for Jun-26, a recurring-scope split budget doesn't carry,
   * or the PY window itself is entirely unfed), never a fabricated zero. */
  comparison: number | null;
  /** Plain-language reason `comparison` is null — undefined when it exists. */
  comparisonUnavailableReason?: string;
  deltaAbs: number | null;
  deltaPct: number | null;
}

export interface KpiHeaderData {
  isLoading: boolean;
  isError: boolean;
  metrics: KpiHeaderMetric[];
  comparisonMode: ComparisonMode;
  /** "Previous Year" | "Budget" — plain label for the active comparison. */
  comparisonLabel: string;
  windowName: string;
  winLabelText: string;
  /** True when the active window is Month-to-date — Budget/PY are pro-rated
   * to elapsed calendar days, same rule as the P&L matrix (never the Actual). */
  mtdProrated: boolean;
  /** True when the selected window has ZERO warehouse fact rows at all (e.g.
   * a future calendar quarter picked from the always-visible Q1-Q4 list
   * before it's fed) — every metric's `actual` is null in this case. Exposed
   * so consuming components (circles, histogram) can show one shared honest
   * empty-state note instead of three silent per-metric dashes. */
  noActualData: boolean;
}

/** Budget non-recurring project lines (Leveredge mandate / F&F campaigns) —
 * mirrors the P&L matrix's own recurring-budget split (spec §1.1 View B).
 * Not exported from the data layer, so re-stated here (a mapping rule on
 * moa_code, not a number) purely to keep the recurring-scope Revenue
 * comparison consistent with the table below it. */
const isBudgetNonRecLine = (moa: string): boolean => moa.startsWith("GA-NRP") || moa === "MS-FFC";

/** Distinct months, within a window, that have at least one warehouse fact
 * row (any section) — zero means the window is entirely unfed (e.g. a
 * future/not-yet-posted calendar quarter picked from the always-visible
 * Q1-Q4 list). Mirrors the "absent ≠ zero" `monthsCovered` guard
 * `useCashFlowPageData` already applies on Cash Flow; added here 2026-08-03
 * after Marcello flagged a fabricated 0/+100% delta on an unfed quarter.
 * Kept LOCAL to this hook rather than added to `aggregatePL` in
 * `data/alignment.ts` — that file is owned by fix-10-selector this round —
 * so this reads the same `rows`/`win` the hook already has with zero change
 * to the shared data layer. */
const monthsCoveredInWin = (rows: { period_month: string }[] | undefined, w: Win): number => {
  if (!rows) return 0;
  const covered = new Set<string>();
  for (const r of rows) {
    const k = monthKey(r.period_month);
    if (k >= w.startKey && k <= w.endKey) covered.add(k);
  }
  return covered.size;
};

const buildMetric = (
  key: KpiKey,
  label: string,
  actual: number | null,
  py: number | null,
  budget: number | null,
  comparisonMode: ComparisonMode,
  budgetNaReason?: string,
  pyNaReason?: string,
): KpiHeaderMetric => {
  const comparison = comparisonMode === "BUDGET" ? budget : py;
  const deltaAbs = actual === null || comparison === null ? null : actual - comparison;
  // comparePct (not pctChange): 2026-08-04, owner-audit #7 — nulls out a
  // sign-flip (loss-to-profit swing) or near-zero base instead of dividing
  // by it into a technically-correct but misleading large percentage.
  const deltaPct = actual === null || comparison === null ? null : comparePct(actual, comparison);
  return {
    key,
    label,
    actual,
    comparison,
    comparisonUnavailableReason: comparison === null
      ? (comparisonMode === "BUDGET" ? budgetNaReason : pyNaReason)
      : undefined,
    deltaAbs,
    deltaPct,
  };
};

export const useKpiHeaderData = (): KpiHeaderData => {
  const { win, py, preset, todayKey, comparisonMode, scope, windowName, winLabelText } = useAlignment();
  const { data: basisData, isLoading: rowsLoading, isError } = useBasisRows();
  const { data: rec } = useRecurrence();
  const { data: budgetRows, isLoading: budgetLoading } = useBudgetMonthly();

  const rows = basisData?.rows;
  const basis = "STRICT" as const; // pinned everywhere — see AlignmentContext

  const mtdPro = useMemo(() => (preset === "MTD" ? computeMtdProration(todayKey) : null), [preset, todayKey]);

  // Empty-window honesty gates (2026-08-03 add-on) — see `monthsCoveredInWin`.
  const noActualData = useMemo(() => monthsCoveredInWin(rows, win) === 0, [rows, win]);
  const noPriorData = useMemo(() => monthsCoveredInWin(rows, py) === 0, [rows, py]);
  const pyNaReason = noPriorData ? `No previous-year data posted yet for ${windowName}.` : undefined;

  const actual = useMemo(() => aggregatePL(rows, basis, win), [rows, win]);
  const priorRaw = useMemo(() => aggregatePL(rows, basis, py), [rows, py]);
  const prior = useMemo(() => (mtdPro ? prorateAgg(priorRaw, mtdPro.fraction) : priorRaw), [priorRaw, mtdPro]);
  const budgetRaw = useMemo(() => aggregateBudgetWindow(budgetRows, win), [budgetRows, win]);
  const budget = useMemo(() => (mtdPro ? prorateBudget(budgetRaw, mtdPro.fraction) : budgetRaw), [budgetRaw, mtdPro]);

  const recActual = useMemo(() => aggregateRecurring(rows, basis, win, rec), [rows, win, rec]);
  const recPriorRaw = useMemo(() => aggregateRecurring(rows, basis, py, rec), [rows, py, rec]);
  const recPrior = useMemo(() => (mtdPro ? prorateRecurring(recPriorRaw, mtdPro.fraction) : recPriorRaw), [recPriorRaw, mtdPro]);

  // Recurring-scope budget Revenue only (mirrors the matrix's recBudget
  // split) — Gross Margin has no recurring-cost budget split anywhere in the
  // warehouse, so it stays null under Budget comparison + Only Recurring,
  // same as the P&L matrix's "Recurring gross profit" row.
  const recBudgetRevenueRaw = useMemo(() => {
    if (budgetRaw === null || !budgetRows) return null;
    let drift = 0;
    for (const r of budgetRows) {
      const k = r.period_month.slice(0, 7);
      if (k < win.startKey || k > win.endKey) continue;
      if (r.section === "Revenue" && isBudgetNonRecLine(r.moa_code)) drift += r.budget_amount_sar;
    }
    return budgetRaw.revenue - drift;
  }, [budgetRaw, budgetRows, win]);
  const recBudgetRevenue = mtdPro && recBudgetRevenueRaw !== null ? recBudgetRevenueRaw * mtdPro.fraction : recBudgetRevenueRaw;

  const budgetNaReason = budget === null
    ? `No approved budget exists for ${winLabelText}.`
    : undefined;

  // "EBITDA (reported)" is ALWAYS non-comparable to Budget, regardless of
  // window — not a coverage gap like `budgetNaReason` above, a permanent
  // structural one: budget_2026 has no Project-Costs section at all (its
  // moa_code vocabulary only maps Leveredge/F&F non-recurring costs onto
  // GA-NRP-*/MS-FFC lines INSIDE OpEx-GA/OpEx-MS), while the actual's
  // "reported" figure sits below a real, separate Project-Costs section.
  // Diffing the two isn't "over/under budget" — it double-counts a
  // structural booking difference as if it were performance. Found live by
  // fix-3 (TTM/Budget showed a nonsensical -282.4% here) — this null keeps
  // the circle honestly agreeing with the Economics table's own "—" for the
  // identical row instead of contradicting it.
  const EBITDA_REPORTED_BUDGET_NA =
    "Budget has no Project-Costs line — not comparable to the actual's post-project-costs EBITDA reported figure.";
  // Recurring EBITDA (Only Recurring scope) has its own, separate reason:
  // budget_2026's only non-recurring concept is the GA-NRP-*/MS-FFC line
  // filter (a 2-pattern rule), which is a DIFFERENT, coarser perimeter than
  // the actual's model-derived recurrence classification (dim_recurrence +
  // recurrence_rules — 5 patterns incl. COMP-IA/TPC/B2B-CGBI/DRIFT retags).
  // Diffing actual recEbitda against budget.ebitdaPreNrp would silently mix
  // two different "recurring" definitions — same class of error as the bug
  // this fix corrects, so it stays null rather than compounding it.
  const REC_EBITDA_BUDGET_NA =
    "Budget's non-recurring perimeter (GA-NRP/MS-FFC) differs from the actual's model-based recurrence classification — not directly comparable.";

  const comparisonLabel = comparisonMode === "BUDGET" ? "Budget" : "Previous Year";

  // Costs-unbooked honesty gate (2026-08-04, owner-audit #3/#4) — hoisted
  // above both branches (2026-08-08 fix) so the "Only Recurring" scope
  // branch below can reuse the SAME reason string the "All" scope branch
  // already uses, rather than duplicating it.
  const costsUnbookedReason = `Costs not fully posted yet for ${windowName} — figure not yet comparable.`;

  const metrics: KpiHeaderMetric[] = useMemo(() => {
    if (scope === "RECURRING" && recActual) {
      // fix (2026-08-08, CEO — "luglio: i tre cerchi mostrano lo stesso
      // numero, un mese senza costi sembra utile che non esiste"): a month
      // with revenue posted but ZERO cost rows at all (no COGS, no OpEx —
      // recurring or not) made `recActual.recGrossProfit` collapse to
      // `recRevenue + 0` and `recActual.recEbitda` collapse to
      // `recGrossProfit + 0`, so Revenue / Gross Margin / Recurring EBITDA
      // all rendered the IDENTICAL figure — a fabricated "profit" out of
      // simply-missing cost data. The "All" scope branch below already
      // guards this exact case with `actual.hasGrossMargin` /
      // `actual.hasEbitda5` (data/alignment.ts's per-section "absent ≠
      // zero" coverage flags — true only when >=1 warehouse row actually
      // landed in that section, independent of its recurring/non-recurring
      // tag). Reused here as-is: `actual`/`prior` (aggregatePL, computed
      // above regardless of scope) already carry section coverage that
      // doesn't depend on the recurring/non-recurring split, so the SAME
      // flags gate this branch too — extending the identical pattern,
      // not inventing a new one. `hasEbitda5` (pre-Project-Costs), not
      // `hasEbitdaReported`: `recEbitda` (= recGrossProfit + recOpex) never
      // includes Project-Costs, so gating it on Project-Costs coverage would
      // wrongly blank it out on months where GA/MS/People + Revenue/COGS are
      // all posted but Leveredge/F&F project costs (routinely late) aren't.
      const recGrossMarginOk = !noActualData && actual.hasGrossMargin;
      const recGrossMarginOkP = !noPriorData && prior.hasGrossMargin;
      const recEbitdaOk = !noActualData && actual.hasEbitda5;
      const recEbitdaOkP = !noPriorData && prior.hasEbitda5;
      // fix-23-recon (2026-08-04): this metric used to read
      // `recActual.reportedEbitda`, which — by construction — adds every
      // non-recurring revenue/COGS/OpEx/Project-Costs line straight back in
      // (see `aggregateRecurring` in data/alignment.ts: `reportedEbitda =
      // recEbitda + nonRecRevenue + nonRecDirect + nonRecOpex`). That makes
      // it algebraically IDENTICAL to the "All" scope's `ebitdaReported` for
      // the same window — toggling "Only Recurring" changed Revenue and
      // Gross Margin but silently left this tile showing the full-company
      // number, Project-Costs (Leveredge/F&F mandates) and all. SQL-verified
      // against the live warehouse: YTD Jan-Aug26 showed -488,452.55 (ties
      // Marcello's reported -488,453) when the model's own recurring
      // perimeter (dim_recurrence, matching `recEbitda`) computes
      // +438,427.86 — POSITIVE, matching the validated deck. PY Jan-Aug25
      // showed -4,042,650.10 (his "-4.0M looks wrong") vs the correct
      // -493,476.97. The full bridge is in
      // CLEVER/Cockpit/deliverables/review-fixes-2026-08-04/fix-23-recon/bridge.md.
      // `recEbitda` (= recGrossProfit + recOpex, stopping BEFORE non-recurring
      // OpEx/Project-Costs are added back) is the model's own "Recurring
      // EBITDA" subtotal (spec Tile P3) — relabeled below so it's never
      // confused with the statutory "EBITDA (reported)" the All-scope tile
      // shows (a different, deliberately-broader figure, unchanged here).
      return [
        buildMetric("revenue", "Revenue", noActualData ? null : recActual.recRevenue, noPriorData ? null : (recPrior?.recRevenue ?? 0), recBudgetRevenue, comparisonMode, budgetNaReason, pyNaReason),
        buildMetric(
          "grossMargin", "Gross Margin",
          recGrossMarginOk ? recActual.recGrossProfit : null,
          recGrossMarginOkP ? (recPrior?.recGrossProfit ?? 0) : null,
          null, comparisonMode, "Budget COGS is not split by recurrence.",
          noPriorData ? pyNaReason : (!prior.hasGrossMargin ? costsUnbookedReason : pyNaReason),
        ),
        buildMetric(
          "ebitda", "Recurring EBITDA (as booked)",
          recEbitdaOk ? recActual.recEbitda : null,
          recEbitdaOkP ? (recPrior?.recEbitda ?? 0) : null,
          null, comparisonMode, REC_EBITDA_BUDGET_NA,
          noPriorData ? pyNaReason : (!prior.hasEbitda5 ? costsUnbookedReason : pyNaReason),
        ),
      ];
    }
    // Costs-unbooked honesty gate (2026-08-04, owner-audit #3/#4): a window
    // can have SOME data (e.g. revenue live) while a section the subtotal
    // depends on has zero posted rows — `hasGrossMargin`/`hasEbitdaReported`
    // (data/alignment.ts) are false in that case, so the headline circle
    // reads "—" instead of silently summing an unbooked 0 into a fabricated
    // positive EBITDA. Mirrors the identical gate now applied to the P&L
    // table (PerformanceAnalysis.tsx). (Hoisted above both branches as of
    // 2026-08-08 — see the comment on its declaration above.)
    return [
      buildMetric("revenue", "Revenue", noActualData ? null : actual.revenue, noPriorData ? null : prior.revenue, budget?.revenue ?? null, comparisonMode, budgetNaReason, pyNaReason),
      buildMetric(
        "grossMargin", "Gross Margin",
        noActualData || !actual.hasGrossMargin ? null : actual.grossMargin,
        noPriorData || !prior.hasGrossMargin ? null : prior.grossMargin,
        budget ? budget.revenue + budget.cogs : null,
        comparisonMode, budgetNaReason, noPriorData ? pyNaReason : (!prior.hasGrossMargin ? costsUnbookedReason : pyNaReason),
      ),
      buildMetric(
        "ebitda", "EBITDA (reported)",
        noActualData || !actual.hasEbitdaReported ? null : actual.ebitdaReported,
        noPriorData || !prior.hasEbitdaReported ? null : prior.ebitdaReported,
        null, comparisonMode, EBITDA_REPORTED_BUDGET_NA, noPriorData ? pyNaReason : (!prior.hasEbitdaReported ? costsUnbookedReason : pyNaReason),
      ),
    ];
  }, [scope, recActual, recPrior, recBudgetRevenue, actual, prior, budget, comparisonMode, budgetNaReason, pyNaReason, EBITDA_REPORTED_BUDGET_NA, REC_EBITDA_BUDGET_NA, noActualData, noPriorData, costsUnbookedReason]);

  return {
    isLoading: rowsLoading || budgetLoading,
    isError,
    metrics,
    comparisonMode,
    comparisonLabel,
    windowName,
    winLabelText,
    mtdProrated: mtdPro !== null,
    noActualData,
  };
};
