import { Card } from "@/components/ui/card";
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendData } from "@/types/dashboard";

interface RevenueTrendChartProps {
  data: TrendData[];
  scenario?: string;
}

export const RevenueTrendChart = ({ data, scenario = "base" }: RevenueTrendChartProps) => {
  const formatCurrency = (value: number) => {
    return `${(value / 1000).toFixed(0)}K`;
  };
  
  const comparisonLabel = scenario === "previous-year" ? "Pr. Year" : "Budget";

  // Create data with variance shading
  const chartData = data.map((item) => ({
    ...item,
    varianceArea: item.actual > item.budget ? item.actual : null,
    negativeVarianceArea: item.actual < item.budget ? item.actual : null,
  }));

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300 group">
      <h3 className="text-2xl md:text-xl font-heading tracking-wide mb-6 transition-colors group-hover:text-gold">
        REVENUE TREND (6 MONTHS)
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData}>
          <defs>
            <linearGradient id="positiveVariance" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(34, 211, 238, 0.2)" />
              <stop offset="100%" stopColor="rgba(34, 211, 238, 0)" />
            </linearGradient>
            <linearGradient id="negativeVariance" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(220, 53, 69, 0.2)" />
              <stop offset="100%" stopColor="rgba(220, 53, 69, 0)" />
            </linearGradient>
          </defs>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(var(--border))" 
            strokeOpacity={0.3}
          />
          <XAxis 
            dataKey="month" 
            className="text-base md:text-sm font-medium"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--foreground))', fontSize: 14 }}
          />
          <YAxis 
            tickFormatter={formatCurrency} 
            className="text-base md:text-sm font-medium"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 14 }}
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
          <Legend 
            wrapperStyle={{ 
              paddingTop: '10px',
              fontWeight: 600,
              fontSize: '15px'
            }}
          />
          {/* Area shading for variance */}
          <Area
            type="monotone"
            dataKey="budget"
            fill="url(#negativeVariance)"
            stroke="none"
            fillOpacity={1}
          />
          <Area
            type="monotone"
            dataKey="varianceArea"
            fill="url(#positiveVariance)"
            stroke="none"
            fillOpacity={1}
          />
          <Line
            type="monotone"
            dataKey="budget"
            stroke="hsl(var(--muted-foreground) / 0.6)"
            strokeWidth={3}
            strokeDasharray="5 5"
            name={comparisonLabel}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="hsl(var(--gold))"
            strokeWidth={4}
            name="Actual"
            dot={{ fill: "hsl(var(--gold))", r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            activeDot={{ r: 7, strokeWidth: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
};
