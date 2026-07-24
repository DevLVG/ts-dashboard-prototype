// LIVE data layer — Payment Priority cockpit panel (Treasury review, Arwa).
//   - v_payment_priority        → scored + ranked bill list (migration 050)
//   - payment_priority_config   → single-row (id=1) scoring weights/caps (migration 050)
//
// Both degrade to { available:false } (and re-poll every 60s) until migration 050 is
// applied, exactly like the ready-to-pay / aging hooks in paymentsLive.ts — so the panel
// ships before the backend lands and populates itself the moment the view/table appear
// (no reload needed).
//
// WRITE-BACK: this layer is READ-ONLY on purpose (same posture as paymentsLive.ts).
// Persisting edited weights back to payment_priority_config is the go-live step and needs
// an approver-scoped write path that is not yet signed off. The panel therefore keeps the
// edited weights in an in-session, client-side copy and recomputes priority_score locally
// using the same formula as the view — it never mutates production.
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";
import type { AgingBucket } from "@/data/statementsLive";

// -------------------------------------------------------- v_payment_priority

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

// ---------------------------------------------------- payment_priority_config

export interface PaymentPriorityConfigRow {
  id: number;
  weight_tier: number;
  weight_overdue: number;
  weight_amount: number;
  weight_due_soon: number;
  critical_boost: number;
  overdue_cap_days: number;
  amount_cap_sar: number;
  due_soon_window_days: number;
  cash_buffer_floor_sar: number;
  is_draft: boolean;
  notes: string | null;
  updated_by: string | null;
  updated_at: string | null;
}

/** Fallback defaults (migration 050 column defaults) — used before the config row
 * loads, and as the "Reset to defaults" target in the editable panel. */
export const DEFAULT_PAYMENT_PRIORITY_CONFIG: PaymentPriorityConfigRow = {
  id: 1,
  weight_tier: 0.40,
  weight_overdue: 0.30,
  weight_amount: 0.15,
  weight_due_soon: 0.15,
  critical_boost: 0.25,
  overdue_cap_days: 60,
  amount_cap_sar: 50000,
  due_soon_window_days: 7,
  cash_buffer_floor_sar: 0,
  is_draft: true,
  notes: null,
  updated_by: null,
  updated_at: null,
};

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

/** Single-row config (id=1). Degrades to { available:false } exactly like the view. */
const fetchConfig = async (): Promise<AvailableResult<PaymentPriorityConfigRow>> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase
    .from("payment_priority_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    if (isMissingObjectError(error)) return { available: false, rows: [] };
    throw toFriendlyError(error);
  }
  return { available: true, rows: data ? [data as PaymentPriorityConfigRow] : [] };
};

export const usePaymentPriorityConfig = () =>
  useQuery({
    queryKey: ["payment_priority_config"],
    queryFn: fetchConfig,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });

// -------------------------------------------------------------- client recompute

/** Editable subset of the config — the weights + caps exposed in the panel's
 * "Editable priority parameters" card. */
export type EditablePriorityWeights = Pick<
  PaymentPriorityConfigRow,
  | "weight_tier"
  | "weight_overdue"
  | "weight_amount"
  | "weight_due_soon"
  | "critical_boost"
  | "overdue_cap_days"
  | "amount_cap_sar"
  | "due_soon_window_days"
  | "cash_buffer_floor_sar"
>;

export const toEditableWeights = (cfg: PaymentPriorityConfigRow): EditablePriorityWeights => ({
  weight_tier: cfg.weight_tier,
  weight_overdue: cfg.weight_overdue,
  weight_amount: cfg.weight_amount,
  weight_due_soon: cfg.weight_due_soon,
  critical_boost: cfg.critical_boost,
  overdue_cap_days: cfg.overdue_cap_days,
  amount_cap_sar: cfg.amount_cap_sar,
  due_soon_window_days: cfg.due_soon_window_days,
  cash_buffer_floor_sar: cfg.cash_buffer_floor_sar,
});

/** Recompute priority_score CLIENT-SIDE from the editable weights, using the SAME
 * formula as v_payment_priority (migration 050): the four *_component values are
 * already computed server-side (they depend on the caps baked into the view at
 * query time), so this recompute only re-weights + re-applies the critical boost —
 * exactly what a reviewer needs to test "what if the weights were different" live,
 * without a write-back. Caps (overdue_cap_days / amount_cap_sar / due_soon_window_days)
 * are surfaced as editable for transparency/discussion but do not change the
 * component values client-side (that would require re-deriving them from raw
 * days_overdue/amount, which the view intentionally owns).
 */
export const recomputePriorityScore = (
  row: PaymentPriorityRow,
  weights: EditablePriorityWeights,
): number => {
  const tierC = row.tier_component ?? 0;
  const overdueC = row.overdue_component ?? 0;
  const amountC = row.amount_component ?? 0;
  const dueSoonC = row.due_soon_component ?? 0;
  const base =
    weights.weight_tier * tierC +
    weights.weight_overdue * overdueC +
    weights.weight_amount * amountC +
    weights.weight_due_soon * dueSoonC;
  return base + (row.is_critical ? weights.critical_boost : 0);
};

export const weightsSum = (w: EditablePriorityWeights): number =>
  w.weight_tier + w.weight_overdue + w.weight_amount + w.weight_due_soon;

// -------------------------------------------------------- tier presentation helper
// (mirrors paymentsLive.TIER_META — kept local so this file has no cross-panel coupling)

export const PRIORITY_TIER_META: Record<number, { label: string; short: string; tone: string }> = {
  0: { label: "Statutory / deadline-bound", short: "Tier 0", tone: "text-destructive" },
  1: { label: "Business-critical continuity", short: "Tier 1", tone: "text-warning" },
  2: { label: "Standard operating", short: "Tier 2", tone: "text-foreground" },
  3: { label: "Discretionary / deferrable", short: "Tier 3", tone: "text-muted-foreground" },
};
