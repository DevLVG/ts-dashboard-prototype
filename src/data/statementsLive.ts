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

export const fetchBalanceSheet = async (): Promise<BalanceSheetResult> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const all: BalanceSheetRow[] = [];
  for (let from = 0; ; from += BS_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("v_balance_sheet_monthly")
      .select("month,section,subsection,line_item,amount,sort_order,is_adjustment,note")
      .order("month", { ascending: true })
      .order("sort_order", { ascending: true })
      .range(from, from + BS_PAGE_SIZE - 1);
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
