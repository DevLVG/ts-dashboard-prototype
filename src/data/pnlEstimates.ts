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
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";

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
