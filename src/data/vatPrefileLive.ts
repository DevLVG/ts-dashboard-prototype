// LIVE data layer — VAT pre-filing checks.
//
// Backing view: v_vat_prefile_checks (migration 041). Handbook package audit
// (2026-08-07): the view existed live with ~114 rows of real data (6 checks
// x 19 ZATCA quarters) but zero frontend code referenced VAT/prefile
// anywhere in src/ — no route, no component. This file is the first
// consumer, read-only.
//
// Contract (migration 041 header, stable): one row per check per ZATCA
// quarter — quarter_label, quarter_start, quarter_end, check_key, check_name,
// status ('pass'|'warn'|'fail'), detail. Six checks: filing_record,
// b2b_tax_ids, vat_sanity, credit_notes, period_completeness,
// variance_prior_period. Thresholds are first-pass defaults per the
// migration's own §ASSUME-4..7 notes — flagged there for Marcello/Luca to
// ratify, not re-litigated here.
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";
import { withTransientRetry } from "@/data/statementsLive";

export type VatCheckStatus = "pass" | "warn" | "fail";

export interface VatPrefileCheckRow {
  quarter_label: string;
  quarter_start: string;
  quarter_end: string;
  check_key: string;
  check_name: string;
  status: VatCheckStatus;
  detail: string;
}

export interface VatPrefileResult {
  /** False while the view has not been created/granted yet (graceful placeholder). */
  available: boolean;
  rows: VatPrefileCheckRow[];
}

const FETCH_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 1000; // 114 rows today, comfortably under PostgREST's cap — paginated defensively as the check history grows

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

const fetchVatPrefileChecks = async (): Promise<VatPrefileResult> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const all: VatPrefileCheckRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await withTransientRetry(async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        return await supabase
          .from("v_vat_prefile_checks")
          .select("*")
          .order("quarter_start", { ascending: false })
          .order("check_key", { ascending: true })
          .range(from, from + PAGE_SIZE - 1)
          .abortSignal(controller.signal);
      } finally {
        clearTimeout(timeout);
      }
    });
    if (error) {
      if (isMissingViewError(error)) return { available: false, rows: [] };
      throw toFriendlyError(error);
    }
    const page = (data ?? []) as VatPrefileCheckRow[];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return { available: true, rows: all };
};

export const useVatPrefileChecks = () =>
  useQuery({
    queryKey: ["v_vat_prefile_checks"],
    queryFn: fetchVatPrefileChecks,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });
