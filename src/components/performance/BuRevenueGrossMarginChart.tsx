// BY BUSINESS UNIT — Economics page, CEO mandate 2026-08-08 (Marcello):
// a graphical view of Revenue and Gross Margin per business unit, in the
// window/comparison/scope the page already has selected. Mounted between the
// KPI circles/histogram and the P&L table in PerformanceAnalysis.tsx, which
// owns all the aggregation (see the `buChartData` memo there) — this file is
// pure presentation, same split as KpiCircles/ComparisonHistogram vs
// useKpiHeaderData.
//
// STOPS AT GROSS MARGIN, ON PURPOSE (CEO-accepted, not a TODO): OPEX-GA /
// OPEX-MS / OPEX-People / Project-Costs / D&A / NON-OP are 100% bu="CORP" by
// MoA design (verified in moaTree.ts, fix-24's own comment) — there is no
// real per-BU indirect-cost split to show below Gross Margin today. If
// EBITDA-per-BU is ever wanted, an indirect-cost allocation policy has to
// exist FIRST (a real methodology, ratified by the CEO) — do not add a
// pro-rata/fabricated EBITDA-per-BU row here to "complete" this chart; that
// would misrepresent an invented allocation as a measured fact.
//
// "Absent ≠ zero" everywhere: a BU/window/scope combination with no posted
// data renders as an honest gap (no bar) plus a plain-English footnote
// listing which BUs are missing — never a fabricated zero-height bar or a
// meaningless +/-100% delta. Same rule the rest of this page already applies
// (see `monthsCoveredInWin` in PerformanceAnalysis.tsx).
//
// Reconciliation (non-negotiable, CEO instruction): every number here is
// read straight off `aggregatePL`/`aggregateBudgetWindow` (data/alignment.ts)
// with the SAME rows/window/scope the P&L table below uses, and the "does
// this row even have data" gates are the table's OWN whole-company flags
// (`sectionHasData(tree,"Revenue")`, `actualSub/priorSub.hasGrossMargin`) —
// not a per-BU recomputation. That distinction matters concretely: Private
// Events and Competitions have zero moa_gestionale COGS accounts (a real MoA
// gap, not a bug — see PerformanceAnalysis.tsx's Gross Margin family
// explosion comment), so their Gross Margin legitimately equals 100% of
// their Revenue. Gating per-BU on "this BU has its own COGS rows" would
// wrongly blank those two out and silently disagree with the table.
import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, ReferenceLine, LabelList,
} from "recharts";
import { fmtSAR, fmtCompact } from "@/lib/format";

export interface BuChartDatum {
  bu: string;
  buName: string;
  revenueActual: number | null;
  revenueComparison: number | null;
  gmActual: number | null;
  gmComparison: number | null;
}

interface ChartRow { bu: string; buName: string; actual: number | null; comparison: number | null }

const GOLD_FILL = "hsl(var(--gold) / 0.85)";
const COMPARISON_FILL = "hsl(var(--foreground) / 0.16)";
const COMPARISON_STROKE = "hsl(var(--foreground) / 0.65)";

const BuTooltip = ({ active, payload, comparisonLabel }: {
  active?: boolean; payload?: Array<{ payload: ChartRow }>; comparisonLabel: string;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">{d.buName}</p>
      <div className="chart-tooltip-content">
        <p className="chart-tooltip-actual">This period: {d.actual === null ? "—" : `${fmtSAR(d.actual)} SAR`}</p>
        <p className="chart-tooltip-budget">
          {comparisonLabel}: {d.comparison === null ? "not available" : `${fmtSAR(d.comparison)} SAR`}
        </p>
      </div>
    </div>
  );
};

/** One bar-pair-per-BU panel — same visual grammar as ComparisonHistogram
 * (gold solid = this period, hollow/outlined = the active comparison), laid
 * out as horizontal grouped bars so 7 BU names (incl. "Horse School",
 * "Private Events") stay legible at 390px without rotated axis labels. */
const BuBarPanel = ({ title, rows, comparisonLabel, showComparison, comparisonUnavailableNote, mtdProrated }: {
  title: string;
  rows: ChartRow[];
  comparisonLabel: string;
  showComparison: boolean;
  comparisonUnavailableNote?: string;
  mtdProrated: boolean;
}) => {
  // Zero-inclusive, padded domain (ComparisonHistogram's own rule) — a BU can
  // run a negative Gross Margin in a given window (costs > revenue), so the
  // axis must never assume every value shares one sign.
  const domain = useMemo((): [number, number] => {
    const values = rows
      .flatMap((r) => [r.actual, showComparison ? r.comparison : null])
      .filter((v): v is number => v !== null);
    if (values.length === 0) return [-1, 1];
    const lo = Math.min(0, ...values);
    const hi = Math.max(0, ...values);
    if (lo === hi) return [-1, 1];
    const pad = (hi - lo) * 0.18;
    return [lo - pad, hi + pad];
  }, [rows, showComparison]);

  const missingActual = rows.filter((r) => r.actual === null).map((r) => r.buName);
  const missingComparison = showComparison
    ? rows.filter((r) => r.actual !== null && r.comparison === null).map((r) => r.buName)
    : [];

  // Accessible + verifiable summary (same role="img"/aria-label pattern as
  // KpiCircles/ComparisonHistogram): a screen reader gets the real numbers,
  // and it doubles as the one place every figure this panel draws is spelled
  // out in plain, exact (fmtSAR, not chart-rounded) text.
  const summary = `${title} — ${rows
    .map((r) => {
      const actualText = r.actual === null ? "no data" : `${fmtSAR(r.actual)} SAR`;
      const compText = !showComparison ? null : r.comparison === null ? "not available" : `${fmtSAR(r.comparison)} SAR`;
      return `${r.buName}: this period ${actualText}${compText ? `, ${comparisonLabel.toLowerCase()} ${compText}` : ""}`;
    })
    .join("; ")}.`;

  const chartHeight = Math.max(224, rows.length * 42);

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">{title}</p>

      <div role="img" aria-label={summary}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 46, bottom: 4, left: 4 }} barCategoryGap="26%" barGap={3}>
            <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeOpacity={0.25} />
            <XAxis type="number" domain={domain} hide />
            <YAxis
              type="category"
              dataKey="buName"
              width={104}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
            />
            <ReferenceLine x={0} stroke="hsl(var(--border))" />
            <RTooltip content={<BuTooltip comparisonLabel={comparisonLabel} />} cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
            <Bar dataKey="actual" name="This period" fill={GOLD_FILL} radius={[0, 3, 3, 0]} maxBarSize={16} isAnimationActive={false}>
              <LabelList
                dataKey="actual"
                position="right"
                formatter={(v: number | null) => (v === null ? "" : fmtCompact(v))}
                fill="hsl(var(--foreground))"
                fontSize={10}
                fontWeight={600}
              />
            </Bar>
            {showComparison && (
              <Bar
                dataKey="comparison"
                name={comparisonLabel}
                fill={COMPARISON_FILL}
                stroke={COMPARISON_STROKE}
                strokeWidth={1.5}
                radius={[0, 3, 3, 0]}
                maxBarSize={16}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="comparison"
                  position="right"
                  formatter={(v: number | null) => (v === null ? "" : fmtCompact(v))}
                  fill="hsl(var(--muted-foreground))"
                  fontSize={10}
                />
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: GOLD_FILL }} aria-hidden />
          This period
        </span>
        {showComparison && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm border" style={{ background: COMPARISON_FILL, borderColor: COMPARISON_STROKE }} aria-hidden />
            {comparisonLabel}
          </span>
        )}
        {mtdProrated && showComparison && <span>{comparisonLabel} pro-rated to elapsed days</span>}
      </div>

      {/* Absent ≠ zero — plain-English footnotes, never a fabricated bar or a
          silently-missing category. */}
      {comparisonUnavailableNote && (
        <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-1.5">
          {comparisonUnavailableNote}
        </p>
      )}
      {missingActual.length > 0 && (
        <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-1.5">
          No data posted yet this window: {missingActual.join(", ")}.
        </p>
      )}
      {!comparisonUnavailableNote && missingComparison.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          No {comparisonLabel.toLowerCase()} figure: {missingComparison.join(", ")}.
        </p>
      )}
    </div>
  );
};

export const BuRevenueGrossMarginChart = ({
  data, comparisonLabel, isBudgetMode, mtdProrated, windowName, noActualData,
}: {
  data: BuChartDatum[];
  comparisonLabel: string;
  isBudgetMode: boolean;
  mtdProrated: boolean;
  windowName: string;
  /** Whole-window "absent" gate — same flag the P&L table above/below this
   * panel already computes (`monthsCoveredInWin(rows, win) === 0`), passed
   * down rather than recomputed so the two can never disagree. */
  noActualData: boolean;
}) => {
  if (noActualData) {
    return (
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">By Business Unit</h2>
        <p className="text-xs text-muted-foreground/80 rounded-xl border border-border bg-card p-4">
          No data posted yet for {windowName} — the business-unit breakdown will appear once this period is fed.
        </p>
      </div>
    );
  }

  const revenueRows: ChartRow[] = data.map((d) => ({ bu: d.bu, buName: d.buName, actual: d.revenueActual, comparison: d.revenueComparison }));
  const gmRows: ChartRow[] = data.map((d) => ({ bu: d.bu, buName: d.buName, actual: d.gmActual, comparison: d.gmComparison }));

  // Verified against the live warehouse 2026-08-08: v_budget_monthly carries
  // bu_code for Revenue (all 7 BUs, real split) but NOT for COGS (null for
  // every real BU, plus one stray 'COMP' tag that doesn't even match
  // Competitions' actual — zero — COGS accounts). Showing a Budget Gross
  // Margin per BU from that would silently read as ~100% margin for Livery/
  // Horse School/Retail/Membership/B2B, which isn't real. One clear note
  // instead of 7 fabricated-looking bars.
  const gmBudgetNote = isBudgetMode
    ? "Budget does not allocate cost of goods sold by business unit, so Gross Margin isn't comparable to Budget per BU. Switch to Versus Previous Year or Versus Previous Period for the full breakdown."
    : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">By Business Unit</h2>
        <p className="text-[11px] text-muted-foreground/70">
          Stops at Gross Margin — indirect costs (G&amp;A, Marketing &amp; Sales, People) aren't allocated to business units yet.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BuBarPanel title="Revenue by Business Unit" rows={revenueRows} comparisonLabel={comparisonLabel} showComparison mtdProrated={mtdProrated} />
        <BuBarPanel
          title="Gross Margin by Business Unit"
          rows={gmRows}
          comparisonLabel={comparisonLabel}
          showComparison={!isBudgetMode}
          comparisonUnavailableNote={gmBudgetNote}
          mtdProrated={mtdProrated}
        />
      </div>
    </div>
  );
};
