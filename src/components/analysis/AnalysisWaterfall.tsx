// P&L waterfall on LIVE data — same visual grammar as the retired mock
// waterfall (stacked transparent-base bars, variance-tinted fills, rounded
// corners, click-to-drill) but built from the analysis lines, so it follows
// the selected period/BU/view. In Management view the build-down inserts the
// FR-1 block: OpEx (underlying) -> EBITDA Underlying -> Non-Recurring ->
// EBITDA Reported.
import { Card } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, LabelList,
} from "recharts";
import { getVarianceHexColor } from "@/lib/varianceColors";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { useIsMobile } from "@/hooks/use-mobile";
import { fmtCompact } from "@/lib/format";

/** Compact x-axis labels for narrow viewports (≤768px) — the full labels
 * overlap at 390px with 9-11 bars (punch item 7). */
const SHORT_LABELS: Record<string, string> = {
  "Revenue": "Rev",
  "COGS": "COGS",
  "Gross Margin": "GM",
  "OpEx": "OpEx",
  "OpEx (underlying)": "OpEx",
  "EBITDA Underlying": "EBITDA U.",
  "Non-Recurring": "Non-rec",
  "Recurring EBITDA": "Rec. EBITDA",
  "Project Costs": "Proj.",
  "EBITDA incl. PC": "incl. PC",
  "D&A": "D&A",
  "EBIT": "EBIT",
};
import {
  COMPARISON_LABELS,
  fmtSar,
  variancePct,
  type AnalysisLine,
  type ComparisonKind,
  type PLViewMode,
} from "@/data/analysisModel";

interface AnalysisWaterfallProps {
  lines: AnalysisLine[];
  comps: ComparisonKind[];
  view: PLViewMode;
  periodLabel: string;
  scope: string;
  onDrill: (lineKey: string) => void;
}

interface WaterfallItem {
  key: string;
  label: string;
  value: number;
  comps: Partial<Record<ComparisonKind, number | null>>;
  type: "total" | "subtotal" | "decrease";
  start: number;
  end: number;
}

const hexToRgba = (hex: string, opacity: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const GOLD = "#c9b37e"; // neutral fallback when no comparison is available

export const AnalysisWaterfall = ({
  lines, comps, view, periodLabel, scope, onDrill,
}: AnalysisWaterfallProps) => {
  const isMobile = useIsMobile();
  const byKey = new Map(lines.map((l) => [l.key, l]));
  const L = (k: string): AnalysisLine | undefined => byKey.get(k);

  // Build-down sequence: [lineKey, label, type] — G3 structure since
  // migration 018: Recurring EBITDA -> Project Costs -> EBITDA incl. PC.
  const seq: [string, string, WaterfallItem["type"]][] = view === "management"
    ? [
        ["revenue", "Revenue", "total"],
        ["cogs", "COGS", "decrease"],
        ["gm", "Gross Margin", "subtotal"],
        ["opex", "OpEx (underlying)", "decrease"],
        ["ebitdaU", "EBITDA Underlying", "subtotal"],
        ["nonRecurring", "Non-Recurring", "decrease"],
        ["ebitda", "Recurring EBITDA", "subtotal"],
        ["projectCosts", "Project Costs", "decrease"],
        ["ebitdaIncl", "EBITDA incl. PC", "subtotal"],
        ["da", "D&A", "decrease"],
        ["ebit", "EBIT", "total"],
      ]
    : [
        ["revenue", "Revenue", "total"],
        ["cogs", "COGS", "decrease"],
        ["gm", "Gross Margin", "subtotal"],
        ["opex", "OpEx", "decrease"],
        ["ebitda", "Recurring EBITDA", "subtotal"],
        ["projectCosts", "Project Costs", "decrease"],
        ["ebitdaIncl", "EBITDA incl. PC", "subtotal"],
        ["da", "D&A", "decrease"],
        ["ebit", "EBIT", "total"],
      ];

  // "opex" is a synthetic bar = sum of the OpEx lines in the current view,
  // plus the (tiny) Unmapped slice so the walk lands exactly on the recurring
  // EBITDA subtotal (bridge convention counts Unmapped inside recurring; the
  // table shows it as its own line when nonzero).
  const opexKeys = view === "management"
    ? ["opexPeople", "opexMs", "opexGaU", "unmapped"]
    : ["opexPeople", "opexMs", "opexGa", "unmapped"];
  const sumComp = (keys: string[], c: ComparisonKind): number | null => {
    let acc = 0;
    for (const k of keys) {
      const line = L(k);
      if (!line) continue; // conditional line (e.g. Unmapped) not present -> 0
      const v = line.comps[c];
      if (v === null || v === undefined) {
        // Unmapped never has a budget by construction — count it as 0
        // instead of voiding the whole synthetic bar's comparison.
        if (k === "unmapped") continue;
        return null;
      }
      acc += v;
    }
    return acc;
  };
  const synthetic = (keys: string[]): { value: number; comps: WaterfallItem["comps"] } => ({
    value: keys.reduce((a, k) => a + (L(k)?.actual ?? 0), 0),
    comps: Object.fromEntries(comps.map((c) => [c, sumComp(keys, c)])),
  });

  let cumulative = 0;
  const items: WaterfallItem[] = seq.map(([key, fullLabel, type]) => {
    const label = isMobile ? (SHORT_LABELS[fullLabel] ?? fullLabel) : fullLabel;
    const src = key === "opex" ? synthetic(opexKeys) : {
      value: L(key)?.actual ?? 0,
      comps: Object.fromEntries(comps.map((c) => [c, L(key)?.comps[c] ?? null])),
    };
    if (type === "total" || type === "subtotal") {
      cumulative = src.value;
      return { key, label, type, value: src.value, comps: src.comps, start: 0, end: src.value };
    }
    const prev = cumulative;
    cumulative = prev + src.value; // costs are negative
    return {
      key, label, type, value: src.value, comps: src.comps,
      start: Math.min(prev, cumulative), end: Math.max(prev, cumulative),
    };
  });

  // Colour: variance vs the FIRST active comparison that has a value
  const barColors = (it: WaterfallItem): { fill: string; stroke: string } => {
    let base = GOLD;
    for (const c of comps) {
      const cv = it.comps[c];
      if (cv !== null && cv !== undefined && cv !== 0) {
        const pct = variancePct(it.value, cv);
        if (pct !== null) base = getVarianceHexColor(pct, "Revenue");
        break;
      }
    }
    // Legible tints: the old 0.10/0.15 fills composited to ~1.2:1 contrast on
    // the dark surface (invisible). Fill 0.40 + full-opacity stroke keeps the
    // ghost-bar grammar while passing the 3:1 mark-contrast check.
    return {
      fill: hexToRgba(base, 0.4),
      stroke: base,
    };
  };

  const maxEnd = Math.max(...items.map((i) => i.end), 0);
  const minStart = Math.min(...items.map((i) => i.start), 0);
  const pad = (maxEnd - minStart) * 0.12 || 1;

  const renderLabel = (props: { x?: number | string; y?: number | string; width?: number | string; index?: number }) => {
    const { x, y, width, index } = props;
    if (index === undefined) return null;
    const it = items[index];
    if (!it) return null;
    const xc = Number(x) + Number(width) / 2;
    const yc = Math.max(Number(y) - 8, 14);
    // Mobile: compact value labels, ANCHORS/SUBTOTALS only — labeling every
    // delta bar collides at 390px (item 7); deltas stay on the tooltip.
    if (isMobile && it.type === "decrease") return null;
    const txt = isMobile
      ? fmtCompact(it.value)
      : it.value < 0 ? `-${fmtSar(Math.abs(it.value))}` : fmtSar(it.value);
    return (
      <text x={xc} y={yc} fill="hsl(36 25% 92%)" textAnchor="middle" fontSize={isMobile ? 9 : 12} fontWeight={600} style={{ pointerEvents: "none" }}>
        {txt}
      </text>
    );
  };

  return (
    <Card className="p-6 animate-fade-in">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold text-foreground inline-flex items-center gap-2">
            P&amp;L Waterfall — Build Down
            <DataSourceBadge source="live" />
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {scope} · {periodLabel} · Revenue to EBIT · click a bar to drill{" "}
            <span className="text-xs">SAR</span>
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={items} margin={{ top: 24, right: 30, left: 20, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis
            dataKey="label"
            angle={isMobile ? -42 : -30}
            textAnchor="end"
            height={isMobile ? 56 : 70}
            stroke="hsl(var(--muted-foreground))"
            fontSize={isMobile ? 9.5 : 12}
            interval={0}
          />
          <YAxis
            tickFormatter={(v: number) => fmtSar(v)}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            domain={[Math.min(minStart - pad, 0), maxEnd + pad]}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const it = payload[0].payload as WaterfallItem;
              return (
                <div className="chart-tooltip">
                  <p className="chart-tooltip-title">{it.label}</p>
                  <div className="chart-tooltip-content space-y-1">
                    <p className="text-popover-foreground">
                      <span className="font-semibold">Actual:</span> {fmtSar(it.value)}
                    </p>
                    {comps.map((c) => {
                      const cv = it.comps[c];
                      const pct = cv === null || cv === undefined ? null : variancePct(it.value, cv);
                      return (
                        <p key={c} className="text-muted-foreground">
                          <span className="font-semibold">{COMPARISON_LABELS[c]}:</span>{" "}
                          {cv === null || cv === undefined ? "n/a" : fmtSar(cv)}
                          {pct !== null && (
                            <span className="ml-1.5">({pct > 0 ? "+" : ""}{pct.toFixed(1)}%)</span>
                          )}
                        </p>
                      );
                    })}
                  </div>
                </div>
              );
            }}
            cursor={{ fill: "hsl(var(--muted))" }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1.5} />
          {/* Animation off: filters/view switches re-feed the data and a
              re-animating chart blanks out between states. */}
          <Bar dataKey="start" stackId="a" fill="transparent" isAnimationActive={false} />
          <Bar
            dataKey={(entry: WaterfallItem) => entry.end - entry.start}
            stackId="a"
            isAnimationActive={false}
            strokeWidth={2}
            radius={[8, 8, 8, 8]}
            onClick={(data: unknown) => {
              const d = data as { key?: string; payload?: { key?: string } };
              const k = d?.key ?? d?.payload?.key;
              if (k) onDrill(k);
            }}
            cursor="pointer"
          >
            {items.map((it) => {
              const { fill, stroke } = barColors(it);
              return <Cell key={it.key} fill={fill} stroke={stroke} />;
            })}
            <LabelList content={renderLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
