import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, LabelList } from "recharts";
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
    if (variance >= -5) return "#22d3ee"; // Trio cyan
    if (variance >= -10) return "#ffc107"; // Yellow
    return "#dc3545"; // Red
  };

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300 group">
      <h3 className="text-2xl md:text-xl font-heading tracking-wide mb-6 transition-colors group-hover:text-gold">
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
            className="text-base md:text-sm font-medium"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 14 }}
          />
          <YAxis 
            type="category" 
            dataKey="name" 
            width={110} 
            className="text-base md:text-sm font-semibold"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--foreground))', fontSize: 14 }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <div
                    style={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "2px solid hsl(var(--gold))",
                      borderRadius: "var(--radius)",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                      padding: "12px 16px",
                    }}
                  >
                    <p style={{ 
                      color: "hsl(var(--popover-foreground))", 
                      fontWeight: 700,
                      fontSize: "15px",
                      marginBottom: "8px"
                    }}>
                      {payload[0].payload.name}
                    </p>
                    {payload.map((entry: any, index: number) => (
                      <p key={index} style={{ 
                        color: "hsl(var(--popover-foreground))", 
                        fontWeight: 600,
                        fontSize: "14px",
                        padding: "4px 0"
                      }}>
                        {entry.name === "actual" ? "Actual" : "Budget"}: {new Intl.NumberFormat("en-SA", {
                          style: "currency",
                          currency: "SAR",
                          minimumFractionDigits: 0,
                        }).format(entry.value)}
                      </p>
                    ))}
                    <p style={{ 
                      color: "hsl(var(--muted-foreground))", 
                      fontWeight: 600,
                      fontSize: "12px",
                      marginTop: "4px"
                    }}>
                      Click to view BU detail
                    </p>
                  </div>
                );
              }
              return null;
            }}
            cursor={{ fill: 'hsl(var(--gold) / 0.1)' }}
          />
          <Legend 
            wrapperStyle={{ 
              paddingTop: '10px',
              fontWeight: 600,
              fontSize: '15px'
            }}
          />
          <Bar 
            dataKey="budget" 
            fill="#6c757d" 
            name="Budget" 
            radius={[0, 6, 6, 0]}
            opacity={0.7}
          />
          <Bar 
            dataKey="actual" 
            name="Actual" 
            radius={[0, 6, 6, 0]}
            opacity={0.95}
            className="cursor-pointer"
          >
            {chartData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={getBarColor(entry.variance)}
                className="transition-all hover:brightness-110"
              />
            ))}
            <LabelList 
              dataKey="variance" 
              position="right"
              formatter={(value: number) => `${value.toFixed(1)}%`}
              style={{ 
                fill: '#ffffff', 
                fontWeight: 'bold', 
                fontSize: '12px' 
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
