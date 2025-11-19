import { Card } from "@/components/ui/card";
import { KPIMetric } from "@/types/dashboard";
import { TrendingDown, TrendingUp } from "lucide-react";

interface KPICardProps {
  metric: KPIMetric;
  onClick?: () => void;
}

export const KPICard = ({ metric, onClick }: KPICardProps) => {
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

  const getVarianceColor = (variance: number) => {
    if (variance >= 0) return "text-success";
    if (variance > -10) return "text-gold";
    return "text-destructive";
  };

  const getStatusColor = (variance: number) => {
    if (variance >= 0) return "bg-success/10 border-success/30";
    if (variance > -10) return "bg-gold/15 border-gold/40";
    return "bg-destructive/10 border-destructive/30";
  };

  return (
    <Card
      className={`group p-5 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1 border-2 animate-fade-in ${getStatusColor(metric.variancePercent)}`}
      onClick={onClick}
    >
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wide transition-colors group-hover:text-foreground">
          {metric.label}
        </p>
        <p className="text-3xl font-heading tracking-tight transition-transform group-hover:scale-105">
          {formatValue(metric.actual, metric.format)}
        </p>
        {metric.label !== "Cash Balance" && (
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 ${getVarianceColor(metric.variancePercent)}`}>
              {metric.variancePercent < 0 ? (
                <TrendingDown className="h-4 w-4" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
              <span className="text-sm font-semibold">{metric.variancePercent.toFixed(1)}%</span>
            </div>
            <span className="text-xs text-muted-foreground">vs Budget</span>
          </div>
        )}
        {metric.label !== "Cash Balance" && (
          <p className="text-xs text-muted-foreground">
            Budget: {formatValue(metric.budget, metric.format)}
          </p>
        )}
      </div>
    </Card>
  );
};
