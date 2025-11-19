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
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300 group">
      <h3 className="text-xl font-heading tracking-wide mb-6 transition-colors group-hover:text-gold">
        REVENUE TREND (6 MONTHS)
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data}>
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(var(--border))" 
            strokeOpacity={0.3}
          />
          <XAxis 
            dataKey="month" 
            className="text-sm font-medium"
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
              backgroundColor: "hsl(var(--card))",
              border: "2px solid hsl(var(--gold))",
              borderRadius: "var(--radius)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              fontWeight: 600,
            }}
          />
          <Legend 
            wrapperStyle={{ 
              paddingTop: '10px',
              fontWeight: 600,
              fontSize: '14px'
            }}
          />
          <Line
            type="monotone"
            dataKey="budget"
            stroke="hsl(var(--muted-foreground) / 0.6)"
            strokeWidth={3}
            strokeDasharray="5 5"
            name="Budget"
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
