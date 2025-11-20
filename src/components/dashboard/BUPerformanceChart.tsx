import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, LabelList } from "recharts";
import { BUPerformance } from "@/types/dashboard";
import { getMonthlyPLData, calculateGM, calculateEBITDA, businessUnitLabels } from "@/data/financialData";

interface BUPerformanceChartProps {
  data: BUPerformance[];
  onClick?: (bu: string) => void;
}

type MetricType = "revenue" | "grossMargin" | "opex" | "ebitda";

export const BUPerformanceChart = ({ data, onClick }: BUPerformanceChartProps) => {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("revenue");

  const chartData = data.map((bu) => {
    const metricData = bu[selectedMetric];
    return {
      name: bu.name,
      actual: metricData.actual,
      budget: metricData.budget,
      variance: ((metricData.actual - metricData.budget) / metricData.budget) * 100,
    };
  });

  // Calculate max value for dynamic domain to ensure labels fit
  const maxValue = Math.max(...chartData.map(d => Math.max(d.actual, d.budget)));
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

  // Determine if we should invert colors (for OpEx)
  const isOpEx = selectedMetric === "opex";

  const getBarColor = (variance: number) => {
    if (isOpEx) {
      // For OpEx: under budget is good (cyan), over budget is bad (yellow/red)
      if (variance <= 0) return "#22d3ee"; // Cyan - at or under budget
      if (variance <= 5) return "#ffc107"; // Yellow - slightly over budget (0-5%)
      return "#dc3545"; // Red - significantly over budget (>5%)
    } else {
      // For Revenue/GM/EBITDA: at/over budget is good (cyan), under budget is bad (yellow/red)
      if (variance >= -5) return "#22d3ee"; // Cyan - at or over budget
      if (variance >= -10) return "#ffc107"; // Yellow - slightly under budget
      return "#dc3545"; // Red - significantly under budget
    }
  };

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300 group">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h3 className="text-2xl md:text-xl font-heading tracking-wide transition-colors group-hover:text-gold">
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
                      {payload[0].payload.name}
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
                        Budget: {new Intl.NumberFormat("en-SA", {
                          style: "currency",
                          currency: "SAR",
                          minimumFractionDigits: 0,
                        }).format(budget)}
                      </p>
                      <p style={{ color: delta >= 0 ? "#22d3ee" : "#dc3545", marginBottom: "3px" }}>
                        Delta: {new Intl.NumberFormat("en-SA", {
                          style: "currency",
                          currency: "SAR",
                          minimumFractionDigits: 0,
                          signDisplay: "always",
                        }).format(delta)}
                      </p>
                      <p style={{ 
                        color: "hsl(var(--muted-foreground))", 
                        fontSize: "11px",
                        marginTop: "2px"
                      }}>
                        Click to view BU detail
                      </p>
                    </div>
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
