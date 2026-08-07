// LIVE data layer — end-of-service benefit (EOSB) + annual-leave accruals.
//
// Backing views: v_eosb_accrual, v_leave_accrual (migration 035,
// "eosb_leave_accruals" / B8). Handbook package audit (2026-08-07): both
// views existed live with real data (37 rows each, one per active employee)
// but were completely orphaned — no later migration wired them into the
// P&L/BS the cockpit reads, and zero frontend code referenced EOSB/leave
// anywhere in src/. This file is the first consumer, read-only.
//
// NOTE on identity: the views are keyed by employee_id (e.g. "TS-0001") only
// — they deliberately do NOT expose full_name. personnel_master (the table
// that has the name) is REVOKEd from `authenticated` directly (verified live:
// a signed-in query against personnel_master returns 0 rows, RLS-denied);
// only the accrual views themselves are GRANTed, because Postgres views run
// with the view owner's privileges unless declared security_invoker. Adding
// a name join would need a new, purpose-built view (a migration) — out of
// scope for a read-only screen per the job's constraints. The UI is honest
// about this: employee ID + business unit only, no fabricated name.
//
// CAVEAT (carried verbatim from the migration header, handbook item 37): the
// KSA wage basis for EOSB and the per-employee leave-taken balances must be
// confirmed with HR before these numbers are treated as authoritative. The
// UI surfaces this caveat, not just the migration comment.
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";
import { withTransientRetry } from "@/data/statementsLive";

export interface EosbAccrualRow {
  employee_id: string;
  bu: string;
  tenure_years: number;
  eosb_monthly_wage: number;
  eosb_tier_years: number;
  months_owed: number;
  eosb_liability_cum_sar: number;
  eosb_accrual_month_sar: number;
}

export interface LeaveAccrualRow {
  employee_id: string;
  bu: string;
  leave_days_entitlement: number;
  daily_wage_sar: number;
  leave_accrual_month_sar: number;
  leave_liability_cum_est_sar: number;
}

export interface AccrualResult<T> {
  /** False while the view has not been created/granted yet (graceful placeholder). */
  available: boolean;
  rows: T[];
}

const FETCH_TIMEOUT_MS = 20_000;

const isMissingViewError = (err: { code?: string; message?: string }): boolean => {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST202" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find")
  );
};

async function fetchAccrualView<T>(view: string): Promise<AccrualResult<T>> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await withTransientRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await supabase
        .from(view)
        .select("*")
        .order("employee_id", { ascending: true })
        .limit(500)
        .abortSignal(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  });
  if (error) {
    if (isMissingViewError(error)) return { available: false, rows: [] };
    throw toFriendlyError(error);
  }
  return { available: true, rows: (data ?? []) as T[] };
}

export const useEosbAccrual = () =>
  useQuery({
    queryKey: ["v_eosb_accrual"],
    queryFn: () => fetchAccrualView<EosbAccrualRow>("v_eosb_accrual"),
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });

export const useLeaveAccrual = () =>
  useQuery({
    queryKey: ["v_leave_accrual"],
    queryFn: () => fetchAccrualView<LeaveAccrualRow>("v_leave_accrual"),
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });
