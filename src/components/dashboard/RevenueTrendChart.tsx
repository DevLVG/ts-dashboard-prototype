import { Card } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, ComposedChart } from "recharts";
import { TrendData } from "@/types/dashboard";

interface RevenueTrendChartProps {
  data: TrendData[];
}

export const RevenueTrendChart = ({ data }: RevenueTrendChartProps) => {
  const formatCurrency = (value: number) => {
    return `${(value / 1000).toFixed(0)}K`;
  };

  return (
    <Card className="p-6 shadow-sm">
      <h3 className="text-xl font-heading tracking-wide mb-6">REVENUE TREND (6 MONTHS)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="month" className="text-xs" />
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
          <Legend />
          <Line
            type="monotone"
            dataKey="budget"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="Budget"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="hsl(var(--primary))"
            strokeWidth={3}
            name="Actual"
            dot={{ fill: "hsl(var(--primary))", r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
};
