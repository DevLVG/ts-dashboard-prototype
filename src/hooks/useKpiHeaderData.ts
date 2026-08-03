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
  prorateBudget,
} from "@/data/alignment";
import { useBudgetMonthly } from "@/data/liveData";
import { pctChange } from "@/lib/format";

export type KpiKey = "revenue" | "grossMargin" | "ebitda";

export interface KpiHeaderMetric {
  key: KpiKey;
  label: string;
  /** The window's actual value on the active scope (SAR, signed). */
  actual: number;
  /** The active comparison's value (PY or Budget, whichever the global
   * toggle selects) — null when it genuinely doesn't exist for this window
   * (e.g. Budget for Jun-26, or a recurring-scope split budget doesn't
   * carry), never a fabricated zero. */
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
}

/** Budget non-recurring project lines (Leveredge mandate / F&F campaigns) —
 * mirrors the P&L matrix's own recurring-budget split (spec §1.1 View B).
 * Not exported from the data layer, so re-stated here (a mapping rule on
 * moa_code, not a number) purely to keep the recurring-scope Revenue
 * comparison consistent with the table below it. */
const isBudgetNonRecLine = (moa: string): boolean => moa.startsWith("GA-NRP") || moa === "MS-FFC";

const buildMetric = (
  key: KpiKey,
  label: string,
  actual: number,
  py: number,
  budget: number | null,
  comparisonMode: ComparisonMode,
  budgetNaReason?: string,
): KpiHeaderMetric => {
  const comparison = comparisonMode === "BUDGET" ? budget : py;
  const deltaAbs = comparison === null ? null : actual - comparison;
  const deltaPct = comparison === null ? null : pctChange(actual, comparison);
  return {
    key,
    label,
    actual,
    comparison,
    comparisonUnavailableReason: comparisonMode === "BUDGET" && comparison === null ? budgetNaReason : undefined,
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

  const comparisonLabel = comparisonMode === "BUDGET" ? "Budget" : "Previous Year";

  const metrics: KpiHeaderMetric[] = useMemo(() => {
    if (scope === "RECURRING" && recActual) {
      return [
        buildMetric("revenue", "Revenue", recActual.recRevenue, recPrior?.recRevenue ?? 0, recBudgetRevenue, comparisonMode, budgetNaReason),
        buildMetric("grossMargin", "Gross Margin", recActual.recGrossProfit, recPrior?.recGrossProfit ?? 0, null, comparisonMode, "Budget COGS is not split by recurrence."),
        buildMetric("ebitda", "EBITDA (reported)", recActual.reportedEbitda, recPrior?.reportedEbitda ?? 0, null, comparisonMode, EBITDA_REPORTED_BUDGET_NA),
      ];
    }
    return [
      buildMetric("revenue", "Revenue", actual.revenue, prior.revenue, budget?.revenue ?? null, comparisonMode, budgetNaReason),
      buildMetric("grossMargin", "Gross Margin", actual.grossMargin, prior.grossMargin, budget ? budget.revenue + budget.cogs : null, comparisonMode, budgetNaReason),
      buildMetric("ebitda", "EBITDA (reported)", actual.ebitdaReported, prior.ebitdaReported, null, comparisonMode, EBITDA_REPORTED_BUDGET_NA),
    ];
  }, [scope, recActual, recPrior, recBudgetRevenue, actual, prior, budget, comparisonMode, budgetNaReason, EBITDA_REPORTED_BUDGET_NA]);

  return {
    isLoading: rowsLoading || budgetLoading,
    isError,
    metrics,
    comparisonMode,
    comparisonLabel,
    windowName,
    winLabelText,
    mtdProrated: mtdPro !== null,
  };
};
