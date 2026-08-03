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
//   - Every SECTION-backed macro row expands (click) into its MoA clusters
//     (L3), each of which expands into its individual MoA leaves (L4,
//     moa_code) — data/moaMaster.ts's dictionary, the same one the old P&L
//     drill used. Subtotal rows (Gross margin, Total OpEx, EBITDA, EBITDA
//     reported, EBIT, Net income) are derived, not expandable.
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
//     applied uniformly down to every cluster/leaf so a child row's
//     comparison always sums back to its parent's.
//   - Window = the global period selector (month/quarter/MTD/YTD/TTM).
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, ChevronDown, Info } from "lucide-react";
import { useAlignment } from "@/contexts/AlignmentContext";
import { WindowPicker, ComparisonToggle, ScopeToggle, OpenMonthsBadge, CompletenessBanner, StrictBasisNote } from "@/components/chrome/AlignmentChrome";
import { KpiCircles } from "@/components/overview/KpiCircles";
import { ComparisonHistogram } from "@/components/overview/ComparisonHistogram";
import {
  useBasisRows, useRecurrence, resolveRecurrence, aggregateBudgetWindow,
  computeMtdProration, prorateBudget, factMonths,
  type BasisRow, type Win, type RecurrenceState, type BudgetAgg,
} from "@/data/alignment";
import { useBudgetMonthly, monthKeyLabel } from "@/data/liveData";
import { moaInfo } from "@/data/moaMaster";
import { fmtSAR, fmtDeltaSAR, fmtDeltaPct, fmtOrDash, pctChange } from "@/lib/format";

// ---------------------------------------------------------------- helpers

/** Budget non-recurring project lines (GA-NRP* / MS-FFC) — restated locally
 * (not exported from the data layer) so the "Only Recurring" scope's Budget
 * comparison stays consistent with the KPI header above this table, which
 * restates the same rule for the same reason. */
const isBudgetNonRecLine = (moa: string): boolean => moa.startsWith("GA-NRP") || moa === "MS-FFC";

const monthKey = (date: string): string => date.slice(0, 7);
const inWin = (k: string, w: Win): boolean => k >= w.startKey && k <= w.endKey;

const PL_SECTIONS = ["Revenue", "COGS", "OPEX-GA", "OPEX-MS", "OPEX-People", "Project-Costs", "D&A", "NON-OP"] as const;
type PLSection = (typeof PL_SECTIONS)[number];

interface LeafNode { moaCode: string; leafName: string; total: number }
interface ClusterNode { clusterKey: string; clusterName: string; total: number; leaves: Map<string, LeafNode> }
interface SectionTree { total: number; clusters: Map<string, ClusterNode> }

/** Builds the section -> cluster -> leaf tree for one window/scope. Every
 * macro row's value is later DERIVED as the sum over this same tree — the
 * displayed total and its expansion can never silently disagree. */
const buildTree = (
  rows: BasisRow[] | undefined,
  w: Win,
  scope: "ALL" | "RECURRING",
  rec: RecurrenceState | undefined,
): Map<PLSection, SectionTree> => {
  const tree = new Map<PLSection, SectionTree>();
  for (const s of PL_SECTIONS) tree.set(s, { total: 0, clusters: new Map() });
  if (!rows) return tree;
  for (const r of rows) {
    if (!PL_SECTIONS.includes(r.section as PLSection)) continue;
    const k = monthKey(r.period_month);
    if (!inWin(k, w)) continue;
    if (scope === "RECURRING" && resolveRecurrence(r, rec) === "non-recurring") continue;
    const section = r.section as PLSection;
    const node = tree.get(section)!;
    node.total += r.amount_sar;
    const moa = r.moa_code ?? "—";
    const info = moaInfo(moa);
    const clusterKey = `${section}::${info.clusterCode}`;
    let cluster = node.clusters.get(clusterKey);
    if (!cluster) {
      cluster = { clusterKey, clusterName: info.clusterName, total: 0, leaves: new Map() };
      node.clusters.set(clusterKey, cluster);
    }
    cluster.total += r.amount_sar;
    let leaf = cluster.leaves.get(moa);
    if (!leaf) {
      leaf = { moaCode: moa, leafName: info.leafName, total: 0 };
      cluster.leaves.set(moa, leaf);
    }
    leaf.total += r.amount_sar;
  }
  return tree;
};

/** Scales every number in a tree by a fixed fraction (MTD pro-ration) —
 * applied uniformly top to bottom so parent = sum(children) always holds. */
const scaleTree = (tree: Map<PLSection, SectionTree>, fraction: number): Map<PLSection, SectionTree> => {
  const out = new Map<PLSection, SectionTree>();
  for (const [section, node] of tree) {
    const clusters = new Map<string, ClusterNode>();
    for (const [ck, c] of node.clusters) {
      const leaves = new Map<string, LeafNode>();
      for (const [lk, l] of c.leaves) leaves.set(lk, { ...l, total: l.total * fraction });
      clusters.set(ck, { ...c, total: c.total * fraction, leaves });
    }
    out.set(section, { total: node.total * fraction, clusters });
  }
  return out;
};

const sectionTotal = (tree: Map<PLSection, SectionTree>, s: PLSection): number => tree.get(s)?.total ?? 0;

/** The 6 derived subtotals, computed FROM the tree's section totals — never
 * from a separate aggregation path, so the table can't disagree with itself. */
interface Subtotals {
  grossMargin: number; opexTotal: number; ebitda5: number; ebitdaReported: number; ebit: number; netResult: number;
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
  return { grossMargin, opexTotal, ebitda5, ebitdaReported, ebit, netResult };
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
  { key: "NON-OP", label: "Non-operating items", section: "NON-OP" },
  { key: "NetResult", label: "Net income", subtotal: true, emphasis: true },
];

const macroValue = (key: string, tree: Map<PLSection, SectionTree>, sub: Subtotals): number => {
  switch (key) {
    case "GrossMargin": return sub.grossMargin;
    case "OpexTotal": return sub.opexTotal;
    case "EBITDA5": return sub.ebitda5;
    case "EBITDAReported": return sub.ebitdaReported;
    case "EBIT": return sub.ebit;
    case "NetResult": return sub.netResult;
    default: return sectionTotal(tree, key as PLSection);
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

  // ------------------------------------------------------------ row build
  interface Row { indent: 0 | 1 | 2; keyPath: string; label: string; actual: number; comparison: number | null; expandable: boolean; expanded: boolean; onToggle?: () => void; subtotal?: boolean; emphasis?: boolean }

  const tableRows = useMemo((): Row[] => {
    const out: Row[] = [];
    for (const m of MACRO_ROWS) {
      const actual = macroValue(m.key, actualTree, actualSub);
      const comparison = isBudgetMode ? budgetValueFor(m.key, budgetAgg) : macroValue(m.key, priorTree, priorSub);
      const sectionKey = m.section ? `sec:${m.section}` : null;
      const canExpand = !isBudgetMode && !!m.section && (actualTree.get(m.section)!.clusters.size > 0);
      out.push({
        indent: 0,
        keyPath: m.key,
        label: m.label,
        actual,
        comparison,
        expandable: canExpand,
        expanded: !!sectionKey && expanded.has(sectionKey),
        onToggle: canExpand && sectionKey ? () => toggle(sectionKey) : undefined,
        subtotal: m.subtotal,
        emphasis: m.emphasis,
      });
      if (!m.section || !sectionKey || !expanded.has(sectionKey) || isBudgetMode) continue;
      const curClusters = [...actualTree.get(m.section)!.clusters.values()];
      const priorClusterMap = priorTree.get(m.section)!.clusters;
      const clusterKeys = new Set<string>([...curClusters.map((c) => c.clusterKey), ...priorClusterMap.keys()]);
      const clusterList = [...clusterKeys].map((ck) => {
        const cur = actualTree.get(m.section!)!.clusters.get(ck);
        const prior = priorClusterMap.get(ck);
        return { ck, name: cur?.clusterName ?? prior?.clusterName ?? ck, cur: cur?.total ?? 0, prior: prior?.total ?? 0, curLeaves: cur?.leaves, priorLeaves: prior?.leaves };
      }).filter((c) => Math.abs(c.cur) > 0.5 || Math.abs(c.prior) > 0.5)
        .sort((a, b) => Math.abs(b.cur) - Math.abs(a.cur));
      for (const c of clusterList) {
        const clusterExpandKey = `clu:${c.ck}`;
        // Every cluster with at least one MoA leaf (this period OR prior —
        // union, not current-only) is explodable, full stop. The previous
        // `leafCount > 1` gate silently stopped the drill at the cluster
        // level whenever exactly one MoA code was active that window — which
        // cost/expense clusters hit far more often than revenue clusters
        // (lumpier postings: one supplier invoice vs many daily product
        // lines), producing the "only Revenue explodes to leaf" defect
        // Marcello flagged 2026-08-03. Root cause, not a revenue-only code
        // path: fixed by granting every cluster the same leaf-level reach.
        const leafKeys = new Set<string>([...(c.curLeaves?.keys() ?? []), ...(c.priorLeaves?.keys() ?? [])]);
        const canExpandCluster = leafKeys.size > 0;
        out.push({
          indent: 1,
          keyPath: c.ck,
          label: c.name,
          actual: c.cur,
          comparison: c.prior,
          expandable: canExpandCluster,
          expanded: expanded.has(clusterExpandKey),
          onToggle: canExpandCluster ? () => toggle(clusterExpandKey) : undefined,
        });
        if (!canExpandCluster || !expanded.has(clusterExpandKey)) continue;
        const leafList = [...leafKeys].map((moa) => {
          const cur = c.curLeaves?.get(moa);
          const prior = c.priorLeaves?.get(moa);
          return { moa, name: cur?.leafName ?? prior?.leafName ?? moa, cur: cur?.total ?? 0, prior: prior?.total ?? 0 };
        }).filter((l) => Math.abs(l.cur) > 0.5 || Math.abs(l.prior) > 0.5)
          .sort((a, b) => Math.abs(b.cur) - Math.abs(a.cur));
        for (const l of leafList) {
          out.push({ indent: 2, keyPath: l.moa, label: `${l.name} (${l.moa})`, actual: l.cur, comparison: l.prior, expandable: false, expanded: false });
        }
      }
    }
    return out;
  }, [actualTree, priorTree, actualSub, priorSub, expanded, isBudgetMode, budgetAgg]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl tracking-wide text-foreground">Economics</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Live P&amp;L — every figure computed from the warehouse for the selected window.</p>
      </div>

      {/* ---------- global controls ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <WindowPicker months={factMonths(rows)} />
        <ComparisonToggle />
        <ScopeToggle />
        <OpenMonthsBadge />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <StrictBasisNote />
      </div>

      <CompletenessBanner rows={rows} />
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
                  const deltaAbs = r.comparison === null ? null : r.actual - r.comparison;
                  const deltaPct = r.comparison === null ? null : pctChange(r.actual, r.comparison);
                  const good = deltaAbs === null ? null : deltaAbs >= 0;
                  return (
                    <tr
                      key={r.keyPath}
                      className={`border-b border-border/10 ${r.subtotal ? "border-t-2 border-t-border" : ""} ${r.emphasis ? "font-semibold" : ""}`}
                    >
                      <td className="py-1.5 pr-3">
                        <span style={{ paddingLeft: `${r.indent * 18}px` }} className="inline-flex items-center gap-1.5">
                          {r.onToggle ? (
                            <button type="button" onClick={r.onToggle} className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted/60 text-muted-foreground shrink-0">
                              {r.expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                          ) : r.indent > 0 ? <span className="inline-block h-4 w-4 shrink-0" /> : null}
                          <span className={r.subtotal ? "text-foreground" : ""}>{r.label}</span>
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{fmtSAR(r.actual)}</td>
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
