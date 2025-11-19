import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";

interface BUMarginData {
  name: string;
  gmActual: number;
  gmBudget: number;
  ebitdaActual: number;
  ebitdaBudget: number;
}

interface BUMarginComparisonProps {
  data: BUMarginData[];
  onClick?: (buName: string) => void;
}

export const BUMarginComparison = ({ data, onClick }: BUMarginComparisonProps) => {
  const getBarColor = (actual: number, budget: number) => {
    const variance = actual - budget;
    if (variance >= 0) return "hsl(var(--chart-1))"; // Cyan
    if (variance < -5) return "hsl(var(--destructive))"; // Red
    return "hsl(var(--warning))"; // Yellow
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover border-2 border-gold rounded-lg shadow-lg p-4">
          <p className="font-bold text-popover-foreground mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            <p className="text-popover-foreground">
              <span className="font-semibold">GM Actual:</span> {data.gmActual.toFixed(1)}%
            </p>
            <p className="text-muted-foreground">
              <span className="font-semibold">GM Budget:</span> {data.gmBudget.toFixed(1)}%
            </p>
            <p className="text-muted-foreground">
              <span className="font-semibold">GM Variance:</span> {(data.gmActual - data.gmBudget).toFixed(1)}pp
            </p>
            <div className="my-2 border-t border-border" />
            <p className="text-popover-foreground">
              <span className="font-semibold">EBITDA Actual:</span> {data.ebitdaActual.toFixed(1)}%
            </p>
            <p className="text-muted-foreground">
              <span className="font-semibold">EBITDA Budget:</span> {data.ebitdaBudget.toFixed(1)}%
            </p>
            <p className="text-muted-foreground">
              <span className="font-semibold">EBITDA Variance:</span> {(data.ebitdaActual - data.ebitdaBudget).toFixed(1)}pp
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  // Transform data for grouped bars
  const chartData = data.flatMap(bu => [
    {
      name: `${bu.name} GM`,
      buName: bu.name,
      metric: "GM",
      Actual: bu.gmActual,
      Budget: bu.gmBudget,
      color: getBarColor(bu.gmActual, bu.gmBudget)
    },
    {
      name: `${bu.name} EBITDA`,
      buName: bu.name,
      metric: "EBITDA",
      Actual: bu.ebitdaActual,
      Budget: bu.ebitdaBudget,
      color: getBarColor(bu.ebitdaActual, bu.ebitdaBudget)
    }
  ]);

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
      <h3 className="text-xl font-heading tracking-wide mb-6">
        BU MARGIN COMPARISON
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart 
          data={chartData} 
          layout="vertical"
          margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
        >
          <CartesianGrid 
            strokeDasharray="3 3" 
            stroke="hsl(var(--border))" 
            strokeOpacity={0.3}
            horizontal={true}
            vertical={false}
          />
          <XAxis 
            type="number"
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--foreground))' }}
          />
          <YAxis 
            type="category"
            dataKey="name"
            width={90}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
          <Legend 
            wrapperStyle={{ 
              paddingTop: '10px',
              fontWeight: 600,
              fontSize: '14px'
            }}
            payload={[
              { value: 'Actual', type: 'square', color: 'hsl(var(--chart-1))' },
              { value: 'Budget', type: 'square', color: 'hsl(var(--muted-foreground))' }
            ]}
          />
          <Bar 
            dataKey="Actual" 
            fill="hsl(var(--chart-1))"
            radius={[0, 4, 4, 0]}
            onClick={(data) => onClick?.(data.buName)}
            cursor="pointer"
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Bar>
          <Bar 
            dataKey="Budget" 
            fill="transparent"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            strokeDasharray="4 4"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
