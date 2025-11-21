import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { DrilldownRow, OpexRow } from "@/lib/drilldownData";

interface SummaryStatisticsProps {
  rows: (DrilldownRow | OpexRow)[];
  metricLabel: string;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatPercent = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

export function SummaryStatistics({ rows, metricLabel }: SummaryStatisticsProps) {
  if (rows.length === 0) return null;

  // Group by BU to calculate BU-level statistics
  type BUGroup = { actual: number; comparison: number; delta: number; count: number };
  const initialGroups: Record<string, BUGroup> = {};
  
  const buGroups: Record<string, BUGroup> = rows.reduce((acc, row) => {
    if (!acc[row.bu]) {
      acc[row.bu] = { actual: 0, comparison: 0, delta: 0, count: 0 };
    }
    acc[row.bu].actual += row.actual;
    acc[row.bu].comparison += row.comparison;
    acc[row.bu].delta += row.delta;
    acc[row.bu].count += 1;
    return acc;
  }, initialGroups);

  const buStats = Object.values(buGroups).map(bu => ({
    actual: bu.actual,
    comparison: bu.comparison,
    delta: bu.delta,
    deltaPercent: bu.comparison !== 0 ? (bu.delta / Math.abs(bu.comparison)) * 100 : 0
  }));

  // Calculate statistics
  const actualValues = buStats.map(s => s.actual);
  const comparisonValues = buStats.map(s => s.comparison);
  const deltaValues = buStats.map(s => s.delta);
  const deltaPercentValues = buStats.map(s => s.deltaPercent);

  const stats = {
    actual: {
      min: Math.min(...actualValues),
      max: Math.max(...actualValues),
      avg: actualValues.reduce((sum, val) => sum + val, 0) / actualValues.length
    },
    comparison: {
      min: Math.min(...comparisonValues),
      max: Math.max(...comparisonValues),
      avg: comparisonValues.reduce((sum, val) => sum + val, 0) / comparisonValues.length
    },
    delta: {
      min: Math.min(...deltaValues),
      max: Math.max(...deltaValues),
      avg: deltaValues.reduce((sum, val) => sum + val, 0) / deltaValues.length
    },
    deltaPercent: {
      min: Math.min(...deltaPercentValues),
      max: Math.max(...deltaPercentValues),
      avg: deltaPercentValues.reduce((sum, val) => sum + val, 0) / deltaPercentValues.length
    }
  };

  return (
    <Card className="p-4 mb-4 bg-muted/30">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold">BU-Level Statistics</h4>
        <span className="text-xs text-muted-foreground">({buStats.length} BUs)</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Actual */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Actual</p>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-chart-1">
                <TrendingUp className="h-3 w-3" />
                Max:
              </span>
              <span className="font-medium">{formatCurrency(stats.actual.max)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                Avg:
              </span>
              <span className="font-medium">{formatCurrency(stats.actual.avg)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-chart-5">
                <TrendingDown className="h-3 w-3" />
                Min:
              </span>
              <span className="font-medium">{formatCurrency(stats.actual.min)}</span>
            </div>
          </div>
        </div>

        {/* Comparison */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Comparison</p>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-chart-1">
                <TrendingUp className="h-3 w-3" />
                Max:
              </span>
              <span className="font-medium">{formatCurrency(stats.comparison.max)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                Avg:
              </span>
              <span className="font-medium">{formatCurrency(stats.comparison.avg)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-chart-5">
                <TrendingDown className="h-3 w-3" />
                Min:
              </span>
              <span className="font-medium">{formatCurrency(stats.comparison.min)}</span>
            </div>
          </div>
        </div>

        {/* Variance (SAR) */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Variance (SAR)</p>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-chart-1">
                <TrendingUp className="h-3 w-3" />
                Max:
              </span>
              <span className="font-medium">{formatCurrency(stats.delta.max)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                Avg:
              </span>
              <span className="font-medium">{formatCurrency(stats.delta.avg)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-chart-5">
                <TrendingDown className="h-3 w-3" />
                Min:
              </span>
              <span className="font-medium">{formatCurrency(stats.delta.min)}</span>
            </div>
          </div>
        </div>

        {/* Variance (%) */}
        <div>
          <p className="text-xs text-muted-foreground mb-2">Variance (%)</p>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-chart-1">
                <TrendingUp className="h-3 w-3" />
                Max:
              </span>
              <span className="font-medium">{formatPercent(stats.deltaPercent.max)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Activity className="h-3 w-3" />
                Avg:
              </span>
              <span className="font-medium">{formatPercent(stats.deltaPercent.avg)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-chart-5">
                <TrendingDown className="h-3 w-3" />
                Min:
              </span>
              <span className="font-medium">{formatPercent(stats.deltaPercent.min)}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
