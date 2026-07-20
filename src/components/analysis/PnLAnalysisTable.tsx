// R1 core artefact — the side-by-side P&L analysis table, expandable down to
// the MoA leaf account (maximum management granularity, ratified 2026-07-20).
//
// Columns: Actual always + (value / Δ / Δ%) for each active comparison
// (Budget / Prev Year / Prev Period, max 2). Rows: P&L lines in the selected
// reading (IFRS Reported or Management Adjusted), each real section
// expandable to its L3 clusters and L4 leaves. Styling mirrors PnLLiveTable
// (same Card, same row emphasis, costs displayed as negatives); variance
// colouring reuses the shared varianceColors system (standard logic — values
// are signed, so a positive delta is always an improvement).
import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { getVarianceTextColor } from "@/lib/varianceColors";
import {
  COMPARISON_LABELS,
  NO_LEAF_BUDGET_NOTE,
  fmtSar,
  fmtDelta,
  variancePct,
  type AnalysisLine,
  type ClusterNode,
  type ComparisonKind,
  type CompValues,
} from "@/data/analysisModel";

interface PnLAnalysisTableProps {
  lines: AnalysisLine[];
  comps: ComparisonKind[];
  /** e.g. "JUL 2026 (MTD)" */
  periodLabel: string;
  /** e.g. "Consolidated" or "Livery (LIV)" */
  scope: string;
  /** Range shown for each comparison, e.g. { PY: "Jul '25", PP: "Jun '26" } */
  compRangeLabels: Partial<Record<ComparisonKind, string>>;
}

const fmtPct = (pct: number | null): string =>
  pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;

/** The three cells (value / Δ / Δ%) for one comparison of one row. */
const CompCells = ({
  actual,
  comp,
  note,
  muted,
}: {
  actual: number;
  comp: number | null | undefined;
  note?: string;
  muted?: boolean;
}) => {
  if (comp === null || comp === undefined) {
    return (
      <>
        <td className="text-right py-2 px-2 tabular-nums whitespace-nowrap text-muted-foreground/60 italic" title={note}>
          n/a
        </td>
        <td className="text-right py-2 px-2 text-muted-foreground/60">—</td>
        <td className="text-right py-2 px-2 text-muted-foreground/60">—</td>
      </>
    );
  }
  const delta = actual - comp;
  const pct = variancePct(actual, comp);
  // Signed values: positive delta = improvement on every line -> standard logic
  const color = pct === null ? "" : getVarianceTextColor(pct, "Revenue");
  return (
    <>
      <td className={cn("text-right py-2 px-2 tabular-nums whitespace-nowrap", muted || comp < 0 ? "text-muted-foreground" : "")}>
        {fmtSar(comp)}
      </td>
      <td className={cn("text-right py-2 px-2 tabular-nums whitespace-nowrap", delta === 0 ? "text-muted-foreground" : color)}>
        {delta === 0 ? "—" : fmtDelta(delta)}
      </td>
      <td className={cn("text-right py-2 px-2 tabular-nums whitespace-nowrap font-medium", delta === 0 ? "text-muted-foreground" : color)}>
        {delta === 0 ? "—" : fmtPct(pct)}
      </td>
    </>
  );
};

export const PnLAnalysisTable = ({
  lines,
  comps,
  periodLabel,
  scope,
  compRangeLabels,
}: PnLAnalysisTableProps) => {
  const [openLines, setOpenLines] = useState<Set<string>>(new Set());
  const [openClusters, setOpenClusters] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, key: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  };

  const nCols = 2 + comps.length * 3;

  const renderCompCellsRow = (actual: number, compVals: CompValues, note?: string, muted?: boolean) =>
    comps.map((c) => (
      <CompCells
        key={c}
        actual={actual}
        comp={compVals[c]}
        note={c === "BUD" ? note ?? NO_LEAF_BUDGET_NOTE : undefined}
        muted={muted}
      />
    ));

  const renderCluster = (line: AnalysisLine, cluster: ClusterNode) => {
    const cKey = `${line.key}:${cluster.code}`;
    const cOpen = openClusters.has(cKey);
    return (
      <Fragment key={cKey}>
        <tr
          className="border-b border-border/10 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors"
          onClick={() => toggle(openClusters, cKey, setOpenClusters)}
        >
          <td className="py-1.5 pr-4 pl-8 whitespace-nowrap text-sm">
            <span className="inline-flex items-center gap-1.5">
              {cOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <span className="font-medium">{cluster.name}</span>
              <span className="text-xs text-muted-foreground">{cluster.code}</span>
            </span>
          </td>
          <td className={cn("text-right py-1.5 px-2 tabular-nums whitespace-nowrap text-sm", cluster.actual < 0 ? "text-muted-foreground" : "")}>
            {fmtSar(cluster.actual)}
          </td>
          {renderCompCellsRow(cluster.actual, cluster.comps)}
        </tr>
        {cOpen &&
          cluster.leaves.map((leaf) => (
            <tr key={`${cKey}:${leaf.moaCode}`} className="border-b border-border/10 bg-muted/10 text-xs">
              <td className="py-1.5 pr-4 pl-16 whitespace-nowrap">
                <span className="text-muted-foreground mr-2 font-mono">{leaf.moaCode}</span>
                {leaf.name}
              </td>
              <td className={cn("text-right py-1.5 px-2 tabular-nums whitespace-nowrap", leaf.actual < 0 ? "text-muted-foreground" : "")}>
                {fmtSar(leaf.actual)}
              </td>
              {renderCompCellsRow(leaf.actual, leaf.comps, undefined, true)}
            </tr>
          ))}
      </Fragment>
    );
  };

  return (
    <Card className="p-6 overflow-x-auto shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h3 className="text-xl font-heading tracking-wide">
          P&amp;L — {scope.toUpperCase()} — {periodLabel.toUpperCase()}
        </h3>
        <DataSourceBadge source="live" />
        <span className="text-xs text-muted-foreground">
          Supabase · pnl_management (MoA leaf grain) + v_budget_monthly · SAR
        </span>
      </div>

      <table className="w-full text-sm" style={{ minWidth: 480 + comps.length * 320 }}>
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 pr-4 font-semibold align-bottom" rowSpan={2}>
              SAR
            </th>
            <th className="text-right py-2 px-2 font-semibold align-bottom" rowSpan={2}>
              Actual
            </th>
            {comps.map((c) => (
              <th key={c} colSpan={3} className="text-center py-1 px-2 font-semibold border-b border-border/40">
                vs {COMPARISON_LABELS[c]}
                {compRangeLabels[c] && (
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                    {compRangeLabels[c]}
                  </span>
                )}
              </th>
            ))}
          </tr>
          <tr className="border-b">
            {comps.map((c) => (
              <Fragment key={c}>
                <th className="text-right py-1 px-2 text-xs font-medium text-muted-foreground">
                  {COMPARISON_LABELS[c]}
                </th>
                <th className="text-right py-1 px-2 text-xs font-medium text-muted-foreground">Δ</th>
                <th className="text-right py-1 px-2 text-xs font-medium text-muted-foreground">Δ%</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const drillable = (line.clusters?.length ?? 0) > 0;
            const open = openLines.has(line.key);
            return (
              <Fragment key={line.key}>
                <tr
                  className={cn(
                    line.emphasis ? "border-b border-border/40 font-semibold" : "border-b border-border/15",
                    drillable && "cursor-pointer hover:bg-muted/30 transition-colors",
                  )}
                  onClick={drillable ? () => toggle(openLines, line.key, setOpenLines) : undefined}
                >
                  <td className={cn("py-2 pr-4 whitespace-nowrap", line.indent && "pl-4", !line.emphasis && line.indent && "text-muted-foreground")}>
                    <span className="inline-flex items-center gap-1.5">
                      {drillable &&
                        (open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
                      {line.label}
                    </span>
                  </td>
                  <td className={cn("text-right py-2 px-2 tabular-nums whitespace-nowrap", line.actual < 0 ? "text-muted-foreground" : "")}>
                    {fmtSar(line.actual)}
                  </td>
                  {renderCompCellsRow(line.actual, line.comps, line.budgetNote)}
                </tr>
                {open && drillable && line.clusters!.map((cl) => renderCluster(line, cl))}
                {open && drillable && (
                  <tr className="border-b border-border/30 text-xs text-muted-foreground">
                    <td colSpan={nCols} className="py-1.5 pl-8">
                      {line.clusters!.length} cluster{line.clusters!.length === 1 ? "" : "s"} · MoA
                      leaf accounts = maximum management granularity. Budget shows n/a at this
                      grain — it is planned on the 30 analytical budget lines, not per account.
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <p className="mt-4 text-xs text-muted-foreground">
        Click a P&amp;L line to open its MoA clusters, a cluster to open its leaf accounts.
        Actuals synced daily from Qoyod; costs appear where bill line-items carry MoA tags
        (payroll is currently posted via journal entries, so OpEx — People shows no billed
        cost). Budget <DataSourceBadge source="live" className="mx-0.5" /> v_budget_monthly
        (BASE, approved 2026-07-16, Jul-2026 → Dec-2027) — outside that window, and below
        EBITDA, the Budget columns show n/a (no budget exists, not zero).
      </p>
    </Card>
  );
};
