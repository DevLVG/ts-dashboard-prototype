import { Card } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface FinancialRatiosChartProps {
  data: Array<{
    month: string;
    gmPercent: number;
    gmBudget: number;
    ebitdaPercent: number;
    ebitdaBudget: number;
    opexPercent: number;
    opexBudget: number;
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
          {/* Actual Lines - Solid */}
          <Line
            type="monotone"
            dataKey="gmPercent"
            stroke="#22d3ee"
            strokeWidth={3}
            name="GM % Actual"
            dot={{ fill: "#22d3ee", r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            activeDot={{ r: 7, strokeWidth: 3 }}
          />
          <Line
            type="monotone"
            dataKey="ebitdaPercent"
            stroke="#fbbf24"
            strokeWidth={3}
            name="EBITDA % Actual"
            dot={{ fill: "#fbbf24", r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            activeDot={{ r: 7, strokeWidth: 3 }}
          />
          <Line
            type="monotone"
            dataKey="opexPercent"
            stroke="#f87171"
            strokeWidth={3}
            name="OpEx % Actual"
            dot={{ fill: "#f87171", r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            activeDot={{ r: 7, strokeWidth: 3 }}
          />
          
          {/* Budget Lines - Dashed */}
          <Line
            type="monotone"
            dataKey="gmBudget"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="GM % Budget"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="ebitdaBudget"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="EBITDA % Budget"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="opexBudget"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            strokeDasharray="5 5"
            name="OpEx % Budget"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};
