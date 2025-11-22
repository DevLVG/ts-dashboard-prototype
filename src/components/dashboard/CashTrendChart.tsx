import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Area, AreaChart, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line } from "recharts";
import { getMonthlyCashBalances, buMap } from "@/data/financialDataV8";
import type { TrendData } from "@/types/dashboard";

interface CashTrendChartProps {
  scenario: string;
  selectedBU: string;
}

type PeriodType = "6months" | "quarterly" | "yearly";

export const CashTrendChart = ({ scenario, selectedBU }: CashTrendChartProps) => {
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>("yearly");

  const getData = (): TrendData[] => {
    const buCode = selectedBU !== "All Company" ? buMap[selectedBU] : undefined;
    const budgetScenario = scenario === "PY" ? "Budget_Base" : scenario;
    const balances = getMonthlyCashBalances(budgetScenario, buCode);
    
    // Filter by period
    let dataToShow = balances;
    if (selectedPeriod === "quarterly") {
      dataToShow = balances.slice(-3);
    } else if (selectedPeriod === "6months") {
      dataToShow = balances.slice(-6);
    }
    
    return dataToShow;
  };

  const data = getData();

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

  const getTitle = () => {
    const buText = selectedBU === "All Company" ? "" : ` - ${selectedBU}`;
    return `CASH BALANCE TREND${buText}`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const actualValue = data.actual;
      const budgetValue = data.budget;
      const delta = actualValue - budgetValue;
      const deltaPercent = budgetValue !== 0 ? ((delta / budgetValue) * 100).toFixed(1) : "0.0";

      return (
        <div className="chart-tooltip">
          <p className="chart-tooltip-title">{data.month}</p>
          <div className="chart-tooltip-content">
            <p className="text-cyan-400">Actual: {formatTooltipCurrency(actualValue)}</p>
            <p className="text-muted-foreground">
              {scenario === "PY" ? "PY" : "Budget"}: {formatTooltipCurrency(budgetValue)}
            </p>
            <p className={delta >= 0 ? "text-cyan-400" : "text-red-400"}>
              Δ: {formatTooltipCurrency(delta)} ({deltaPercent}%)
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  // Calculate variance areas for shading
  const chartData = data.map(d => {
    const variance = d.actual - d.budget;
    return {
      ...d,
      baseArea: d.budget,
      positiveVariance: variance > 0 ? variance : 0,
      negativeVariance: variance < 0 ? Math.abs(variance) : 0
    };
  });

  return (
    <Card className="dashboard-card group">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <h3 className="dashboard-card-title">{getTitle()}</h3>
        <div className="flex gap-4">
          <Select value={selectedPeriod} onValueChange={(value: PeriodType) => setSelectedPeriod(value)}>
            <SelectTrigger className="w-[140px]">
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
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="positiveGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="negativeGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#dc3545" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#dc3545" stopOpacity={0} />
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
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'hsl(var(--gold) / 0.1)' }} />
          
          {/* Base area (budget) */}
          <Area
            type="monotone"
            dataKey="baseArea"
            stackId="1"
            stroke="none"
            fill="transparent"
          />
          
          {/* Positive variance area */}
          <Area
            type="monotone"
            dataKey="positiveVariance"
            stackId="1"
            stroke="none"
            fill="url(#positiveGradient)"
          />
          
          {/* Lines for actual and budget */}
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#22d3ee"
            strokeWidth={3}
            dot={{ fill: '#22d3ee', r: 4 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="budget"
            stroke="hsl(var(--muted-foreground))"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ fill: 'hsl(var(--muted-foreground))', r: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
};
