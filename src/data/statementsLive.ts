// LIVE data layer — financial statements beyond the P&L:
//   - v_cashflow_statement_monthly  (monthly cash-flow statement)
//   - v_working_capital_monthly     (AR / inventory / AP / net WC by month)
//   - v_balance_sheet_monthly       (Assets / Liabilities / Equity — contract
//     agreed with the balance-sheet DB agent, migration 023)
//
// The balance-sheet view may not exist yet when the frontend ships: the hook
// degrades to { available: false } and silently re-polls every 60s until the
// view lands — the UI shows a graceful "statement not yet available" state.
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";

// ------------------------------------------------------------- cash flow

export interface CashflowMonthRow {
  period_month: string; // "YYYY-MM-01"
  operating_result: number | null;
  operating_wc_change: number | null;
  operating_da_noncash: number | null;
  operating_cash_flow: number | null;
  investing_cash_flow: number | null;
  financing_equity: number | null;
  financing_intercompany: number | null;
  financing_cash_flow: number | null;
  other_cash_flow: number | null;
  net_cash_flow: number | null;
  bs_cash_movement: number | null;
}

export const fetchCashflowMonthly = async (): Promise<CashflowMonthRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase
    .from("v_cashflow_statement_monthly")
    .select("*")
    .order("period_month", { ascending: true })
    .limit(1000);
  if (error) throw toFriendlyError(error);
  return (data ?? []) as CashflowMonthRow[];
};

export const useCashflowMonthly = () =>
  useQuery({
    queryKey: ["v_cashflow_statement_monthly"],
    queryFn: fetchCashflowMonthly,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
  });

// -------------------------------------------------------- working capital

export interface WorkingCapitalMonthRow {
  period_month: string; // "YYYY-MM-01"
  receivables: number | null;
  inventory: number | null;
  payables: number | null;
  net_working_capital: number | null;
}

export const fetchWorkingCapitalMonthly = async (): Promise<WorkingCapitalMonthRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const { data, error } = await supabase
    .from("v_working_capital_monthly")
    .select("*")
    .order("period_month", { ascending: true })
    .limit(1000);
  if (error) throw toFriendlyError(error);
  return (data ?? []) as WorkingCapitalMonthRow[];
};

export const useWorkingCapitalMonthly = () =>
  useQuery({
    queryKey: ["v_working_capital_monthly"],
    queryFn: fetchWorkingCapitalMonthly,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
  });

// ---------------------------------------------------------- balance sheet

/** Contract of v_balance_sheet_monthly (migration 023, balance-sheet agent):
 * month date, section 'Assets'|'Liabilities'|'Equity', subsection text,
 * line_item text, amount numeric, sort_order int, is_adjustment bool,
 * note text nullable. */
export interface BalanceSheetRow {
  month: string; // "YYYY-MM-01"
  section: "Assets" | "Liabilities" | "Equity";
  subsection: string;
  line_item: string;
  amount: number;
  sort_order: number;
  is_adjustment: boolean;
  note: string | null;
  /** Stable key (e.g. "A_BANK") — join key against v_budget_balance_sheet_monthly. */
  line_code: string;
}

export interface BalanceSheetResult {
  /** False while the view has not been created/populated yet. */
  available: boolean;
  rows: BalanceSheetRow[];
}

const BS_PAGE_SIZE = 1000; // PostgREST caps a single response at 1000 rows

/** "Relation does not exist / not in schema cache" — the view has not landed
 * yet. Any such error degrades to { available: false } instead of an error
 * state, so the UI can show a friendly placeholder and keep polling. */
const isMissingViewError = (err: { code?: string; message?: string }): boolean => {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return (
    code === "42P01" || // undefined_table
    code === "PGRST205" || // relation not found in schema cache
    code === "PGRST202" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find")
  );
};

// Per-request timeout (2026-08-04, owner-audit #9): a hung request in this
// pagination loop (e.g. starved of connections by other queries firing on
// the same page load) previously left `isLoading` true forever — no error,
// no console output, matching the mobile-viewport symptom exactly (Playwright
// capture: 0 console/page-error events, page stuck on "Loading…"). Each page
// now aborts after 20s and surfaces a real error instead of hanging silently,
// so the UI can show the existing error state / let react-query retry.
const BS_PAGE_TIMEOUT_MS = 20_000;

export const fetchBalanceSheet = async (): Promise<BalanceSheetResult> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const all: BalanceSheetRow[] = [];
  for (let from = 0; ; from += BS_PAGE_SIZE) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BS_PAGE_TIMEOUT_MS);
    let data, error;
    try {
      ({ data, error } = await supabase
        .from("v_balance_sheet_monthly")
        .select("month,section,subsection,line_item,amount,sort_order,is_adjustment,note,line_code")
        .order("month", { ascending: true })
        .order("sort_order", { ascending: true })
        .range(from, from + BS_PAGE_SIZE - 1)
        .abortSignal(controller.signal));
    } catch (e) {
      clearTimeout(timeout);
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`Timed out loading the balance sheet (page starting at row ${from}) — please retry.`);
      }
      throw e;
    }
    clearTimeout(timeout);
    if (error) {
      if (isMissingViewError(error)) return { available: false, rows: [] };
      throw toFriendlyError(error);
    }
    const page = (data ?? []) as BalanceSheetRow[];
    all.push(...page);
    if (page.length < BS_PAGE_SIZE) break;
  }
  return { available: true, rows: all };
};

export const useBalanceSheet = () =>
  useQuery({
    queryKey: ["v_balance_sheet_monthly"],
    queryFn: fetchBalanceSheet,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    // While the view has not landed, re-poll every 60s; once live, normal cache.
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });

// -------------------------------------------- alignment additions 2026-07-21

/** Live bank & cash balances (Qoyod sync) — the canonical cash position is
 * the SUM of these accounts; every anchor renders from data, no literals. */
export interface BankBalanceRow {
  qoyod_account_code: string;
  qoyod_account_name: string;
  current_balance: number;
  last_synced: string;
}

export const useBankBalances = () =>
  useQuery({
    queryKey: ["bank_balances"],
    queryFn: async (): Promise<BankBalanceRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.from("bank_balances").select("*").limit(200);
      if (error) throw toFriendlyError(error);
      return (data ?? []) as BankBalanceRow[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
  });

/** v_cashflow_budget_comparison — actual vs budget CF per month. NOTE the
 * documented caveat: before the forward budget window the "operating budget"
 * is budget EBITDA used as an operating-CF proxy (no CF-* budget lines exist
 * historically) — the UI labels the series accordingly. */
export interface CashflowBudgetRow {
  period_month: string;
  operating_actual: number | null;
  operating_budget: number | null;
  investing_actual: number | null;
  investing_budget: number | null;
  financing_actual: number | null;
  financing_budget: number | null;
  net_actual: number | null;
  net_budget: number | null;
}

export const useCashflowBudgetComparison = () =>
  useQuery({
    queryKey: ["v_cashflow_budget_comparison"],
    queryFn: async (): Promise<CashflowBudgetRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("v_cashflow_budget_comparison")
        .select("*")
        .order("period_month", { ascending: true })
        .limit(1000);
      if (error) throw toFriendlyError(error);
      return (data ?? []) as CashflowBudgetRow[];
    },
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
  });

// ------------------------------------------------------ AR / AP aging (v2)
//
// Residual-aware aging snapshots, "as of today" (the views bucket on
// CURRENT_DATE − due_date, so there is no month selector — they always show
// the current open book). Contract = migration 025 (ar_aging_v2 / ap_aging_v2):
// residual_amount is the Qoyod-native due_amount (net of payments AND applied
// credit notes), falling back to the status rule where due_amount is unsynced.
// Buckets: 'current' | '1-30' | '31-60' | '61-90' | '>90'.
// Both views are GRANTed to `authenticated` only — a signed-in session is
// required, same posture as the statement views.

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | ">90";

/** Canonical bucket order — oldest last (used by the UI to render in sequence). */
export const AGING_BUCKET_ORDER: AgingBucket[] = ["current", "1-30", "31-60", "61-90", ">90"];

export interface ArAgingRow {
  customer_id: number | null;
  customer_name: string | null;
  qoyod_invoice_id: number | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  status: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  residual_amount: number | null;
  days_overdue: number | null;
  aging_bucket: AgingBucket;
}

export interface ApAgingRow {
  vendor_qoyod_id: number | null;
  vendor_name: string | null;
  qoyod_bill_id: number | null;
  bill_number: string | null;
  bill_date: string | null;
  due_date: string | null;
  status: string | null;
  total_amount: number | null;
  paid_amount: number | null;
  residual_amount: number | null;
  days_overdue: number | null;
  aging_bucket: AgingBucket;
}

export interface AgingResult<T> {
  /** False while the view has not been created/granted yet (graceful placeholder). */
  available: boolean;
  rows: T[];
}

const AGING_PAGE_SIZE = 1000;

/** Generic paginated fetch for the aging views, with the same missing-view
 * degradation as the balance sheet (returns { available:false } instead of
 * throwing when the relation is absent). */
const fetchAging = async <T>(view: string): Promise<AgingResult<T>> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const all: T[] = [];
  for (let from = 0; ; from += AGING_PAGE_SIZE) {
    const { data, error } = await supabase
      .from(view)
      .select("*")
      .order("residual_amount", { ascending: false })
      .range(from, from + AGING_PAGE_SIZE - 1);
    if (error) {
      if (isMissingViewError(error)) return { available: false, rows: [] };
      throw toFriendlyError(error);
    }
    const page = (data ?? []) as T[];
    all.push(...page);
    if (page.length < AGING_PAGE_SIZE) break;
  }
  return { available: true, rows: all };
};

export const useArAging = () =>
  useQuery({
    queryKey: ["ar_aging_v2"],
    queryFn: () => fetchAging<ArAgingRow>("ar_aging_v2"),
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });

export const useApAging = () =>
  useQuery({
    queryKey: ["ap_aging_v2"],
    queryFn: () => fetchAging<ApAgingRow>("ap_aging_v2"),
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });

// ------------------------------------------------ balance-sheet budget (v2)
//
// v_budget_balance_sheet_monthly (migration 068, 2026-08-03): a SIMPLE
// DERIVED balance-sheet budget — no client-approved line-by-line BS budget
// exists (budget_2026 covers P&L + cash flow only). Computed by
// scripts/build_budget_balance_sheet.py as a month-by-month roll-forward
// from the 2026-06-30 actual balance sheet, driven by the already-approved
// P&L+CF budget; ties assets=liabilities+equity by construction (verified
// for all 18 months before load). Full method: Budget_Load_Report_2026-07-19
// .md addendum 2026-08-03. Covers Jul-2026 -> Dec-2027 only — any other
// month degrades to "no budget for this month", never a fabricated figure.
// UI label is plain "Budget" everywhere (Marcello, 2026-08-03: no
// "derived" badges/tags) — the method is documented, not surfaced per-figure.
export interface BudgetBalanceSheetRow {
  period_month: string; // "YYYY-MM-01"
  line_code: string;
  section: "Assets" | "Liabilities" | "Equity";
  subsection: string;
  line_item: string;
  budget_amount_sar: number;
  method_note: string;
  version_id: string;
}

export interface BudgetBalanceSheetResult {
  /** False while the view has not been created/populated yet. */
  available: boolean;
  rows: BudgetBalanceSheetRow[];
}

export const fetchBudgetBalanceSheet = async (): Promise<BudgetBalanceSheetResult> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const all: BudgetBalanceSheetRow[] = [];
  for (let from = 0; ; from += BS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("v_budget_balance_sheet_monthly")
      .select("period_month,line_code,section,subsection,line_item,budget_amount_sar,method_note,version_id")
      .order("period_month", { ascending: true })
      .range(from, from + BS_PAGE_SIZE - 1);
    if (error) {
      if (isMissingViewError(error)) return { available: false, rows: [] };
      throw toFriendlyError(error);
    }
    const page = (data ?? []) as BudgetBalanceSheetRow[];
    all.push(...page);
    if (page.length < BS_PAGE_SIZE) break;
  }
  return { available: true, rows: all };
};

export const useBudgetBalanceSheet = () =>
  useQuery({
    queryKey: ["v_budget_balance_sheet_monthly"],
    queryFn: fetchBudgetBalanceSheet,
    staleTime: 10 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.available ? 60_000 : false,
  });
