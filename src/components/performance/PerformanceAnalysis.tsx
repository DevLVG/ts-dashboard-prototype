// ECONOMICS — Marcello's live-review rebuild, 2026-08-03.
//
// This screen replaces the old Performance Analysis bundle (recurring
// tiles, basis & window bridge, credit-note anomaly, budget-story panel,
// multi-year series, fiscal quarters — "va via, non ci serve niente") AND
// absorbs P&L Overview + the Drill screen (fix-1 is removing both from
// nav; this page's explodable table covers Drill's job).
//
// Final page layout, top to bottom (nothing else):
//   global controls (period selector · Comparison · Scope — all owned by
//   the shared chrome layer, consumed here, never rebuilt)
//   -> KPI circles + comparison histogram (squad fix-4-kpi's mount point —
//      wired in once their components land; see the marked spot below)
//   -> ONE interactive, expandable P&L table (built here)
//
// The table:
//   - Macro rows, statutory order: Gross revenue -> COGS -> Gross margin ->
//     OpEx (its 3 sections) -> Total OpEx -> EBITDA -> Project costs ->
//     EBITDA (reported) -> D&A -> EBIT -> Non-operating -> Net income.
//   - Every SECTION-backed macro row expands (click) into its MoA FAMILY
//     (L2 BU: Livery, Horse School, Membership, Events, B2B, Competitions,
//     Retail, Corporate — `data/moaTree.ts`), each family into its MoA
//     clusters (L3), each cluster into its individual MoA leaves (L4,
//     moa_code). Subtotal rows (Gross margin, Total OpEx, EBITDA, EBITDA
//     reported, EBIT, Net income) are derived, not expandable.
//
//     FIX-18 (2026-08-03, Marcello P0 — "non c'è Livery, è tutto a caso"):
//     the table used to skip straight from section to L3 cluster via
//     `data/moaMaster.ts`'s `moaInfo()`, a dictionary with no family field at
//     all — every cluster from every BU rendered as one flat, unsorted
//     sibling list. It also keyed clusters by `clusterCode` alone, which
//     collides across families that happen to share an L3 code (e.g.
//     DA-LIA exists under B2B, CORP AND LIV) — a second, silent
//     mis-grouping bug. `buildTree` below now walks the canonical MoA
//     hierarchy from `data/moaTree.ts` (a mechanical dump of `moa_gestionale`,
//     is_active leaves only) as a FIXED skeleton — Section -> Family (bu) ->
//     Cluster (l3) -> Leaf (l4, keyed by (bu, clusterCode) then moaCode) —
//     built the same way regardless of what data exists, so actual/prior
//     trees always share an identical shape (no runtime union needed, no
//     disappearing branches, ties to the cent at every level by
//     construction) and every leaf always renders, per Marcello's mandate
//     ("voglio vedere ogni riga e sottoriga di foglia") — no >0.5 filter.
//   - Comparison column follows the GLOBAL Comparison toggle (PY | Budget),
//     one at a time. Granularity rule (Marcello's explicit caveat):
//       vs Previous Year  -> full leaf granularity everywhere.
//       vs Budget         -> capped at budget_2026's own granularity (macro
//                            sections only — the budget vocabulary doesn't
//                            share a code scheme with the actual MoA tree,
//                            so mapping budget lines onto actual leaves
//                            would be invented, not real). Expansion is
//                            disabled in Budget mode; a note says why.
//   - MTD pro-ration: Month-to-date compares a partial month's actual
//     against a FULL prior-year month / FULL budget month, which
//     overstates both — same elapsed-day pro-ration rule fix-4's KPI
//     header uses (`computeMtdProration` + `prorateAgg`/`prorateBudget`),
//     applied uniformly down to every family/cluster/leaf so a child row's
//     comparison always sums back to its parent's.
//   - Window = the global period selector (month/quarter/MTD/YTD/TTM).
//
// FIX-24 (2026-08-04, Marcello P0 live review — tree hygiene + MoA leaf
// verification):
//   - Single-child collapse (global rule): a family/cluster level only earns
//     its own clickable row when it splits into 2+ children. A lone child —
//     same name (Private Events family -> its only cluster, also "Private
//     Events") or different (Corporate -> its ten G&A clusters; Trio Project
//     Costs' two leaves) — is equally uninformative as an extra click, so its
//     row is skipped and its own children are promoted straight into its
//     slot, chained through as many singleton hops as exist. Concrete effect:
//     Private Events collapses straight to its 3 leaves; G&A/Marketing &
//     Sales/People collapse away their sole "Corporate" family (those 3
//     sections are 100% CORP by MoA design — the family split is structurally
//     never anything else); Project costs collapses BOTH "Corporate" and
//     "Trio Project Costs" in one hop, landing on its 2 leaves; every D&A
//     family whose only cluster has only one leaf (B2B, Retail) collapses
//     straight to that leaf; every cluster of exactly one leaf anywhere
//     collapses to the leaf's own name (Bank Costs -> Bank Charges,
//     Furniture & Fixtures, EOS Provision -> End of Service, Non-Recurring
//     Professional Fees -> Project Professional Fees, etc). See
//     `clusterSlots`/`familySlots`/`sectionFamilySlots` below. Leaves
//     (terminal moa_code rows) never carry an onToggle, promoted or not — no
//     row can ever expand into a copy of itself.
//   - Gross margin now explodes into a per-revenue-family margin line
//     (family revenue + family COGS, COGS already negative — same sign
//     convention as the macro row) alongside the existing Cost of goods sold
//     family breakdown, tying to the macro Gross margin total by
//     construction (same underlying family totals, just regrouped).
//   - Below EBIT, the single opaque "Non-operating items" row is replaced by
//     the master's own NON-OP breakdown as explicit, always-visible
//     statutory lines — Financial charges (NO-FIN01, Bank Interest), Gains &
//     disposals (NO-GAI01), Zakat (NO-ZKT01) — then Net income. No account is
//     invented: the master has no financial-INCOME leaf today, only the
//     financial-charge (interest) leaf, so only that side renders — verified
//     against moa_gestionale 2026-08-04 (see fix-24 deliverable report).
//   - The shared "Figures net of customer credit notes" line was retired at
//     the chrome level by fix-25 (StrictBasisNote -> no-op); this page also
//     drops its own `CompletenessBanner` render — Marcello, live review:
//     "togli tutto" — keeping only the small `OpenMonthsBadge`.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, ChevronDown, Info } from "lucide-react";
import { useAlignment } from "@/contexts/AlignmentContext";
import { WindowPicker, ComparisonToggle, ScopeToggle, OpenMonthsBadge } from "@/components/chrome/AlignmentChrome";
import { KpiCircles } from "@/components/overview/KpiCircles";
import { ComparisonHistogram } from "@/components/overview/ComparisonHistogram";
import {
  useBasisRows, useRecurrence, resolveRecurrence, aggregateBudgetWindow,
  computeMtdProration, prorateBudget, factMonths,
  type BasisRow, type Win, type RecurrenceState, type BudgetAgg,
} from "@/data/alignment";
import { useBudgetMonthly, monthKeyLabel } from "@/data/liveData";
import { MOA_PL_LEAVES, buFamilyName } from "@/data/moaTree";
import { fmtDeltaSAR, fmtDeltaPct, fmtOrDash, comparePct } from "@/lib/format";

// ---------------------------------------------------------------- helpers

/** Budget non-recurring project lines (GA-NRP* / MS-FFC) — restated locally
 * (not exported from the data layer) so the "Only Recurring" scope's Budget
 * comparison stays consistent with the KPI header above this table, which
 * restates the same rule for the same reason. */
const isBudgetNonRecLine = (moa: string): boolean => moa.startsWith("GA-NRP") || moa === "MS-FFC";

const monthKey = (date: string): string => date.slice(0, 7);
const inWin = (k: string, w: Win): boolean => k >= w.startKey && k <= w.endKey;

/** Distinct months, within a window, with at least one warehouse fact row
 * (any section) — zero means the window is entirely unfed (e.g. a future
 * calendar quarter picked from the always-visible Q1-Q4 list, before it's
 * fed). "Absent ≠ zero" (the same rule Cash Flow's `useCashFlowPageData`
 * already applies): every macro/subtotal row for such a window must render
 * "—", never a fabricated 0 with a meaningless +/-100% delta. Added
 * 2026-08-03 (Marcello, live review) — kept local here rather than added to
 * `aggregatePL`/`data/alignment.ts`, which fix-10-selector owns this round. */
const monthsCoveredInWin = (rows: BasisRow[] | undefined, w: Win): number => {
  if (!rows) return 0;
  const covered = new Set<string>();
  for (const r of rows) {
    const k = monthKey(r.period_month);
    if (inWin(k, w)) covered.add(k);
  }
  return covered.size;
};

const PL_SECTIONS = ["Revenue", "COGS", "OPEX-GA", "OPEX-MS", "OPEX-People", "Project-Costs", "D&A", "NON-OP"] as const;
type PLSection = (typeof PL_SECTIONS)[number];

interface LeafNode { moaCode: string; leafName: string; total: number }
interface ClusterNode { clusterCode: string; clusterName: string; total: number; leaves: LeafNode[] }
interface FamilyNode { bu: string; buName: string; total: number; clusters: ClusterNode[] }
// `hasData`: true only when >=1 warehouse row actually landed in this
// section for the window (2026-08-04, owner-audit #3/#4 — "absent ≠ zero").
// A section with zero matching rows must render "—", never a fabricated 0
// with a meaningless delta — same rule Cash Flow already applies.
interface SectionTree { total: number; hasData: boolean; families: FamilyNode[] }

/** Builds the section -> family (BU) -> cluster -> leaf tree for one
 * window/scope. The skeleton (every family/cluster/leaf `data/moaTree.ts`
 * defines for this section) is built FIRST, unconditionally — so a window
 * with zero matching rows still returns the full canonical shape, just with
 * every total at 0. Every macro row's value is later DERIVED as the sum
 * over this same tree — the displayed total and its expansion can never
 * silently disagree, at any level, in any window. */
const buildTree = (
  rows: BasisRow[] | undefined,
  w: Win,
  scope: "ALL" | "RECURRING",
  rec: RecurrenceState | undefined,
): Map<PLSection, SectionTree> => {
  const tree = new Map<PLSection, SectionTree>();
  const leafByCode = new Map<string, LeafNode>();
  const familyByKey = new Map<string, FamilyNode>();
  const clusterByKey = new Map<string, ClusterNode>();
  for (const s of PL_SECTIONS) tree.set(s, { total: 0, hasData: false, families: [] });
  for (const def of MOA_PL_LEAVES) {
    const section = tree.get(def.plSection as PLSection);
    if (!section) continue; // defensive: moaTree.ts only ever emits the 8 PL sections above
    const famKey = `${def.plSection}::${def.bu}`;
    let fam = familyByKey.get(famKey);
    if (!fam) {
      fam = { bu: def.bu, buName: buFamilyName(def.bu), total: 0, clusters: [] };
      familyByKey.set(famKey, fam);
      section.families.push(fam);
    }
    const cluKey = `${famKey}::${def.clusterCode}`;
    let clu = clusterByKey.get(cluKey);
    if (!clu) {
      clu = { clusterCode: def.clusterCode, clusterName: def.clusterName, total: 0, leaves: [] };
      clusterByKey.set(cluKey, clu);
      fam.clusters.push(clu);
    }
    const leaf: LeafNode = { moaCode: def.moaCode, leafName: def.leafName, total: 0 };
    clu.leaves.push(leaf);
    leafByCode.set(def.moaCode, leaf);
  }
  if (rows) {
    for (const r of rows) {
      if (!PL_SECTIONS.includes(r.section as PLSection)) continue;
      const k = monthKey(r.period_month);
      if (!inWin(k, w)) continue;
      if (scope === "RECURRING" && resolveRecurrence(r, rec) === "non-recurring") continue;
      const leaf = r.moa_code ? leafByCode.get(r.moa_code) : undefined;
      // Verified 2026-08-03: every moa_code on a row tagged to one of the 8
      // PL_SECTIONS is an active moa_gestionale leaf and therefore present
      // above — this lookup never misses in practice. If a future MoA edit
      // ever produced an orphan code, it would fall through here exactly as
      // it silently did in the pre-fix build (no regression), not corrupt a
      // total — leaf/cluster/family/section sums stay internally consistent
      // either way because every total is DERIVED from the leaves below it.
      if (leaf) {
        leaf.total += r.amount_sar;
        tree.get(r.section as PLSection)!.hasData = true;
      }
    }
  }
  for (const section of tree.values()) {
    for (const fam of section.families) {
      for (const clu of fam.clusters) clu.total = clu.leaves.reduce((s, l) => s + l.total, 0);
      fam.total = fam.clusters.reduce((s, c) => s + c.total, 0);
    }
    section.total = section.families.reduce((s, f) => s + f.total, 0);
  }
  return tree;
};

/** Scales every number in a tree by a fixed fraction (MTD pro-ration) —
 * applied uniformly top to bottom so parent = sum(children) always holds. */
const scaleTree = (tree: Map<PLSection, SectionTree>, fraction: number): Map<PLSection, SectionTree> => {
  const out = new Map<PLSection, SectionTree>();
  for (const [section, node] of tree) {
    const families = node.families.map((fam) => ({
      ...fam,
      total: fam.total * fraction,
      clusters: fam.clusters.map((c) => ({
        ...c,
        total: c.total * fraction,
        leaves: c.leaves.map((l) => ({ ...l, total: l.total * fraction })),
      })),
    }));
    out.set(section, { total: node.total * fraction, hasData: node.hasData, families });
  }
  return out;
};

const sectionTotal = (tree: Map<PLSection, SectionTree>, s: PLSection): number => tree.get(s)?.total ?? 0;
const sectionHasData = (tree: Map<PLSection, SectionTree>, s: PLSection): boolean => tree.get(s)?.hasData ?? false;

/** Finds one specific leaf (by moa_code) anywhere in a section — used for
 * the below-EBIT statutory lines (fix-24), which each pin to exactly one
 * NON-OP account rather than an aggregate. */
const findLeafInTree = (tree: Map<PLSection, SectionTree>, section: PLSection, moaCode: string): LeafNode | undefined => {
  for (const fam of tree.get(section)?.families ?? []) {
    for (const clu of fam.clusters) {
      const leaf = clu.leaves.find((l) => l.moaCode === moaCode);
      if (leaf) return leaf;
    }
  }
  return undefined;
};
const findLeafInFamilies = (families: FamilyNode[], moaCode: string): LeafNode | undefined => {
  for (const f of families) for (const c of f.clusters) {
    const leaf = c.leaves.find((l) => l.moaCode === moaCode);
    if (leaf) return leaf;
  }
  return undefined;
};
const findClusterInFamilies = (families: FamilyNode[], bu: string, clusterCode: string): ClusterNode | undefined =>
  families.find((f) => f.bu === bu)?.clusters.find((c) => c.clusterCode === clusterCode);
const findFamilyByBu = (families: FamilyNode[], bu: string): FamilyNode | undefined => families.find((f) => f.bu === bu);

// --------------------------------------------- single-child collapse (fix-24)
//
// "A level renders only if it splits into 2+ children" (Marcello, live
// review). A container (family or cluster) with exactly one child is
// equally uninformative as an extra click whether the child's name matches
// its own or not, so its row is skipped entirely and the child's own
// children are promoted to render directly in its slot — chained through as
// many singleton hops as exist (Project costs: 1 family -> 1 cluster both
// collapse in one hop, landing on its 2 leaves).

type NodeSlot =
  | { kind: "family"; family: FamilyNode }
  | { kind: "cluster"; cluster: ClusterNode }
  | { kind: "leaf"; leaf: LeafNode };

/** A cluster of exactly one leaf conveys nothing the leaf itself doesn't —
 * skip the cluster row, promote the leaf into the cluster's slot. */
const clusterSlots = (clusters: ClusterNode[]): NodeSlot[] =>
  clusters.map((c) => (c.leaves.length === 1 ? { kind: "leaf", leaf: c.leaves[0] } : { kind: "cluster", cluster: c }));

/** A family of exactly one cluster: skip the cluster row too, promoting
 * straight to that cluster's own leaves (itself further collapsed if there's
 * only one — the B2B/Retail D&A "family with one leaf" case). */
const familySlots = (family: FamilyNode): NodeSlot[] =>
  family.clusters.length === 1
    ? family.clusters[0].leaves.map((l) => ({ kind: "leaf" as const, leaf: l }))
    : clusterSlots(family.clusters);

/** A section of exactly one family (every OPEX-GA/OPEX-MS/OPEX-People/
 * Project-Costs/NON-OP leaf is bu="CORP" by MoA design, structurally, not
 * just today) skips the redundant "Corporate" family row too. */
const sectionFamilySlots = (families: FamilyNode[]): NodeSlot[] =>
  families.length === 1 ? familySlots(families[0]) : families.map((f) => ({ kind: "family" as const, family: f }));

/** The 6 derived subtotals, computed FROM the tree's section totals — never
 * from a separate aggregation path, so the table can't disagree with itself.
 * Each also carries a `hasX` coverage flag (2026-08-04, owner-audit #3/#4):
 * a subtotal is only a real, comparable number when EVERY section it
 * depends on has at least one posted row — a window with revenue live but
 * costs unbooked must never let those unbooked 0s sum into a positive
 * EBITDA. */
interface Subtotals {
  grossMargin: number; opexTotal: number; ebitda5: number; ebitdaReported: number; ebit: number; netResult: number;
  hasGrossMargin: boolean; hasOpexTotal: boolean; hasEbitda5: boolean; hasEbitdaReported: boolean; hasEbit: boolean; hasNetResult: boolean;
}
const deriveSubtotals = (tree: Map<PLSection, SectionTree>): Subtotals => {
  const revenue = sectionTotal(tree, "Revenue");
  const cogs = sectionTotal(tree, "COGS");
  const grossMargin = revenue + cogs;
  const opexTotal = sectionTotal(tree, "OPEX-GA") + sectionTotal(tree, "OPEX-MS") + sectionTotal(tree, "OPEX-People");
  const ebitda5 = grossMargin + opexTotal;
  const projectCosts = sectionTotal(tree, "Project-Costs");
  const ebitdaReported = ebitda5 + projectCosts;
  const da = sectionTotal(tree, "D&A");
  const ebit = ebitdaReported + da;
  const nonOp = sectionTotal(tree, "NON-OP");
  const netResult = ebit + nonOp;

  const hasGrossMargin = sectionHasData(tree, "Revenue") && sectionHasData(tree, "COGS");
  const hasOpexTotal = sectionHasData(tree, "OPEX-GA") && sectionHasData(tree, "OPEX-MS") && sectionHasData(tree, "OPEX-People");
  const hasEbitda5 = hasGrossMargin && hasOpexTotal;
  const hasEbitdaReported = hasEbitda5 && sectionHasData(tree, "Project-Costs");
  const hasEbit = hasEbitdaReported && sectionHasData(tree, "D&A");
  const hasNetResult = hasEbit && sectionHasData(tree, "NON-OP");

  return { grossMargin, opexTotal, ebitda5, ebitdaReported, ebit, netResult, hasGrossMargin, hasOpexTotal, hasEbitda5, hasEbitdaReported, hasEbit, hasNetResult };
};

/** Budget value for a macro row key — null where budget_2026 structurally
 * doesn't reach (Project costs / D&A / EBIT / Non-op / Net income: the
 * budget has no lines there at all, never a fabricated figure). */
const budgetValueFor = (key: string, b: BudgetAgg | null): number | null => {
  if (!b) return null;
  switch (key) {
    case "Revenue": return b.revenue;
    case "COGS": return b.cogs;
    case "GrossMargin": return b.revenue + b.cogs;
    case "OPEX-GA": return b.opexGa;
    case "OPEX-MS": return b.opexMs;
    case "OPEX-People": return b.opexPeople;
    case "OpexTotal": return b.opexGa + b.opexMs + b.opexPeople;
    case "EBITDA5": return b.ebitdaAll;
    default: return null; // Project costs, EBITDA reported, D&A, EBIT, Non-op, Net income
  }
};

interface MacroRowDef {
  key: string;
  label: string;
  section?: PLSection;
  subtotal?: boolean;
  emphasis?: boolean;
}

const MACRO_ROWS: MacroRowDef[] = [
  { key: "Revenue", label: "Gross revenue", section: "Revenue" },
  { key: "COGS", label: "Cost of goods sold", section: "COGS" },
  { key: "GrossMargin", label: "Gross margin", subtotal: true },
  { key: "OPEX-GA", label: "General & administrative", section: "OPEX-GA" },
  { key: "OPEX-MS", label: "Marketing & sales", section: "OPEX-MS" },
  { key: "OPEX-People", label: "People", section: "OPEX-People" },
  { key: "OpexTotal", label: "Total operating expenses", subtotal: true },
  { key: "EBITDA5", label: "EBITDA", subtotal: true, emphasis: true },
  { key: "Project-Costs", label: "Project costs", section: "Project-Costs" },
  { key: "EBITDAReported", label: "EBITDA (reported)", subtotal: true },
  { key: "D&A", label: "Depreciation & amortization", section: "D&A" },
  { key: "EBIT", label: "EBIT", subtotal: true },
  // Below-EBIT statutory lines (fix-24, 2026-08-04): the master's own NON-OP
  // breakdown, each pinned to one moa_gestionale leaf, always shown even at
  // zero — no "Non-operating items" catch-all row anymore. The master has no
  // financial-INCOME leaf today (only the financial-charge/interest one), so
  // only that side is shown — never invented. See MACRO_LEAF_CODE below.
  { key: "NonOpFin", label: "Financial charges" },
  { key: "NonOpGains", label: "Gains & disposals" },
  { key: "Zakat", label: "Zakat" },
  { key: "NetResult", label: "Net income", subtotal: true, emphasis: true },
];

/** moa_code each below-EBIT statutory row pins to — shown as the row's small
 * secondary tag, same convention as every other leaf on this table. */
const MACRO_LEAF_CODE: Record<string, string> = {
  NonOpFin: "NO-FIN01",
  NonOpGains: "NO-GAI01",
  Zakat: "NO-ZKT01",
};

const macroValue = (key: string, tree: Map<PLSection, SectionTree>, sub: Subtotals): number => {
  switch (key) {
    case "GrossMargin": return sub.grossMargin;
    case "OpexTotal": return sub.opexTotal;
    case "EBITDA5": return sub.ebitda5;
    case "EBITDAReported": return sub.ebitdaReported;
    case "EBIT": return sub.ebit;
    case "NetResult": return sub.netResult;
    case "NonOpFin": return findLeafInTree(tree, "NON-OP", MACRO_LEAF_CODE.NonOpFin)?.total ?? 0;
    case "NonOpGains": return findLeafInTree(tree, "NON-OP", MACRO_LEAF_CODE.NonOpGains)?.total ?? 0;
    case "Zakat": return findLeafInTree(tree, "NON-OP", MACRO_LEAF_CODE.Zakat)?.total ?? 0;
    default: return sectionTotal(tree, key as PLSection);
  }
};

/** Whether a macro row's value is backed by at least one posted warehouse
 * row (2026-08-04, owner-audit #3/#4) — false means "not yet booked", so the
 * row must render "—", not the fabricated 0 `macroValue` would otherwise
 * return for an un-posted section. */
const macroHasData = (key: string, tree: Map<PLSection, SectionTree>, sub: Subtotals): boolean => {
  switch (key) {
    case "GrossMargin": return sub.hasGrossMargin;
    case "OpexTotal": return sub.hasOpexTotal;
    case "EBITDA5": return sub.hasEbitda5;
    case "EBITDAReported": return sub.hasEbitdaReported;
    case "EBIT": return sub.hasEbit;
    case "NetResult": return sub.hasNetResult;
    case "NonOpFin": case "NonOpGains": case "Zakat": return sectionHasData(tree, "NON-OP");
    default: return sectionHasData(tree, key as PLSection);
  }
};

// ------------------------------------------------------------- component

export const PerformanceAnalysis = () => {
  const { win, py, preset, todayKey, windowName, comparisonMode, scope, includesOpenMonths } = useAlignment();
  const { data: basisData, isLoading, error: basisError } = useBasisRows();
  const { data: rec, error: recError } = useRecurrence();
  const { data: budgetRowsAll, isLoading: budgetLoading } = useBudgetMonthly();
  const rows = basisData?.rows;

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const mtdPro = useMemo(() => (preset === "MTD" ? computeMtdProration(todayKey) : null), [preset, todayKey]);

  const actualTree = useMemo(() => buildTree(rows, win, scope, rec), [rows, win, scope, rec]);
  const priorTreeRaw = useMemo(() => buildTree(rows, py, scope, rec), [rows, py, scope, rec]);
  const priorTree = useMemo(() => (mtdPro ? scaleTree(priorTreeRaw, mtdPro.fraction) : priorTreeRaw), [priorTreeRaw, mtdPro]);

  const budgetRowsForScope = useMemo(
    () => (scope === "RECURRING" ? budgetRowsAll?.filter((r) => !isBudgetNonRecLine(r.moa_code)) : budgetRowsAll),
    [budgetRowsAll, scope],
  );
  const budgetAggRaw = useMemo(() => aggregateBudgetWindow(budgetRowsForScope, win), [budgetRowsForScope, win]);
  const budgetAgg = useMemo(() => (mtdPro ? prorateBudget(budgetAggRaw, mtdPro.fraction) : budgetAggRaw), [budgetAggRaw, mtdPro]);

  const actualSub = useMemo(() => deriveSubtotals(actualTree), [actualTree]);
  const priorSub = useMemo(() => deriveSubtotals(priorTree), [priorTree]);

  const isBudgetMode = comparisonMode === "BUDGET";
  const comparisonLabel = isBudgetMode ? "Budget" : "Previous Year";
  const budgetNaNote = isBudgetMode && !budgetAgg ? `No approved budget exists for ${windowName}.` : null;

  const hasAnyData = rows && rows.length > 0;

  // Empty-window honesty gates (2026-08-03 add-on) — a fully unfed window
  // (typically a future calendar quarter) makes EVERY macro/subtotal row's
  // actual (and, symmetrically, a fully unfed PY window's comparison) render
  // "—" instead of the fabricated 0 `buildTree`/`deriveSubtotals` naturally
  // produce for a window with zero matching rows.
  const noActualData = useMemo(() => monthsCoveredInWin(rows, win) === 0, [rows, win]);
  const noPriorData = useMemo(() => monthsCoveredInWin(rows, py) === 0, [rows, py]);
  const noDataNote = noActualData
    ? `No data posted yet for ${windowName} — every line below shows "—" until this period is fed.`
    : null;

  // Partial-window honesty note (2026-08-04, owner-audit #3/#4): the window
  // itself has SOME data (revenue live), but at least one cost section
  // hasn't been posted yet, so EBITDA/EBITDA (reported)/EBIT/Net income are
  // not yet computable — mirrors Cash Flow's equivalent banner so the same
  // "figures aren't final for an open period" signal appears in both places.
  const partialDataNote = useMemo(() => {
    if (noActualData || isBudgetMode) return null;
    if (actualSub.hasEbitdaReported) return null;
    return `Some cost lines are not fully posted yet for ${windowName} — EBITDA / EBITDA (reported) / EBIT / Net income show "—" until costs are booked.`;
  }, [noActualData, isBudgetMode, actualSub, windowName]);

  // ------------------------------------------------------------ row build
  //
  // 4 levels, in exact canonical MoA order (data/moaTree.ts's MOA_PL_LEAVES
  // order — the same order the zero-diff verification script checks):
  //   0 = macro section / subtotal
  //   1 = family (L2 BU — Livery, Horse School, Membership, Events, B2B,
  //       Competitions, Retail, Corporate)
  //   2 = cluster (L3)
  //   3 = leaf (L4, moa_code) — `codeTag` carries the code as a subtle
  //       secondary tag, never the primary label (Marcello's explicit rule:
  //       human-readable name first, code only as a small secondary tag).
  //
  // actualTree and priorTree are built from the IDENTICAL canonical leaf
  // list (see buildTree), so they share the exact same families/clusters in
  // the exact same order — every row below is walked once, by index, off
  // the actual tree, with the matching prior node picked up alongside it.
  // No runtime union, no per-branch filtering: every family/cluster/leaf the
  // MoA defines for a section renders, every time, per Marcello's mandate
  // ("voglio vedere ogni riga e sottoriga di foglia") — a window with zero
  // rows still shows the full tree at 0 (or "—" under the honesty gate).
  interface Row { indent: 0 | 1 | 2 | 3; keyPath: string; label: string; codeTag?: string; actual: number | null; comparison: number | null; expandable: boolean; expanded: boolean; onToggle?: () => void; subtotal?: boolean; emphasis?: boolean }

  const tableRows = useMemo((): Row[] => {
    const out: Row[] = [];
    for (const m of MACRO_ROWS) {
      const rawActual = macroValue(m.key, actualTree, actualSub);
      const rawComparison = isBudgetMode ? budgetValueFor(m.key, budgetAgg) : macroValue(m.key, priorTree, priorSub);
      // "Absent ≠ zero" (2026-08-04, owner-audit #3/#4): a row backed by zero
      // posted warehouse rows renders "—", not a fabricated 0 — whether the
      // WHOLE window is unfed (noActualData/noPriorData) or just this row's
      // underlying section/subtotal hasn't been booked yet (macroHasData).
      const actual = noActualData || !macroHasData(m.key, actualTree, actualSub) ? null : rawActual;
      const comparison = isBudgetMode
        ? rawComparison
        : (noPriorData || !macroHasData(m.key, priorTree, priorSub) ? null : rawComparison);

      // Gross margin family explosion (fix-24, rule 5): family revenue -
      // family direct costs, one row per revenue family, ties to the macro
      // Gross margin total by construction (same underlying family totals,
      // just regrouped) — disabled in Budget mode, same as every other
      // MoA-granularity drill on this table.
      if (m.key === "GrossMargin") {
        const gmExpandKey = "gm:family";
        const revFamilies = actualTree.get("Revenue")!.families; // canonical order — same as the Revenue row's own expansion
        const canExpandGM = !isBudgetMode && revFamilies.length > 0;
        out.push({
          indent: 0, keyPath: "GrossMargin", label: m.label, actual, comparison,
          expandable: canExpandGM,
          expanded: canExpandGM && expanded.has(gmExpandKey),
          onToggle: canExpandGM ? () => toggle(gmExpandKey) : undefined,
          subtotal: m.subtotal, emphasis: m.emphasis,
        });
        if (canExpandGM && expanded.has(gmExpandKey)) {
          const cogsFamilies = actualTree.get("COGS")!.families;
          const revFamiliesP = priorTree.get("Revenue")!.families;
          const cogsFamiliesP = priorTree.get("COGS")!.families;
          for (const revFam of revFamilies) {
            // Not every revenue family has a COGS counterpart — Competitions
            // and Private Events have zero moa_gestionale COGS accounts
            // today (verified 2026-08-04: no B2B/EVT/COMP placeholder
            // exists), which is a real MoA-completeness gap, not a bug —
            // their family margin is correctly 100% of revenue, never a
            // fabricated cost.
            const cogsFam = findFamilyByBu(cogsFamilies, revFam.bu);
            const revFamP = findFamilyByBu(revFamiliesP, revFam.bu);
            const cogsFamP = findFamilyByBu(cogsFamiliesP, revFam.bu);
            const famGmActual = revFam.total + (cogsFam?.total ?? 0);
            const famGmPrior = (revFamP?.total ?? 0) + (cogsFamP?.total ?? 0);
            out.push({
              indent: 1, keyPath: `gm:${revFam.bu}`, label: revFam.buName,
              actual: noActualData || !actualSub.hasGrossMargin ? null : famGmActual,
              comparison: noPriorData || !priorSub.hasGrossMargin ? null : famGmPrior,
              expandable: false, expanded: false,
            });
          }
        }
        continue;
      }

      const sectionKey = m.section ? `sec:${m.section}` : null;
      // The canonical tree always has >=1 family for every one of the 8 PL
      // sections (moaTree.ts defines leaves for all of them) — so this is
      // no longer gated on the CURRENT window having rows. Fixes the
      // "August has zero cost rows -> chevron disappears" defect: PY (or
      // budget-adjacent) data still drives full expansion of an empty
      // current window, exactly as Marcello's mandate requires.
      const curSlots = m.section ? sectionFamilySlots(actualTree.get(m.section)!.families) : [];
      const canExpand = !isBudgetMode && !!m.section && curSlots.length > 0;
      out.push({
        indent: 0,
        keyPath: m.key,
        label: m.label,
        codeTag: MACRO_LEAF_CODE[m.key],
        actual,
        comparison,
        expandable: canExpand,
        expanded: !!sectionKey && expanded.has(sectionKey),
        onToggle: canExpand && sectionKey ? () => toggle(sectionKey) : undefined,
        subtotal: m.subtotal,
        emphasis: m.emphasis,
      });
      if (!m.section || !sectionKey || !expanded.has(sectionKey) || isBudgetMode) continue;
      const section = m.section;
      const curFamilies = actualTree.get(section)!.families;
      const priorFamilies = priorTree.get(section)!.families;
      // Section-level "absent ≠ zero" gate for every family/cluster/leaf
      // beneath this macro row — mirrors the macro row's own `macroHasData`
      // check just above, so a section with zero posted rows shows "—" at
      // every depth, not just at the top (2026-08-04, owner-audit #3/#4).
      const curSectionHasData = sectionHasData(actualTree, section);
      const priorSectionHasData = sectionHasData(priorTree, section);
      const gated = (curTotal: number, priorTotal: number) => ({
        actual: noActualData || !curSectionHasData ? null : curTotal,
        comparison: noPriorData || !priorSectionHasData ? null : priorTotal,
      });

      // Single-child collapse (fix-24): `curSlots` is the section's family
      // level already collapsed per `sectionFamilySlots` — for the 5
      // structurally-CORP-only sections (OPEX-GA/MS/People, Project-Costs,
      // and, were it still section-driven, NON-OP) this is directly the
      // cluster/leaf level, promoted one tier up; for Revenue/COGS/D&A
      // (2+ families) it's the normal family row list.
      const soleBu = curFamilies.length === 1 ? curFamilies[0].bu : null;
      for (const slot of curSlots) {
        if (slot.kind === "leaf") {
          const leafP = findLeafInFamilies(priorFamilies, slot.leaf.moaCode);
          out.push({
            indent: 1, keyPath: slot.leaf.moaCode, label: slot.leaf.leafName, codeTag: slot.leaf.moaCode,
            ...gated(slot.leaf.total, leafP?.total ?? 0), expandable: false, expanded: false,
          });
          continue;
        }
        if (slot.kind === "cluster") {
          const bu = soleBu!; // a cluster/leaf slot only appears here when the section has exactly one family
          const cluExpandKey = `clu:${section}::${bu}::${slot.cluster.clusterCode}`;
          const priorClu = findClusterInFamilies(priorFamilies, bu, slot.cluster.clusterCode);
          out.push({
            indent: 1, keyPath: cluExpandKey, label: slot.cluster.clusterName,
            ...gated(slot.cluster.total, priorClu?.total ?? 0),
            expandable: true, expanded: expanded.has(cluExpandKey), onToggle: () => toggle(cluExpandKey),
          });
          if (!expanded.has(cluExpandKey)) continue;
          for (const leaf of slot.cluster.leaves) {
            const leafP = priorClu?.leaves.find((l) => l.moaCode === leaf.moaCode);
            out.push({
              indent: 2, keyPath: leaf.moaCode, label: leaf.leafName, codeTag: leaf.moaCode,
              ...gated(leaf.total, leafP?.total ?? 0), expandable: false, expanded: false,
            });
          }
          continue;
        }
        // slot.kind === "family" — the normal 2+-family case (Revenue, COGS, D&A).
        const fam = slot.family;
        const famExpandKey = `fam:${section}::${fam.bu}`;
        const famP = findFamilyByBu(priorFamilies, fam.bu);
        const famSlotsArr = familySlots(fam);
        const canExpandFam = famSlotsArr.length > 0;
        out.push({
          indent: 1, keyPath: famExpandKey, label: fam.buName,
          ...gated(fam.total, famP?.total ?? 0),
          expandable: canExpandFam, expanded: expanded.has(famExpandKey),
          onToggle: canExpandFam ? () => toggle(famExpandKey) : undefined,
        });
        if (!canExpandFam || !expanded.has(famExpandKey)) continue;
        for (const fs of famSlotsArr) {
          if (fs.kind === "leaf") {
            const leafP = famP ? findLeafInFamilies([famP], fs.leaf.moaCode) : undefined;
            out.push({
              indent: 2, keyPath: fs.leaf.moaCode, label: fs.leaf.leafName, codeTag: fs.leaf.moaCode,
              ...gated(fs.leaf.total, leafP?.total ?? 0), expandable: false, expanded: false,
            });
            continue;
          }
          // fs.kind === "cluster"
          const cluExpandKey = `clu:${section}::${fam.bu}::${fs.cluster.clusterCode}`;
          const priorClu = famP?.clusters.find((c) => c.clusterCode === fs.cluster.clusterCode);
          out.push({
            indent: 2, keyPath: cluExpandKey, label: fs.cluster.clusterName,
            ...gated(fs.cluster.total, priorClu?.total ?? 0),
            expandable: true, expanded: expanded.has(cluExpandKey), onToggle: () => toggle(cluExpandKey),
          });
          if (!expanded.has(cluExpandKey)) continue;
          for (const leaf of fs.cluster.leaves) {
            const leafP = priorClu?.leaves.find((l) => l.moaCode === leaf.moaCode);
            out.push({
              indent: 3, keyPath: leaf.moaCode, label: leaf.leafName, codeTag: leaf.moaCode,
              ...gated(leaf.total, leafP?.total ?? 0), expandable: false, expanded: false,
            });
          }
        }
      }
    }
    return out;
  }, [actualTree, priorTree, actualSub, priorSub, expanded, isBudgetMode, budgetAgg, noActualData, noPriorData]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl tracking-wide text-foreground">Economics</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Live P&amp;L — every figure computed from the warehouse for the selected window.</p>
      </div>

      {/* ---------- global controls ---------- */}
      {/* fix-24 (2026-08-04, Marcello — "togli tutto"): the "Figures net of
          customer credit notes" footnote and the Data completeness banner
          are both removed from this page; only the small open-months badge
          stays. The footnote is a shared-chrome no-op as of fix-25 either
          way — the wrapper div and CompletenessBanner call are dropped here
          rather than left rendering nothing. */}
      <div className="flex flex-wrap items-center gap-3">
        <WindowPicker months={factMonths(rows)} />
        <ComparisonToggle />
        <ScopeToggle />
        <OpenMonthsBadge />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading live warehouse rows…</p>}
      {basisError && !isLoading && (
        <p className="text-sm text-destructive/90">
          Could not load warehouse rows — {basisError instanceof Error ? basisError.message : String(basisError)}
        </p>
      )}
      {recError && <p className="text-xs text-destructive/70">Recurrence data unavailable — {recError instanceof Error ? recError.message : String(recError)} (Only Recurring scope may be incomplete.)</p>}

      {/* ---------- KPI circles + comparison histogram ---------- */}
      {/* fix-4-kpi, commit 91ce209 — both components are standalone (read
          useKpiHeaderData() internally, no props), so they tie to whatever
          window/comparison/scope the table below is showing with zero extra
          wiring from this page. */}
      <KpiCircles />
      <ComparisonHistogram />

      {/* ---------- the P&L table ---------- */}
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            P&amp;L — {windowName}
          </h2>
          {mtdPro && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground cursor-help">
                  <Info className="h-3 w-3" /> {comparisonLabel} pro-rated to {mtdPro.elapsedDays}/{mtdPro.daysInMonth} days
                </span>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs text-xs">
                Month to date compares a partial month — the {comparisonLabel.toLowerCase()} figure is scaled to the
                same elapsed share of the month so the comparison is fair. Actual is never pro-rated.
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {noDataNote && (
          <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">{noDataNote}</p>
        )}
        {partialDataNote && !noDataNote && (
          <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">{partialDataNote}</p>
        )}
        {budgetNaNote && (
          <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">{budgetNaNote}</p>
        )}
        {isBudgetMode && !budgetNaNote && (
          <p className="text-[11px] text-muted-foreground/80">
            Detail limited to budget granularity — budget_2026 has no line-level equivalent to the managerial chart of
            accounts, so rows don't expand in Budget view. Switch to Previous Year for full leaf detail.
          </p>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading the P&amp;L…</p>
        ) : !hasAnyData ? (
          <p className="text-sm text-muted-foreground py-4">No data for this window.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="text-left py-2 pr-3 font-semibold">Line item</th>
                  <th className="text-right py-2 px-3 font-semibold">This window</th>
                  <th className="text-right py-2 px-3 font-semibold">{comparisonLabel}</th>
                  <th className="text-right py-2 px-3 font-semibold">Δ value</th>
                  <th className="text-right py-2 pl-3 font-semibold">Δ %</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r) => {
                  const deltaAbs = r.actual === null || r.comparison === null ? null : r.actual - r.comparison;
                  // comparePct (not pctChange): 2026-08-04, owner-audit #7 —
                  // a comparison base that's negative/near-zero (loss-to-
                  // profit swing, or a tiny prior-year figure) must render
                  // "n/m" (shown as "—" via deltaPct===null below), never a
                  // clean-looking but meaningless +1026.2%-style artifact.
                  const deltaPct = r.actual === null || r.comparison === null ? null : comparePct(r.actual, r.comparison);
                  const good = deltaAbs === null ? null : deltaAbs >= 0;
                  return (
                    <tr
                      key={r.keyPath}
                      className={`border-b border-border/10 ${r.subtotal ? "border-t-2 border-t-border" : ""} ${r.emphasis ? "font-semibold" : ""}`}
                    >
                      {/* owner-audit #11 (2026-08-04): the chevron button's tap
                          target was 16x16 CSS px with the row label OUTSIDE the
                          clickable area — below even the WCAG 2.5.8 AA minimum
                          (24x24px). The whole cell now shares r.onToggle (a
                          normal "tap the row to expand" mobile gesture works),
                          the button keeps its own handler too (stopPropagation
                          guards against the Set-based toggle firing twice and
                          cancelling itself out) so keyboard/explicit-click
                          behaviour on the chevron itself is unchanged. */}
                      <td
                        className={`py-1.5 pr-3 ${r.onToggle ? "cursor-pointer select-none" : ""}`}
                        onClick={r.onToggle}
                      >
                        <span style={{ paddingLeft: `${r.indent * 18}px` }} className="inline-flex items-center gap-1.5">
                          {r.onToggle ? (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); r.onToggle?.(); }}
                              className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted/60 text-muted-foreground shrink-0"
                            >
                              {r.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          ) : r.indent > 0 ? <span className="inline-block h-4 w-4 shrink-0" /> : null}
                          <span className={r.subtotal ? "text-foreground" : ""}>{r.label}</span>
                          {r.codeTag && (
                            <span className="text-[10px] font-mono text-muted-foreground/50 shrink-0">{r.codeTag}</span>
                          )}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{fmtOrDash(r.actual)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{fmtOrDash(r.comparison)}</td>
                      <td className={`py-1.5 px-3 text-right tabular-nums ${good === null ? "text-muted-foreground" : good ? "text-success" : "text-destructive"}`}>
                        {deltaAbs === null ? "—" : fmtDeltaSAR(deltaAbs)}
                      </td>
                      <td className={`py-1.5 pl-3 text-right tabular-nums font-semibold ${good === null ? "text-muted-foreground" : good ? "text-success" : "text-destructive"}`}>
                        {deltaPct === null ? "—" : fmtDeltaPct(deltaPct)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {budgetLoading && isBudgetMode && <p className="text-xs text-muted-foreground">Loading budget…</p>}
      </Card>
    </div>
  );
};
