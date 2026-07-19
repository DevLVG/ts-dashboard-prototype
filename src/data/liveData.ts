// LIVE data layer — Supabase view `pnl_by_bu` (trio-sporting-pm).
//
// One fetch (few hundred rows: month x BU), cached by React Query; all
// aggregation happens client-side with pure helpers that mirror the sign
// conventions of the mock layer (financialData.ts): COGS and OpEx returned
// as POSITIVE numbers, D&A positive; the view stores costs as negatives.
//
// LIVE here means: Actual + Previous Year (computed by -12m shift on live
// rows). Budget comparatives are NOT live (budget table not yet populated)
// and stay on the mock dataset, flagged with a MOCK badge in the UI.
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

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
  ebitda_reported: number | null;
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
  if (byBu.error) throw byBu.error;
  if (unalloc.error) throw unalloc.error;
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
  da: number; // positive
  grossMargin: number;
  ebitda: number;
}

export const emptyTotals = (): LivePLTotals => ({
  revenue: 0, cogs: 0, opexPeople: 0, opexMs: 0, opexGa: 0, opex: 0, da: 0, grossMargin: 0, ebitda: 0,
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
    out.da += -n(r.da);
  }
  out.opex = out.opexPeople + out.opexMs + out.opexGa;
  out.grossMargin = out.revenue - out.cogs;
  out.ebitda = out.revenue - out.cogs - out.opex;
  return out;
};

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

/** Last `count` months (ending at the latest live period), actual + PY, optional BU filter. */
export const getLiveMonthlySeries = (
  rows: PnlByBuRow[] | undefined,
  bu?: string,
  count = 12,
): LiveMonthlyPoint[] => {
  const periods = listLivePeriods(rows);
  if (periods.length === 0) return [];
  const last = periods[periods.length - 1];
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
