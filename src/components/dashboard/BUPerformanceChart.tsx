import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, LabelList } from "recharts";
import { BUPerformance } from "@/types/dashboard";
import { getMonthlyPLData, calculateGM, calculateEBITDA, businessUnitLabels } from "@/data/financialData";
import { getVarianceHexColor } from "@/lib/varianceColors";

interface BUPerformanceChartProps {
  data: BUPerformance[];
  onClick?: (bu: string) => void;
}

type MetricType = "revenue" | "grossMargin" | "opex" | "ebitda";

export const BUPerformanceChart = ({ data, onClick }: BUPerformanceChartProps) => {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("revenue");

  const chartData = data.map((bu) => {
    const metricData = bu[selectedMetric];
    const actual = metricData?.actual || 0;
    const budget = metricData?.budget || 0;
    const variance = budget !== 0 ? ((actual - budget) / Math.abs(budget)) * 100 : 0;
    
    return {
      name: bu.name,
      actual,
      budget,
      variance,
    };
  });

  // Calculate max value for dynamic domain to ensure labels fit
  const values = chartData.flatMap(d => [d.actual, d.budget]).filter(v => v > 0);
  const maxValue = values.length > 0 ? Math.max(...values) : 1000;
  const domainMax = maxValue * 1.2; // Add 20% padding for labels

  const formatCurrency = (value: number) => {
    return `${(value / 1000).toFixed(0)}K`;
  };

  // Get title based on selected metric
  const getTitle = () => {
    const metricNames = {
      revenue: "REVENUE",
      grossMargin: "GM",
      opex: "OPEX",
      ebitda: "EBITDA",
    };
    return `BU ${metricNames[selectedMetric]}`;
  };

  // Get metric label for color logic
  const getMetricLabel = () => {
    switch (selectedMetric) {
      case "opex": return "OpEx";
      case "grossMargin": return "GM";
      case "ebitda": return "EBITDA";
      default: return "Revenue";
    }
  };

  return (
    <Card className="dashboard-card group">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h3 className="dashboard-card-title">
          {getTitle()}
        </h3>
        <Select value={selectedMetric} onValueChange={(value) => setSelectedMetric(value as MetricType)}>
          <SelectTrigger className="w-[150px] bg-background font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="revenue">Revenue</SelectItem>
            <SelectItem value="grossMargin">Gross Margin</SelectItem>
            <SelectItem value="opex">OpEx</SelectItem>
            <SelectItem value="ebitda">EBITDA</SelectItem>
          </SelectContent>
        </Select>
      </div>
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
            domain={[0, domainMax]}
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
                const actualEntry = payload.find((p: any) => p.dataKey === "actual");
                const budgetEntry = payload.find((p: any) => p.dataKey === "budget");
                const actual = typeof actualEntry?.value === 'number' ? actualEntry.value : 0;
                const budget = typeof budgetEntry?.value === 'number' ? budgetEntry.value : 0;
                const delta = actual - budget;

                return (
                  <div className="chart-tooltip">
                    <p className="chart-tooltip-title">{payload[0].payload.name}</p>
                    <div className="chart-tooltip-content">
                      <p className="chart-tooltip-actual">
                        Actual: {new Intl.NumberFormat("en-SA", {
                          style: "currency",
                          currency: "SAR",
                          minimumFractionDigits: 0,
                        }).format(actual)}
                      </p>
                      <p className="chart-tooltip-budget">
                        Budget: {new Intl.NumberFormat("en-SA", {
                          style: "currency",
                          currency: "SAR",
                          minimumFractionDigits: 0,
                        }).format(budget)}
                      </p>
                      <p className={delta >= 0 ? "chart-tooltip-delta-positive" : "chart-tooltip-delta-negative"}>
                        Delta: {new Intl.NumberFormat("en-SA", {
                          style: "currency",
                          currency: "SAR",
                          minimumFractionDigits: 0,
                          signDisplay: "always",
                        }).format(delta)}
                      </p>
                      <p className="chart-tooltip-hint">Click to view BU detail</p>
                    </div>
                  </div>
                );
              }
              return null;
            }}
            cursor={{ fill: 'hsl(var(--gold) / 0.1)' }}
          />
          <Legend className="chart-legend" />
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
                fill={getVarianceHexColor(entry.variance, getMetricLabel())}
                className="transition-all hover:brightness-110"
              />
            ))}
            <LabelList 
              dataKey="variance" 
              position="right"
              formatter={(value: number) => `${value.toFixed(1)}%`}
              className="chart-bar-label"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
