import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { CashFlowData } from "@/types/dashboard";

interface CashFlowWaterfallProps {
  data: CashFlowData[];
}

export const CashFlowWaterfall = ({ data }: CashFlowWaterfallProps) => {
  let cumulative = 0;
  const waterfallData = data.map((item, index) => {
    const start = cumulative;
    cumulative += item.amount;
    const isTotal = index === 0 || index === data.length - 1;
    
    return {
      name: item.category,
      value: Math.abs(item.amount),
      start: isTotal ? 0 : start < cumulative ? start : cumulative,
      end: cumulative,
      isTotal,
      isNegative: item.amount < 0,
    };
  });

  const formatCurrency = (value: number) => {
    return `${(value / 1000000).toFixed(1)}M`;
  };

  const getColor = (item: any) => {
    if (item.isTotal) return "hsl(var(--primary))";
    if (item.isNegative) return "hsl(var(--destructive))";
    return "hsl(var(--success))";
  };

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300 group">
      <h3 className="text-xl font-heading tracking-wide mb-6 transition-colors group-hover:text-gold">
        CASH FLOW WATERFALL
      </h3>
      <ResponsiveContainer width="100%" height={380}>
        <BarChart data={waterfallData}>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(var(--border))" 
            strokeOpacity={0.3}
          />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={140}
            className="text-xs font-medium"
            interval={0}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--foreground))' }}
          />
          <YAxis 
            tickFormatter={formatCurrency} 
            className="text-sm font-medium"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
          />
          <Tooltip
            formatter={(value: number) => [
              new Intl.NumberFormat("en-SA", {
                style: "currency",
                currency: "SAR",
                minimumFractionDigits: 0,
              }).format(value),
              "",
            ]}
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "2px solid hsl(var(--gold))",
              borderRadius: "var(--radius)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              padding: "12px 16px",
            }}
            labelStyle={{
              color: "hsl(var(--popover-foreground))",
              fontWeight: 700,
              fontSize: "15px",
              marginBottom: "8px",
            }}
            itemStyle={{
              color: "hsl(var(--popover-foreground))",
              fontWeight: 600,
              fontSize: "14px",
              padding: "4px 0",
            }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={2} />
          <Bar dataKey="start" stackId="a" fill="transparent" />
          <Bar dataKey="value" stackId="a" radius={[6, 6, 0, 0]}>
            {waterfallData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={getColor(entry)}
                opacity={0.95}
                className="transition-opacity hover:opacity-100"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
