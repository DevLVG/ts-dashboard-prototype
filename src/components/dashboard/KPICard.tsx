import { Card } from "@/components/ui/card";
import { KPIMetric } from "@/types/dashboard";
import { TrendingDown, TrendingUp } from "lucide-react";
import { getVarianceTextColor, getVarianceBackgroundColor } from "@/lib/varianceColors";
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


  const comparisonLabel = scenario === "py" ? "Pr. Year" : "Budget";
  return <Card className={`group relative p-5 cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] border-2 animate-fade-in ${getVarianceBackgroundColor(metric.variancePercent, metric.label)}`} onClick={onClick}>
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
        {metric.budget !== 0 ? <>
            <div className={`flex items-center gap-1 ${getVarianceTextColor(metric.variancePercent, metric.label)}`}>
              {/* Show absolute delta when signs are opposite, but still use percentage for color */}
              {metric.isOppositeSigns ? (
                <span className="text-base md:text-sm font-semibold">
                  {new Intl.NumberFormat("en-SA", {
                    style: "currency",
                    currency: "SAR",
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                    signDisplay: "always"
                  }).format(metric.variance)}
                </span>
              ) : (
                <>
                  {/* Arrow direction: OpEx and Receivables use inverted logic (up = bad) */}
                  {metric.label === "OpEx" || metric.label.includes("Receivables")
                    ? metric.variancePercent > 0 
                      ? <TrendingUp className="h-5 w-5 md:h-4 md:w-4" /> 
                      : <TrendingDown className="h-5 w-5 md:h-4 md:w-4" />
                    : metric.variancePercent < 0 
                      ? <TrendingDown className="h-5 w-5 md:h-4 md:w-4" /> 
                      : <TrendingUp className="h-5 w-5 md:h-4 md:w-4" />
                  }
                  <span className="text-base md:text-sm font-semibold">
                    {Math.abs(metric.variancePercent).toFixed(1)}%
                  </span>
                </>
              )}
            </div>
            <p className="text-sm md:text-xs text-muted-foreground">
              {comparisonLabel}: {formatValue(metric.budget, metric.format)}
            </p>
          </> : <div className="flex items-center gap-2">
            <span className="text-base md:text-sm text-muted-foreground">--</span>
            <span className="text-sm md:text-xs text-muted-foreground">No budget comparison</span>
          </div>}
      </div>
    </Card>;
};