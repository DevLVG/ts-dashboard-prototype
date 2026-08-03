// BIG CASH CIRCLE — matches fix-4-kpi's KpiCircles visual language exactly
// (same ring/tone tokens, same value-shrink rule, same a11y pattern) so the
// Cash Flow page reads as ONE system with Economics. KpiCircle itself isn't
// exported (only the 3-metric `KpiCircles` container is), so the single-
// metric circle here is a deliberate visual match rather than an import —
// per the brief: "reuse the component if mountable, else match its style
// exactly."
//
// Color rule (Marcello, explicit, same as KpiCircles): delta positive ->
// azure (`--success`), delta negative -> red (`--destructive`). Meaning
// always carries in text + icon too, never in ring color alone.
import { Fragment } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { CashPoint } from "@/hooks/useCashFlowPageData";
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

export const CashPositionCircle = ({
  actual, comparison, comparisonLabel, className,
}: {
  actual: CashPoint;
  comparison: CashPoint;
  comparisonLabel: string;
  className?: string;
}) => {
  const deltaAbs = actual.value !== null && comparison.value !== null ? actual.value - comparison.value : null;
  const deltaPct = actual.value !== null && comparison.value !== null ? pctChange(actual.value, comparison.value) : null;
  const tone = toneOf(deltaAbs);
  const Icon = TONE_ICON[tone];
  const valueStr = actual.value === null ? "—" : fmtSAR(actual.value);

  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm animate-fade-in", className)}>
      <p className="text-xs md:text-sm uppercase tracking-wider text-muted-foreground font-semibold text-center">
        Total cash on hand
      </p>

      <div
        className={cn(
          "relative flex h-36 w-36 md:h-44 md:w-44 shrink-0 items-center justify-center rounded-full border-[3px] bg-background/60 transition-colors",
          TONE_RING[tone],
        )}
        role="img"
        aria-label={`Total cash on hand: ${actual.value === null ? "not available" : `${valueStr} SAR`}${
          comparison.value !== null
            ? `, ${fmtDeltaSAR(deltaAbs ?? 0)} SAR (${deltaPct !== null ? fmtDeltaPct(deltaPct) : "n/a"}) ${comparisonLabel.toLowerCase()}`
            : `, no ${comparisonLabel.toLowerCase()} comparison available`
        }`}
      >
        <div className="flex flex-col items-center px-2 text-center">
          <p className={cn("font-heading tracking-tight leading-none", valueSizeClass(valueStr))}>{valueStr}</p>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">SAR</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-0.5 min-h-[2.75rem] justify-center">
        {comparison.value === null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground cursor-help">
                <Minus className="h-3.5 w-3.5" aria-hidden />
                —
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {comparison.unavailableReason ?? `No ${comparisonLabel.toLowerCase()} figure for this window.`}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", TONE_TEXT[tone])}>
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            {fmtDeltaSAR(deltaAbs ?? 0)}
            {deltaPct !== null && <Fragment> · {fmtDeltaPct(deltaPct)}</Fragment>}
          </span>
        )}
        <p className="text-[11px] text-muted-foreground text-center">
          vs {comparisonLabel}
          {actual.isLive ? " (live bank position)" : ""}
        </p>
      </div>
    </div>
  );
};
