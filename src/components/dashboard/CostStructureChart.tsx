import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from "recharts";

interface CostStructureData {
  name: string;
  directCosts: number;
  opex: number;
  ebitda: number;
}

interface CostStructureChartProps {
  data: CostStructureData[];
}

export const CostStructureChart = ({ data }: CostStructureChartProps) => {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const total = payload.reduce((sum: number, p: any) => sum + p.value, 0);
      return (
        <div className="bg-popover border-2 border-gold rounded-lg shadow-lg p-4">
          <p className="font-bold text-popover-foreground mb-2">{label}</p>
          <div className="space-y-1 text-sm">
            {payload.reverse().map((entry: any) => (
              <div key={entry.name} className="flex justify-between gap-4 text-popover-foreground">
                <span className="flex items-center gap-2">
                  <span 
                    className="w-3 h-3 rounded-sm" 
                    style={{ backgroundColor: entry.color }}
                  />
                  {entry.name}:
                </span>
                <span className="font-semibold">
                  {entry.value.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = (props: any) => {
    const { x, y, width, value } = props;
    if (value < 8) return null; // Don't show label if segment too small
    
    return (
      <text
        x={x + width / 2}
        y={y + 20}
        fill="white"
        textAnchor="middle"
        fontSize={12}
        fontWeight={600}
      >
        {value.toFixed(1)}%
      </text>
    );
  };

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
      <h3 className="text-xl font-heading tracking-wide mb-6">
        COST STRUCTURE (% OF REVENUE)
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart 
          data={data} 
          layout="vertical"
          margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
          stackOffset="expand"
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
            tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--foreground))' }}
          />
          <YAxis 
            type="category"
            dataKey="name"
            width={90}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--foreground))' }}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
          <Legend 
            wrapperStyle={{ 
              paddingTop: '10px',
              fontWeight: 600,
              fontSize: '14px'
            }}
          />
          <Bar 
            dataKey="directCosts" 
            stackId="a" 
            fill="#93c5fd"
            name="Direct Costs"
            label={renderCustomLabel}
            radius={[4, 0, 0, 4]}
          />
          <Bar 
            dataKey="opex" 
            stackId="a" 
            fill="#fb923c"
            name="OpEx"
            label={renderCustomLabel}
          />
          <Bar 
            dataKey="ebitda" 
            stackId="a" 
            fill="hsl(var(--chart-1))"
            name="EBITDA"
            label={renderCustomLabel}
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
