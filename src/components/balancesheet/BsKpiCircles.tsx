// BALANCE SHEET — the 3 circles: Fixed Assets / Equity / Liabilities.
//
// Visual language matches squad fix-4-kpi's KpiCircles.tsx exactly (ring
// size, tone rule, value-shrink logic) — reused for identity, not for code:
// their component (src/components/overview/KpiCircles.tsx, on origin as of
// this build) only exports the `useKpiHeaderData()`-bound wrapper, hardcoded
// to the P&L revenue/grossMargin/ebitda triplet, with no exported
// presentational primitive to import — and it's on the DO-NOT-EDIT list for
// this squad, so it can't be generalized here either. This file is a
// self-contained, visually-identical sibling for balance-sheet metrics.
// TODO(fix-4): if/when KpiCircles.tsx exports its inner <KpiCircle> as a
// metrics-in-as-props primitive, swap this file's <BsKpiCircle> for it and
// delete the duplicated styling below.
//
// Color rule (Marcello, explicit, same as the P&L circles): delta positive
// -> azure (--success token), delta negative -> red (--destructive token),
// applied LITERALLY by sign for all three circles — INCLUDING Liabilities —
// no inversion (a bigger balance is not tagged "bad" just because it sits on
// the liabilities side; keep it literal and consistent per the mandate).
import { Fragment } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fmtSAR, fmtDeltaSAR, fmtDeltaPct, pctChange } from "@/lib/format";

type Tone = "up" | "down" | "flat" | "na";
const DELTA_EPSILON = 0.5; // SAR — matches fmtDeltaSAR's own "0" rounding floor

const toneOf = (deltaAbs: number | null): Tone => {
  if (deltaAbs === null) return "na";
  if (Math.abs(deltaAbs) < DELTA_EPSILON) return "flat";
  return deltaAbs > 0 ? "up" : "down";
};

const TONE_RING: Record<Tone, string> = {
  up: "border-success ring-4 ring-success/20",
  down: "border-destructive ring-4 ring-destructive/20",
  flat: "border-border ring-4 ring-border/20",
  na: "border-border/70 ring-4 ring-border/10",
};
const TONE_TEXT: Record<Tone, string> = {
  up: "text-success",
  down: "text-destructive",
  flat: "text-muted-foreground",
  na: "text-muted-foreground",
};
const TONE_ICON: Record<Tone, typeof TrendingUp | null> = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
  na: null,
};

const valueSizeClass = (formatted: string): string => {
  const len = formatted.length;
  if (len <= 7) return "text-3xl md:text-4xl";
  if (len <= 10) return "text-2xl md:text-3xl";
  return "text-xl md:text-2xl";
};

export interface BsKpiMetric {
  key: string;
  label: string;
  actual: number;
  /** null = genuinely unavailable for this as-of/comparison combo — never a fabricated zero. */
  comparison: number | null;
  comparisonUnavailableReason?: string;
  /** Optional hover disclosure on the circle's main value — independent of
   *  comparison availability. Used by Balance Sheet's Equity/Liabilities
   *  circles to show the statutory vs shareholder-advance vs managerial
   *  breakdown (Marcello mandate, fix-20-bs-equity, 2026-08-03). */
  valueTooltip?: string;
}

const BsKpiCircle = ({ metric, comparisonLabel }: { metric: BsKpiMetric; comparisonLabel: string }) => {
  const deltaAbs = metric.comparison === null ? null : metric.actual - metric.comparison;
  const deltaPct = metric.comparison === null ? null : pctChange(metric.actual, metric.comparison);
  const tone = toneOf(deltaAbs);
  const Icon = TONE_ICON[tone];
  const valueStr = fmtSAR(metric.actual);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm animate-fade-in">
      <p className="text-xs md:text-sm uppercase tracking-wider text-muted-foreground font-semibold text-center">
        {metric.label}
      </p>

      {(() => {
        const circle = (
          <div
            className={cn(
              "relative flex h-36 w-36 md:h-40 md:w-40 shrink-0 items-center justify-center rounded-full border-[3px] bg-background/60 transition-colors",
              metric.valueTooltip ? "cursor-help" : "",
              TONE_RING[tone],
            )}
            role="img"
            aria-label={`${metric.label}: ${valueStr} SAR${
              metric.comparison !== null
                ? `, ${fmtDeltaSAR(deltaAbs ?? 0)} SAR (${deltaPct !== null ? fmtDeltaPct(deltaPct) : "n/a"}) ${comparisonLabel.toLowerCase()}`
                : `, no ${comparisonLabel.toLowerCase()} comparison available`
            }${metric.valueTooltip ? ` — ${metric.valueTooltip}` : ""}`}
          >
            <div className="flex flex-col items-center px-2 text-center">
              <p className={cn("font-heading tracking-tight leading-none", valueSizeClass(valueStr))}>{valueStr}</p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">SAR</p>
            </div>
          </div>
        );
        if (!metric.valueTooltip) return circle;
        return (
          <Tooltip>
            <TooltipTrigger asChild>{circle}</TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">{metric.valueTooltip}</TooltipContent>
          </Tooltip>
        );
      })()}

      <div className="flex flex-col items-center gap-0.5 min-h-[2.75rem] justify-center">
        {metric.comparison === null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground cursor-help">
                <Minus className="h-3.5 w-3.5" aria-hidden />
                —
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {metric.comparisonUnavailableReason ?? `No ${comparisonLabel.toLowerCase()} figure available.`}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", TONE_TEXT[tone])}>
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            {fmtDeltaSAR(deltaAbs ?? 0)}
            {deltaPct !== null && <Fragment> · {fmtDeltaPct(deltaPct)}</Fragment>}
          </span>
        )}
        <p className="text-[11px] text-muted-foreground text-center">vs {comparisonLabel}</p>
      </div>
    </div>
  );
};

export const BsKpiCircles = ({
  metrics, comparisonLabel, className,
}: { metrics: BsKpiMetric[]; comparisonLabel: string; className?: string }) => (
  <div className={cn("grid grid-cols-1 sm:grid-cols-3 gap-4", className)}>
    {metrics.map((m) => (
      <BsKpiCircle key={m.key} metric={m} comparisonLabel={comparisonLabel} />
    ))}
  </div>
);
