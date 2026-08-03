// CASH FLOW STATEMENT TABLE — same table language as the Economics P&L
// table (Card wrapper, header + MTD hint, click-to-expand chevrons, Δ value
// + Δ % columns, subtotal/emphasis row styling) so the two statements read
// as one system.
//
// Structure (Marcello's spec, literal order): Operating cash flow ->
// Investing cash flow -> Financing cash flow -> Net change in cash (+
// opening/closing). "Other cash flow" is kept as a 5th, visually secondary
// row: v_cashflow_statement_monthly carries a real (non-zero) other_cash_flow
// bucket, and Net change is the view's own net_cash_flow field — omitting
// Other would make Net change silently NOT equal the sum of the visible
// rows, which this cockpit never allows (every subtotal ties to its parts
// by construction).
//
// Expand: Operating -> {Operating result, Working-capital change, D&A
// add-back}; Financing -> {equity, intercompany}. Investing has no further
// split in the warehouse view, so it stays flat (spec: "if not, flat but
// clean"). Same granularity rule as Economics: Budget comparison has no
// component-level split, so expansion is disabled entirely in Budget mode
// (`budgetCapNote` explains why, same placement as Economics' note).
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, ChevronDown, Info } from "lucide-react";
import type { CashFlowLineRow } from "@/hooks/useCashFlowPageData";
import { fmtDeltaSAR, fmtDeltaPct, fmtOrDash, pctChange } from "@/lib/format";

interface MtdHint { elapsedDays: number; daysInMonth: number }

export const CashFlowTable = ({
  rows, windowName, comparisonLabel, mtdProrated, mtdHint, budgetCapNote, actualDataNote,
}: {
  rows: CashFlowLineRow[];
  windowName: string;
  comparisonLabel: string;
  mtdProrated: boolean;
  mtdHint: MtdHint | null;
  budgetCapNote: string | null;
  actualDataNote: string | null;
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const visibleRows = rows.filter((r) => !r.parentKey || expanded.has(r.parentKey));

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Cash Flow — {windowName}
        </h2>
        {mtdProrated && mtdHint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground cursor-help">
                <Info className="h-3 w-3" /> {comparisonLabel} pro-rated to {mtdHint.elapsedDays}/{mtdHint.daysInMonth} days
              </span>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-xs text-xs">
              Month to date compares a partial month — the flow lines' {comparisonLabel.toLowerCase()} figure is
              scaled to the same elapsed share of the month. Cash position (opening/closing) is a point-in-time
              balance and is never pro-rated. Actual is never pro-rated.
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {budgetCapNote && (
        <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">{budgetCapNote}</p>
      )}
      {actualDataNote && (
        <p className="text-xs text-muted-foreground bg-muted/30 border border-border rounded-md px-3 py-2">{actualDataNote}</p>
      )}

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
            {visibleRows.map((r) => {
              const deltaAbs = r.actual === null || r.comparison === null ? null : r.actual - r.comparison;
              const deltaPct = r.actual === null || r.comparison === null ? null : pctChange(r.actual, r.comparison);
              const good = deltaAbs === null ? null : deltaAbs >= 0;
              const isSep = r.key === "opening";
              return (
                <tr
                  key={r.key}
                  className={`border-b border-border/10 ${r.subtotal ? "border-t-2 border-t-border" : ""} ${r.emphasis ? "font-semibold" : ""} ${isSep ? "border-t border-t-border/40" : ""}`}
                >
                  <td className="py-1.5 pr-3">
                    <span style={{ paddingLeft: `${r.indent * 18}px` }} className="inline-flex items-center gap-1.5">
                      {r.expandable ? (
                        <button
                          type="button"
                          onClick={() => toggle(r.key)}
                          className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted/60 text-muted-foreground shrink-0"
                        >
                          {expanded.has(r.key) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        </button>
                      ) : r.indent > 0 ? <span className="inline-block h-4 w-4 shrink-0" /> : null}
                      <span className={r.key === "closing" || r.key === "opening" ? "text-gold" : r.subtotal ? "text-foreground" : ""}>{r.label}</span>
                    </span>
                  </td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{fmtOrDash(r.actual)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">
                    {r.comparison === null ? (
                      r.comparisonUnavailableReason ? (
                        <Tooltip>
                          <TooltipTrigger asChild><span className="cursor-help">—</span></TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs text-xs">{r.comparisonUnavailableReason}</TooltipContent>
                        </Tooltip>
                      ) : fmtOrDash(r.comparison)
                    ) : fmtOrDash(r.comparison)}
                  </td>
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
    </Card>
  );
};
