// LIVE data layer — month-end close assistant (checklist tracker).
//
// Backing view: v_monthly_close_status, over table monthly_close_tasks
// (migration 042). Handbook package audit (2026-08-07): the view existed
// live with real data (15 tasks for the current period) but zero frontend
// code referenced it — only a stray code COMMENT mentioning "month-end
// close" existed in data/liveData.ts, no component, no route. This file is
// the first consumer, strictly read-only: task status changes are a
// deliberately separate, not-yet-built write surface (per the migration's
// own note — status updates are expected to route through a future
// role-based panel, out of scope here).
//
// Contract (migration 042, view v_monthly_close_status): current period
// (MAX(period) in monthly_close_tasks) with a per-task traffic light
// (task_light: red=blocked/overdue, amber=pending/in_progress, green=done,
// grey=na) plus period-wide progress columns (total_tasks/done_tasks/
// blocked_tasks/pct_complete/overall_light) denormalized onto every row.
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";
import { withTransientRetry } from "@/data/statementsLive";

export type CloseTaskStatus = "pending" | "in_progress" | "done" | "blocked" | "na";
export type CloseLight = "red" | "amber" | "green" | "grey";

export interface MonthlyCloseTaskRow {
  period: string; // "YYYY-MM-01"
  block: string; // "A".."G"
  task_key: string;
  description: string;
  owner: string;
  status: CloseTaskStatus;
  due_date: string;
  is_overdue: boolean;
  task_light: CloseLight;
  completed_at: string | null;
  completed_by: string | null;
  notes: string | null;
  sort_order: number;
  // Denormalized period-wide progress — identical on every row.
  total_tasks: number;
  done_tasks: number;
  blocked_tasks: number;
  pct_complete: number;
  overall_light: "red" | "amber" | "green";
}

export interface MonthlyCloseResult {
  /** False while the view has not been created/granted yet (graceful placeholder). */
  available: boolean;
  rows: MonthlyCloseTaskRow[];
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

const fetchMonthlyCloseStatus = async (): Promise<MonthlyCloseResult> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await withTransientRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await supabase
        .from("v_monthly_close_status")
        .select("*")
        .order("sort_order", { ascending: true })
        .limit(200)
        .abortSignal(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  });
  if (error) {
    if (isMissingViewError(error)) return { available: false, rows: [] };
    throw toFriendlyError(error);
  }
  return { available: true, rows: (data ?? []) as MonthlyCloseTaskRow[] };
};

export const useMonthlyCloseStatus = () =>
  useQuery({
    queryKey: ["v_monthly_close_status"],
    queryFn: fetchMonthlyCloseStatus,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });
