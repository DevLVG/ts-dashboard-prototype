// R1 Economic Analysis — pure computation model (no React, no fetches).
//
// Builds the multi-view P&L from the leaf-grain live rows (pnl_management)
// and the live budget (v_budget_monthly):
//   - side-by-side comparisons: Actual always + up to 2 of Budget / PY / PP
//     (ratified by Marcello 2026-07-20 — option 3 of build-plan Open Decision B)
//   - G3 headline block (migration 018, complete P&L incl. manual JEs):
//     Recurring EBITDA (pre Project Costs) -> Project Costs (Leveredge/F&F,
//     TPC actuals ∥ GA-NRP budget lines) -> EBITDA incl. Project Costs
//   - IFRS (Reported) vs Management (Adjusted) reading — FR-1: in Management
//     any GA-NRP actuals inside G&A are isolated as EBITDA Underlying above
//     Non-Recurring above the recurring EBITDA
//   - drill tree: P&L line -> L3 cluster -> L4 leaf (max MoA granularity,
//     ratified drill depth for R1; journal-entry drill is a fast-follow)
//
// Sign convention: SIGNED values everywhere (revenue +, costs -), matching
// pnl_management / v_budget_monthly storage and the natural P&L presentation
// of PnLLiveTable (costs shown as negatives). With signed values a positive
// delta vs comparison is ALWAYS an improvement, so variance colouring uses
// the standard higher-is-better logic on every line.
import {
  type PnlLeafRow,
  type BudgetMonthlyRow,
  monthKey,
  budgetCoversRange,
  UNALLOCATED_BU,
} from "@/data/liveData";
import { moaInfo, isNonRecurring } from "@/data/moaMaster";

export type ComparisonKind = "BUD" | "PY" | "PP";
export type PLViewMode = "reported" | "management";

export const COMPARISON_LABELS: Record<ComparisonKind, string> = {
  BUD: "Budget",
  PY: "Prev Year",
  PP: "Prev Period",
};

/** Comparison value per kind. `null` = honestly absent (e.g. budget outside
 * the loaded Jul-2026..Dec-2027 window, or no budget below EBITDA) — the UI
 * must render "n/a", never zero. */
export type CompValues = Partial<Record<ComparisonKind, number | null>>;

export interface LeafNode {
  moaCode: string;
  name: string;
  actual: number;
  comps: CompValues;
}

export interface ClusterNode {
  code: string;
  name: string;
  actual: number;
  comps: CompValues;
  leaves: LeafNode[];
}

export interface AnalysisLine {
  key: string;
  label: string;
  emphasis?: boolean;
  indent?: boolean;
  actual: number; // signed
  comps: CompValues;
  /** Present on drillable lines (real P&L sections); absent on computed
   * subtotals (GM / EBITDA / EBIT). */
  clusters?: ClusterNode[];
  /** Tooltip explaining an absent budget comparative. */
  budgetNote?: string;
}

// P&L sections in scope (NON-OP / Other are below-EBIT and excluded, matching
// the pnl_by_bu spine). Since migration 018 the views carry the COMPLETE P&L
// (documents + manual JEs): 'Project-Costs' (Leveredge/F&F TPC-* fees, below
// EBITDA per the reconciliation Option A / Margins-deck convention) and
// 'Unmapped' (JE lines pending decision D378, conservatively inside recurring
// EBITDA per the bridge convention).
const SECTION_REVENUE = "Revenue";
const SECTION_COGS = "COGS";
const SECTION_PPL = "OPEX-People";
const SECTION_MS = "OPEX-MS";
const SECTION_GA = "OPEX-GA";
const SECTION_DA = "D&A";
const SECTION_TPC = "Project-Costs";
const SECTION_UNMAPPED = "Unmapped";
export const PL_SECTIONS = [
  SECTION_REVENUE, SECTION_COGS, SECTION_PPL, SECTION_MS, SECTION_GA,
  SECTION_DA, SECTION_TPC, SECTION_UNMAPPED,
] as const;
export type PLSection = (typeof PL_SECTIONS)[number];

export const NO_LEAF_BUDGET_NOTE =
  "Budget is planned at analytical-line grain (30 budget lines), not per MoA account — no per-cluster/leaf budget exists.";
export const NO_EBIT_BUDGET_NOTE =
  "No budget for this line — the approved budget (2026-07-16) stops at EBITDA; no D&A or EBIT budget exists.";
export const NO_WINDOW_BUDGET_NOTE =
  "No budget for this period — the approved budget covers Jul-2026 to Dec-2027.";

// ---------------------------------------------------------------- aggregation

interface LeafAgg { name: string; total: number }
interface ClusterAgg { name: string; total: number; leaves: Map<string, LeafAgg> }
export interface SectionAgg {
  total: number;
  /** Non-recurring (GA-NRP) slice inside this section, signed. */
  nr: number;
  clusters: Map<string, ClusterAgg>;
}

export type SectionAggMap = Map<string, SectionAgg>;

const matchBu = (rowBu: string | null, bu?: string): boolean => {
  if (!bu) return true; // consolidated
  if (bu === UNALLOCATED_BU) return rowBu === null;
  return rowBu === bu;
};

/** Aggregate leaf rows over an inclusive month-key range (optional BU) into
 * section -> cluster -> leaf totals, signed. */
export const aggregateLeafSections = (
  rows: PnlLeafRow[] | undefined,
  startKey: string,
  endKey: string,
  bu?: string,
): SectionAggMap => {
  const out: SectionAggMap = new Map();
  if (!rows) return out;
  for (const r of rows) {
    if (!(PL_SECTIONS as readonly string[]).includes(r.section)) continue;
    const k = monthKey(r.period_month);
    if (k < startKey || k > endKey) continue;
    if (!matchBu(r.bu, bu)) continue;

    let sec = out.get(r.section);
    if (!sec) { sec = { total: 0, nr: 0, clusters: new Map() }; out.set(r.section, sec); }
    sec.total += r.amount_sar;
    if (r.moa_code !== null && isNonRecurring(r.moa_code)) sec.nr += r.amount_sar;

    // 'Unmapped' rows carry NULL moa_code (JE accounts pending D378 mapping)
    const code = r.moa_code ?? "UNMAPPED";
    const info = r.moa_code !== null
      ? moaInfo(r.moa_code)
      : { clusterCode: "UNMAPPED", clusterName: "Unallocated", leafName: "Pending mapping (D378)" };
    const clusterName = r.cluster ?? info.clusterName;
    const leafName = r.leaf ?? info.leafName;
    let cl = sec.clusters.get(info.clusterCode);
    if (!cl) { cl = { name: clusterName, total: 0, leaves: new Map() }; sec.clusters.set(info.clusterCode, cl); }
    cl.total += r.amount_sar;
    let lf = cl.leaves.get(code);
    if (!lf) { lf = { name: leafName, total: 0 }; cl.leaves.set(code, lf); }
    lf.total += r.amount_sar;
  }
  return out;
};

export interface BudgetSectionTotals {
  bySection: Record<string, number>; // signed, P&L sections only (no D&A)
  nr: number; // signed GA-NRP slice (budget codes GA-NRP-HOS / GA-NRP-PD)
}

/** Signed budget totals by section over a range (optional BU). Returns null
 * when the range is not fully inside the loaded budget window — the UI must
 * show "n/a", not zero. */
export const aggregateBudgetSections = (
  rows: BudgetMonthlyRow[] | undefined,
  startKey: string,
  endKey: string,
  bu?: string,
): BudgetSectionTotals | null => {
  if (!rows || rows.length === 0) return null;
  if (!budgetCoversRange(startKey, endKey)) return null;
  const out: BudgetSectionTotals = { bySection: {}, nr: 0 };
  for (const r of rows) {
    const k = monthKey(r.period_month);
    if (k < startKey || k > endKey) continue;
    if (!matchBu(r.bu_code, bu)) continue;
    out.bySection[r.section] = (out.bySection[r.section] ?? 0) + r.budget_amount_sar;
    if (isNonRecurring(r.moa_code)) out.nr += r.budget_amount_sar;
  }
  return out;
};

// ------------------------------------------------------------- line building

export interface AnalysisInput {
  leafRows: PnlLeafRow[] | undefined;
  budgetRows: BudgetMonthlyRow[] | undefined;
  startKey: string;
  endKey: string;
  bu?: string;
  /** Active comparisons, ordered, max 2 (Actual is always shown). */
  comps: ComparisonKind[];
  view: PLViewMode;
  /** Pre-computed comparison ranges (PY = -12m, PP = -length). */
  pyRange: { startKey: string; endKey: string };
  ppRange: { startKey: string; endKey: string };
}

const sectionTotal = (agg: SectionAggMap, section: string): number =>
  agg.get(section)?.total ?? 0;
const sectionNr = (agg: SectionAggMap, section: string): number =>
  agg.get(section)?.nr ?? 0;

interface Derived {
  revenue: number; cogs: number; gm: number;
  ppl: number; ms: number; ga: number;
  nr: number; gaUnderlying: number;
  unmapped: number;
  /** Recurring EBITDA (pre project costs) — the G3 headline. Includes the
   * Unmapped slice (bridge convention, ties to pnl_by_bu.ebitda_reported). */
  ebitda: number;
  ebitdaUnderlying: number;
  /** Leveredge/F&F project fees, signed (negative). */
  projectCosts: number;
  /** EBITDA incl. project costs. */
  ebitdaIncl: number;
  da: number; ebit: number;
}

const deriveFromSections = (agg: SectionAggMap): Derived => {
  const revenue = sectionTotal(agg, SECTION_REVENUE);
  const cogs = sectionTotal(agg, SECTION_COGS);
  const ppl = sectionTotal(agg, SECTION_PPL);
  const ms = sectionTotal(agg, SECTION_MS);
  const ga = sectionTotal(agg, SECTION_GA);
  const nr = sectionNr(agg, SECTION_GA);
  const unmapped = sectionTotal(agg, SECTION_UNMAPPED);
  const projectCosts = sectionTotal(agg, SECTION_TPC);
  const da = sectionTotal(agg, SECTION_DA);
  const gm = revenue + cogs;
  const ebitda = revenue + cogs + ppl + ms + ga + unmapped; // recurring, pre project costs
  const ebitdaIncl = ebitda + projectCosts;
  return {
    revenue, cogs, gm, ppl, ms, ga, nr,
    gaUnderlying: ga - nr,
    unmapped,
    ebitda,
    ebitdaUnderlying: ebitda - nr,
    projectCosts,
    ebitdaIncl,
    da,
    ebit: ebitdaIncl + da,
  };
};

const deriveFromBudget = (b: BudgetSectionTotals | null): Partial<Derived> | null => {
  if (b === null) return null;
  const revenue = b.bySection[SECTION_REVENUE] ?? 0;
  const cogs = b.bySection[SECTION_COGS] ?? 0;
  const ppl = b.bySection[SECTION_PPL] ?? 0;
  const ms = b.bySection[SECTION_MS] ?? 0;
  // The budget plans the Leveredge/F&F fees as GA-NRP-* lines inside OPEX-GA;
  // actuals record the same fees as 'Project-Costs' (TPC-*) below EBITDA
  // (migration 018). Map budget GA-NRP onto the Project-Costs line so budget
  // vs actual is like-for-like on G&A, recurring EBITDA and EBITDA incl. PC.
  const ga = (b.bySection[SECTION_GA] ?? 0) - b.nr;
  const projectCosts = b.nr;
  const ebitda = revenue + cogs + ppl + ms + ga; // recurring (GA-NRP re-mapped)
  return {
    revenue, cogs, gm: revenue + cogs, ppl, ms, ga,
    nr: 0, // nothing non-recurring left inside budget G&A after the re-map
    gaUnderlying: ga,
    unmapped: 0,
    ebitda,
    ebitdaUnderlying: ebitda,
    projectCosts,
    ebitdaIncl: ebitda + projectCosts,
    // no D&A / EBIT budget — the approved budget stops at EBITDA
  };
};

/** Build the drill tree for one section, merging keys across Actual and the
 * active PY/PP aggregations (so items present only in a comparison period
 * still surface, with Actual 0). Budget at cluster/leaf grain is always null
 * (budget is planned at analytical-line grain). */
const buildSectionClusters = (
  section: string,
  actualAgg: SectionAggMap,
  compAggs: Partial<Record<ComparisonKind, SectionAggMap>>,
  comps: ComparisonKind[],
  filter?: (moaCode: string) => boolean,
): ClusterNode[] => {
  const clusterKeys = new Set<string>();
  const sources: { kind: "ACT" | ComparisonKind; agg: SectionAggMap }[] = [
    { kind: "ACT", agg: actualAgg },
    ...comps
      .filter((c) => c !== "BUD" && compAggs[c])
      .map((c) => ({ kind: c, agg: compAggs[c]! })),
  ];
  for (const s of sources) {
    for (const code of s.agg.get(section)?.clusters.keys() ?? []) clusterKeys.add(code);
  }

  const nodes: ClusterNode[] = [];
  for (const code of clusterKeys) {
    const leafKeys = new Set<string>();
    let name = code;
    for (const s of sources) {
      const cl = s.agg.get(section)?.clusters.get(code);
      if (cl) {
        name = cl.name;
        for (const mc of cl.leaves.keys()) leafKeys.add(mc);
      }
    }
    const keptLeaves = [...leafKeys].filter((mc) => (filter ? filter(mc) : true));
    if (keptLeaves.length === 0) continue;

    const leaves: LeafNode[] = keptLeaves.map((mc) => {
      const actual = actualAgg.get(section)?.clusters.get(code)?.leaves.get(mc)?.total ?? 0;
      const compVals: CompValues = {};
      for (const c of comps) {
        compVals[c] = c === "BUD"
          ? null
          : compAggs[c]?.get(section)?.clusters.get(code)?.leaves.get(mc)?.total ?? 0;
      }
      const leafName =
        actualAgg.get(section)?.clusters.get(code)?.leaves.get(mc)?.name ??
        moaInfo(mc).leafName;
      return { moaCode: mc, name: leafName, actual, comps: compVals };
    });
    leaves.sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual));

    const sum = (vals: (number | null | undefined)[]): number =>
      vals.reduce<number>((acc, v) => acc + (v ?? 0), 0);
    const actual = sum(leaves.map((l) => l.actual));
    const compVals: CompValues = {};
    for (const c of comps) {
      compVals[c] = c === "BUD" ? null : sum(leaves.map((l) => l.comps[c]));
    }
    nodes.push({ code, name, actual, comps: compVals, leaves });
  }
  nodes.sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual));
  return nodes;
};

/** The full analysis line set for the selected view, side-by-side ready. */
export const buildAnalysisLines = (input: AnalysisInput): AnalysisLine[] => {
  const { leafRows, budgetRows, startKey, endKey, bu, comps, view, pyRange, ppRange } = input;

  const actualAgg = aggregateLeafSections(leafRows, startKey, endKey, bu);
  const compAggs: Partial<Record<ComparisonKind, SectionAggMap>> = {};
  if (comps.includes("PY")) compAggs.PY = aggregateLeafSections(leafRows, pyRange.startKey, pyRange.endKey, bu);
  if (comps.includes("PP")) compAggs.PP = aggregateLeafSections(leafRows, ppRange.startKey, ppRange.endKey, bu);

  const act = deriveFromSections(actualAgg);
  const der: Partial<Record<ComparisonKind, Partial<Derived> | null>> = {};
  if (compAggs.PY) der.PY = deriveFromSections(compAggs.PY);
  if (compAggs.PP) der.PP = deriveFromSections(compAggs.PP);
  if (comps.includes("BUD")) {
    der.BUD = deriveFromBudget(aggregateBudgetSections(budgetRows, startKey, endKey, bu));
  }

  const compsFor = (field: keyof Derived, budgetable = true): CompValues => {
    const out: CompValues = {};
    for (const c of comps) {
      const d = der[c];
      if (d === null || d === undefined) { out[c] = c === "BUD" ? null : 0; continue; }
      const v = d[field];
      out[c] = v === undefined || (c === "BUD" && !budgetable) ? null : v;
    }
    return out;
  };

  const clustersFor = (section: string, filter?: (mc: string) => boolean): ClusterNode[] =>
    buildSectionClusters(section, actualAgg, compAggs, comps, filter);

  const budgetIsNull = comps.includes("BUD") && (der.BUD === null || der.BUD === undefined);
  const windowNote = budgetIsNull ? NO_WINDOW_BUDGET_NOTE : undefined;

  const lines: AnalysisLine[] = [];
  lines.push({
    key: "revenue", label: "Revenue", emphasis: true,
    actual: act.revenue, comps: compsFor("revenue"),
    clusters: clustersFor(SECTION_REVENUE), budgetNote: windowNote,
  });
  lines.push({
    key: "cogs", label: "COGS",
    actual: act.cogs, comps: compsFor("cogs"),
    clusters: clustersFor(SECTION_COGS), budgetNote: windowNote,
  });
  lines.push({
    key: "gm", label: "Gross Margin", emphasis: true,
    actual: act.gm, comps: compsFor("gm"), budgetNote: windowNote,
  });
  lines.push({
    key: "opexPeople", label: "OpEx — People", indent: true,
    actual: act.ppl, comps: compsFor("ppl"),
    clusters: clustersFor(SECTION_PPL), budgetNote: windowNote,
  });
  lines.push({
    key: "opexMs", label: "OpEx — Marketing & Sales", indent: true,
    actual: act.ms, comps: compsFor("ms"),
    clusters: clustersFor(SECTION_MS), budgetNote: windowNote,
  });

  if (view === "management") {
    // FR-1 Management (Adjusted): G&A excluding non-recurring, then
    // EBITDA Underlying above Non-Recurring above the recurring EBITDA.
    // (GA-NRP actuals are currently zero — the fees the budget plans as
    // GA-NRP live on the Project-Costs line; this block populates if bills
    // get tagged on the GA-NRP01 leaf.)
    lines.push({
      key: "opexGaU", label: "OpEx — G&A (underlying)", indent: true,
      actual: act.gaUnderlying, comps: compsFor("gaUnderlying"),
      clusters: clustersFor(SECTION_GA, (mc) => !isNonRecurring(mc)),
      budgetNote: windowNote,
    });
  } else {
    lines.push({
      key: "opexGa", label: "OpEx — G&A", indent: true,
      actual: act.ga, comps: compsFor("ga"),
      clusters: clustersFor(SECTION_GA), budgetNote: windowNote,
    });
  }

  // Unallocated lines (pending D378) — inside recurring EBITDA (bridge
  // convention). Covers journal entries and, since migration 079, invoice /
  // bill / simple-bill / credit-note items too. Shown only when something is
  // there, so the line disappears by itself once the residual accounts are mapped.
  const unmappedVisible =
    act.unmapped !== 0 ||
    comps.some((c) => {
      const d = der[c];
      return d !== null && d !== undefined && (d.unmapped ?? 0) !== 0;
    });
  if (unmappedVisible) {
    lines.push({
      key: "unmapped", label: "Unallocated (pending mapping)", indent: true,
      actual: act.unmapped, comps: compsFor("unmapped", false),
      clusters: clustersFor(SECTION_UNMAPPED),
      budgetNote: "No budget exists for unmapped journal lines — they empty out once decision D378 maps the residual accounts.",
    });
  }

  if (view === "management") {
    lines.push({
      key: "ebitdaU", label: "EBITDA Underlying", emphasis: true,
      actual: act.ebitdaUnderlying, comps: compsFor("ebitdaUnderlying"),
      budgetNote: windowNote,
    });
    lines.push({
      key: "nonRecurring", label: "Non-Recurring (GA-NRP)", indent: true,
      actual: act.nr, comps: compsFor("nr"),
      clusters: clustersFor(SECTION_GA, (mc) => isNonRecurring(mc)),
      budgetNote: windowNote,
    });
  }

  // G3 headline block: Recurring EBITDA -> Project Costs -> EBITDA incl. PC
  lines.push({
    key: "ebitda", label: "Recurring EBITDA (pre Project Costs)", emphasis: true,
    actual: act.ebitda, comps: compsFor("ebitda"), budgetNote: windowNote,
  });
  lines.push({
    key: "projectCosts", label: "Project Costs (Leveredge / F&F)", indent: true,
    actual: act.projectCosts, comps: compsFor("projectCosts"),
    clusters: clustersFor(SECTION_TPC),
    budgetNote: windowNote,
  });
  lines.push({
    key: "ebitdaIncl", label: "EBITDA incl. Project Costs", emphasis: true,
    actual: act.ebitdaIncl, comps: compsFor("ebitdaIncl"), budgetNote: windowNote,
  });

  lines.push({
    key: "da", label: "D&A",
    actual: act.da, comps: compsFor("da", false),
    clusters: clustersFor(SECTION_DA), budgetNote: NO_EBIT_BUDGET_NOTE,
  });
  lines.push({
    key: "ebit", label: "EBIT", emphasis: true,
    actual: act.ebit, comps: compsFor("ebit", false), budgetNote: NO_EBIT_BUDGET_NOTE,
  });

  return lines;
};

// --------------------------------------------------------------- formatting

/** SAR figure, no decimals; zero renders as "—" (absent, matching PnLLiveTable). */
export const fmtSar = (v: number): string =>
  v === 0 ? "—" : new Intl.NumberFormat("en-SA", { maximumFractionDigits: 0 }).format(v);

/** Signed delta, no decimals. */
export const fmtDelta = (v: number): string =>
  new Intl.NumberFormat("en-SA", { maximumFractionDigits: 0, signDisplay: "always" }).format(v);

/** Variance % of a SIGNED delta vs a SIGNED comparison (null when the
 * comparison is 0 — a percentage against nothing is meaningless). */
export const variancePct = (actual: number, comp: number): number | null =>
  comp === 0 ? null : ((actual - comp) / Math.abs(comp)) * 100;
