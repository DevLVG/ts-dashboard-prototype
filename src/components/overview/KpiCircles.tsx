// KPI CIRCLES — Marcello's live-review sketch (paper drawing, verbal spec):
// a row of three circular badges — Revenue / Gross Margin / EBITDA (reported)
// — each showing the absolute SAR value for the selected window and the
// delta (SAR + %) vs whichever comparison the global toggle currently shows
// (Versus Previous Year / Versus Budget).
//
// Color rule (Marcello, explicit): delta positive -> azure, delta negative
// -> red, applied to the delta text AND the circle's accent ring. This reuses
// the app's EXISTING `--success` / `--destructive` tokens rather than
// inventing new hex values — `--success` in this theme is already the azure
// hue (195° — see index.css / `deltaColor` in PnLOverview.tsx), so "positive
// = azure" is the house style, not a new color decision.
//
// The ring is a DECORATIVE accent, never a proportional gauge/arc-fill: there
// is no honest 0-100% denominator for Revenue/GM/EBITDA to fill a ring
// against, so faking one would misrepresent magnitude (dataviz anti-pattern:
// a meter needs a real limit). Meaning always carries in the text + icon,
// never in the ring color alone (WCAG "color not the only indicator").
//
// Page-agnostic: reads only `useKpiHeaderData` (itself reading the global
// window/Comparison/Scope controls) — no page-specific coupling, mountable
// anywhere the AlignmentProvider + QueryClient context is available.
import { Fragment } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useKpiHeaderData, type KpiHeaderMetric } from "@/hooks/useKpiHeaderData";
import { fmtSAR, fmtDeltaSAR, fmtDeltaPct } from "@/lib/format";

type Tone = "up" | "down" | "flat" | "na";

const DELTA_EPSILON = 0.5; // SAR — matches fmtDeltaSAR's own "0" rounding floor

const toneOf = (deltaAbs: number | null): Tone => {
  if (deltaAbs === null) return "na";
  if (Math.abs(deltaAbs) < DELTA_EPSILON) return "flat";
  return deltaAbs > 0 ? "up" : "down";
};

// Fixed, literal Tailwind class strings per tone (dynamic `border-${x}`
// interpolation would silently miss Tailwind's static class extraction).
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

/** Shrink the value font as the formatted string grows, so "1,234,567" and
 * "(88,412)" both stay inside the circle with comfortable padding — measured
 * by character count (proportional figures, per dataviz: never `tabular-nums`
 * on a large standalone number). */
const valueSizeClass = (formatted: string): string => {
  const len = formatted.length;
  if (len <= 7) return "text-3xl md:text-4xl";
  if (len <= 10) return "text-2xl md:text-3xl";
  return "text-xl md:text-2xl";
};

const KpiCircle = ({ metric, comparisonLabel, mtdProrated }: {
  metric: KpiHeaderMetric;
  comparisonLabel: string;
  mtdProrated: boolean;
}) => {
  const tone = toneOf(metric.deltaAbs);
  const Icon = TONE_ICON[tone];
  const valueStr = fmtSAR(metric.actual);

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm animate-fade-in">
      <p className="text-xs md:text-sm uppercase tracking-wider text-muted-foreground font-semibold text-center">
        {metric.label}
      </p>

      <div
        className={cn(
          "relative flex h-36 w-36 md:h-40 md:w-40 shrink-0 items-center justify-center rounded-full border-[3px] bg-background/60 transition-colors",
          TONE_RING[tone],
        )}
        role="img"
        aria-label={`${metric.label}: ${valueStr} SAR${
          metric.comparison !== null
            ? `, ${fmtDeltaSAR(metric.deltaAbs ?? 0)} SAR (${metric.deltaPct !== null ? fmtDeltaPct(metric.deltaPct) : "n/a"}) ${comparisonLabel.toLowerCase()}`
            : `, no ${comparisonLabel.toLowerCase()} comparison available`
        }`}
      >
        <div className="flex flex-col items-center px-2 text-center">
          <p className={cn("font-heading tracking-tight leading-none", valueSizeClass(valueStr))}>{valueStr}</p>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">SAR</p>
        </div>
      </div>

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
              {metric.comparisonUnavailableReason ?? `No ${comparisonLabel.toLowerCase()} figure for this window.`}
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className={cn("inline-flex items-center gap-1 text-sm font-semibold", TONE_TEXT[tone])}>
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            {fmtDeltaSAR(metric.deltaAbs ?? 0)}
            {metric.deltaPct !== null && <Fragment> · {fmtDeltaPct(metric.deltaPct)}</Fragment>}
          </span>
        )}
        <p className="text-[11px] text-muted-foreground text-center">
          vs {comparisonLabel}
          {mtdProrated && metric.comparison !== null ? " (pro-rated)" : ""}
        </p>
      </div>
    </div>
  );
};

export const KpiCircles = ({ className }: { className?: string }) => {
  const { metrics, isLoading, isError, comparisonLabel, mtdProrated } = useKpiHeaderData();

  if (isError) {
    return (
      <p className={cn("text-sm text-destructive", className)}>
        Could not load the KPI figures.
      </p>
    );
  }

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-3 gap-4", className)}>
      {isLoading && metrics.length === 0
        ? [0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5">
              <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              <div className="h-36 w-36 md:h-40 md:w-40 rounded-full bg-muted animate-pulse" />
              <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            </div>
          ))
        : metrics.map((m) => (
            <KpiCircle key={m.key} metric={m} comparisonLabel={comparisonLabel} mtdProrated={mtdProrated} />
          ))}
    </div>
  );
};
