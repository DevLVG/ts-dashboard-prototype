import { Card } from "@/components/ui/card";
import { KPIMetric } from "@/types/dashboard";
import { TrendingDown, TrendingUp } from "lucide-react";

interface KPICardProps {
  metric: KPIMetric;
  onClick?: () => void;
  periodLabel?: string;
}

export const KPICard = ({ metric, onClick, periodLabel = "MTD" }: KPICardProps) => {
  const formatValue = (value: number, format: KPIMetric["format"]) => {
    switch (format) {
      case "currency":
        return new Intl.NumberFormat("en-SA", {
          style: "currency",
          currency: "SAR",
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
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
      if (variance <= 0) return "text-[#22d3ee]"; // Under/on budget = good
      if (variance <= 5) return "text-[#ffc107]"; // Slightly over
      return "text-[#dc3545]"; // Significantly over
    }
    
    // All metrics: percentage variance logic
    if (variance >= -5) return "text-[#22d3ee]"; // Good
    if (variance >= -10) return "text-[#ffc107]"; // Borderline
    return "text-[#dc3545]"; // Bad
  };

  const getStatusColor = (variance: number, label: string) => {
    // OpEx: under budget is good (inverted logic)
    if (label === "OpEx") {
      if (variance <= 0) return "bg-[#22d3ee]/10 border-[#22d3ee]/30"; // Under/on budget = good
      if (variance <= 5) return "bg-[#ffc107]/15 border-[#ffc107]/40"; // Slightly over
      return "bg-[#dc3545]/10 border-[#dc3545]/30"; // Significantly over
    }
    
    // All metrics: percentage variance logic
    if (variance >= -5) return "bg-[#22d3ee]/10 border-[#22d3ee]/30"; // Good
    if (variance >= -10) return "bg-[#ffc107]/15 border-[#ffc107]/40"; // Borderline
    return "bg-[#dc3545]/10 border-[#dc3545]/30"; // Bad
  };

  // Calculate bar heights for mini chart
  const maxValue = Math.max(metric.actual, metric.budget);
  const actualHeight = (metric.actual / maxValue) * 100;
  const budgetHeight = (metric.budget / maxValue) * 100;

  return (
    <Card
      className={`group relative p-5 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1 hover:scale-[1.02] border-2 animate-fade-in ${getStatusColor(metric.variancePercent, metric.label)}`}
      onClick={onClick}
    >
      <div className="space-y-3">
        <p className="text-base md:text-sm text-muted-foreground font-semibold uppercase tracking-wide transition-colors group-hover:text-foreground">
          {metric.label} {periodLabel !== "MTD" && periodLabel !== "QTD" && periodLabel !== "YTD" ? periodLabel.split(" ")[0] : periodLabel}
        </p>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-4xl md:text-3xl font-heading tracking-tight transition-transform group-hover:scale-105">
                {formatValue(metric.actual, metric.format)}
              </p>
              {metric.label === "Runway" && metric.actual < 6 && (
                <TrendingDown className="h-5 w-5 md:h-4 md:w-4 text-[#ffc107]" />
              )}
            </div>
            {metric.label === "Cash Balance" ? (
              <div className="flex items-center gap-2">
                <span className="text-base md:text-sm text-muted-foreground">--</span>
                <span className="text-sm md:text-xs text-muted-foreground">No budget comparison</span>
              </div>
            ) : (
              <>
                <div className={`flex items-center gap-1 ${getVarianceColor(metric.variancePercent, metric.label)}`}>
                  {/* For OpEx, invert the icon logic (negative variance = under budget = good) */}
                  {metric.label === "OpEx" ? (
                    metric.variancePercent < 0 ? (
                      <TrendingDown className="h-5 w-5 md:h-4 md:w-4" />
                    ) : (
                      <TrendingUp className="h-5 w-5 md:h-4 md:w-4" />
                    )
                  ) : (
                    metric.variancePercent < 0 ? (
                      <TrendingDown className="h-5 w-5 md:h-4 md:w-4" />
                    ) : (
                      <TrendingUp className="h-5 w-5 md:h-4 md:w-4" />
                    )
                  )}
                  <span className="text-base md:text-sm font-semibold">
                    {Math.abs(metric.variancePercent).toFixed(1)}%
                  </span>
                </div>
                <p className="text-sm md:text-xs text-muted-foreground">
                  Budget: {formatValue(metric.budget, metric.format)}
                </p>
              </>
            )}
          </div>
          
          {/* Mini Bar Chart */}
          {metric.label !== "Cash Balance" && metric.label !== "Runway" && (
            <div className="flex items-end gap-1.5 h-16">
              <div className="flex flex-col items-center gap-1">
                <div className="w-8 bg-muted rounded-t-sm relative overflow-hidden" style={{ height: '48px' }}>
                  <div 
                    className="absolute bottom-0 w-full bg-primary transition-all duration-300"
                    style={{ height: `${actualHeight}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">AS</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-8 bg-muted rounded-t-sm relative overflow-hidden" style={{ height: '48px' }}>
                  <div 
                    className="absolute bottom-0 w-full bg-muted-foreground/40 transition-all duration-300"
                    style={{ height: `${budgetHeight}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-medium">IS</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <TrendingUp className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground/50 transition-opacity group-hover:opacity-100" />
    </Card>
  );
};
