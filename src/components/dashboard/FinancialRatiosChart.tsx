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
    <Card className="p-6 shadow-sm">
      <h3 className="text-xl font-heading tracking-wide mb-6">FINANCIAL RATIOS TREND</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="month" className="text-xs" />
          <YAxis
            tickFormatter={(value) => `${value}%`}
            className="text-xs"
            domain={[0, 60]}
          />
          <Tooltip
            formatter={(value: number) => [`${value.toFixed(1)}%`, ""]}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "var(--radius)",
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="gmPercent"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            name="Gross Margin %"
            dot={{ fill: "hsl(var(--chart-1))", r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="ebitdaPercent"
            stroke="hsl(var(--chart-2))"
            strokeWidth={2}
            name="EBITDA %"
            dot={{ fill: "hsl(var(--chart-2))", r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="opexPercent"
            stroke="hsl(var(--chart-3))"
            strokeWidth={2}
            name="OpEx %"
            dot={{ fill: "hsl(var(--chart-3))", r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
};
