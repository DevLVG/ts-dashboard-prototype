import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendData } from "@/types/dashboard";
import { 
  trendData, 
  grossMarginTrendData, 
  opexTrendData, 
  ebitdaTrendData,
  quarterlyTrendData,
  yearlyTrendData
} from "@/data/mockData";

interface RevenueTrendChartProps {
  scenario?: string;
}

type MetricType = "revenue" | "grossMargin" | "opex" | "ebitda";
type PeriodType = "6months" | "quarterly" | "yearly";

export const RevenueTrendChart = ({ scenario = "base" }: RevenueTrendChartProps) => {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("revenue");
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("6months");

  const formatCurrency = (value: number) => {
    return `${(value / 1000).toFixed(0)}K`;
  };
  
  const comparisonLabel = scenario === "previous-year" ? "Pr. Year" : "Budget";

  // Get data based on selected metric and period
  const getData = (): TrendData[] => {
    if (selectedPeriod === "quarterly") {
      return quarterlyTrendData[selectedMetric];
    } else if (selectedPeriod === "yearly") {
      return yearlyTrendData[selectedMetric];
    } else {
      // 6 months
      switch (selectedMetric) {
        case "grossMargin":
          return grossMarginTrendData;
        case "opex":
          return opexTrendData;
        case "ebitda":
          return ebitdaTrendData;
        default:
          return trendData;
      }
    }
  };

  const data = getData();

  // Get title based on selected metric
  const getTitle = () => {
    const metricNames = {
      revenue: "REVENUE",
      grossMargin: "GM",
      opex: "OPEX",
      ebitda: "EBITDA",
    };

    return `${metricNames[selectedMetric]} TREND`;
  };

  // Determine if we should invert colors (for OpEx)
  const isOpEx = selectedMetric === "opex";

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
  // For OpEx, invert the logic: over budget is bad (red), under budget is good (cyan)
  const chartData = data.map((item) => ({
    ...item,
    baseArea: Math.min(item.actual, item.budget),
    positiveVariance: isOpEx 
      ? (item.budget > item.actual ? item.budget - item.actual : 0) // For OpEx: under budget is positive (cyan)
      : (item.actual > item.budget ? item.actual - item.budget : 0), // For others: over budget is positive (cyan)
    negativeVariance: isOpEx
      ? (item.actual > item.budget ? item.actual - item.budget : 0) // For OpEx: over budget is negative (red)
      : (item.budget > item.actual ? item.budget - item.actual : 0), // For others: under budget is negative (red)
  }));

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300 group">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h3 className="text-2xl md:text-xl font-heading tracking-wide transition-colors group-hover:text-gold">
          {getTitle()}
        </h3>
        <div className="flex gap-3">
          <Select value={selectedMetric} onValueChange={(value) => setSelectedMetric(value as MetricType)}>
            <SelectTrigger className="w-[160px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">Revenue</SelectItem>
              <SelectItem value="grossMargin">Gross Margin</SelectItem>
              <SelectItem value="opex">OpEx</SelectItem>
              <SelectItem value="ebitda">EBITDA</SelectItem>
            </SelectContent>
          </Select>
          <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as PeriodType)}>
            <SelectTrigger className="w-[140px] bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="6months">6 Months</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
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
