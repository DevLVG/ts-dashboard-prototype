// DSO CARD — average collection time (Marcello's spec, item 2).
//
// FORMULA CHOSEN (shown on-screen, not hidden): the trailing-twelve-month
// method —
//
//   DSO = Receivables (today's open AR book) / Trailing-12-month revenue x 365
//
// This is the "days of trailing revenue currently sitting in AR" reading —
// more resilient to a single seasonal month than the simpler "AR / one
// month's revenue x 30" version, and it's the method the DATA actually
// supports well here: ar_aging_v2 gives a clean "as of today" AR figure,
// and the P&L basis rows give a clean monthly revenue series to trail
// twelve months of. (The alternative "average AR over the period" DSO
// variant needs a daily/weekly AR time series, which does not exist in
// this warehouse — only month-end book values do — so it is not used.)
//
// CURRENT vs LAST-12-MONTHS AVERAGE (of the SAME metric, not of revenue or
// AR alone): for each of the trailing 12 complete months, this recomputes
// that month's OWN DSO — that month's AR book value (from
// v_working_capital_monthly, the only historical AR series that exists)
// divided by ITS OWN trailing-12-month revenue — then averages those. When
// fewer than 12 such months exist yet, the average is computed over
// whatever is available and the card says so explicitly (data-coverage
// honesty, same house rule as everywhere else in this cockpit).
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, Info, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useArAging } from "@/data/statementsLive";
import { useWorkingCapitalMonthly } from "@/data/statementsLive";
import { useBasisRows, aggregatePL, lastCompleteFromBasis } from "@/data/alignment";
import { monthKey, shiftMonthKey, monthKeyLabel } from "@/data/liveData";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";

const n = (v: number | null | undefined): number => v ?? 0;

const trailingRevenue = (basisData: ReturnType<typeof useBasisRows>["data"], endKey: string): number => {
  const win = { startKey: shiftMonthKey(endKey, -11), endKey };
  return aggregatePL(basisData?.rows, "STRICT", win).revenue;
};

export const DsoCard = ({ className }: { className?: string }) => {
  const { data: basis, isLoading: basisLoading } = useBasisRows();
  const ar = useArAging();
  const { data: wcRows, isLoading: wcLoading } = useWorkingCapitalMonthly();

  const arTotal = useMemo(
    () => (ar.data?.available ? ar.data.rows.reduce((s, r) => s + n(r.residual_amount), 0) : null),
    [ar.data],
  );

  const lastComplete = useMemo(() => lastCompleteFromBasis(basis?.rows), [basis]);

  const currentDso = useMemo(() => {
    if (arTotal === null || !lastComplete) return null;
    const rev = trailingRevenue(basis, lastComplete);
    if (rev <= 0) return null;
    return (arTotal / rev) * 365;
  }, [arTotal, basis, lastComplete]);

  const history = useMemo(() => {
    if (!wcRows || !lastComplete) return { points: [] as { key: string; dso: number }[], monthsAvailable: 0, excludedNegative: 0 };
    const sorted = [...wcRows]
      .map((r) => ({ key: monthKey(r.period_month), receivables: n(r.receivables) }))
      .filter((r) => r.key <= lastComplete)
      .sort((a, b) => a.key.localeCompare(b.key));
    const last12 = sorted.slice(-12);
    // Negative-book-value guard (2026-08-04, owner-audit #5): a month whose
    // v_working_capital_monthly.receivables is negative is on a different,
    // net basis than "Current DSO"'s always-non-negative ar_aging_v2 figure
    // (see DsoCard's header comment) — averaging a negative "own DSO" into
    // days-of-receivables produces a mathematically nonsensical negative
    // average. Such months are excluded from the average rather than
    // silently included, and the card discloses the exclusion.
    let excludedNegative = 0;
    const points = last12
      .map((m) => {
        if (m.receivables < 0) { excludedNegative += 1; return null; }
        const rev = trailingRevenue(basis, m.key);
        return rev > 0 ? { key: m.key, dso: (m.receivables / rev) * 365 } : null;
      })
      .filter((p): p is { key: string; dso: number } => p !== null);
    return { points, monthsAvailable: points.length, excludedNegative };
  }, [wcRows, basis, lastComplete]);

  const avgDso = history.points.length > 0
    ? history.points.reduce((s, p) => s + p.dso, 0) / history.points.length
    : null;

  const isLoading = basisLoading || wcLoading || (ar.isLoading && !ar.data);
  const deltaAbs = currentDso !== null && avgDso !== null ? currentDso - avgDso : null;
  const tone = deltaAbs === null ? "na" : Math.abs(deltaAbs) < 0.5 ? "flat" : deltaAbs > 0 ? "up" : "down";
  // For DSO, "up" (slower collection) uses the SAME mechanical up=azure/
  // down=red rule as every other circle/card in the cockpit — a plain
  // direction-of-change signal, not a value judgement baked into the color.
  const TONE_TEXT: Record<string, string> = { up: "text-success", down: "text-destructive", flat: "text-muted-foreground", na: "text-muted-foreground" };
  const Icon = tone === "up" ? TrendingUp : tone === "down" ? TrendingDown : Minus;

  return (
    <Card className={cn("p-6 shadow-sm animate-fade-in", className)}>
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h3 className="text-xl font-heading tracking-wide inline-flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-gold" /> DSO — AVERAGE COLLECTION TIME
        </h3>
        <DataSourceBadge source="live" sourceLabel="Live data from Supabase (ar_aging_v2 + v_pnl_basis + v_working_capital_monthly)" />
        <span className="text-xs text-muted-foreground">Live receivables + revenue data</span>
      </div>

      <p className="text-sm text-muted-foreground mb-4 inline-flex items-start gap-1.5">
        <span>
          DSO = Receivables (today's open book) ÷ trailing-12-month revenue × 365 — the more resilient
          annualised-revenue method, not a single-month approximation.
        </span>
        <Tooltip>
          <TooltipTrigger asChild><Info className="h-3.5 w-3.5 mt-0.5 text-gold/80 cursor-help shrink-0" /></TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm text-xs">
            Formula chosen because the data supports it cleanly: a live, precise "as of today" AR figure
            (ar_aging_v2) divided by a real trailing-12-month revenue figure (P&L basis rows), annualised
            ×365. The alternative "average AR over the period" variant needs a daily/weekly AR time series
            that does not exist in this warehouse — only month-end book values do — so it is not used here.
          </TooltipContent>
        </Tooltip>
      </p>

      {isLoading ? (
        <div className="h-28 rounded-lg bg-muted animate-pulse" />
      ) : currentDso === null ? (
        <p className="text-sm text-muted-foreground">
          Not enough data yet to compute DSO (needs a posted-cost month for trailing revenue, and a live AR
          aging figure).
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
          <div className="flex flex-col items-center sm:items-start">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Current DSO</span>
            <span className="font-heading text-4xl md:text-5xl tracking-tight tabular-nums">
              {currentDso.toFixed(0)} <span className="text-lg text-muted-foreground font-sans">days</span>
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              trailing 12m to {lastComplete ? monthKeyLabel(lastComplete) : "—"}
            </span>
          </div>

          <div className="flex flex-col items-center sm:items-start border-t sm:border-t-0 sm:border-l border-border/60 pt-4 sm:pt-0 sm:pl-6">
            <span className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
              Last-12-months average {history.monthsAvailable < 12 - history.excludedNegative && (
                <span className="text-amber-400">(only {history.monthsAvailable} mo. available)</span>
              )}
              {history.excludedNegative > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-amber-400 cursor-help" /></TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    {history.excludedNegative} of the trailing 12 months excluded — v_working_capital_monthly's
                    receivables book value is negative for those months (a net, not gross, figure), which would
                    produce a mathematically meaningless negative DSO if averaged in.
                  </TooltipContent>
                </Tooltip>
              )}
            </span>
            {avgDso === null ? (
              <span className="text-sm text-muted-foreground mt-1">
                {history.excludedNegative > 0
                  ? "n/m — every trailing month's receivables book value is negative (net basis), not comparable to Current DSO."
                  : "Not enough history yet."}
              </span>
            ) : (
              <>
                <span className="font-heading text-3xl md:text-4xl tracking-tight tabular-nums">
                  {avgDso.toFixed(0)} <span className="text-base text-muted-foreground font-sans">days</span>
                </span>
                <span className={cn("inline-flex items-center gap-1 text-sm font-semibold mt-1", TONE_TEXT[tone])}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {deltaAbs !== null ? `${deltaAbs > 0 ? "+" : ""}${deltaAbs.toFixed(0)} days vs average` : "—"}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
