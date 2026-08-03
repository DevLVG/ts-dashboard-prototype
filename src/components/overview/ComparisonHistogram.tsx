// COMPARISON HISTOGRAM — Marcello's live-review sketch: below the KPI
// circles, a current-vs-comparison bar pair per KPI (Revenue / Gross Margin /
// EBITDA reported), with the +/- delta called out in ABSOLUTE SAR value.
//
// Three independently-scaled small multiples (one bar-pair group per KPI),
// never one shared axis — Revenue, Gross Margin and EBITDA reported sit at
// very different magnitudes (and EBITDA can be negative), so a single shared
// scale would either flatten two series or force a misleading dual axis
// (dataviz anti-pattern). Each group carries its own zero baseline.
//
// Bar identity (2 series: "This period" vs the active comparison) is
// encoded BOTH by hue (gold = current, matching the "Actual" bars in the
// trend charts below) AND by fill treatment (solid vs a lighter
// outlined/hollow fill) — a shape-level distinction independent of hue, kept
// on purpose because gold-vs-neutral sits in this theme's low-CVD-separation
// band (validated with the dataviz skill's palette validator: ~14 ΔE dark /
// ~79 ΔE light — dark mode is the tight case). Category names are ALWAYS
// direct-labeled under each bar too, so identity never depends on color
// alone (the skill's mandatory secondary encoding for a borderline pair).
//
// The delta callout (badge above each group) is the ONLY place the
// azure/red STATUS color appears in this chart — status and series-identity
// never share a color in the same view (dataviz collision rule).
//
// Page-agnostic — same `useKpiHeaderData` hook as KpiCircles, no page coupling.
import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { useKpiHeaderData, type KpiHeaderMetric } from "@/hooks/useKpiHeaderData";
import { fmtSAR, fmtDeltaSAR, fmtDeltaPct, fmtCompact } from "@/lib/format";

type Tone = "up" | "down" | "flat" | "na";
const DELTA_EPSILON = 0.5;
const toneOf = (deltaAbs: number | null): Tone => {
  if (deltaAbs === null) return "na";
  if (Math.abs(deltaAbs) < DELTA_EPSILON) return "flat";
  return deltaAbs > 0 ? "up" : "down";
};
const TONE_TEXT: Record<Tone, string> = {
  up: "text-success", down: "text-destructive", flat: "text-muted-foreground", na: "text-muted-foreground",
};
const TONE_BADGE: Record<Tone, string> = {
  up: "bg-success/10 text-success", down: "bg-destructive/10 text-destructive",
  flat: "bg-muted text-muted-foreground", na: "bg-muted text-muted-foreground",
};
const TONE_ICON: Record<Tone, typeof TrendingUp | null> = {
  up: TrendingUp, down: TrendingDown, flat: Minus, na: null,
};

interface BarDatum { name: string; value: number; kind: "current" | "comparison" }

const GOLD_FILL = "hsl(var(--gold) / 0.85)";
const COMPARISON_FILL = "hsl(var(--foreground) / 0.16)";
const COMPARISON_STROKE = "hsl(var(--foreground) / 0.65)";

/** 4px rounded data-end, square at the baseline (dataviz mark spec) — the
 * rounded corners sit on whichever end is FAR from zero: top for a positive
 * bar, bottom for a negative one. Recharts' own `radius` prop rounds all 4
 * corners the same way regardless of sign, so this is a small custom shape. */
const roundedBarPath = (x: number, y: number, w: number, h: number, r: number, roundTop: boolean): string => {
  const rr = Math.max(0, Math.min(r, h, w / 2));
  if (h <= 0 || w <= 0) return "";
  return roundTop
    ? `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`
    : `M${x},${y} L${x + w},${y} L${x + w},${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} L${x + rr},${y + h} Q${x},${y + h} ${x},${y + h - rr} Z`;
};

const BarShape = (props: {
  x?: number; y?: number; width?: number; height?: number; payload?: BarDatum;
}) => {
  const { x = 0, y = 0, width = 0, height: rawHeight = 0, payload } = props;
  // Recharts gives a SIGNED height for negative bars: a negative `height`
  // means "extends upward from y by |height|" (top = y + height), rather
  // than the plain positive-rect-from-top convention a custom shape might
  // assume — normalize to an actual top/height pair before drawing.
  const top = rawHeight < 0 ? y + rawHeight : y;
  const height = Math.abs(rawHeight);
  const isCurrent = payload?.kind === "current";
  const isPositive = (payload?.value ?? 0) >= 0;
  const d = roundedBarPath(x, top, width, height, 4, isPositive);
  if (!d) return null;
  return (
    <path
      d={d}
      fill={isCurrent ? GOLD_FILL : COMPARISON_FILL}
      stroke={isCurrent ? "none" : COMPARISON_STROKE}
      strokeWidth={isCurrent ? 0 : 1.5}
    />
  );
};

/** Direct value label at the bar's far end (tip) — always visible, never
 * hover-only (dataviz: tooltips enhance, never gate). */
const ValueLabel = (props: { x?: number; y?: number; width?: number; value?: number }) => {
  const { x = 0, y = 0, width = 0, value = 0 } = props;
  const cx = x + width / 2;
  const isNeg = value < 0;
  // Recharts' raw `y` for a negative bar already sits at the tip (the far,
  // more-negative end) — see the `BarShape` comment above for the full
  // signed-height convention this mirrors. No `height` term needed here.
  const cy = isNeg ? y + 13 : y - 6;
  return (
    <text x={cx} y={cy} textAnchor="middle" fontSize={11} fontWeight={600} fill="hsl(var(--foreground))">
      {fmtCompact(value)}
    </text>
  );
};

const HistogramTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: BarDatum }> }) => {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">{d.name}</p>
      <p className="chart-tooltip-content">{fmtSAR(d.value)} SAR</p>
    </div>
  );
};

const KpiBarGroup = ({ metric, comparisonLabel, mtdProrated, windowName }: {
  metric: KpiHeaderMetric;
  comparisonLabel: string;
  mtdProrated: boolean;
  windowName: string;
}) => {
  const tone = toneOf(metric.deltaAbs);
  const Icon = TONE_ICON[tone];
  const data: BarDatum[] = useMemo(() => {
    if (metric.actual === null) return [];
    const out: BarDatum[] = [{ name: "This period", value: metric.actual, kind: "current" }];
    if (metric.comparison !== null) out.push({ name: comparisonLabel, value: metric.comparison, kind: "comparison" });
    return out;
  }, [metric.actual, metric.comparison, comparisonLabel]);

  // Literal numeric domain (never Recharts' function-callback domain form —
  // with a single negative-only data point it silently resolves to a
  // degenerate [0,0] range and the bar disappears). Always zero-inclusive so
  // the baseline sits on the plot even when every value shares one sign.
  // Padded 20% past the data range on both ends — without headroom a bar
  // that IS the domain extreme fills the plot edge-to-edge, leaving no room
  // for its own direct value label (which sits just past the bar's tip) and
  // colliding with the category-axis text below it.
  //
  // Both `useMemo` hooks above/below run UNCONDITIONALLY on every render —
  // the empty-window early return sits AFTER them (Rules of Hooks: a hook
  // can never be skipped based on a condition). `data` is already `[]` for
  // an unfed window, and the `lo === hi` guard below degrades that
  // gracefully to `[-1, 1]` — the computed `domain` is simply unused in that
  // branch's JSX.
  const domain = useMemo((): [number, number] => {
    const values = data.map((d) => d.value);
    const lo = Math.min(0, ...values);
    const hi = Math.max(0, ...values);
    if (lo === hi) return [-1, 1];
    const pad = (hi - lo) * 0.2;
    return [lo - pad, hi + pad];
  }, [data]);

  // Absent ≠ zero (2026-08-03 add-on): a fully unfed window (e.g. a future
  // calendar quarter) has no honest bar to draw at all — a 0-height "This
  // period" bar would misrepresent "no data" as "measured zero" (dataviz
  // anti-pattern). Same card shell/height as the populated state, so the grid
  // doesn't jump, with a plain empty-state message instead of an axis.
  if (metric.actual === null) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{metric.label}</p>
        </div>
        <div className="h-[192px] flex items-center justify-center text-center px-4">
          <p className="text-xs text-muted-foreground">No data posted yet for {windowName}.</p>
        </div>
        <p className="text-[11px] text-muted-foreground text-center min-h-[1rem]"> </p>
      </div>
    );
  }

  const summary = `${metric.label} — this period ${fmtSAR(metric.actual)} SAR vs ${comparisonLabel} ${
    metric.comparison === null ? "not available" : `${fmtSAR(metric.comparison)} SAR`
  }${metric.comparison !== null ? `, delta ${fmtDeltaSAR(metric.deltaAbs ?? 0)} SAR` : ""}`;

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{metric.label}</p>
        {metric.comparison === null ? (
          <span className="text-[11px] font-semibold text-muted-foreground">
            No {comparisonLabel.toLowerCase()} figure
          </span>
        ) : (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", TONE_BADGE[tone])}>
            {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
            {fmtDeltaSAR(metric.deltaAbs ?? 0)}
            {metric.deltaPct !== null && ` · ${fmtDeltaPct(metric.deltaPct)}`}
          </span>
        )}
      </div>

      <div role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height={192}>
          {/* bottom margin gives a negative bar's direct label (drawn BELOW
              its tip) clearance from the category axis text under it. */}
          <BarChart data={data} margin={{ top: 22, right: 8, bottom: 18, left: 8 }} barCategoryGap="40%">
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
            <RTooltip content={<HistogramTooltip />} cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            />
            <YAxis hide domain={domain} />
            <Bar dataKey="value" maxBarSize={48} isAnimationActive={false} shape={BarShape} label={ValueLabel} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[11px] text-muted-foreground text-center min-h-[1rem]">
        {mtdProrated && metric.comparison !== null ? `${comparisonLabel} pro-rated to elapsed days` : " "}
      </p>
    </div>
  );
};

export const ComparisonHistogram = ({ className }: { className?: string }) => {
  const { metrics, isLoading, isError, comparisonLabel, mtdProrated, windowName } = useKpiHeaderData();

  if (isError) {
    return <p className={cn("text-sm text-destructive", className)}>Could not load the comparison figures.</p>;
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Shared legend — one identity encoding for all three groups below,
          never repeated per-chart (dataviz: legend once, scopes everything). */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: GOLD_FILL }} aria-hidden />
          This period
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-sm border"
            style={{ background: COMPARISON_FILL, borderColor: COMPARISON_STROKE }}
            aria-hidden
          />
          {comparisonLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading && metrics.length === 0
          ? [0, 1, 2].map((i) => <div key={i} className="h-[236px] rounded-xl border border-border bg-card animate-pulse" />)
          : metrics.map((m) => (
              <KpiBarGroup key={m.key} metric={m} comparisonLabel={comparisonLabel} mtdProrated={mtdProrated} windowName={windowName} />
            ))}
      </div>
    </div>
  );
};
