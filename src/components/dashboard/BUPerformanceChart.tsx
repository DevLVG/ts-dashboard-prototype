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
    if (variance > -10) return "hsl(var(--gold))";
    return "hsl(var(--destructive))";
  };

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300 group">
      <h3 className="text-xl font-heading tracking-wide mb-6 transition-colors group-hover:text-gold">
        BU PERFORMANCE
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart 
          data={chartData} 
          layout="vertical" 
          onClick={(data) => data && onClick?.(data.activeLabel as string)}
          barGap={8}
        >
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(var(--border))" 
            strokeOpacity={0.3}
          />
          <XAxis 
            type="number" 
            tickFormatter={formatCurrency} 
            className="text-sm font-medium"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
          />
          <YAxis 
            type="category" 
            dataKey="name" 
            width={110} 
            className="text-sm font-semibold"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--foreground))' }}
          />
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
              border: "2px solid hsl(var(--gold))",
              borderRadius: "var(--radius)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              fontWeight: 600,
            }}
            cursor={{ fill: 'hsl(var(--gold) / 0.1)' }}
          />
          <Legend 
            wrapperStyle={{ 
              paddingTop: '10px',
              fontWeight: 600,
              fontSize: '14px'
            }}
          />
          <Bar 
            dataKey="budget" 
            fill="hsl(var(--muted-foreground) / 0.4)" 
            name="Budget" 
            radius={[0, 6, 6, 0]}
            opacity={0.7}
          />
          <Bar 
            dataKey="actual" 
            name="Actual" 
            radius={[0, 6, 6, 0]}
            opacity={0.95}
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={getBarColor(entry.variance)}
                className="transition-opacity hover:opacity-100"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
