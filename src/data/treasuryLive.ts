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

export type TreasuryActionDomain = "REMINDER" | "CONFIRMATION" | "DUNNING_CUSTOMER" | "PAYABLE_ESCALATION";

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

// ------------------------------------------------------------- Dunning config (migration 051, extended 069)

/** Parametric reminder-engine config (migration 051) + the ladder cadence /
 * send-governance columns added by migration 070. Single row (id=1). Every
 * *_after_days / *_grace_days field is Marcello's own cadence (2026-08-03),
 * NOT the Treasury-Decision-Rules draft's bucket-based cadence — see the
 * component headers for which supersedes which. */
export interface DunningConfigRow {
  id: number;
  cadence_stage1_days: number;
  cadence_stage2_days: number;
  cadence_stage3_days: number;
  cadence_stage4_days: number;
  old_after_days: number;
  escalate_after_attempts: number;
  escalation_person: string | null;
  is_draft: boolean;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
  // migration 070 additions
  dunning_send_enabled: boolean;
  ceo_escalation_notify_enabled: boolean;
  stage2_after_days: number;
  stage3_after_days: number;
  escalate_grace_days: number;
  test_send_recipient: string;
}

export const useDunningConfig = () =>
  useQuery({
    queryKey: ["dunning_config"],
    queryFn: async (): Promise<AvailableResult<DunningConfigRow>> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.from("dunning_config").select("*").eq("id", 1).maybeSingle();
      if (error) {
        if (isMissingObjectError(error)) return { available: false, rows: [] };
        throw toFriendlyError(error);
      }
      return { available: true, rows: data ? [data as DunningConfigRow] : [] };
    },
    staleTime: 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) => (query.state.data && !query.state.data.available ? 60_000 : false),
  });

// ------------------------------------------------------------- Contact anagrafica (customers + vendors)
//
// Recipient resolution for the dunning ladder (Marcello, 2026-08-03: "resolve
// each customer's/vendor's email... where missing show 'no email on file'").
// Scoped with `.in(...)` to only the ids actually present in the open book —
// there are ~1,700 qoyod_customers and ~190 vendor_master rows, no reason to
// pull the whole registry for a ~30-row debtor/vendor list.

export interface CustomerContactRow {
  qoyod_customer_id: string;
  email: string | null;
  phone: string | null;
}

/** Resolution order: qoyod_customers.email first, falling back to the
 * unified `customers` registry (migration 063, Shopify/HubSpot-fed) when the
 * Qoyod mirror has none. Returns a Map keyed by customer_id (string) for O(1)
 * lookup from the aggregated customer-lines table. */
export const useCustomerContacts = (customerIds: (string | number)[]) => {
  const ids = [...new Set(customerIds.map((id) => String(id)))].filter(Boolean);
  return useQuery({
    queryKey: ["customer_contacts", ids.slice().sort()],
    queryFn: async (): Promise<Map<string, CustomerContactRow>> => {
      const out = new Map<string, CustomerContactRow>();
      if (!supabase || ids.length === 0) return out;
      const { data: qc, error: qcErr } = await supabase
        .from("qoyod_customers")
        .select("qoyod_customer_id, email, phone")
        .in("qoyod_customer_id", ids);
      if (qcErr && !isMissingObjectError(qcErr)) throw toFriendlyError(qcErr);
      for (const r of (qc ?? []) as CustomerContactRow[]) {
        out.set(r.qoyod_customer_id, { qoyod_customer_id: r.qoyod_customer_id, email: r.email ?? null, phone: r.phone ?? null });
      }
      const stillMissing = ids.filter((id) => !out.get(id)?.email);
      if (stillMissing.length > 0) {
        const { data: cu, error: cuErr } = await supabase
          .from("customers")
          .select("qoyod_customer_id, email, phone")
          .in("qoyod_customer_id", stillMissing);
        if (cuErr && !isMissingObjectError(cuErr)) throw toFriendlyError(cuErr);
        for (const r of (cu ?? []) as { qoyod_customer_id: string | null; email: string | null; phone: string | null }[]) {
          if (!r.qoyod_customer_id) continue;
          const existing = out.get(r.qoyod_customer_id);
          if (r.email && !existing?.email) {
            out.set(r.qoyod_customer_id, { qoyod_customer_id: r.qoyod_customer_id, email: r.email, phone: existing?.phone ?? r.phone ?? null });
          }
        }
      }
      return out;
    },
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured && ids.length > 0,
    retry: false,
  });
};

export interface VendorContactRow {
  qoyod_vendor_id: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

/** Vendor contact anagrafica (migration 070's new vendor_master columns —
 * 0/193 populated at creation, see missing-emails.md). Scoped to the vendor
 * ids present in the open AP book. */
export const useVendorContacts = (vendorIds: (number | string)[]) => {
  const ids = [...new Set(vendorIds.map((id) => Number(id)))].filter((id) => Number.isFinite(id));
  return useQuery({
    queryKey: ["vendor_contacts", ids.slice().sort((a, b) => a - b)],
    queryFn: async (): Promise<Map<number, VendorContactRow>> => {
      const out = new Map<number, VendorContactRow>();
      if (!supabase || ids.length === 0) return out;
      const { data, error } = await supabase
        .from("vendor_master")
        .select("qoyod_vendor_id, contact_name, contact_email, contact_phone")
        .in("qoyod_vendor_id", ids);
      if (error) {
        if (isMissingObjectError(error)) return out;
        throw toFriendlyError(error);
      }
      for (const r of (data ?? []) as VendorContactRow[]) {
        if (r.qoyod_vendor_id != null) out.set(r.qoyod_vendor_id, r);
      }
      return out;
    },
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured && ids.length > 0,
    retry: false,
  });
};
