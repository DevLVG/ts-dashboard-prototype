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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const actual = payload.find((p: any) => p.dataKey === "actual")?.value || 0;
      const budget = payload.find((p: any) => p.dataKey === "budget")?.value || 0;
      const delta = actual - budget;

      return (
        <div
          style={{
            backgroundColor: "hsl(var(--popover))",
            border: "2px solid hsl(var(--gold))",
            borderRadius: "var(--radius)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            padding: "8px 12px",
          }}
        >
          <p
            style={{
              color: "hsl(var(--popover-foreground))",
              fontWeight: 700,
              fontSize: "13px",
              marginBottom: "6px",
            }}
          >
            {label}
          </p>
          <div style={{ fontSize: "12px", fontWeight: 600 }}>
            <p style={{ color: "hsl(var(--gold))", marginBottom: "3px" }}>
              Actual: {new Intl.NumberFormat("en-SA", {
                style: "currency",
                currency: "SAR",
                minimumFractionDigits: 0,
              }).format(actual)}
            </p>
            <p style={{ color: "hsl(var(--muted-foreground))", marginBottom: "3px" }}>
              {comparisonLabel}: {new Intl.NumberFormat("en-SA", {
                style: "currency",
                currency: "SAR",
                minimumFractionDigits: 0,
              }).format(budget)}
            </p>
            <p style={{ color: delta >= 0 ? "#22d3ee" : "#dc3545", marginBottom: "0" }}>
              Delta: {new Intl.NumberFormat("en-SA", {
                style: "currency",
                currency: "SAR",
                minimumFractionDigits: 0,
                signDisplay: "always",
              }).format(delta)}
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  // Create data with variance shading between the two lines
  const chartData = data.map((item) => ({
    ...item,
    baseArea: Math.min(item.actual, item.budget),
    positiveVariance: item.actual > item.budget ? item.actual - item.budget : 0,
    negativeVariance: item.budget > item.actual ? item.budget - item.actual : 0,
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
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ 
              paddingTop: '10px',
              fontWeight: 600,
              fontSize: '15px'
            }}
          />
          {/* Area shading between the two lines */}
          <Area
            type="monotone"
            dataKey="baseArea"
            stackId="1"
            fill="transparent"
            stroke="none"
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="positiveVariance"
            stackId="1"
            fill="url(#positiveVariance)"
            stroke="none"
            fillOpacity={1}
            legendType="none"
          />
          <Area
            type="monotone"
            dataKey="negativeVariance"
            stackId="1"
            fill="url(#negativeVariance)"
            stroke="none"
            fillOpacity={1}
            legendType="none"
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
