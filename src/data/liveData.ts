// LIVE data layer — Supabase views `pnl_by_bu` + `v_budget_monthly`
// (trio-sporting-pm).
//
// One fetch (few hundred rows: month x BU), cached by React Query; all
// aggregation happens client-side with pure helpers: COGS and OpEx returned
// as POSITIVE numbers, D&A positive; the views store costs as negatives.
// (The historical mock layer was fully removed for the 2026-07-21 go-live.)
//
// LIVE here means: Actual + Previous Year (computed by -12m shift on live
// rows) + Budget BASE scenario (v_budget_monthly, loaded 2026-07-19 from the
// approved 2026-07-16 budget — window Jul-2026..Dec-2027, EBITDA-deep only:
// no D&A/EBIT budget exists). Budget Worst/Best scenarios are NOT loaded and
// stay on the mock dataset, flagged with a MOCK badge in the UI.
//
// MIGRATION 018 (2026-07-20): the views now read the COMPLETE P&L (documents
// + manual journal entries — payroll, JE-paid costs, project fees). `ebitda`
// is the TRUE recurring EBITDA (pre project costs); the Leveredge/F&F fees
// (TPC-*) surface separately as `projectCosts` with `ebitdaIncl` below them
// (G3 presentation). Data starts 2022-01 (G2): PY comparatives for 2022 have
// no live source and honestly show as absent.
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";

export interface PnlByBuRow {
  period_month: string; // "YYYY-MM-01"
  bu: string; // LIV | HSE | RET | MEM | B2B | COMP | EVT | CORP
  revenue: number | null;
  cogs: number | null; // negative in view
  opex_people: number | null; // negative in view
  opex_ms: number | null; // negative in view
  opex_ga: number | null; // negative in view
  da: number | null; // negative in view
  gross_margin: number | null;
  contribution_margin: number | null;
  /** Migration 018: TRUE recurring EBITDA (documents + manual JEs, pre
   * project costs; conservatively includes the tiny Unmapped slice). */
  ebitda_reported: number | null;
  /** Migration 018 (appended): Leveredge/F&F project fees (TPC-*), negative. */
  project_costs?: number | null;
  /** Migration 018 (appended): ebitda_reported + project_costs. */
  ebitda_incl_project_costs?: number | null;
  /** UNALL pseudo-rows only: JE cost on unmapped accounts (pending D378),
   * negative. Counted inside recurring EBITDA (bridge convention). */
  unmapped?: number | null;
}

// ADR-003 authoritative BU taxonomy labels (live Qoyod tagging)
export const LIVE_BU_LABELS: Record<string, string> = {
  LIV: "Livery",
  HSE: "Horse School",
  RET: "Retail",
  MEM: "Membership",
  B2B: "B2B",
  COMP: "Competitions",
  EVT: "Events",
  CORP: "Corporate",
  UNALL: "Unallocated",
};

/** Pseudo-BU for pnl_management rows with bu IS NULL (mostly bill items whose
 * moa_bu_code is not yet denormalized). pnl_by_bu drops them (WHERE bu IS NOT
 * NULL), which would silently understate consolidated costs — so we fetch that
 * slice separately and merge it under this code. */
export const UNALLOCATED_BU = "UNALL";

interface PnlManagementSlice {
  period_month: string;
  section: string; // Revenue | COGS | OPEX-People | OPEX-MS | OPEX-GA | D&A | NON-OP | Other
  amount_sar: number;
}

const sliceToRows = (slice: PnlManagementSlice[]): PnlByBuRow[] => {
  const byMonth = new Map<string, PnlByBuRow>();
  for (const s of slice) {
    let row = byMonth.get(s.period_month);
    if (!row) {
      row = {
        period_month: s.period_month, bu: UNALLOCATED_BU,
        revenue: 0, cogs: 0, opex_people: 0, opex_ms: 0, opex_ga: 0, da: 0,
        gross_margin: 0, contribution_margin: 0, ebitda_reported: 0,
        project_costs: 0, ebitda_incl_project_costs: 0, unmapped: 0,
      };
      byMonth.set(s.period_month, row);
    }
    switch (s.section) {
      case "Revenue": row.revenue = (row.revenue ?? 0) + s.amount_sar; break;
      case "COGS": row.cogs = (row.cogs ?? 0) + s.amount_sar; break;
      case "OPEX-People": row.opex_people = (row.opex_people ?? 0) + s.amount_sar; break;
      case "OPEX-MS": row.opex_ms = (row.opex_ms ?? 0) + s.amount_sar; break;
      case "OPEX-GA": row.opex_ga = (row.opex_ga ?? 0) + s.amount_sar; break;
      case "D&A": row.da = (row.da ?? 0) + s.amount_sar; break;
      // Migration 018 sections:
      case "Project-Costs": row.project_costs = (row.project_costs ?? 0) + s.amount_sar; break;
      case "Unmapped": row.unmapped = (row.unmapped ?? 0) + s.amount_sar; break;
      default: break; // NON-OP / Other: below-EBIT lines, out of scope here
    }
  }
  return [...byMonth.values()];
};

export const fetchPnlByBu = async (): Promise<PnlByBuRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
  const [byBu, unalloc] = await Promise.all([
    supabase.from("pnl_by_bu").select("*").order("period_month", { ascending: true }).limit(5000),
    supabase.from("pnl_management").select("period_month,section,amount_sar").is("bu", null).limit(5000),
  ]);
  if (byBu.error) throw toFriendlyError(byBu.error);
  if (unalloc.error) throw toFriendlyError(unalloc.error);
  return [
    ...((byBu.data ?? []) as PnlByBuRow[]),
    ...sliceToRows((unalloc.data ?? []) as PnlManagementSlice[]),
  ];
};

export const usePnlByBu = () =>
  useQuery({
    queryKey: ["pnl_by_bu"],
    queryFn: fetchPnlByBu,
    staleTime: 5 * 60 * 1000, // Qoyod sync is polling-based; 5 min freshness is fine
    enabled: isSupabaseConfigured,
  });

// ------------------------------------------------- leaf-grain P&L (R1 drill)

/** Full-grain row of pnl_management: month x section x BU x MoA leaf.
 * `cluster`/`leaf` names are denormalized for revenue (invoice items) but NULL
 * for costs (bill items) and D&A (JE-derived) — resolve names via moaMaster. */
export interface PnlLeafRow {
  period_month: string; // "YYYY-MM-01"
  /** Revenue | COGS | OPEX-People | OPEX-MS | OPEX-GA | D&A | Project-Costs |
   * Unmapped | NON-OP | Other (Project-Costs/Unmapped since migration 018) */
  section: string;
  bu: string | null; // null = unallocated (merged as UNALL)
  cluster: string | null;
  leaf: string | null;
  /** NULL on 'Unmapped' rows (JE lines on accounts pending D378 mapping). */
  moa_code: string | null;
  amount_sar: number; // signed: revenue +, costs -
  line_count: number;
}

const LEAF_PAGE_SIZE = 1000; // PostgREST hard-caps responses at 1000 rows

/** Fetch pnl_management at full MoA-leaf grain, paginated (the view holds
 * ~2k rows and PostgREST silently caps a single response at 1000). */
export const fetchPnlLeafRows = async (): Promise<PnlLeafRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
  const all: PnlLeafRow[] = [];
  for (let from = 0; ; from += LEAF_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("pnl_management")
      .select("period_month,section,bu,cluster,leaf,moa_code,amount_sar,line_count")
      .order("period_month", { ascending: true })
      .order("moa_code", { ascending: true })
      .range(from, from + LEAF_PAGE_SIZE - 1);
    if (error) throw toFriendlyError(error);
    const page = (data ?? []) as PnlLeafRow[];
    all.push(...page);
    if (page.length < LEAF_PAGE_SIZE) break;
  }
  return all;
};

export const usePnlLeafRows = () =>
  useQuery({
    queryKey: ["pnl_management_leaf"],
    queryFn: fetchPnlLeafRows,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
  });

// ------------------------------------------------------------------ budget

/** Budget window loaded in Supabase (BASE scenario, approved 2026-07-16).
 * Months outside this inclusive range have NO budget comparative — the UI
 * must show "—" (absent), never zero. */
export const BUDGET_START_KEY = "2026-07";
export const BUDGET_END_KEY = "2027-12";

/** True when the whole inclusive month-key range falls inside the loaded
 * budget window (a partial overlap would produce a misleading comparative). */
export const budgetCoversRange = (startKey: string, endKey: string): boolean =>
  startKey >= BUDGET_START_KEY && endKey <= BUDGET_END_KEY;

export interface BudgetMonthlyRow {
  period_month: string; // "YYYY-MM-01"
  moa_code: string;
  bu_code: string | null; // NULL for unallocated lines (e.g. recurring COGS)
  section: string; // Revenue | COGS | OPEX-People | OPEX-MS | OPEX-GA (CASHFLOW filtered out)
  line_label: string;
  budget_amount_sar: number; // signed like pnl_management: revenue +, costs -
  version_id: string;
}

export const fetchBudgetMonthly = async (): Promise<BudgetMonthlyRow[]> => {
  if (!supabase) throw new Error("Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)");
  // P&L sections only — the CASHFLOW section belongs to the Cash tab (still mock).
  const { data, error } = await supabase
    .from("v_budget_monthly")
    .select("*")
    .neq("section", "CASHFLOW")
    .order("period_month", { ascending: true })
    .limit(5000);
  if (error) throw toFriendlyError(error);
  return (data ?? []) as BudgetMonthlyRow[];
};

export const useBudgetMonthly = () =>
  useQuery({
    queryKey: ["v_budget_monthly"],
    queryFn: fetchBudgetMonthly,
    staleTime: 60 * 60 * 1000, // budget changes only on re-approval
    enabled: isSupabaseConfigured,
  });

// ---------------------------------------------------------------- helpers

const n = (v: number | null | undefined): number => v ?? 0;

/** "YYYY-MM" key from a date string */
export const monthKey = (date: string): string => date.slice(0, 7);

/** Shift a "YYYY-MM" key by +/- months */
export const shiftMonthKey = (key: string, months: number): string => {
  const [y, m] = key.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
};

/** Number of months in an inclusive "YYYY-MM" key range. */
export const rangeLengthMonths = (startKey: string, endKey: string): number => {
  const [sy, sm] = startKey.split("-").map(Number);
  const [ey, em] = endKey.split("-").map(Number);
  return (ey * 12 + em) - (sy * 12 + sm) + 1;
};

/** Previous Period = the immediately preceding period of the SAME length.
 * Month -> previous month, quarter -> previous quarter, YTD/LTM -> the
 * equal-length window ending right before the current one. (ADR-003 / CFO
 * spec Tab 1: PP is a required comparison alongside Budget and PY.) */
export const previousPeriodRange = (
  startKey: string,
  endKey: string,
): { startKey: string; endKey: string } => {
  const len = rangeLengthMonths(startKey, endKey);
  return { startKey: shiftMonthKey(startKey, -len), endKey: shiftMonthKey(endKey, -len) };
};

/** Previous Year = same window shifted back 12 months. */
export const previousYearRange = (
  startKey: string,
  endKey: string,
): { startKey: string; endKey: string } => ({
  startKey: shiftMonthKey(startKey, -12),
  endKey: shiftMonthKey(endKey, -12),
});

export const monthKeyLabel = (key: string): string => {
  const [y, m] = key.split("-").map(Number);
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[m - 1]} '${String(y).slice(-2)}`;
};

export interface LivePLTotals {
  revenue: number;
  cogs: number; // positive
  opexPeople: number; // positive
  opexMs: number; // positive
  opexGa: number; // positive
  opex: number; // positive, People + M&S + G&A
  /** JE cost on accounts pending mapping (D378), positive. Inside recurring
   * EBITDA per the bridge convention. Actuals only (budget has none). */
  unmapped: number;
  /** Leveredge/F&F project fees, positive. Actuals: 'Project-Costs' (TPC-*)
   * section. Budget: the GA-NRP-* lines (the budget plans the same fees under
   * GA-NRP; mapped here for like-for-like comparison — G3). */
  projectCosts: number;
  da: number; // positive
  grossMargin: number;
  /** Recurring EBITDA (pre project costs) — G3 headline. */
  ebitda: number;
  /** EBITDA incl. project costs = ebitda - projectCosts. */
  ebitdaIncl: number;
}

export const emptyTotals = (): LivePLTotals => ({
  revenue: 0, cogs: 0, opexPeople: 0, opexMs: 0, opexGa: 0, opex: 0,
  unmapped: 0, projectCosts: 0, da: 0, grossMargin: 0, ebitda: 0, ebitdaIncl: 0,
});

/**
 * Aggregate live rows over an inclusive month-key range, optionally one BU.
 * Sign conventions match the mock layer: costs positive, GM = rev - cogs,
 * EBITDA = rev - cogs - opex.
 */
export const aggregateLivePL = (
  rows: PnlByBuRow[] | undefined,
  startMonthKey: string,
  endMonthKey: string,
  bu?: string,
): LivePLTotals => {
  const out = emptyTotals();
  if (!rows) return out;
  for (const r of rows) {
    const k = monthKey(r.period_month);
    if (k < startMonthKey || k > endMonthKey) continue;
    if (bu && r.bu !== bu) continue;
    out.revenue += n(r.revenue);
    out.cogs += -n(r.cogs);
    out.opexPeople += -n(r.opex_people);
    out.opexMs += -n(r.opex_ms);
    out.opexGa += -n(r.opex_ga);
    out.unmapped += -n(r.unmapped);
    out.projectCosts += -n(r.project_costs);
    out.da += -n(r.da);
  }
  out.opex = out.opexPeople + out.opexMs + out.opexGa;
  out.grossMargin = out.revenue - out.cogs;
  // Recurring EBITDA (pre project costs); Unmapped counted inside — bridge
  // convention, same as pnl_by_bu.ebitda_reported post-migration-018.
  out.ebitda = out.revenue - out.cogs - out.opex - out.unmapped;
  out.ebitdaIncl = out.ebitda - out.projectCosts;
  return out;
};

/**
 * Aggregate LIVE budget rows (v_budget_monthly) over an inclusive month-key
 * range, optionally one BU. Same sign conventions as aggregateLivePL: costs
 * positive, GM = rev - cogs, EBITDA = rev - cogs - opex. The budget is
 * EBITDA-deep: `da` is always 0 and MUST NOT be rendered as a real budget
 * (no D&A/EBIT budget exists — show "—").
 *
 * Returns null when the range is not fully covered by the loaded budget
 * window (months before Jul-2026 / after Dec-2027 have no budget).
 */
export const aggregateBudgetPL = (
  rows: BudgetMonthlyRow[] | undefined,
  startMonthKey: string,
  endMonthKey: string,
  bu?: string,
): LivePLTotals | null => {
  if (!rows || rows.length === 0) return null;
  if (!budgetCoversRange(startMonthKey, endMonthKey)) return null;
  const out = emptyTotals();
  for (const r of rows) {
    const k = monthKey(r.period_month);
    if (k < startMonthKey || k > endMonthKey) continue;
    if (bu && r.bu_code !== bu) continue;
    // The budget plans the Leveredge/F&F fees as GA-NRP-* lines (inside
    // OPEX-GA). Actuals record the same fees as 'Project-Costs' (TPC-*),
    // below EBITDA (migration 018, reconciliation Option A). Map the budget
    // GA-NRP lines onto projectCosts so budget vs actual is like-for-like
    // on every line (G&A, recurring EBITDA, project costs, EBITDA incl.).
    if (r.moa_code.startsWith("GA-NRP")) {
      out.projectCosts += -r.budget_amount_sar;
      continue;
    }
    switch (r.section) {
      case "Revenue": out.revenue += r.budget_amount_sar; break;
      case "COGS": out.cogs += -r.budget_amount_sar; break;
      case "OPEX-People": out.opexPeople += -r.budget_amount_sar; break;
      case "OPEX-MS": out.opexMs += -r.budget_amount_sar; break;
      case "OPEX-GA": out.opexGa += -r.budget_amount_sar; break;
      default: break;
    }
  }
  out.opex = out.opexPeople + out.opexMs + out.opexGa;
  out.grossMargin = out.revenue - out.cogs;
  out.ebitda = out.revenue - out.cogs - out.opex; // recurring (GA-NRP excluded above)
  out.ebitdaIncl = out.ebitda - out.projectCosts;
  return out;
};

/** Budget totals for a single month ("YYYY-MM"), or null when the month is
 * outside the loaded budget window. */
export const budgetForMonth = (
  rows: BudgetMonthlyRow[] | undefined,
  key: string,
  bu?: string,
): LivePLTotals | null => aggregateBudgetPL(rows, key, key, bu);

/** Distinct BU codes present in the live data, ordered by ADR-003 taxonomy. */
export const listLiveBUs = (rows: PnlByBuRow[] | undefined): string[] => {
  if (!rows) return [];
  const order = Object.keys(LIVE_BU_LABELS);
  const present = new Set(rows.map((r) => r.bu));
  return order.filter((b) => present.has(b)).concat([...present].filter((b) => !order.includes(b)).sort());
};

/** Sorted distinct month keys present in the live data. */
export const listLivePeriods = (rows: PnlByBuRow[] | undefined): string[] => {
  if (!rows) return [];
  return [...new Set(rows.map((r) => monthKey(r.period_month)))].sort();
};

export interface LiveMonthlyPoint {
  monthKey: string;
  month: string; // display label
  actual: LivePLTotals;
  previousYear: LivePLTotals;
}

/** Last `count` months (ending at `endKey` if given, else the latest live
 * period), actual + PY, optional BU filter. Charts pass the last COMPLETE
 * month as `endKey` so a partial in-progress month (revenue synced, no costs)
 * never plots as a fake collapse. */
export const getLiveMonthlySeries = (
  rows: PnlByBuRow[] | undefined,
  bu?: string,
  count = 12,
  endKey?: string,
): LiveMonthlyPoint[] => {
  const periods = listLivePeriods(rows);
  if (periods.length === 0) return [];
  const last = endKey && periods.includes(endKey) ? endKey : periods[periods.length - 1];
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) keys.push(shiftMonthKey(last, -i));
  return keys.map((k) => ({
    monthKey: k,
    month: monthKeyLabel(k),
    actual: aggregateLivePL(rows, k, k, bu),
    previousYear: aggregateLivePL(rows, shiftMonthKey(k, -12), shiftMonthKey(k, -12), bu),
  }));
};

/** Today (real clock, not mock metadata). */
export const LIVE_TODAY = new Date().toISOString().slice(0, 10);
export const LIVE_CURRENT_MONTH = monthKey(LIVE_TODAY);

// ------------------------------------------------------------ data freshness

/** Fallback last-closed month, used ONLY until the live rows load (the real
 * value is DERIVED from the data — see deriveLastCompleteMonth). */
export const LAST_CLOSED_MONTH_FALLBACK = "2026-06";

/** Latest month whose live rows carry POSTED COSTS (cogs / opex / D&A /
 * project costs). Months after it may show synced revenue with no costs yet
 * (e.g. the current month mid-close) — the UI must treat them as partial and
 * never default headline KPIs onto them. Derived from the data on every
 * fetch, so it rolls forward automatically at each month-end close. */
export const deriveLastCompleteMonth = (rows: PnlByBuRow[] | undefined): string | null => {
  if (!rows || rows.length === 0) return null;
  let last: string | null = null;
  for (const r of rows) {
    const costs =
      n(r.cogs) + n(r.opex_people) + n(r.opex_ms) + n(r.opex_ga) +
      n(r.da) + n(r.project_costs) + n(r.unmapped);
    if (costs !== 0) {
      const k = monthKey(r.period_month);
      if (last === null || k > last) last = k;
    }
  }
  return last;
};

/** "30 June 2026"-style label for the end of a "YYYY-MM" month. */
export const endOfMonthLabel = (key: string): string => {
  const [y, m] = key.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${lastDay} ${monthNames[m - 1]} ${y}`;
};

/** True for months after the last complete close (revenue synced, costs not
 * yet posted — figures are partial, not final). */
export const isIncompleteMonth = (
  key: string,
  lastClosed: string = LAST_CLOSED_MONTH_FALLBACK,
): boolean => key > lastClosed;

/** True when an inclusive month-key range touches any incomplete month. */
export const rangeHasIncompleteMonths = (
  _startKey: string,
  endKey: string,
  lastClosed: string = LAST_CLOSED_MONTH_FALLBACK,
): boolean => isIncompleteMonth(endKey, lastClosed);
