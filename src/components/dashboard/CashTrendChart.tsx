import { Card } from "@/components/ui/card";
import { Area, AreaChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface CashTrendData {
  month: string;
  balance: number;
  forecast?: boolean;
  runway?: number;
}

interface CashTrendChartProps {
  data: CashTrendData[];
}

export const CashTrendChart = ({ data }: CashTrendChartProps) => {
  const formatCurrency = (value: number) => {
    return `${(value / 1000000).toFixed(1)}M`;
  };

  const formatTooltipCurrency = (value: number) => {
    return new Intl.NumberFormat("en-SA", {
      style: "currency",
      currency: "SAR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
      <h3 className="text-2xl md:text-xl font-heading tracking-wide mb-6">
        CASH BALANCE TREND & FORECAST
      </h3>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
          <XAxis
            dataKey="month"
            className="text-base md:text-sm font-medium"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 14 }}
          />
          <YAxis
            tickFormatter={formatCurrency}
            className="text-base md:text-sm font-medium"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 14 }}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="chart-tooltip">
                    <p className="chart-tooltip-title">
                      {data.month} {data.forecast ? "(Forecast)" : ""}
                    </p>
                    <div className="chart-tooltip-content">
                      <p className="text-popover-foreground">
                        Balance: {formatTooltipCurrency(data.balance)}
                      </p>
                      {data.runway && (
                        <p className="text-muted-foreground">
                          Runway: {data.runway.toFixed(1)} months
                        </p>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            }}
            cursor={{ fill: 'hsl(var(--gold) / 0.1)' }}
          />
          {/* Danger zone at 2M */}
          <ReferenceLine 
            y={2000000} 
            stroke="#dc3545" 
            strokeDasharray="3 3" 
            strokeWidth={2}
            label={{ 
              value: 'Critical Level (3mo runway)', 
              position: 'insideTopRight',
              fill: '#dc3545',
              fontSize: 12,
              fontWeight: 600
            }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#22d3ee"
            strokeWidth={3}
            fill="url(#cashGradient)"
            fillOpacity={1}
          />
          <Line
            type="monotone"
            dataKey="balance"
            stroke="#6c757d"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            connectNulls
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
};
