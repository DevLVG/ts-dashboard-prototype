// Drill-down drawer on LIVE leaf-grain data — replaces the mock
// WaterfallDrilldownDrawer for the Economic Analysis tool. Same interaction
// grammar (bottom drawer, ESC to close, expandable groups, variance badges)
// but fed by the analysis model: L3 clusters -> L4 leaf accounts, side-by-side
// with the active comparisons. Drill stops at the MoA leaf (ratified R1 depth;
// journal-entry drill is a fast-follow behind auth).
import { Fragment, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getVarianceTextColor } from "@/lib/varianceColors";
import { SummaryPanel } from "@/components/drilldown/SummaryPanel";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import {
  COMPARISON_LABELS,
  NO_LEAF_BUDGET_NOTE,
  fmtSar,
  fmtDelta,
  variancePct,
  type AnalysisLine,
  type ComparisonKind,
} from "@/data/analysisModel";

interface AnalysisDrilldownDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** The drilled line (null = closed). */
  line: AnalysisLine | null;
  /** All lines of the current view — used for the mini build-down when the
   * drilled line is a computed subtotal (GM / EBITDA / EBIT). */
  lines: AnalysisLine[];
  comps: ComparisonKind[];
  periodLabel: string;
  scope: string;
}

const fmtPct = (pct: number | null): string =>
  pct === null ? "—" : `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;

const deltaBadgeVariant = (pct: number | null): "default" | "secondary" | "destructive" => {
  if (pct === null) return "secondary";
  if (pct >= 0) return "default";
  if (pct >= -5) return "secondary";
  return "destructive";
};

/** Cells: comparison value / Δ / Δ% (signed values — standard colour logic). */
const CompCells = ({ actual, comp, budget }: { actual: number; comp: number | null | undefined; budget?: boolean }) => {
  if (comp === null || comp === undefined) {
    return (
      <>
        <TableCell className="text-right text-muted-foreground/60 italic" title={budget ? NO_LEAF_BUDGET_NOTE : undefined}>
          n/a
        </TableCell>
        <TableCell className="text-right text-muted-foreground/60">—</TableCell>
        <TableCell className="text-right text-muted-foreground/60">—</TableCell>
      </>
    );
  }
  const delta = actual - comp;
  const pct = variancePct(actual, comp);
  const color = pct === null ? "" : getVarianceTextColor(pct, "Revenue");
  return (
    <>
      <TableCell className="text-right tabular-nums">{fmtSar(comp)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", delta === 0 ? "text-muted-foreground" : color)}>
        {delta === 0 ? "—" : fmtDelta(delta)}
      </TableCell>
      <TableCell className="text-right">
        {delta === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <Badge variant={deltaBadgeVariant(pct)} className="font-semibold">{fmtPct(pct)}</Badge>
        )}
      </TableCell>
    </>
  );
};

export function AnalysisDrilldownDrawer({
  isOpen, onClose, line, lines, comps, periodLabel, scope,
}: AnalysisDrilldownDrawerProps) {
  const [openClusters, setOpenClusters] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Reset expansion when the drilled line changes
  useEffect(() => { setOpenClusters(new Set()); }, [line?.key]);

  if (!line) return null;

  const revenue = lines.find((l) => l.key === "revenue");
  const revActual = revenue?.actual ?? 0;

  // Primary comparison = first active one with a value on this line
  const primary = comps.find((c) => line.comps[c] !== null && line.comps[c] !== undefined);

  // % of revenue summary (skip for the revenue line itself)
  const isCost = line.actual < 0 || ["cogs", "opexPeople", "opexMs", "opexGa", "opexGaU", "nonRecurring", "da"].includes(line.key);
  const summary = (() => {
    if (line.key === "revenue" || revActual === 0 || !primary) return null;
    const revComp = revenue?.comps[primary];
    if (revComp === null || revComp === undefined || revComp === 0) return null;
    const compVal = line.comps[primary]!;
    const actualPct = (Math.abs(line.actual) / revActual) * 100;
    const compPct = (Math.abs(compVal) / Math.abs(revComp)) * 100;
    return {
      label: `${line.label} % of Revenue (vs ${COMPARISON_LABELS[primary]})`,
      actualPct, compPct, deltaPP: actualPct - compPct,
      logic: (isCost ? "lower-is-better" : "higher-is-better") as "lower-is-better" | "higher-is-better",
    };
  })();

  const hasClusters = (line.clusters?.length ?? 0) > 0;
  const buildLines = lines.filter((l) => l.key !== line.key);

  const toggleCluster = (code: string) => {
    setOpenClusters((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="h-[90vh]">
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle className="text-xl inline-flex items-center gap-2">
                {line.label} — Breakdown
                <DataSourceBadge source="live" />
              </DrawerTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {periodLabel} • {scope} • MoA drill: cluster → leaf account
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DrawerHeader>

        <div className="overflow-y-auto p-6 space-y-6">
          {summary && (
            <SummaryPanel
              label={summary.label}
              actualPercent={summary.actualPct}
              comparisonPercent={summary.compPct}
              deltaPP={summary.deltaPP}
              colorLogic={summary.logic}
            />
          )}

          {hasClusters ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[34%]">Cluster / Leaf account</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    {comps.map((c) => (
                      <Fragment key={c}>
                        <TableHead className="text-right">{COMPARISON_LABELS[c]}</TableHead>
                        <TableHead className="text-right">Δ</TableHead>
                        <TableHead className="text-right">Δ%</TableHead>
                      </Fragment>
                    ))}
                    <TableHead className="text-right">% of line</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {line.clusters!.map((cluster) => {
                    const open = openClusters.has(cluster.code);
                    return (
                      <Fragment key={cluster.code}>
                        <TableRow
                          className="font-semibold cursor-pointer hover:bg-muted/50 bg-muted/20"
                          onClick={() => toggleCluster(cluster.code)}
                        >
                          <TableCell>
                            <span className="inline-flex items-center gap-2">
                              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              {cluster.name}
                              <span className="text-xs font-normal text-muted-foreground">{cluster.code}</span>
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{fmtSar(cluster.actual)}</TableCell>
                          {comps.map((c) => (
                            <CompCells key={c} actual={cluster.actual} comp={cluster.comps[c]} budget={c === "BUD"} />
                          ))}
                          <TableCell className="text-right tabular-nums">
                            {line.actual !== 0 ? `${((cluster.actual / line.actual) * 100).toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                        {open && cluster.leaves.map((leaf) => (
                          <TableRow key={leaf.moaCode} className="text-sm">
                            <TableCell className="pl-10">
                              <span className="text-muted-foreground font-mono text-xs mr-2">{leaf.moaCode}</span>
                              {leaf.name}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{fmtSar(leaf.actual)}</TableCell>
                            {comps.map((c) => (
                              <CompCells key={c} actual={leaf.actual} comp={leaf.comps[c]} budget={c === "BUD"} />
                            ))}
                            <TableCell className="text-right tabular-nums">
                              {line.actual !== 0 ? `${((leaf.actual / line.actual) * 100).toFixed(1)}%` : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    );
                  })}
                  <TableRow className="font-bold border-t-2 bg-muted/30">
                    <TableCell>TOTAL {line.label.toUpperCase()}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtSar(line.actual)}</TableCell>
                    {comps.map((c) => (
                      <CompCells key={c} actual={line.actual} comp={line.comps[c]} budget={c === "BUD"} />
                    ))}
                    <TableCell className="text-right font-bold tabular-nums">100.0%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          ) : (
            // Computed subtotal (GM / EBITDA / EBIT): show the build-down
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[34%]">P&amp;L line</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    {comps.map((c) => (
                      <Fragment key={c}>
                        <TableHead className="text-right">{COMPARISON_LABELS[c]}</TableHead>
                        <TableHead className="text-right">Δ</TableHead>
                        <TableHead className="text-right">Δ%</TableHead>
                      </Fragment>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {buildLines.map((l) => (
                    <TableRow key={l.key} className={cn(l.emphasis && "font-semibold bg-muted/20")}>
                      <TableCell className={cn(l.indent && "pl-8")}>{l.label}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtSar(l.actual)}</TableCell>
                      {comps.map((c) => (
                        <CompCells key={c} actual={l.actual} comp={l.comps[c]} budget={c === "BUD"} />
                      ))}
                    </TableRow>
                  ))}
                  <TableRow className="font-bold border-t-2 bg-muted/30">
                    <TableCell>{line.label.toUpperCase()}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtSar(line.actual)}</TableCell>
                    {comps.map((c) => (
                      <CompCells key={c} actual={line.actual} comp={line.comps[c]} budget={c === "BUD"} />
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Live Supabase data (pnl_management, MoA leaf grain). Budget comparatives exist at
            P&amp;L-line grain only — the approved budget is planned on 30 analytical lines, so
            cluster/leaf Budget cells show n/a. Journal-entry drill arrives right after R1
            (requires the authenticated data access piece).
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
