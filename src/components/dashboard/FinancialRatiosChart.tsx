import { Card } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface FinancialRatiosChartProps {
  data: Array<{
    month: string;
    gmPercent: number;
    ebitdaPercent: number;
    opexPercent: number;
  }>;
}

export const FinancialRatiosChart = ({ data }: FinancialRatiosChartProps) => {
  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300 group">
      <h3 className="text-xl font-heading tracking-wide mb-6 transition-colors group-hover:text-gold">
        FINANCIAL RATIOS TREND
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
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
            tickFormatter={(value) => `${value}%`}
            className="text-sm font-medium"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))' }}
            domain={[0, 60]}
          />
          <Tooltip
            formatter={(value: number) => [`${value.toFixed(1)}%`, ""]}
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
              fontSize: '14px'
            }}
          />
          <Line
            type="monotone"
            dataKey="gmPercent"
            stroke="hsl(var(--gold))"
            strokeWidth={3}
            name="Gross Margin %"
            dot={{ fill: "hsl(var(--gold))", r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            activeDot={{ r: 7, strokeWidth: 3 }}
          />
          <Line
            type="monotone"
            dataKey="ebitdaPercent"
            stroke="hsl(var(--success))"
            strokeWidth={3}
            name="EBITDA %"
            dot={{ fill: "hsl(var(--success))", r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            activeDot={{ r: 7, strokeWidth: 3 }}
          />
          <Line
            type="monotone"
            dataKey="opexPercent"
            stroke="hsl(var(--destructive))"
            strokeWidth={3}
            name="OpEx %"
            dot={{ fill: "hsl(var(--destructive))", r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            activeDot={{ r: 7, strokeWidth: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};
