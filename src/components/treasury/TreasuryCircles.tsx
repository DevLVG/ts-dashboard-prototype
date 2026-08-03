// TREASURY CIRCLES — the operational desk's top strip (Marcello's live-
// review spec, item 1): Receivables open · Receivables overdue · Payables
// open · Payables overdue, each with SAR + a count.
//
// VISUAL LANGUAGE: deliberately matches fix-4-kpi's KpiCircles exactly
// (src/components/overview/KpiCircles.tsx) — same ring/tone tokens, same
// value-shrink rule, same a11y pattern — so Treasury reads as ONE system
// with Economics, per Marcello's "clean, symmetric styling with the rest of
// the cockpit". KpiCircle itself isn't exported from that file (only the
// 3-metric container is), so — same call CashPositionCircle.tsx already
// made for the Cash Flow page — this is a deliberate visual match, not an
// import.
//
// COMPARISON HONESTY: ar_aging_v2 / ap_aging_v2 are "as of today" snapshots
// with no history of their own, so there is no honest "vs same time last
// period" figure for a stock/book-value number like this. What DOES exist,
// genuinely, is v_working_capital_monthly's month-end book values — so the
// two OPEN circles compare today's open book to the last completed month's
// book value (a real, if approximate, prior data point). The two OVERDUE
// circles have no equivalent historical breakdown anywhere in the
// warehouse (aging-by-bucket is never snapshotted monthly) — they honestly
// show "no comparison available" rather than inventing one, exactly the
// same "na" state KpiCircle already renders for a missing PY/Budget figure.
import { Fragment } from "react";
import { TrendingUp, TrendingDown, Minus, ArrowDownCircle, ArrowUpCircle, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fmtSAR, fmtDeltaSAR, fmtDeltaPct, pctChange } from "@/lib/format";

type Tone = "up" | "down" | "flat" | "na";
const DELTA_EPSILON = 0.5;

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
  up: "text-success", down: "text-destructive", flat: "text-muted-foreground", na: "text-muted-foreground",
};
const TONE_ICON: Record<Tone, typeof TrendingUp | null> = {
  up: TrendingUp, down: TrendingDown, flat: Minus, na: null,
};

const valueSizeClass = (formatted: string): string => {
  const len = formatted.length;
  if (len <= 7) return "text-3xl md:text-4xl";
  if (len <= 10) return "text-2xl md:text-3xl";
  return "text-xl md:text-2xl";
};

export interface TreasuryCircleMetric {
  key: string;
  label: string;
  value: number;
  count: number;
  countNoun: string; // "invoices" | "invoices overdue" | "bills" | "bills overdue"
  icon: React.ComponentType<{ className?: string }>;
  /** null = no honest comparison exists for this metric. */
  comparison: number | null;
  comparisonUnavailableReason?: string;
}

const TreasuryCircle = ({ metric, comparisonLabel }: { metric: TreasuryCircleMetric; comparisonLabel: string }) => {
  const deltaAbs = metric.comparison !== null ? metric.value - metric.comparison : null;
  const deltaPct = metric.comparison !== null ? pctChange(metric.value, metric.comparison) : null;
  const tone = toneOf(deltaAbs);
  const Icon = TONE_ICON[tone];
  const valueStr = fmtSAR(metric.value);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm animate-fade-in">
      <p className="text-xs md:text-sm uppercase tracking-wider text-muted-foreground font-semibold text-center inline-flex items-center gap-1.5">
        <metric.icon className="h-3.5 w-3.5 text-gold/80 shrink-0" aria-hidden />
        {metric.label}
      </p>

      <div
        className={cn(
          "relative flex h-36 w-36 md:h-40 md:w-40 shrink-0 items-center justify-center rounded-full border-[3px] bg-background/60 transition-colors",
          TONE_RING[tone],
        )}
        role="img"
        aria-label={`${metric.label}: ${valueStr} SAR, ${metric.count} ${metric.countNoun}${
          metric.comparison !== null
            ? `, ${fmtDeltaSAR(deltaAbs ?? 0)} SAR (${deltaPct !== null ? fmtDeltaPct(deltaPct) : "n/a"}) ${comparisonLabel.toLowerCase()}`
            : `, no ${comparisonLabel.toLowerCase()} comparison available`
        }`}
      >
        <div className="flex flex-col items-center px-2 text-center">
          <p className={cn("font-heading tracking-tight leading-none", valueSizeClass(valueStr))}>{valueStr}</p>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">SAR</p>
        </div>
      </div>

      <p className="text-sm font-semibold text-foreground text-center tabular-nums">
        {metric.count} {metric.countNoun}
      </p>

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
        <p className="text-[11px] text-muted-foreground text-center">{comparisonLabel}</p>
      </div>
    </div>
  );
};

export interface TreasuryCirclesProps {
  arTotal: number; arCount: number;
  arOverdue: number; arOverdueCount: number;
  apTotal: number; apCount: number;
  apOverdue: number; apOverdueCount: number;
  /** Last completed month's book values from v_working_capital_monthly —
   * null when that history isn't available yet. */
  lastMonthReceivables: number | null;
  lastMonthPayables: number | null;
  lastMonthLabel: string | null;
  isLoading: boolean;
  className?: string;
}

export const TreasuryCircles = ({
  arTotal, arCount, arOverdue, arOverdueCount, apTotal, apCount, apOverdue, apOverdueCount,
  lastMonthReceivables, lastMonthPayables, lastMonthLabel, isLoading, className,
}: TreasuryCirclesProps) => {
  const comparisonLabel = lastMonthLabel ? `vs ${lastMonthLabel} book value` : "vs last month-end";

  const metrics: TreasuryCircleMetric[] = [
    {
      key: "ar_open", label: "Receivables open", value: arTotal, count: arCount, countNoun: arCount === 1 ? "invoice" : "invoices",
      icon: ArrowDownCircle, comparison: lastMonthReceivables,
      comparisonUnavailableReason: "v_working_capital_monthly has no prior month yet.",
    },
    {
      key: "ar_overdue", label: "Receivables overdue", value: arOverdue, count: arOverdueCount, countNoun: arOverdueCount === 1 ? "invoice overdue" : "invoices overdue",
      icon: AlertTriangle, comparison: null,
      comparisonUnavailableReason: "No historical aging-bucket breakdown exists (only today's snapshot) — nothing honest to compare against yet.",
    },
    {
      key: "ap_open", label: "Payables open", value: apTotal, count: apCount, countNoun: apCount === 1 ? "bill" : "bills",
      icon: ArrowUpCircle, comparison: lastMonthPayables,
      comparisonUnavailableReason: "v_working_capital_monthly has no prior month yet.",
    },
    {
      key: "ap_overdue", label: "Payables overdue", value: apOverdue, count: apOverdueCount, countNoun: apOverdueCount === 1 ? "bill overdue" : "bills overdue",
      icon: AlertTriangle, comparison: null,
      comparisonUnavailableReason: "No historical aging-bucket breakdown exists (only today's snapshot) — nothing honest to compare against yet.",
    },
  ];

  return (
    <div className={cn("grid grid-cols-2 lg:grid-cols-4 gap-4", className)}>
      {isLoading
        ? [0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5">
              <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              <div className="h-36 w-36 md:h-40 md:w-40 rounded-full bg-muted animate-pulse" />
              <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            </div>
          ))
        : metrics.map((m) => <TreasuryCircle key={m.key} metric={m} comparisonLabel={comparisonLabel} />)}
    </div>
  );
};
