import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  usePnlByBu,
  useBudgetMonthly,
  getLiveMonthlySeries,
  budgetForMonth,
  type LivePLTotals,
} from "@/data/liveData";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";

/** Local trend point — budget is null when no budget exists for the month
 * (before Jul-2026 / after Dec-2027): the line shows a gap, not zero. */
interface LiveTrendPoint {
  month: string;
  actual: number;
  budget: number | null;
}

interface RevenueTrendChartProps {
  scenario?: 'Budget_Base' | 'PY';
  /** Live BU code (LIV/HSE/...) or "All Company" */
  selectedBU?: string;
  /** Last complete month ("YYYY-MM") — the series ends here so the partial
   * in-progress month (revenue synced, no costs) never plots as a collapse. */
  endMonthKey?: string;
}

type MetricType = "revenue" | "grossMargin" | "opex" | "ebitda";
type PeriodType = "6months" | "quarterly" | "yearly";

export const RevenueTrendChart = ({ scenario = "Budget_Base", selectedBU = "All Company", endMonthKey }: RevenueTrendChartProps) => {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("revenue");
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("yearly");
  // LIVE monthly series (Supabase pnl_by_bu) + LIVE budget (v_budget_monthly,
  // BASE scenario). All mock paths removed for the production go-live.
  const { data: liveRows } = usePnlByBu();
  const { data: budgetRows } = useBudgetMonthly();

  const formatCurrency = (value: number) => {
    return `${(value / 1000).toFixed(0)}K`;
  };

  const comparisonLabel = scenario === "PY" ? "PY (LIVE)" : "Budget (LIVE)";

  const metricOf = (t: LivePLTotals): number => {
    switch (selectedMetric) {
      case "grossMargin": return t.grossMargin;
      case "opex": return Math.abs(t.opex);
      case "ebitda": return t.ebitda;
      default: return t.revenue;
    }
  };

  // Get data: LIVE actuals + comparison per month. PY -> LIVE (-12m shift);
  // Budget_Base -> LIVE from v_budget_monthly (null outside Jul-2026..Dec-2027 —
  // the line shows a gap, not zero).
  const getData = (): LiveTrendPoint[] => {
    const buCode = selectedBU !== "All Company" ? selectedBU : undefined;
    const count = selectedPeriod === "quarterly" ? 3 : selectedPeriod === "6months" ? 6 : 12;
    const series = getLiveMonthlySeries(liveRows, buCode, count, endMonthKey);

    const budgetOf = (monthKey: string): number | null => {
      const b = budgetForMonth(budgetRows, monthKey, buCode);
      return b === null ? null : metricOf(b);
    };

    return series.map((point) => ({
      month: point.month,
      actual: metricOf(point.actual),
      budget: scenario === "PY" ? metricOf(point.previousYear) : budgetOf(point.monthKey),
    }));
  };

  const data = getData();

  // Get title based on selected metric
  const getTitle = () => {
    const metricNames = {
      revenue: "REVENUE",
      grossMargin: "GM",
      opex: "OPEX",
      ebitda: "EBITDA",
    };

    const buLabel = selectedBU !== "All Company" ? ` - ${selectedBU}` : "";
    return `${metricNames[selectedMetric]} TREND${buLabel}`;
  };

  // Determine if we should invert colors (for OpEx)
  const isOpEx = selectedMetric === "opex";

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const actual = payload.find((p: any) => p.dataKey === "actual")?.value || 0;
      const budgetRaw = payload.find((p: any) => p.dataKey === "budget")?.value;
      const budget: number | null = budgetRaw === null || budgetRaw === undefined ? null : budgetRaw;
      const delta = budget === null ? null : actual - budget;

      return (
        <div className="chart-tooltip">
          <p className="chart-tooltip-title">{label}</p>
          <div className="chart-tooltip-content">
            <p className="chart-tooltip-actual">
              Actual: {new Intl.NumberFormat("en-SA", {
                style: "currency",
                currency: "SAR",
                minimumFractionDigits: 0,
              }).format(actual)}
            </p>
            <p className="chart-tooltip-budget">
              {comparisonLabel}: {budget === null
                ? "— (no budget before Jul '26)"
                : new Intl.NumberFormat("en-SA", {
                    style: "currency",
                    currency: "SAR",
                    minimumFractionDigits: 0,
                  }).format(budget)}
            </p>
            {delta !== null && (
              <p className={delta >= 0 ? "chart-tooltip-delta-positive" : "chart-tooltip-delta-negative"}>
                Delta: {new Intl.NumberFormat("en-SA", {
                  style: "currency",
                  currency: "SAR",
                  minimumFractionDigits: 0,
                  signDisplay: "always",
                }).format(delta)}
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Create data with variance shading between the two lines.
  // For OpEx, invert the logic: over budget is bad (red), under budget is good (cyan).
  // Months without a budget comparative (null) get no shading and a gap in the line.
  const chartData = data.map((item) => ({
    ...item,
    baseArea: item.budget === null ? 0 : Math.min(item.actual, item.budget),
    positiveVariance: item.budget === null ? 0 : isOpEx
      ? (item.budget > item.actual ? item.budget - item.actual : 0) // For OpEx: under budget is positive (cyan)
      : (item.actual > item.budget ? item.actual - item.budget : 0), // For others: over budget is positive (cyan)
    negativeVariance: item.budget === null ? 0 : isOpEx
      ? (item.actual > item.budget ? item.actual - item.budget : 0) // For OpEx: over budget is negative (red)
      : (item.budget > item.actual ? item.budget - item.actual : 0), // For others: under budget is negative (red)
  }));

  return (
    <Card className="dashboard-card group">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h3 className="dashboard-card-title">
          {getTitle()} <DataSourceBadge source="live" className="ml-2" />
        </h3>
        <div className="flex gap-3">
          <Select value={selectedMetric} onValueChange={(value) => setSelectedMetric(value as MetricType)}>
            <SelectTrigger className="w-[150px] bg-background font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="grossMargin">Gross Margin</SelectItem>
              <SelectItem value="opex">OpEx</SelectItem>
              <SelectItem value="ebitda">EBITDA</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as PeriodType)}>
            <SelectTrigger className="w-[150px] bg-background font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="quarterly">Last 3 months</SelectItem>
              <SelectItem value="6months">Last 6 months</SelectItem>
              <SelectItem value="yearly">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData}>
          <defs>
            <linearGradient id="positiveVariance" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(34, 211, 238, 0.2)" />
              <stop offset="100%" stopColor="rgba(34, 211, 238, 0)" />
            </linearGradient>
            <linearGradient id="negativeVariance" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(220, 53, 69, 0.2)" />
              <stop offset="100%" stopColor="rgba(220, 53, 69, 0)" />
            </linearGradient>
          </defs>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(var(--border))" 
            strokeOpacity={0.3}
          />
          <XAxis 
            dataKey="month" 
            className="text-base md:text-sm font-medium"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--foreground))', fontSize: 14 }}
          />
          <YAxis 
            tickFormatter={formatCurrency} 
            className="text-base md:text-sm font-medium"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 14 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend className="chart-legend" />
          {/* Area shading between the two lines. Animation is OFF on every
              series: recharts replays its entry animation on remount/resize/
              tab switches and the series blanks out mid-animation (same bug
              class previously fixed on the analysis waterfall). */}
          <Area
            type="monotone"
            dataKey="baseArea"
            stackId="1"
            fill="transparent"
            stroke="none"
            legendType="none"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="positiveVariance"
            stackId="1"
            fill="url(#positiveVariance)"
            stroke="none"
            fillOpacity={1}
            legendType="none"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="negativeVariance"
            stackId="1"
            fill="url(#negativeVariance)"
            stroke="none"
            fillOpacity={1}
            legendType="none"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="budget"
            // Full-opacity muted ink: the 0.6-alpha stroke used before sat
            // below 3:1 contrast on the dark card surface (dataviz check).
            // Identity is double-encoded: color AND dash pattern.
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2.5}
            strokeDasharray="6 4"
            name={comparisonLabel}
            isAnimationActive={false}
            // Small dot so isolated budget months (e.g. only Jul '26 in a
            // window that starts before the budget) remain visible.
            dot={{ fill: "hsl(var(--muted-foreground))", r: 3, strokeWidth: 0 }}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="hsl(var(--gold))"
            strokeWidth={4}
            name="Actual"
            isAnimationActive={false}
            dot={{ fill: "hsl(var(--gold))", r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            activeDot={{ r: 7, strokeWidth: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
};
