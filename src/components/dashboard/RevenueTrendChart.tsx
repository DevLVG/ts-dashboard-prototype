import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendData } from "@/types/dashboard";
import { getMonthlyPLData, calculateGM, calculateEBITDA } from "@/data/financialData";

interface RevenueTrendChartProps {
  scenario?: string;
  selectedBU?: string;
}

type MetricType = "revenue" | "grossMargin" | "opex" | "ebitda";
type PeriodType = "6months" | "quarterly" | "yearly";

export const RevenueTrendChart = ({ scenario = "base", selectedBU = "All Company" }: RevenueTrendChartProps) => {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>("revenue");
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("yearly");

  const formatCurrency = (value: number) => {
    return `${(value / 1000).toFixed(0)}K`;
  };
  
  const comparisonLabel = scenario === "py" ? "PY" : "Budget";

  // Get data based on selected metric and period using new financialData system
  const getData = (): TrendData[] => {
    const plData = getMonthlyPLData(selectedBU === "All Company" ? undefined : selectedBU);
    
    // Determine how many months to show based on period
    let dataToShow = plData;
    if (selectedPeriod === "quarterly") {
      dataToShow = plData.slice(-3); // Last 3 months
    } else if (selectedPeriod === "6months") {
      dataToShow = plData.slice(-6); // Last 6 months
    }
    // else yearly = all 12 months
    
    return dataToShow.map(monthData => {
      let actual = 0;
      let comparison = 0;
      
      // Calculate actual values
      switch (selectedMetric) {
        case "grossMargin":
          actual = calculateGM(monthData.revenues.actual, monthData.cogs.actual);
          break;
        case "opex":
          actual = Math.abs(monthData.opex.actual);
          break;
        case "ebitda":
          actual = calculateEBITDA(monthData.revenues.actual, monthData.cogs.actual, monthData.opex.actual);
          break;
        default: // revenue
          actual = monthData.revenues.actual;
      }
      
      // Calculate comparison values based on scenario
      let revComparison = monthData.revenues.budget;
      let cogsComparison = monthData.cogs.budget;
      let opexComparison = monthData.opex.budget;
      
      if (scenario === "worst") {
        // Budget Worst: -20% revenue, +10% opex
        revComparison = monthData.revenues.budget * 0.8;
        cogsComparison = monthData.cogs.budget * 0.8;
        opexComparison = monthData.opex.budget * 1.1;
      } else if (scenario === "best") {
        // Budget Best: +15% revenue, -5% opex
        revComparison = monthData.revenues.budget * 1.15;
        cogsComparison = monthData.cogs.budget * 1.15;
        opexComparison = monthData.opex.budget * 0.95;
      } else if (scenario === "py") {
        // Compare against Previous Year
        revComparison = monthData.revenues.previousYear;
        cogsComparison = monthData.cogs.previousYear;
        opexComparison = monthData.opex.previousYear;
      }
      
      // Calculate comparison metric value
      switch (selectedMetric) {
        case "grossMargin":
          comparison = calculateGM(revComparison, cogsComparison);
          break;
        case "opex":
          comparison = Math.abs(opexComparison);
          break;
        case "ebitda":
          comparison = calculateEBITDA(revComparison, cogsComparison, opexComparison);
          break;
        default: // revenue
          comparison = revComparison;
      }
      
      return {
        month: monthData.month,
        actual,
        budget: comparison
      };
    });
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

    const buLabel = selectedBU !== "All Company" ? ` - ${selectedBU}` : "";
    return `${metricNames[selectedMetric]} TREND${buLabel}`;
  };

  // Determine if we should invert colors (for OpEx)
  const isOpEx = selectedMetric === "opex";

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const actual = payload.find((p: any) => p.dataKey === "actual")?.value || 0;
      const budget = payload.find((p: any) => p.dataKey === "budget")?.value || 0;
      const delta = actual - budget;

      return (
        <div className="chart-tooltip">
          <p className="chart-tooltip-title">{label}</p>
          <div className="chart-tooltip-content">
            <p className="chart-tooltip-actual">
              Actual: {new Intl.NumberFormat("en-SA", {
                style: "currency",
                currency: "SAR",
                minimumFractionDigits: 0,
              }).format(actual)}
            </p>
            <p className="chart-tooltip-budget">
              {comparisonLabel}: {new Intl.NumberFormat("en-SA", {
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
    <Card className="dashboard-card group">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h3 className="dashboard-card-title">
          {getTitle()}
        </h3>
        <div className="flex gap-3">
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
          <Select value={selectedPeriod} onValueChange={(value) => setSelectedPeriod(value as PeriodType)}>
            <SelectTrigger className="w-[150px] bg-background font-medium">
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
          <Legend className="chart-legend" />
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
