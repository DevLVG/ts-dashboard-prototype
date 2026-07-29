// LIVE data layer — Treasury operational workspace (Receivables, Legacy pool,
// Reminders, Confirmations).
//   - v_dunning_worklist_v2      → config/state-aware reminder worklist (migration 051)
//   - v_invoices_to_confirm      → weekly vendor-bill confirmation queue (migration 052)
//   - v_invoices_to_confirm_weekly → ISO-week rollup header for the above
//   - v_legacy_receivables       → per-debtor legacy (2020-2021) worksheet (migration 060)
//   - treasury_action_log        → audit-only write target for Reminders/Confirmations
//     human decisions (migration 059) — NOT a sending mechanism, see component headers.
//
// All read hooks follow the house degrade-gracefully pattern: a missing
// relation (view not yet applied / grant not yet landed) resolves to
// { available:false } and the hook re-polls every 60s instead of throwing,
// so the UI shows a clear "not yet available" placeholder, never a crash.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";

export interface AvailableResult<T> {
  available: boolean;
  rows: T[];
}

const PAGE_SIZE = 1000;

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

// ------------------------------------------------------------- Reminders (dunning)

export interface DunningWorklistRow {
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  qoyod_invoice_id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  invoice_status: string | null;
  total_amount: number | null;
  residual_amount: number | null;
  days_overdue: number | null;
  dunning_stage: number;
  dunning_stage_label: string;
  suggested_action: string | null;
  attempt_count: number;
  last_reminder_at: string | null;
  escalate_after_attempts: number;
  old_after_days: number;
  escalation_person: string | null;
  effective_status: "active" | "old" | "escalated" | "paused" | "resolved";
  escalated_to: string | null;
  is_blocked: boolean;
  next_reminder_date: string | null;
  config_is_draft: boolean;
}

export const useDunningWorklist = () =>
  useQuery({
    queryKey: ["v_dunning_worklist_v2"],
    queryFn: () => fetchAll<DunningWorklistRow>("v_dunning_worklist_v2", { column: "days_overdue", ascending: false }),
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) => (query.state.data && !query.state.data.available ? 60_000 : false),
  });

// ------------------------------------------------------------- Confirmations (invoice-inbox)

export interface InvoiceToConfirmRow {
  bill_id: string;
  vendor: string | null;
  invoice_number: string | null;
  received_date: string | null;
  invoice_date: string | null;
  due_date: string | null;
  amount_sar: number | null;
  vat_sar: number | null;
  status: string | null;
  anomaly_flags: string[] | null;
  invoice_pdf_link: string | null;
  qoyod_bill_id: number | null;
  notes: string | null;
  week_start: string;
  iso_week: string;
  confirm_reason: string | null;
}

export interface InvoiceToConfirmWeeklyRow {
  week_start: string;
  iso_week: string;
  bills_to_confirm: number;
  total_amount_sar: number | null;
  anomaly_count: number;
  failure_count: number;
}

export const useInvoicesToConfirm = () =>
  useQuery({
    queryKey: ["v_invoices_to_confirm"],
    queryFn: () => fetchAll<InvoiceToConfirmRow>("v_invoices_to_confirm", { column: "received_date", ascending: false }),
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) => (query.state.data && !query.state.data.available ? 60_000 : false),
  });

export const useInvoicesToConfirmWeekly = () =>
  useQuery({
    queryKey: ["v_invoices_to_confirm_weekly"],
    queryFn: () => fetchAll<InvoiceToConfirmWeeklyRow>("v_invoices_to_confirm_weekly", { column: "week_start", ascending: false }),
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) => (query.state.data && !query.state.data.available ? 60_000 : false),
  });

// ------------------------------------------------------------- Legacy receivables (§A.6)

export interface LegacyReceivableRow {
  customer_id: number | null;
  customer_name: string | null;
  legacy_invoice_count: number;
  legacy_billed_total: number | null;
  legacy_unpaid_per_qoyod: number | null;
  earliest_invoice_date: string | null;
  latest_invoice_date: string | null;
  days_since_last_invoice: number | null;
}

export const useLegacyReceivables = () =>
  useQuery({
    queryKey: ["v_legacy_receivables"],
    queryFn: () => fetchAll<LegacyReceivableRow>("v_legacy_receivables", { column: "legacy_billed_total", ascending: false }),
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) => (query.state.data && !query.state.data.available ? 60_000 : false),
  });

// ------------------------------------------------------------- Treasury action log (write target, migration 059)

export type TreasuryActionDomain = "REMINDER" | "CONFIRMATION";

export interface TreasuryActionLogRow {
  id: string;
  domain: TreasuryActionDomain;
  entity_ref: string;
  action: string;
  actor: string | null;
  reason: string | null;
  payload: Record<string, unknown> | null;
  occurred_at: string;
}

export const useTreasuryActionLog = (domain?: TreasuryActionDomain) =>
  useQuery({
    queryKey: ["treasury_action_log", domain ?? "all"],
    queryFn: async (): Promise<AvailableResult<TreasuryActionLogRow>> => {
      if (!supabase) throw new Error("Supabase is not configured");
      let q = supabase.from("treasury_action_log").select("*").order("occurred_at", { ascending: false }).limit(500);
      if (domain) q = q.eq("domain", domain);
      const { data, error } = await q;
      if (error) {
        if (isMissingObjectError(error)) return { available: false, rows: [] };
        throw toFriendlyError(error);
      }
      return { available: true, rows: (data ?? []) as TreasuryActionLogRow[] };
    },
    staleTime: 30 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) => (query.state.data && !query.state.data.available ? 60_000 : false),
  });

export interface RecordTreasuryActionInput {
  domain: TreasuryActionDomain;
  entity_ref: string;
  action: string;
  actor: string | null;
  reason?: string;
  payload?: Record<string, unknown>;
}

/** Records a human decision (Reminders Approve&Send/Edit/Hold/Snooze, or
 * Confirmations Confirm/Needs fix/Escalate) to the audit-only action log.
 * This NEVER sends/posts anything — it only writes a row that says a human
 * decided. See migration 059 header + the Reminders/Confirmations component
 * headers for the human-in-the-loop contract. */
export const useRecordTreasuryAction = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordTreasuryActionInput) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.from("treasury_action_log").insert(input).select().single();
      if (error) throw toFriendlyError(error);
      return data as TreasuryActionLogRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treasury_action_log"] });
    },
  });
};
