// ALIGNMENT DATA LAYER — Dashboard Alignment Spec 2026-07-21.
//
// Implements the spec's two-basis / window / recurrence / budget contracts:
//
//   BASES (§0.1) — both net of 15% VAT, never silently mixed:
//     VALIDATED  net of VAT, BEFORE customer credit notes (package basis, DEFAULT)
//                = pnl_management rows with source <> 'credit_note'
//     STRICT     net of VAT AND net of credit notes (certified basis)
//                = all pnl_management rows
//
//   SOURCE PREFERENCE — `v_pnl_basis` (DB-2) is used when live; until it lands
//   the SAME arithmetic runs on `pnl_management` (which already carries the
//   `source` column incl. 'credit_note'). Both are live warehouse objects; the
//   numbers are identical by the DB-2 contract. NOTHING IS HARDCODED: every
//   figure on screen is an aggregation of fetched rows.
//
//   RECURRENCE (DB-1 gate, §1.2): recurring measures render ONLY when the
//   `dim_recurrence` table (or in-row recurrence from v_pnl_basis) is live.
//   Until then every "recurring" tile shows its explicit pending state.
//
//   WINDOWS & PY (§0.2): PY of any window = the SAME window shifted −12
//   months, same basis, same perimeter. Pinned preset "As delivered
//   (Jun-25→May-26)" reproduces the 18-Jul package window. Fiscal quarters
//   start June (Q1=Jun-Aug ... Q4=Mar-May).
import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";
import { monthKey, shiftMonthKey, monthKeyLabel } from "@/data/liveData";

// ---------------------------------------------------------------- types

export type Basis = "VALIDATED" | "STRICT";

export const BASIS_LABELS: Record<Basis, string> = {
  VALIDATED: "Validated basis — net of VAT, before credit notes",
  STRICT: "Strict basis — net of VAT and credit notes",
};
export const BASIS_SHORT: Record<Basis, string> = {
  VALIDATED: "Validated basis",
  STRICT: "Strict basis",
};

/** Normalised P&L fact row (v_pnl_basis when live, else pnl_management). */
export interface BasisRow {
  period_month: string; // "YYYY-MM-01"
  section: string; // Revenue | COGS | OPEX-GA | OPEX-MS | OPEX-People | D&A | Project-Costs | NON-OP | ...
  bu: string | null;
  cluster: string | null;
  leaf: string | null;
  moa_code: string | null;
  source: string; // invoice | bill | journal | credit_note | model_adjustment
  amount_sar: number; // signed, STRICT measure (CN rows included, negative)
  recurrence: "recurring" | "non-recurring" | null; // in-row only from v_pnl_basis
  drift_flag: string | null;
}

export interface BasisDataset {
  rows: BasisRow[];
  /** Which warehouse object served the rows (provenance chip). */
  sourceObject: "v_pnl_basis" | "pnl_management";
}

const PAGE = 1000;

const isMissingRelation = (err: { code?: string; message?: string }): boolean => {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return (
    code === "42P01" || code === "PGRST205" || code === "PGRST202" ||
    msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("could not find")
  );
};

const fetchAllPages = async <T,>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<T[] | "missing"> => {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) {
      if (isMissingRelation(error)) return "missing";
      throw toFriendlyError(error);
    }
    const page = (data ?? []) as T[];
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
};

// ------------------------------------------------------ basis fact fetch

interface VPnlBasisRow {
  period_month: string; section: string; bu: string | null; cluster: string | null;
  leaf: string | null; moa_code: string | null; source: string;
  recurrence: string | null; drift_flag: string | null;
  amount_net_sar: number | null; amount_precn_sar: number | null; credit_note_sar: number | null;
}

export const fetchBasisRows = async (): Promise<BasisDataset> => {
  if (!supabase) throw new Error("Supabase is not configured");
  // Preferred: the DB-2 contract view.
  const viaView = await fetchAllPages<VPnlBasisRow>((from, to) =>
    supabase!
      .from("v_pnl_basis")
      .select("period_month,section,bu,cluster,leaf,moa_code,source,recurrence,drift_flag,amount_net_sar,amount_precn_sar,credit_note_sar")
      .order("period_month", { ascending: true })
      .order("moa_code", { ascending: true })
      .range(from, to),
  );
  if (viaView !== "missing") {
    return {
      sourceObject: "v_pnl_basis",
      rows: viaView.map((r) => ({
        period_month: r.period_month,
        section: r.section,
        bu: r.bu,
        cluster: r.cluster,
        leaf: r.leaf,
        moa_code: r.moa_code,
        source: r.source,
        amount_sar: r.amount_net_sar ?? 0,
        recurrence: r.recurrence === "recurring" || r.recurrence === "non-recurring" ? r.recurrence : null,
        drift_flag: r.drift_flag,
      })),
    };
  }
  // Fallback: identical arithmetic on pnl_management (has `source`, incl.
  // 'credit_note' — migration 026). Certified live view, NOT a mock.
  const viaMgmt = await fetchAllPages<Omit<BasisRow, "recurrence" | "drift_flag">>((from, to) =>
    supabase!
      .from("pnl_management")
      .select("period_month,section,bu,cluster,leaf,moa_code,source,amount_sar")
      .order("period_month", { ascending: true })
      .order("moa_code", { ascending: true })
      .range(from, to),
  );
  if (viaMgmt === "missing") throw new Error("pnl_management is not reachable");
  return {
    sourceObject: "pnl_management",
    rows: viaMgmt.map((r) => ({ ...r, recurrence: null, drift_flag: null })),
  };
};

export const useBasisRows = () =>
  useQuery({
    queryKey: ["alignment_basis_rows"],
    queryFn: fetchBasisRows,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
  });

// ------------------------------------------------- recurrence dimension

export interface RecurrenceDimRow {
  period_month: string;
  moa_code: string;
  recurrence: "recurring" | "non-recurring";
  drift_flag: string | null;
}
export interface RecurrenceRule {
  moa_pattern: string; // SQL LIKE pattern, e.g. "COMP-IA%"
  recurrence: "recurring" | "non-recurring";
}

export interface RecurrenceState {
  /** DB-1 gate: true only when the dimension is live in the warehouse. */
  live: boolean;
  byKey: Map<string, RecurrenceDimRow>;
  rules: RecurrenceRule[];
}

const likeToRegex = (pattern: string): RegExp =>
  new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".")}$`);

export const fetchRecurrence = async (): Promise<RecurrenceState> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const dim = await fetchAllPages<RecurrenceDimRow>((from, to) =>
    supabase!
      .from("dim_recurrence")
      .select("period_month,moa_code,recurrence,drift_flag")
      .range(from, to),
  );
  if (dim === "missing") return { live: false, byKey: new Map(), rules: [] };
  const byKey = new Map<string, RecurrenceDimRow>();
  for (const r of dim) byKey.set(`${monthKey(r.period_month)}|${r.moa_code}`, r);
  // Companion rules table (months beyond the model coverage) — pattern rules
  // applied in PRIORITY order (lowest first), catch-all '%' last.
  let rules: RecurrenceRule[] = [];
  const ruleRows = await fetchAllPages<{ moa_pattern: string; recurrence: string; priority: number | null }>((from, to) =>
    supabase!.from("recurrence_rules").select("moa_pattern,recurrence,priority").order("priority", { ascending: true }).range(from, to),
  );
  if (ruleRows !== "missing") {
    rules = ruleRows
      .filter((r) => r.recurrence === "recurring" || r.recurrence === "non-recurring")
      .map((r) => ({ moa_pattern: r.moa_pattern, recurrence: r.recurrence as RecurrenceRule["recurrence"] }));
  }
  return { live: byKey.size > 0, byKey, rules };
};

export const useRecurrence = () =>
  useQuery({
    queryKey: ["alignment_recurrence"],
    queryFn: fetchRecurrence,
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    // Re-poll while the DB track has not landed DB-1 yet.
    refetchInterval: (query) => (query.state.data && !query.state.data.live ? 60_000 : false),
  });

/** Resolve recurrence for a row: in-row (v_pnl_basis) → dim → rules → null. */
export const resolveRecurrence = (
  row: BasisRow,
  rec: RecurrenceState | undefined,
): "recurring" | "non-recurring" | null => {
  if (row.recurrence) return row.recurrence;
  if (!rec || !rec.live) return null;
  if (row.moa_code) {
    const hit = rec.byKey.get(`${monthKey(row.period_month)}|${row.moa_code}`);
    if (hit) return hit.recurrence;
    for (const rule of rec.rules) {
      if (likeToRegex(rule.moa_pattern).test(row.moa_code)) return rule.recurrence;
    }
  }
  // Deterministic default per DB-1 loader: unresolved rows fail the load, so
  // reaching here means the dimension does not cover this row yet.
  return null;
};

// ------------------------------------------------------------ P&L windows

/** Inclusive month-key window. */
export interface Win { startKey: string; endKey: string }

export type WindowPresetId = "AS_DELIVERED" | "MTD" | "LAST_MONTH" | "TTM" | "YTD" | "FY" | string; // "M:YYYY-MM"

/** The pinned package window (§0.2) — a WINDOW DEFINITION, not a figure. */
export const AS_DELIVERED_WIN: Win = { startKey: "2025-06", endKey: "2026-05" };

export const winLabel = (w: Win): string =>
  w.startKey === w.endKey ? monthKeyLabel(w.startKey) : `${monthKeyLabel(w.startKey)}→${monthKeyLabel(w.endKey)}`;

export const shiftWin = (w: Win, months: number): Win => ({
  startKey: shiftMonthKey(w.startKey, months),
  endKey: shiftMonthKey(w.endKey, months),
});

/** PY = the same window shifted −12 months (§0.2). Never anything else. */
export const pyWin = (w: Win): Win => shiftWin(w, -12);

/** A window "includes open months" whenever it reaches past the last CLOSED
 * month (`lastComplete`, derived from actual cost postings — see
 * `lastCompleteFromBasis`). "To date" windows (Month to date / YTD / FY to
 * date) are anchored to TODAY, not to the last close, so they routinely
 * extend into a month that hasn't fully posted yet — that's the honesty-rule
 * case (§0.3) the inline badge exists for. */
export const windowIncludesOpenMonths = (w: Win, lastComplete: string): boolean => w.endKey > lastComplete;

/**
 * Resolve a window preset to an actual month range + display name.
 *
 * `lastComplete` = the last CLOSED month (data-driven — costs materially
 * posted). Used by TTM / "Last closed month", which must stay 12 CLOSED
 * months for trend comparability, never open ones.
 *
 * `todayKey` = today's real calendar month (device clock, see
 * `todayMonthKey()` — never hard-coded). Used by "to date" windows (Month to
 * date / YTD / FY to date) per the founder's request: these must track the
 * actual calendar, not freeze at whatever month the data last closed.
 */
export const resolveWindow = (preset: WindowPresetId, lastComplete: string, todayKey: string): { win: Win; name: string } => {
  if (preset === "AS_DELIVERED") return { win: AS_DELIVERED_WIN, name: "As delivered (TTM Jun-25→May-26)" };
  if (preset === "MTD") return { win: { startKey: todayKey, endKey: todayKey }, name: `Month to date (${monthKeyLabel(todayKey)})` };
  if (preset === "LAST_MONTH") return { win: { startKey: lastComplete, endKey: lastComplete }, name: `Last closed month (${monthKeyLabel(lastComplete)})` };
  if (preset === "TTM") return { win: { startKey: shiftMonthKey(lastComplete, -11), endKey: lastComplete }, name: `TTM (${monthKeyLabel(shiftMonthKey(lastComplete, -11))}→${monthKeyLabel(lastComplete)})` };
  if (preset === "YTD") {
    const y = todayKey.slice(0, 4);
    return { win: { startKey: `${y}-01`, endKey: todayKey }, name: `YTD (Jan→${monthKeyLabel(todayKey)})` };
  }
  if (preset === "FY") {
    // Fiscal year starts June (§0.2) — anchored to TODAY, not the last close.
    const [y, m] = todayKey.split("-").map(Number);
    const fyStart = m >= 6 ? `${y}-06` : `${y - 1}-06`;
    return { win: { startKey: fyStart, endKey: todayKey }, name: `FY to date (${monthKeyLabel(fyStart)}→${monthKeyLabel(todayKey)})` };
  }
  if (preset.startsWith("M:")) {
    const k = preset.slice(2);
    return { win: { startKey: k, endKey: k }, name: monthKeyLabel(k) };
  }
  return resolveWindow("TTM", lastComplete, todayKey);
};

/** Fiscal quarters of the FY containing/ending at the anchor (Q1=Jun-Aug). */
export const fiscalQuarters = (fyStartKey: string): { label: string; win: Win }[] =>
  [0, 1, 2, 3].map((q) => ({
    label: `Q${q + 1}`,
    win: { startKey: shiftMonthKey(fyStartKey, q * 3), endKey: shiftMonthKey(fyStartKey, q * 3 + 2) },
  }));

// -------------------------------------------------------- P&L aggregation

export interface PLAgg {
  revenue: number;      // active-basis revenue (signed +)
  creditNotes: number;  // CN deduction over the window, POSITIVE (net of VAT)
  cogs: number;         // negative
  grossMargin: number;
  opexGa: number;       // negative
  opexMs: number;       // negative
  opexPeople: number;   // negative
  opex: number;         // negative
  ebitda5: number;      // 5-section EBITDA (pre project costs)
  projectCosts: number; // negative (TPC — Leveredge/F&F, section Project-Costs)
  ebitdaReported: number; // ebitda5 + projectCosts
  da: number;           // negative
  ebit: number;
  nonOp: number;
  netResult: number;
}

const emptyAgg = (): PLAgg => ({
  revenue: 0, creditNotes: 0, cogs: 0, grossMargin: 0, opexGa: 0, opexMs: 0,
  opexPeople: 0, opex: 0, ebitda5: 0, projectCosts: 0, ebitdaReported: 0,
  da: 0, ebit: 0, nonOp: 0, netResult: 0,
});

const inWin = (k: string, w: Win) => k >= w.startKey && k <= w.endKey;

/** Aggregate the P&L on the active basis over a window (§0.1 arithmetic). */
export const aggregatePL = (
  rows: BasisRow[] | undefined,
  basis: Basis,
  w: Win,
  bu?: string,
): PLAgg => {
  const out = emptyAgg();
  if (!rows) return out;
  for (const r of rows) {
    const k = monthKey(r.period_month);
    if (!inWin(k, w)) continue;
    if (bu && r.bu !== bu) continue;
    const isCN = r.source === "credit_note";
    if (isCN) out.creditNotes += -r.amount_sar; // CN rows are negative revenue
    if (isCN && basis === "VALIDATED") continue; // Validated basis: CN excluded
    switch (r.section) {
      case "Revenue": out.revenue += r.amount_sar; break;
      case "COGS": out.cogs += r.amount_sar; break;
      case "OPEX-GA": out.opexGa += r.amount_sar; break;
      case "OPEX-MS": out.opexMs += r.amount_sar; break;
      case "OPEX-People": out.opexPeople += r.amount_sar; break;
      case "Project-Costs": out.projectCosts += r.amount_sar; break;
      case "D&A": out.da += r.amount_sar; break;
      case "NON-OP": out.nonOp += r.amount_sar; break;
      default: break; // Unmapped = 0 everywhere post-verification 2026-07-21
    }
  }
  out.opex = out.opexGa + out.opexMs + out.opexPeople;
  out.grossMargin = out.revenue + out.cogs;
  out.ebitda5 = out.revenue + out.cogs + out.opex;
  out.ebitdaReported = out.ebitda5 + out.projectCosts;
  out.ebit = out.ebitdaReported + out.da;
  out.netResult = out.ebit + out.nonOp;
  return out;
};

/** Management-view aggregation (View B / tiles P1-P4) — DB-1 gated. */
export interface RecurringAgg {
  recRevenue: number;
  nonRecRevenue: number;
  totalRevenue: number;
  recDirect: number;    // negative
  nonRecDirect: number; // negative
  recGrossProfit: number;
  recOpex: number;      // negative (OPEX-* recurring)
  nonRecOpex: number;   // negative (OPEX-* non-recurring + Project-Costs)
  nonRecOpexLines: { label: string; amount: number }[];
  recEbitda: number;    // as-booked recurring EBITDA
  reportedEbitda: number;
}

/** DB-1 gate check: recurrence is live when the dimension table is loaded OR
 * the basis rows carry in-row recurrence (v_pnl_basis). */
export const recurrenceIsLive = (
  rows: BasisRow[] | undefined,
  rec: RecurrenceState | undefined,
): boolean => (rec?.live ?? false) || (rows?.some((r) => r.recurrence !== null) ?? false);

export const aggregateRecurring = (
  rows: BasisRow[] | undefined,
  basis: Basis,
  w: Win,
  rec: RecurrenceState | undefined,
  bu?: string,
): RecurringAgg | null => {
  if (!rows || !recurrenceIsLive(rows, rec)) return null; // DB-1 gate (§1.2 P1)
  const out: RecurringAgg = {
    recRevenue: 0, nonRecRevenue: 0, totalRevenue: 0, recDirect: 0, nonRecDirect: 0,
    recGrossProfit: 0, recOpex: 0, nonRecOpex: 0, nonRecOpexLines: [], recEbitda: 0, reportedEbitda: 0,
  };
  const nonRecLineMap = new Map<string, number>();
  for (const r of rows) {
    const k = monthKey(r.period_month);
    if (!inWin(k, w)) continue;
    if (bu && r.bu !== bu) continue;
    if (basis === "VALIDATED" && r.source === "credit_note") continue;
    const rc = resolveRecurrence(r, rec);
    switch (r.section) {
      case "Revenue":
        if (rc === "non-recurring") out.nonRecRevenue += r.amount_sar;
        else out.recRevenue += r.amount_sar; // unresolved rows default recurring per loader integrity
        break;
      case "COGS":
        if (rc === "non-recurring") out.nonRecDirect += r.amount_sar;
        else out.recDirect += r.amount_sar;
        break;
      case "OPEX-GA":
      case "OPEX-MS":
      case "OPEX-People":
        if (rc === "non-recurring") {
          out.nonRecOpex += r.amount_sar;
          const label = r.cluster ?? r.leaf ?? r.moa_code ?? "Non-recurring OpEx";
          nonRecLineMap.set(label, (nonRecLineMap.get(label) ?? 0) + r.amount_sar);
        } else out.recOpex += r.amount_sar;
        break;
      case "Project-Costs": {
        out.nonRecOpex += r.amount_sar;
        const label = r.cluster ?? r.leaf ?? r.moa_code ?? "Project costs";
        nonRecLineMap.set(label, (nonRecLineMap.get(label) ?? 0) + r.amount_sar);
        break;
      }
      default: break;
    }
  }
  out.totalRevenue = out.recRevenue + out.nonRecRevenue;
  out.recGrossProfit = out.recRevenue + out.recDirect;
  out.recEbitda = out.recGrossProfit + out.recOpex;
  out.reportedEbitda = out.recEbitda + out.nonRecRevenue + out.nonRecDirect + out.nonRecOpex;
  out.nonRecOpexLines = [...nonRecLineMap.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => a.amount - b.amount);
  return out;
};

/** Monthly series on the active basis (charts). */
export interface MonthlyPLPoint { key: string; label: string; agg: PLAgg }
export const monthlySeries = (
  rows: BasisRow[] | undefined,
  basis: Basis,
  w: Win,
  bu?: string,
): MonthlyPLPoint[] => {
  const points: MonthlyPLPoint[] = [];
  let k = w.startKey;
  while (k <= w.endKey) {
    points.push({ key: k, label: monthKeyLabel(k), agg: aggregatePL(rows, basis, { startKey: k, endKey: k }, bu) });
    k = shiftMonthKey(k, 1);
  }
  return points;
};

/** Distinct months present in the fact rows. */
export const factMonths = (rows: BasisRow[] | undefined): string[] =>
  rows ? [...new Set(rows.map((r) => monthKey(r.period_month)))].sort() : [];

/** Latest month whose cost sections are materially posted (close complete). */
export const lastCompleteFromBasis = (rows: BasisRow[] | undefined): string | null => {
  if (!rows) return null;
  const cost = new Map<string, number>();
  for (const r of rows) {
    if (["COGS", "OPEX-GA", "OPEX-MS", "OPEX-People", "D&A", "Project-Costs"].includes(r.section)) {
      const k = monthKey(r.period_month);
      cost.set(k, (cost.get(k) ?? 0) + Math.abs(r.amount_sar));
    }
  }
  let last: string | null = null;
  for (const [k, v] of cost) if (v > 0 && (last === null || k > last)) last = k;
  return last;
};

// ------------------------------------------------------------- credit notes

export interface CreditNoteMonth { key: string; label: string; cnNet: number }

/** Preferred: v_credit_notes_monthly (DB-5); fallback: aggregate CN rows. */
export const creditNotesMonthly = (rows: BasisRow[] | undefined): CreditNoteMonth[] => {
  if (!rows) return [];
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.source !== "credit_note") continue;
    const k = monthKey(r.period_month);
    map.set(k, (map.get(k) ?? 0) + -r.amount_sar);
  }
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, cnNet]) => ({ key, label: monthKeyLabel(key), cnNet }));
};

export const creditNotesInWin = (rows: BasisRow[] | undefined, w: Win): number =>
  creditNotesMonthly(rows).filter((m) => inWin(m.key, w)).reduce((s, m) => s + m.cnNet, 0);

// ------------------------------------------------------------- collections

/** v_collections_monthly (migration 032): customer collections per month =
 * payment allocations to invoices (VAT-inclusive receipts). Denominator of
 * the CN/collections ratio on the credit-note anomaly tile (spec §1.2 P5).
 * Missing view degrades to { available: false } — the tile hides the ratio
 * with a pending note instead of faking a number. */
export interface CollectionsMonthRow { period_month: string; collections_sar: number }

export const useCollectionsMonthly = () =>
  useQuery({
    queryKey: ["v_collections_monthly"],
    queryFn: async (): Promise<{ available: boolean; rows: CollectionsMonthRow[] }> => {
      const res = await fetchAllPages<CollectionsMonthRow>((from, to) =>
        supabase!
          .from("v_collections_monthly")
          .select("period_month,collections_sar")
          .order("period_month", { ascending: true })
          .range(from, to),
      );
      return res === "missing" ? { available: false, rows: [] } : { available: true, rows: res };
    },
    staleTime: 10 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
  });

export const collectionsInWin = (
  rows: CollectionsMonthRow[] | undefined,
  w: Win,
): number | null => {
  if (!rows || rows.length === 0) return null;
  let any = false;
  let sum = 0;
  for (const r of rows) {
    const k = monthKey(r.period_month);
    if (!inWin(k, w)) continue;
    any = true;
    sum += r.collections_sar;
  }
  return any ? sum : null;
};

// -------------------------------------------------------- credit-note audit

export interface CreditNoteAuditRow {
  finding: string;
  cluster_key: string | null;
  cluster_size: number | null;
  qoyod_credit_note_id: number;
  reference: string | null;
  contact_id: number | null;
  issue_date: string;
  status: string;
  total_amount: number;
  remaining_amount: number | null;
  net_of_vat: number;
  is_excess_member: boolean | null;
}

export const useCreditNoteAudit = (enabled: boolean) =>
  useQuery({
    queryKey: ["v_credit_note_audit"],
    queryFn: async (): Promise<CreditNoteAuditRow[]> => {
      const res = await fetchAllPages<CreditNoteAuditRow>((from, to) =>
        supabase!
          .from("v_credit_note_audit")
          .select("*")
          .order("issue_date", { ascending: false })
          .range(from, to),
      );
      return res === "missing" ? [] : res;
    },
    staleTime: 10 * 60 * 1000,
    enabled: enabled && isSupabaseConfigured,
  });

// ------------------------------------------------------------------ budget

/** Non-recurring project lines inside the BUDGET (both vintages): the
 * Leveredge mandate (GA-NRP-*) and F&F non-recurring campaigns (MS-FFC).
 * A MAPPING RULE on moa_code, not a number. */
const isBudgetNonRecLine = (moa: string): boolean => moa.startsWith("GA-NRP") || moa === "MS-FFC";

export interface BudgetAgg {
  revenue: number;
  cogs: number;      // negative
  opexGa: number;    // negative
  opexMs: number;    // negative
  opexPeople: number;// negative
  ebitdaAll: number; // all five sections — ties the deck (−914,040 on preset)
  nonRecLines: number; // negative (GA-NRP-* + MS-FFC slice)
  ebitdaPreNrp: number; // ebitdaAll − nonRecLines (comparable to actual 5-section EBITDA)
  coveredMonths: string[];
  monthsInWindow: number;
  versions: string[];
}

export const budgetMonthsSet = (budgetRows: { period_month: string; section: string }[] | undefined): Set<string> => {
  const s = new Set<string>();
  for (const r of budgetRows ?? []) if (r.section !== "CASHFLOW") s.add(monthKey(r.period_month));
  return s;
};

export const aggregateBudgetWindow = (
  budgetRows: { period_month: string; section: string; moa_code: string; bu_code: string | null; budget_amount_sar: number; version_id: string }[] | undefined,
  w: Win,
  bu?: string,
): BudgetAgg | null => {
  if (!budgetRows || budgetRows.length === 0) return null;
  const out: BudgetAgg = {
    revenue: 0, cogs: 0, opexGa: 0, opexMs: 0, opexPeople: 0, ebitdaAll: 0,
    nonRecLines: 0, ebitdaPreNrp: 0, coveredMonths: [], monthsInWindow: 0,
    versions: [],
  };
  const covered = new Set<string>();
  const versions = new Set<string>();
  for (const r of budgetRows) {
    if (r.section === "CASHFLOW") continue;
    const k = monthKey(r.period_month);
    if (!inWin(k, w)) continue;
    if (bu && r.bu_code !== bu) continue;
    covered.add(k);
    versions.add(r.version_id);
    if (isBudgetNonRecLine(r.moa_code)) out.nonRecLines += r.budget_amount_sar;
    switch (r.section) {
      case "Revenue": out.revenue += r.budget_amount_sar; break;
      case "COGS": out.cogs += r.budget_amount_sar; break;
      case "OPEX-GA": out.opexGa += r.budget_amount_sar; break;
      case "OPEX-MS": out.opexMs += r.budget_amount_sar; break;
      case "OPEX-People": out.opexPeople += r.budget_amount_sar; break;
      default: break;
    }
  }
  if (covered.size === 0) return null;
  out.ebitdaAll = out.revenue + out.cogs + out.opexGa + out.opexMs + out.opexPeople;
  out.ebitdaPreNrp = out.ebitdaAll - out.nonRecLines;
  out.coveredMonths = [...covered].sort();
  // window length
  let k = w.startKey, len = 0;
  while (k <= w.endKey) { len += 1; k = shiftMonthKey(k, 1); }
  out.monthsInWindow = len;
  out.versions = [...versions].sort();
  return out;
};

// -------------------------------------------------- completeness (DB-7 / §1.5)

export interface CompletenessFlag {
  key: string;
  label: string;
  kind: "costs-partial" | "costs-missing" | "lev-unbooked";
  detail: string;
}

/** Warehouse-driven completeness heuristic (spec §1.5): flags months whose
 * cost postings are materially below the trailing norm, months with revenue
 * but zero cost rows, and the Project-Costs (LEV fees) series stopping. NO
 * hardcoded month list — derived from the fetched rows on every load. */
export const deriveCompleteness = (rows: BasisRow[] | undefined): CompletenessFlag[] => {
  if (!rows || rows.length === 0) return [];
  const months = factMonths(rows);
  const costByMonth = new Map<string, number>();
  const revByMonth = new Map<string, number>();
  const tpcByMonth = new Map<string, number>();
  for (const r of rows) {
    const k = monthKey(r.period_month);
    if (r.section === "Revenue" && r.source !== "credit_note") revByMonth.set(k, (revByMonth.get(k) ?? 0) + r.amount_sar);
    if (["COGS", "OPEX-GA", "OPEX-MS", "OPEX-People"].includes(r.section)) costByMonth.set(k, (costByMonth.get(k) ?? 0) + Math.abs(r.amount_sar));
    if (r.section === "Project-Costs") tpcByMonth.set(k, (tpcByMonth.get(k) ?? 0) + Math.abs(r.amount_sar));
  }
  const flags: CompletenessFlag[] = [];
  const lastRevMonth = months.filter((m) => (revByMonth.get(m) ?? 0) > 0).pop();
  // Norm = median monthly cost over the 6 months before each candidate month.
  const costMedianBefore = (k: string): number => {
    const prior = months.filter((m) => m < k).slice(-6).map((m) => costByMonth.get(m) ?? 0).sort((a, b) => a - b);
    return prior.length === 0 ? 0 : prior[Math.floor(prior.length / 2)];
  };
  for (const m of months) {
    const rev = revByMonth.get(m) ?? 0;
    if (rev <= 0) continue;
    const cost = costByMonth.get(m) ?? 0;
    const norm = costMedianBefore(m);
    if (cost === 0 && norm > 0) {
      flags.push({ key: m, label: monthKeyLabel(m), kind: "costs-missing", detail: `${monthKeyLabel(m)}: revenue synced, zero cost rows` });
    } else if (norm > 0 && cost < 0.55 * norm) {
      flags.push({ key: m, label: monthKeyLabel(m), kind: "costs-partial", detail: `${monthKeyLabel(m)}: costs partial (${Math.round((cost / norm) * 100)}% of trailing norm)` });
    }
  }
  // Project-costs (Leveredge fees) series stopping before the revenue horizon.
  const lastTpc = months.filter((m) => (tpcByMonth.get(m) ?? 0) > 0).pop();
  if (lastTpc && lastRevMonth && lastTpc < lastRevMonth) {
    let k = shiftMonthKey(lastTpc, 1);
    const missing: string[] = [];
    while (k <= lastRevMonth) { missing.push(monthKeyLabel(k)); k = shiftMonthKey(k, 1); }
    if (missing.length > 0) {
      flags.push({
        key: shiftMonthKey(lastTpc, 1), label: missing.join(", "), kind: "lev-unbooked",
        detail: `Leveredge/project fees unbooked ${missing.join(", ")} (last posted ${monthKeyLabel(lastTpc)})`,
      });
    }
  }
  return flags;
};

/** DB-7 `v_data_completeness_monthly` — preferred source for the banner. */
export interface CompletenessViewRow {
  period_month: string;
  costs_missing: boolean | null;
  costs_partial: boolean | null;
  lev_fees_missing: boolean | null;
  da_present: boolean | null;
  project_costs_present: boolean | null;
}

export const useCompletenessMonthly = () =>
  useQuery({
    queryKey: ["v_data_completeness_monthly"],
    queryFn: async (): Promise<{ available: boolean; rows: CompletenessViewRow[] }> => {
      const res = await fetchAllPages<CompletenessViewRow>((from, to) =>
        supabase!
          .from("v_data_completeness_monthly")
          .select("period_month,costs_missing,costs_partial,lev_fees_missing,da_present,project_costs_present")
          .order("period_month", { ascending: true })
          .range(from, to),
      );
      return res === "missing" ? { available: false, rows: [] } : { available: true, rows: res };
    },
    staleTime: 5 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) => (query.state.data && !query.state.data.available ? 120_000 : false),
  });

/** Flags from the DB-7 view (contract §1.5). */
export const flagsFromCompletenessView = (rows: CompletenessViewRow[]): CompletenessFlag[] => {
  const flags: CompletenessFlag[] = [];
  const levMonths: string[] = [];
  for (const r of rows) {
    const k = monthKey(r.period_month);
    const label = monthKeyLabel(k);
    if (r.costs_missing) flags.push({ key: k, label, kind: "costs-missing", detail: `${label}: revenue synced, zero cost rows` });
    else if (r.costs_partial) flags.push({ key: k, label, kind: "costs-partial", detail: `${label}: costs partial` });
    if (r.lev_fees_missing) levMonths.push(label);
  }
  if (levMonths.length > 0) {
    flags.push({
      key: levMonths[0], label: levMonths.join(", "), kind: "lev-unbooked",
      detail: `Leveredge/project fees unbooked ${levMonths.join(", ")}`,
    });
  }
  return flags;
};

// ------------------------------------------------ model adjustments (DB-4)

export interface ModelAdjustment {
  period_month: string;
  adj_code: string;
  label: string;
  target_section: string;
  recurrence: "recurring" | "non-recurring" | null;
  amount_sar: number;
  source_ref: string | null;
}
export interface AdjustmentsState { available: boolean; rows: ModelAdjustment[] }

export const useModelAdjustments = () =>
  useQuery({
    queryKey: ["model_adjustments"],
    queryFn: async (): Promise<AdjustmentsState> => {
      const res = await fetchAllPages<ModelAdjustment>((from, to) =>
        supabase!.from("model_adjustments").select("period_month,adj_code,label,target_section,recurrence,amount_sar,source_ref").range(from, to),
      );
      return res === "missing" ? { available: false, rows: [] } : { available: true, rows: res };
    },
    staleTime: 10 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    refetchInterval: (query) => (query.state.data && !query.state.data.available ? 120_000 : false),
  });

/** Adjustment ladder over a window, grouped by adj_code (P3, §1.2).
 * `recurrenceFilter='recurring'` = the steps that carry the AS-BOOKED
 * recurring EBITDA to the model's CLEAN recurring EBITDA (the package
 * ladder); non-recurring memo rows are reported separately. */
export const adjustmentLadder = (
  adj: AdjustmentsState | undefined,
  w: Win,
  recurrenceFilter?: "recurring" | "non-recurring",
): { code: string; label: string; amount: number; sourceRef: string | null }[] => {
  if (!adj || !adj.available) return [];
  const map = new Map<string, { code: string; label: string; amount: number; sourceRef: string | null }>();
  for (const r of adj.rows) {
    const k = monthKey(r.period_month);
    if (!inWin(k, w)) continue;
    if (recurrenceFilter && r.recurrence !== recurrenceFilter) continue;
    const cur = map.get(r.adj_code) ?? { code: r.adj_code, label: r.label, amount: 0, sourceRef: r.source_ref };
    cur.amount += r.amount_sar;
    map.set(r.adj_code, cur);
  }
  return [...map.values()];
};
