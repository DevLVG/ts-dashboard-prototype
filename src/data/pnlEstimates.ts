// P&L MTD/YTD with the estimate layer (Marcello, 2026-10-01).
//
// Reads the dedicated `v_pnl_mtd` / `v_pnl_ytd` Supabase views (migrations
// 094-097 — see ~/Work/Trio-Sporting/CLEVER/Cockpit/supabase/migrations and
// the design note docs/pnl-mtd-ytd-estimates-2026-10-01.md). These views are
// independent of the existing `v_pnl_basis`/`pnl_management` pipeline the
// rest of this page (PerformanceAnalysis) already uses — deliberately: they
// carry an is_estimate flag + method + source so an open/just-closed month
// that is missing a real posting (payroll arrives late, supplier bills
// arrive late) shows a believable number instead of a false zero, while
// every other screen keeps reading actuals exactly as before.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";
import type { BasisRow } from "@/data/alignment";

export interface PnlEstimateRow {
  period_month: string; // "YYYY-MM-01"
  section: string;
  bu_code: string | null;
  actual_sar: number;
  estimate_sar: number;
  total_sar: number;
  is_estimate: boolean;
  method: string | null;
  source_month?: string | null; // v_pnl_mtd/ytd_monthly only
  source_detail?: string | null; // v_pnl_mtd only
}

const fetchMtd = async (): Promise<PnlEstimateRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.from("v_pnl_mtd").select("*").limit(1000);
  if (error) throw toFriendlyError(error);
  return (data ?? []) as PnlEstimateRow[];
};

const fetchYtd = async (): Promise<PnlEstimateRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.from("v_pnl_ytd").select("*").limit(1000);
  if (error) throw toFriendlyError(error);
  return (data ?? []) as PnlEstimateRow[];
};

export const usePnlMtd = () =>
  useQuery({
    queryKey: ["v_pnl_mtd"],
    queryFn: fetchMtd,
    staleTime: 5 * 60 * 1000, // estimates are date-sensitive (pro-ration) — refresh more often than the hourly budget cache
    enabled: isSupabaseConfigured,
  });

export const usePnlYtd = () =>
  useQuery({
    queryKey: ["v_pnl_ytd"],
    queryFn: fetchYtd,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
  });

// ---------------------------------------------------------------------
// v_pnl_ytd_monthly (one row per month, Jan of the current year -> the
// current month) — used by PnlEstimateCard so it can follow WHATEVER
// month/window the page's global period selector has active, instead of
// being pinned to "now" like v_pnl_mtd/v_pnl_ytd are. Found live
// 2026-10-01: the card kept showing October while the page had September
// selected — fixed by reading this per-month view and summing whichever
// months fall inside the active `win`, exactly like the main table's own
// `inWin` filter.
// ---------------------------------------------------------------------
const fetchYtdMonthly = async (): Promise<PnlEstimateRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.from("v_pnl_ytd_monthly").select("*").limit(5000);
  if (error) throw toFriendlyError(error);
  return (data ?? []) as PnlEstimateRow[];
};

export const usePnlYtdMonthly = () =>
  useQuery({
    queryKey: ["v_pnl_ytd_monthly"],
    queryFn: fetchYtdMonthly,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
  });

/** Same shape as `sectionTotal` but summed only over the months of `rows`
 * that fall inside `win` (Win = {startKey,endKey} as "YYYY-MM" strings —
 * same contract as PerformanceAnalysis.tsx's own `inWin`). */
export const sectionTotalInWin = (
  rows: PnlEstimateRow[] | undefined,
  section: string,
  win: { startKey: string; endKey: string },
) => {
  const matching = (rows ?? []).filter((r) => {
    if (r.section !== section) return false;
    const k = r.period_month.slice(0, 7);
    return k >= win.startKey && k <= win.endKey;
  });
  if (matching.length === 0) return null;
  const actual_sar = matching.reduce((s, r) => s + r.actual_sar, 0);
  const estimate_sar = matching.reduce((s, r) => s + r.estimate_sar, 0);
  const total_sar = matching.reduce((s, r) => s + r.total_sar, 0);
  const is_estimate = matching.some((r) => r.is_estimate);
  const methods = [...new Set(matching.filter((r) => r.is_estimate && r.method).map((r) => r.method as string))];
  return { actual_sar, estimate_sar, total_sar, is_estimate, methods, sourceDetails: [] as string[] };
};

// ---------------------------------------------------------------------
// Component-grain estimate rows, reshaped as BasisRow so they can be
// spliced directly into the SAME `rows` array the P&L table/KPI circles
// already aggregate (buildTree / aggregatePL just sum `amount_sar` by
// section/bu/moa_code, agnostic to where a row came from — this is the
// whole point: the existing, battle-tested aggregation logic needs ZERO
// changes to "already include the estimated lines" in every total).
// `source: "estimate"` is the marker buildTree uses to tag a leaf/
// cluster/family/section as partly-estimated (see PerformanceAnalysis.tsx
// buildTree, 2026-10-01 addition).
// ---------------------------------------------------------------------
interface EstimateComponentRow {
  period_month: string;
  section: string;
  bu: string | null;
  moa_code: string | null;
  leaf: string | null;
  source_month: string | null;
  source_amount_sar: number;
  estimate_sar: number;
  method: string;
  is_estimate: true;
}

const fetchComponentEstimates = async (): Promise<EstimateComponentRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase.from("v_pnl_estimate_lines").select("*").limit(2000);
  if (error) throw toFriendlyError(error);
  return (data ?? []) as EstimateComponentRow[];
};

const fetchUnbilledOutflowEstimates = async (): Promise<EstimateComponentRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured");
  // Table is seeded empty (migration 097) until the bank-outflow-matching
  // workstream starts writing rows — isMissingRelation-style tolerance
  // isn't needed here (the view always exists), an empty result is normal.
  const { data, error } = await supabase.from("v_pnl_unbilled_outflow_estimate_lines").select("*").limit(2000);
  if (error) throw toFriendlyError(error);
  return (data ?? []) as EstimateComponentRow[];
};

const fetchRunrateEstimates = async (): Promise<EstimateComponentRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured");
  // Run-rate cost-family estimates (migrations 099-101): COGS, OPEX-GA,
  // OPEX-MS, Project-Costs — structurally-late cost families, 3-month
  // average baseline, de-duplicated against actuals + unbilled outflows.
  const { data, error } = await supabase.from("v_pnl_runrate_estimate_lines").select("*").limit(2000);
  if (error) throw toFriendlyError(error);
  return (data ?? []) as EstimateComponentRow[];
};

const toBasisRow = (r: EstimateComponentRow): BasisRow => ({
  period_month: r.period_month,
  section: r.section,
  bu: r.bu,
  cluster: null,
  leaf: r.leaf,
  moa_code: r.moa_code,
  source: "estimate",
  amount_sar: r.estimate_sar,
  recurrence: "recurring", // every estimated category (salaries/GOSI/EOSB/depreciation/ordinary supplier costs) is a recurring operating cost by nature
  drift_flag: null,
});

/** Fetches both estimate sources (carry-forward component estimates +
 * unbilled-outflow estimates) and shapes them as BasisRow[], ready to
 * concatenate onto `useBasisRows()`'s own rows. One hook, one shape, used
 * by both PerformanceAnalysis.tsx (the main P&L table) and
 * useKpiHeaderData.ts (the KPI circles/histogram above it) so every total
 * on the Economics page agrees. */
export const useEstimateBasisRows = () => {
  const componentQ = useQuery({
    queryKey: ["v_pnl_estimate_lines"],
    queryFn: fetchComponentEstimates,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
  });
  const unbilledQ = useQuery({
    queryKey: ["v_pnl_unbilled_outflow_estimate_lines"],
    queryFn: fetchUnbilledOutflowEstimates,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
  });
  const runrateQ = useQuery({
    queryKey: ["v_pnl_runrate_estimate_lines"],
    queryFn: fetchRunrateEstimates,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
  });
  const rows = useMemo(
    () => [...(componentQ.data ?? []), ...(unbilledQ.data ?? []), ...(runrateQ.data ?? [])].map(toBasisRow),
    [componentQ.data, unbilledQ.data, runrateQ.data],
  );
  return {
    data: rows,
    isLoading: componentQ.isLoading || unbilledQ.isLoading || runrateQ.isLoading,
    isError: componentQ.isError || unbilledQ.isError || runrateQ.isError,
  };
};

/** Concatenates actual warehouse rows with the shaped estimate rows.
 * Order doesn't matter (every consumer just sums `amount_sar`). A plain
 * export (not a hook) so it's trivial to unit-test and reuse. */
export const mergeEstimateRows = (actualRows: BasisRow[] | undefined, estimateRows: BasisRow[] | undefined): BasisRow[] => [
  ...(actualRows ?? []),
  ...(estimateRows ?? []),
];

/** Collapses the (section, bu) rows for ONE section into a single
 * company-wide total, carrying is_estimate=true if ANY bu's slice of this
 * section is estimated. Used by the summary card — the detail-by-BU stays
 * one query away via the raw rows if ever needed. */
export const sectionTotal = (rows: PnlEstimateRow[] | undefined, section: string) => {
  const matching = (rows ?? []).filter((r) => r.section === section);
  if (matching.length === 0) return null;
  const actual_sar = matching.reduce((s, r) => s + r.actual_sar, 0);
  const estimate_sar = matching.reduce((s, r) => s + r.estimate_sar, 0);
  const total_sar = matching.reduce((s, r) => s + r.total_sar, 0);
  const is_estimate = matching.some((r) => r.is_estimate);
  const methods = [...new Set(matching.filter((r) => r.is_estimate && r.method).map((r) => r.method as string))];
  const sourceDetails = [...new Set(matching.filter((r) => r.is_estimate && r.source_detail).map((r) => r.source_detail as string))];
  return { actual_sar, estimate_sar, total_sar, is_estimate, methods, sourceDetails };
};
