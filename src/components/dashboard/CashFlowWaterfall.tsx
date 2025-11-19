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
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
      <h3 className="text-xl font-heading tracking-wide mb-6">CASH FLOW WATERFALL</h3>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={waterfallData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="name"
            angle={-45}
            textAnchor="end"
            height={120}
            className="text-xs"
            interval={0}
          />
          <YAxis tickFormatter={formatCurrency} className="text-xs" />
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
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
            }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" />
          <Bar dataKey="start" stackId="a" fill="transparent" />
          <Bar dataKey="value" stackId="a" radius={[4, 4, 0, 0]}>
            {waterfallData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(entry)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
