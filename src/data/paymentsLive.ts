// LIVE data layer — CEO payment-approval panel.
//   - v_ready_to_pay          → prioritised ready-to-pay candidate list (Treasury-Decision-Rules §B.2)
//   - payment_decision_log    → append-only decision & audit trail (migration 034)
//
// Both degrade to { available:false } (and re-poll every 60s) until migration 034 is applied,
// exactly like the aging / balance-sheet hooks — so the panel ships before the backend lands and
// populates itself the moment the view/table appear (no reload).
//
// WRITE-BACK: this layer is READ-ONLY on purpose. Recording a CEO decision (approve/hold/adjust)
// against payment_run_item is the go-live step and needs an approver-scoped write path (RLS policy
// or a service-key Edge Function) that is not yet signed off (auth model + Treasury Decision-Rules).
// The panel therefore records decisions in an in-session ledger and shows the exact payload that
// will be written — it never mutates production.
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";
import type { AgingBucket } from "@/data/statementsLive";

// ------------------------------------------------------------- ready-to-pay

export type RecommendedAction = "PAY_NOW" | "SCHEDULE" | "HOLD";

export interface ReadyToPayRow {
  qoyod_bill_id: number | null;
  vendor_qoyod_id: number | null;
  payee: string | null;
  bill_number: string | null;
  due_date: string | null;
  amount: number | null;
  days_overdue: number | null;
  aging_bucket: AgingBucket;
  tier: number | null;
  is_critical: boolean | null;
  risk_if_delayed: string | null;
  tier_confirmed: boolean | null;
  score: number | null;
  recommended_action: RecommendedAction | null;
}

// ---------------------------------------------------------- decision log

export interface PaymentDecisionLogRow {
  id: string;
  run_id: string | null;
  item_id: string | null;
  action: "submit" | "approve" | "schedule" | "partial" | "hold" | "reject" | "execute" | "cancel" | "reopen";
  actor: string | null;
  diff: Record<string, unknown> | null;
  decision_ref: string | null;
  reason: string | null;
  occurred_at: string;
}

export interface AvailableResult<T> {
  /** False while the object has not been created/granted yet (graceful placeholder + re-poll). */
  available: boolean;
  rows: T[];
}

const PAGE_SIZE = 1000;

/** "Relation does not exist / not in schema cache" → the object has not landed yet. */
const isMissingObjectError = (err: { code?: string; message?: string }): boolean => {
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

const fetchAll = async <T>(
  from: string,
  order: { column: string; ascending: boolean },
): Promise<AvailableResult<T>> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const all: T[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(from)
      .select("*")
      .order(order.column, { ascending: order.ascending })
      .range(start, start + PAGE_SIZE - 1);
    if (error) {
      if (isMissingObjectError(error)) return { available: false, rows: [] };
      throw toFriendlyError(error);
    }
    const page = (data ?? []) as T[];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { available: true, rows: all };
};

export const useReadyToPay = () =>
  useQuery({
    queryKey: ["v_ready_to_pay"],
    queryFn: () => fetchAll<ReadyToPayRow>("v_ready_to_pay", { column: "days_overdue", ascending: false }),
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });

export const usePaymentDecisionLog = () =>
  useQuery({
    queryKey: ["payment_decision_log"],
    queryFn: () => fetchAll<PaymentDecisionLogRow>("payment_decision_log", { column: "occurred_at", ascending: false }),
    staleTime: 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });

// -------------------------------------------------- tier presentation helper

export const TIER_META: Record<number, { label: string; short: string; tone: string }> = {
  0: { label: "Statutory / deadline-bound", short: "Tier 0", tone: "text-destructive" },
  1: { label: "Business-critical continuity", short: "Tier 1", tone: "text-warning" },
  2: { label: "Standard operating", short: "Tier 2", tone: "text-foreground" },
  3: { label: "Discretionary / deferrable", short: "Tier 3", tone: "text-muted-foreground" },
};
