// LIVE data layer — cash forecast (13-week weekly + 12-month monthly).
//
// Backing views: v_cash_forecast_13w, v_cash_forecast_monthly (migration 045,
// "Cash Forecast — 13-week weekly + 12-month monthly", renumbered from 037).
// Handbook package audit (2026-08-07): both views existed live with real
// data (12 + 13 rows) since the migration applied, but ZERO frontend code
// ever referenced either one — grepped src/ end to end, no component, no
// route. This file is the first consumer.
//
// Method (from the migration header, surfaced on-screen too, not hidden):
// opening cash = latest SUM(bank_balances.current_balance); each period adds
// the APPROVED budget's net cash movement (budget_2026, version
// BUD-2026-07-16-APPROVED); closing rolls forward. The weekly view spreads
// each month's net evenly across its calendar days — an assumption (A1 in
// the migration), not a collections-weighted forecast. Both views re-anchor
// live on every Qoyod sync (opening cash always follows bank_balances).
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";
import { withTransientRetry } from "@/data/statementsLive";

export interface CashForecastMonthRow {
  month_no: number;
  period_month: string; // "YYYY-MM-01"
  period_label: string; // "Sep 2026"
  opening_balance: number;
  net_cash_movement: number;
  closing_balance: number;
  anchor_date: string;
  anchor_opening_cash: number;
  budget_version: string;
}

export interface CashForecastWeekRow {
  week_no: number;
  week_start: string;
  week_end: string;
  opening_balance: number;
  net_cash_movement: number;
  closing_balance: number;
  anchor_date: string;
  anchor_opening_cash: number;
  method: string;
  budget_version: string;
}

export interface ForecastResult<T> {
  /** False while the view has not been created/granted yet (graceful placeholder,
   * same degradation pattern as fetchBalanceSheet/fetchAging in statementsLive.ts). */
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

/** Single-page fetch (both views are well under PostgREST's 1000-row cap —
 * 12 and 13 rows respectively) wrapped in the same bounded retry + 20s abort
 * guard as the paginated statement fetches, since it's the same Supabase
 * edge and the same transient QUIC failure mode (JOB 1, 2026-08-07). */
async function fetchForecastView<T>(view: string, orderCol: string): Promise<ForecastResult<T>> {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await withTransientRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await supabase
        .from(view)
        .select("*")
        .order(orderCol, { ascending: true })
        .limit(100)
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

export const useCashForecastMonthly = () =>
  useQuery({
    queryKey: ["v_cash_forecast_monthly"],
    queryFn: () => fetchForecastView<CashForecastMonthRow>("v_cash_forecast_monthly", "month_no"),
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });

export const useCashForecast13w = () =>
  useQuery({
    queryKey: ["v_cash_forecast_13w"],
    queryFn: () => fetchForecastView<CashForecastWeekRow>("v_cash_forecast_13w", "week_no"),
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });
