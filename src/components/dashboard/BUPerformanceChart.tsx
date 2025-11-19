import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";
import { BUPerformance } from "@/types/dashboard";

interface BUPerformanceChartProps {
  data: BUPerformance[];
  onClick?: (bu: string) => void;
}

export const BUPerformanceChart = ({ data, onClick }: BUPerformanceChartProps) => {
  const chartData = data.map((bu) => ({
    name: bu.name,
    actual: bu.revenue.actual,
    budget: bu.revenue.budget,
    variance: ((bu.revenue.actual - bu.revenue.budget) / bu.revenue.budget) * 100,
  }));

  const formatCurrency = (value: number) => {
    return `${(value / 1000).toFixed(0)}K`;
  };

  const getBarColor = (variance: number) => {
    if (variance >= 0) return "hsl(var(--success))";
    if (variance > -10) return "hsl(var(--warning))";
    return "hsl(var(--destructive))";
  };

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
      <h3 className="text-xl font-heading tracking-wide mb-6">BU PERFORMANCE</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} layout="vertical" onClick={(data) => data && onClick?.(data.activeLabel as string)}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis type="number" tickFormatter={formatCurrency} className="text-xs" />
          <YAxis type="category" dataKey="name" width={100} className="text-xs" />
          <Tooltip
            formatter={(value: number, name: string) => [
              new Intl.NumberFormat("en-SA", {
                style: "currency",
                currency: "SAR",
                minimumFractionDigits: 0,
              }).format(value),
              name === "actual" ? "Actual" : "Budget",
            ]}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
            }}
          />
          <Legend />
          <Bar dataKey="budget" fill="hsl(var(--muted))" name="Budget" radius={[0, 4, 4, 0]} />
          <Bar dataKey="actual" name="Actual" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.variance)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
