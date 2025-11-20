import { Card } from "@/components/ui/card";
import { KPIMetric } from "@/types/dashboard";
import { TrendingDown, TrendingUp } from "lucide-react";
interface KPICardProps {
  metric: KPIMetric;
  onClick?: () => void;
  periodLabel?: string;
  scenario?: string;
}
export const KPICard = ({
  metric,
  onClick,
  periodLabel = "MTD",
  scenario = "base"
}: KPICardProps) => {
  const formatValue = (value: number, format: KPIMetric["format"]) => {
    switch (format) {
      case "currency":
        return new Intl.NumberFormat("en-SA", {
          style: "currency",
          currency: "SAR",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        }).format(value);
      case "percent":
        return `${value.toFixed(1)}%`;
      case "months":
        return `${value.toFixed(1)} mo`;
      case "number":
        return value.toLocaleString();
    }
  };
  const getVarianceColor = (variance: number, label: string) => {
    // OpEx: under budget is good (inverted logic)
    if (label === "OpEx") {
      if (variance <= 0) return "text-success"; // Under/on budget = good
      if (variance <= 5) return "text-warning"; // Slightly over
      return "text-destructive"; // Significantly over
    }

    // All metrics: percentage variance logic
    if (variance >= 0) return "text-success"; // Above budget
    if (variance >= -5) return "text-warning"; // Moderately under
    return "text-destructive"; // Under budget
  };
  const getStatusColor = (variance: number, label: string) => {
    // OpEx: under budget is good (inverted logic)
    if (label === "OpEx") {
      if (variance <= 0) return "bg-success/10 border-success/30"; // Under/on budget = good
      if (variance <= 5) return "bg-warning/15 border-warning/40"; // Slightly over
      return "bg-destructive/10 border-destructive/30"; // Significantly over
    }

    // All metrics: percentage variance logic
    if (variance >= 0) return "bg-success/10 border-success/30"; // Above budget
    if (variance >= -5) return "bg-warning/15 border-warning/40"; // Moderately under
    return "bg-destructive/10 border-destructive/30"; // Under budget
  };

  const getBarColor = (variance: number, label: string) => {
    // OpEx: under budget is good (inverted logic)
    if (label === "OpEx") {
      if (variance <= 0) return "bg-success"; // Under/on budget = good
      if (variance <= 5) return "bg-warning"; // Slightly over
      return "bg-destructive"; // Significantly over
    }

    // All metrics: percentage variance logic
    if (variance >= 0) return "bg-success"; // Above budget
    if (variance >= -5) return "bg-warning"; // Moderately under
    return "bg-destructive"; // Under budget
  };

  // Calculate bar heights for mini chart - use absolute values
  const maxValue = Math.max(Math.abs(metric.actual), Math.abs(metric.budget));
  const actualHeight = Math.abs(metric.actual) / maxValue * 100;
  const budgetHeight = Math.abs(metric.budget) / maxValue * 100;
  
  const comparisonLabel = scenario === "previous-year" ? "Pr. Year" : "Budget";
  return <Card className={`group relative p-5 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1 hover:scale-[1.02] border-2 animate-fade-in ${getStatusColor(metric.variancePercent, metric.label)}`} onClick={onClick}>
      <div className="space-y-3">
        <p className="text-base md:text-sm text-muted-foreground font-semibold uppercase tracking-wide transition-colors group-hover:text-foreground">
          {metric.label} {periodLabel !== "MTD" && periodLabel !== "QTD" && periodLabel !== "YTD" ? periodLabel.split(" ")[0] : periodLabel}
        </p>
        <div className="flex items-center gap-2">
          <p className="text-4xl md:text-3xl font-heading tracking-tight transition-transform group-hover:scale-105">
            {formatValue(metric.actual, metric.format)}
          </p>
          {metric.label === "Runway" && metric.actual < 6 && <TrendingDown className="h-5 w-5 md:h-4 md:w-4 text-warning" />}
        </div>
        {metric.label === "Cash Balance" ? <div className="flex items-center gap-2">
            <span className="text-base md:text-sm text-muted-foreground">--</span>
            <span className="text-sm md:text-xs text-muted-foreground">No budget comparison</span>
          </div> : <>
            <div className={`flex items-center gap-1 ${getVarianceColor(metric.variancePercent, metric.label)}`}>
              {/* For OpEx, invert the icon logic (negative variance = under budget = good) */}
              {metric.label === "OpEx" ? metric.variancePercent < 0 ? <TrendingDown className="h-5 w-5 md:h-4 md:w-4" /> : <TrendingUp className="h-5 w-5 md:h-4 md:w-4" /> : metric.variancePercent < 0 ? <TrendingDown className="h-5 w-5 md:h-4 md:w-4" /> : <TrendingUp className="h-5 w-5 md:h-4 md:w-4" />}
              <span className="text-base md:text-sm font-semibold">
                {Math.abs(metric.variancePercent).toFixed(1)}%
              </span>
            </div>
            <p className="text-sm md:text-xs text-muted-foreground">
              {comparisonLabel}: {formatValue(metric.budget, metric.format)}
            </p>
            
            {/* Mini Bar Chart - Below content */}
            {metric.label !== "Runway" && <div className="pt-2 mt-2 border-t border-border/50">
                <div className="flex items-end justify-center gap-3 h-20">
                  <div className="flex flex-col items-center gap-1.5 flex-1 max-w-[80px]">
                    <div className="mini-bar-container">
                      <div 
                        className={`mini-bar-actual ${getBarColor(metric.variancePercent, metric.label)}`}
                        style={{ height: `${actualHeight}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground font-semibold">Actual</span>
                  </div>
                  <div className="flex flex-col items-center gap-1.5 flex-1 max-w-[80px]">
                    <div className="mini-bar-container">
                      <div 
                        className="mini-bar-budget"
                        style={{ height: `${budgetHeight}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground font-semibold">{comparisonLabel}</span>
                  </div>
                </div>
              </div>}
          </>}
      </div>
    </Card>;
};