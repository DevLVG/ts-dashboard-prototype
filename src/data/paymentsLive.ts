// LIVE data layer — CEO payment-approval panel.
//   - v_ready_to_pay          → prioritised ready-to-pay candidate list (Treasury-Decision-Rules §B.2)
//   - payment_decision_log    → append-only decision & audit trail (migration 034)
//
// Both degrade to { available:false } (and re-poll every 60s) until migration 034 is applied,
// exactly like the aging / balance-sheet hooks — so the panel ships before the backend lands and
// populates itself the moment the view/table appear (no reload).
//
// WRITE-BACK (live since 2026-09-11, migrations 083+084): recording a CEO decision now INSERTs
// directly into payment_decision_log — durable, with actor (the signed-in user's email from the
// Supabase session) + timestamp + a jsonb diff snapshot of the bill/decision. This is deliberately
// NOT routed through payment_run/payment_run_item (that heavier workflow still needs the Treasury
// Decision-Rules sign-off — thresholds, vendor tiers, cash buffer, approvers — a separate business
// decision, correctly out of scope here) — run_id/item_id are left NULL, which the schema allows.
// authenticated has INSERT + SELECT only on payment_decision_log (never UPDATE/DELETE) — the trail
// is audit-only by grant, not just by convention (same pattern as treasury_action_log, migration 059).
// This does NOT make the panel a live payment tool: nothing here posts to Qoyod, sends money, or
// talks to a bank. Payment EXECUTION stays manual, by design (segregation of duties) — a human takes
// the exported payment-run file (see usePaymentRunExport below) into the bank.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

// ---------------------------------------------------- payment priority (score)
//
// v_ready_to_pay.score (034) is a hard NULL — the §B.1 weights were
// unconfirmed at the time. Migration 050 turns those weights into editable
// DATA (payment_priority_config) and computes a real, live-reranking
// priority_score in v_payment_priority. It is still is_draft (score_is_draft)
// until Arwa/Marcello confirm in-tool, so the panel joins it in ALONGSIDE
// v_ready_to_pay and badges it "Proposed — to confirm" rather than presenting
// it as settled ranking logic.

export interface PaymentPriorityRow {
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
  tier_confirmed: boolean | null;
  score_is_draft: boolean | null;
  tier_component: number | null;
  overdue_component: number | null;
  amount_component: number | null;
  due_soon_component: number | null;
  priority_score: number | null;
  risk_if_delayed: string | null;
}

export const usePaymentPriority = () =>
  useQuery({
    queryKey: ["v_payment_priority"],
    queryFn: () => fetchAll<PaymentPriorityRow>("v_payment_priority", { column: "priority_score", ascending: false }),
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });

// ---------------------------------------------------- record a CEO decision (write-back, 2026-09-11)

export interface RecordPaymentDecisionArgs {
  action: "approve" | "schedule" | "partial" | "hold" | "reject";
  actor: string;               // signed-in user's email — never a hardcoded placeholder
  decisionRef: string;
  payee: string;
  billKey: string;
  billNumber: string | null;
  fromAmount: number;
  toAmount: number;
  scheduledFor?: string;
  reason?: string;
}

/** Durable insert into payment_decision_log (migrations 083/084 opened the write path). Append-only:
 * no update/delete is ever issued from here. run_id/item_id stay NULL (see file header) — the full
 * context travels in `diff`. */
export const useRecordPaymentDecision = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: RecordPaymentDecisionArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("payment_decision_log")
        .insert({
          action: args.action,
          actor: args.actor,
          decision_ref: args.decisionRef,
          reason: args.reason ?? null,
          diff: {
            payee: args.payee,
            bill_key: args.billKey,
            bill_number: args.billNumber,
            from: { amount: args.fromAmount },
            to: {
              amount: args.toAmount,
              scheduled_for: args.scheduledFor ?? null,
            },
          },
        })
        .select()
        .single();
      if (error) throw toFriendlyError(error);
      return data as PaymentDecisionLogRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payment_decision_log"] });
    },
  });
};

// -------------------------------------------------- tier presentation helper

export const TIER_META: Record<number, { label: string; short: string; tone: string }> = {
  0: { label: "Statutory / deadline-bound", short: "Tier 0", tone: "text-destructive" },
  1: { label: "Business-critical continuity", short: "Tier 1", tone: "text-warning" },
  2: { label: "Standard operating", short: "Tier 2", tone: "text-foreground" },
  3: { label: "Discretionary / deferrable", short: "Tier 3", tone: "text-muted-foreground" },
};
