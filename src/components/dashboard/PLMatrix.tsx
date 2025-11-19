import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BUPerformance, ServicePerformance } from "@/types/dashboard";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";

interface PLMatrixProps {
  data: BUPerformance[];
  onServiceClick?: (bu: string, service: string) => void;
  onOpExClick?: (bu: string, service?: string) => void;
  onGrossMarginClick?: (bu: string, service?: string) => void;
}

export const PLMatrix = ({ data, onServiceClick, onOpExClick, onGrossMarginClick }: PLMatrixProps) => {
  const [expandedBUs, setExpandedBUs] = useState<Set<string>>(new Set());

  const toggleBU = (buName: string) => {
    const newExpanded = new Set(expandedBUs);
    if (newExpanded.has(buName)) {
      newExpanded.delete(buName);
    } else {
      newExpanded.add(buName);
    }
    setExpandedBUs(newExpanded);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-SA", {
      style: "currency",
      currency: "SAR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const calculateVariance = (actual: number, budget: number) => {
    const variance = actual - budget;
    const variancePercent = (variance / budget) * 100;
    return { variance, variancePercent };
  };

  const getVarianceColor = (percent: number) => {
    if (percent >= 0) return "text-success";
    if (percent > -10) return "text-gold";
    return "text-destructive";
  };

  const getBackgroundColor = (percent: number) => {
    if (percent >= 0) return "bg-success/10";
    if (percent > -10) return "bg-gold/15";
    return "bg-destructive/10";
  };

  const MetricCell = ({ 
    actual, 
    budget, 
    isOpEx,
    isGrossMargin,
    onClick 
  }: { 
    actual: number; 
    budget: number; 
    isOpEx?: boolean;
    isGrossMargin?: boolean;
    onClick?: (e: React.MouseEvent) => void;
  }) => {
    const { variance, variancePercent } = calculateVariance(actual, budget);
    return (
      <div 
        className={`text-right space-y-1 ${(isOpEx || isGrossMargin) ? 'cursor-pointer group relative' : ''}`}
        onClick={onClick}
      >
        <div className="font-semibold">{formatCurrency(actual)}</div>
        <div className="text-xs text-muted-foreground">{formatCurrency(budget)}</div>
        <div className={`text-xs font-medium ${getVarianceColor(variancePercent)}`}>
          {variancePercent > 0 ? "+" : ""}
          {variancePercent.toFixed(1)}%
        </div>
        {(isOpEx || isGrossMargin) && (
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <svg className="h-3 w-3 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="p-6 overflow-x-auto shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
      <h3 className="text-xl font-heading tracking-wide mb-6">P&L MATRIX - DRILLABLE</h3>
      <div className="min-w-[800px]">
        <div className="grid grid-cols-5 gap-4 mb-4 pb-2 border-b">
          <div className="font-semibold">Business Unit / Service</div>
          <div className="text-right font-semibold">Revenue</div>
          <div className="text-right font-semibold">Gross Margin</div>
          <div className="text-right font-semibold">OpEx</div>
          <div className="text-right font-semibold">EBITDA</div>
        </div>

        {data.map((bu) => {
          const isExpanded = expandedBUs.has(bu.name);
          const revenueVar = calculateVariance(bu.revenue.actual, bu.revenue.budget);
          
          return (
            <div key={bu.name} className={`mb-2 rounded-lg ${getBackgroundColor(revenueVar.variancePercent)}`}>
            <div
                className="grid grid-cols-5 gap-4 p-3 cursor-pointer hover:bg-muted/50 rounded-lg transition-all duration-200 hover:scale-[1.01]"
                onClick={() => toggleBU(bu.name)}
              >
                <div className="flex items-center gap-2 font-medium">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {bu.name}
                </div>
                <MetricCell actual={bu.revenue.actual} budget={bu.revenue.budget} />
                <MetricCell 
                  actual={bu.grossMargin.actual} 
                  budget={bu.grossMargin.budget}
                  isGrossMargin={true}
                  onClick={(e) => {
                    e.stopPropagation();
                    onGrossMarginClick?.(bu.name);
                  }}
                />
                <MetricCell 
                  actual={bu.opex.actual} 
                  budget={bu.opex.budget} 
                  isOpEx={true}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpExClick?.(bu.name);
                  }}
                />
                <MetricCell actual={bu.ebitda.actual} budget={bu.ebitda.budget} />
              </div>

              {isExpanded && bu.services && (
                <div className="ml-8 space-y-1 pb-2">
                  {bu.services.map((service) => (
                    <div
                      key={service.name}
                      className="grid grid-cols-5 gap-4 p-2 text-sm hover:bg-muted/50 rounded cursor-pointer transition-all duration-200 hover:translate-x-1"
                      onClick={() => onServiceClick?.(bu.name, service.name)}
                    >
                      <div className="text-muted-foreground pl-6">{service.name}</div>
                      <MetricCell actual={service.revenue.actual} budget={service.revenue.budget} />
                      <MetricCell 
                        actual={service.grossMargin.actual} 
                        budget={service.grossMargin.budget}
                        isGrossMargin={true}
                        onClick={(e) => {
                          e.stopPropagation();
                          onGrossMarginClick?.(bu.name, service.name);
                        }}
                      />
                      <MetricCell 
                        actual={service.opex.actual} 
                        budget={service.opex.budget}
                        isOpEx={true}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpExClick?.(bu.name, service.name);
                        }}
                      />
                      <MetricCell actual={service.ebitda.actual} budget={service.ebitda.budget} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};
