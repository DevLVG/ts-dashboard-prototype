import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { CashFlowData } from "@/types/dashboard";
import { ChevronLeft } from "lucide-react";

interface CashFlowWaterfallProps {
  data: CashFlowData[];
}

export const CashFlowWaterfall = ({ data }: CashFlowWaterfallProps) => {
  const [drillLevel, setDrillLevel] = useState<"aggregated" | "inflows" | "outflows">("aggregated");

  // Detailed breakdown data
  const inflowsDetail = [
    { category: "Opening Balance", amount: 3200000, type: "inflow" as const },
    { category: "Lessons", amount: 300000, type: "inflow" as const },
    { category: "Livery", amount: 250000, type: "inflow" as const },
    { category: "Events", amount: 200000, type: "inflow" as const },
    { category: "Retail", amount: 50000, type: "inflow" as const },
    { category: "Advisory", amount: 20000, type: "inflow" as const },
    { category: "Total Outflows", amount: -1267000, type: "outflow" as const, isCollapsed: true },
    { category: "Closing Balance", amount: 2800000, type: "inflow" as const },
  ];

  const outflowsDetail = [
    { category: "Opening Balance", amount: 3200000, type: "inflow" as const },
    { category: "Total Inflows", amount: 850000, type: "inflow" as const, isCollapsed: true },
    { category: "Salaries", amount: -450000, type: "outflow" as const },
    { category: "Horse Care", amount: -80000, type: "outflow" as const },
    { category: "Facilities", amount: -60000, type: "outflow" as const },
    { category: "Marketing", amount: -77000, type: "outflow" as const },
    { category: "CapEx", amount: -50000, type: "outflow" as const },
    { category: "Loan Payment", amount: -30000, type: "outflow" as const },
    { category: "AR Delay", amount: -20000, type: "outflow" as const },
    { category: "Closing Balance", amount: 2800000, type: "inflow" as const },
  ];

  const aggregatedData = [
    { category: "Opening Balance", amount: 3200000, type: "inflow" as const },
    { category: "Total Inflows", amount: 850000, type: "inflow" as const, isClickable: true },
    { category: "Total Outflows", amount: -1267000, type: "outflow" as const, isClickable: true },
    { category: "Closing Balance", amount: 2800000, type: "inflow" as const },
  ];

  const getDisplayData = () => {
    switch (drillLevel) {
      case "inflows":
        return inflowsDetail;
      case "outflows":
        return outflowsDetail;
      default:
        return aggregatedData;
    }
  };

  const displayData = getDisplayData();

  let cumulative = 0;
  const waterfallData = displayData.map((item, index) => {
    const start = cumulative;
    cumulative += item.amount;
    const isTotal = index === 0 || index === displayData.length - 1;
    const isClickable = (item as any).isClickable && drillLevel === "aggregated";
    const isCollapsed = (item as any).isCollapsed;
    
    return {
      name: item.category,
      value: Math.abs(item.amount),
      start: isTotal ? 0 : start < cumulative ? start : cumulative,
      end: cumulative,
      isTotal,
      isNegative: item.amount < 0,
      isClickable,
      isCollapsed,
      originalAmount: item.amount,
    };
  });

  const formatCurrency = (value: number) => {
    return `${(value / 1000000).toFixed(1)}M`;
  };

  const getColor = (item: any) => {
    if (item.isTotal) return "#6c757d";
    if (item.isCollapsed) return "#6c757d";
    if (item.isNegative) return "#dc3545";
    return "#22d3ee";
  };

  const handleBarClick = (data: any) => {
    if (drillLevel !== "aggregated") return;
    
    if (data.name === "Total Inflows") {
      setDrillLevel("inflows");
    } else if (data.name === "Total Outflows") {
      setDrillLevel("outflows");
    }
  };

  const getViewLabel = () => {
    switch (drillLevel) {
      case "inflows":
        return "Inflows Detail";
      case "outflows":
        return "Outflows Detail";
      default:
        return "Aggregated";
    }
  };

  // Set minimum bar width of 30px
  const minBarWidth = 30;

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300 group">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl md:text-xl font-heading tracking-wide transition-colors group-hover:text-gold">
          CASH FLOW WATERFALL
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">View: <span className="font-semibold">{getViewLabel()}</span></span>
          {drillLevel !== "aggregated" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDrillLevel("aggregated")}
              className="gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Collapse
            </Button>
          )}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={waterfallData} barSize={Math.max(minBarWidth, 50)}>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(var(--border))" 
            strokeOpacity={0.3}
          />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={120}
            className="text-sm md:text-xs font-medium"
            interval={0}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
            tickMargin={4}
          />
          <YAxis 
            tickFormatter={formatCurrency} 
            className="text-base md:text-sm font-medium"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 14 }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div
                    style={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "2px solid hsl(var(--gold))",
                      borderRadius: "var(--radius)",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                      padding: "12px 16px",
                    }}
                  >
                    <p style={{ 
                      color: "hsl(var(--popover-foreground))", 
                      fontWeight: 700,
                      fontSize: "15px",
                      marginBottom: "8px"
                    }}>
                      {data.name}
                    </p>
                    <p style={{ 
                      color: "hsl(var(--popover-foreground))", 
                      fontWeight: 600,
                      fontSize: "14px",
                      padding: "4px 0"
                    }}>
                      {new Intl.NumberFormat("en-SA", {
                        style: "currency",
                        currency: "SAR",
                        minimumFractionDigits: 0,
                      }).format(Math.abs(data.originalAmount))}
                    </p>
                    {data.isClickable && (
                      <p style={{ 
                        color: "hsl(var(--muted-foreground))", 
                        fontWeight: 600,
                        fontSize: "12px",
                        marginTop: "4px"
                      }}>
                        Click to see breakdown
                      </p>
                    )}
                  </div>
                );
              }
              return null;
            }}
            cursor={{ fill: 'hsl(var(--gold) / 0.1)' }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={2} />
          <Bar dataKey="start" stackId="a" fill="transparent" />
          <Bar 
            dataKey="value" 
            stackId="a" 
            radius={[6, 6, 0, 0]}
            onClick={handleBarClick}
            minPointSize={minBarWidth}
          >
            {waterfallData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={getColor(entry)}
                opacity={0.95}
                className={`transition-all ${entry.isClickable ? 'cursor-pointer hover:brightness-110' : ''}`}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
