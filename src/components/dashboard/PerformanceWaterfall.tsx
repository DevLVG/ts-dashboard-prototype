import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList } from "recharts";
import { useState } from "react";
import { getMonthlyPLData, calculateGM, calculateEBITDA } from "@/data/financialData";

interface PerformanceWaterfallProps {
  selectedMonth: string;
  selectedScenario: string;
  selectedBU: string;
}

export const PerformanceWaterfall = ({ selectedMonth, selectedScenario, selectedBU }: PerformanceWaterfallProps) => {
  // Get data using the new financial data system
  const buCode = selectedBU === "All Company" ? undefined : 
    selectedBU === "Equestrian" ? "BU1_Equestrian" :
    selectedBU === "Events" ? "BU2_Events" :
    selectedBU === "Retail" ? "BU3_Retail" :
    selectedBU === "Advisory" ? "BU4_Advisory" : undefined;
  
  const plData = getMonthlyPLData(buCode);
  
  // Determine which months to include based on selectedMonth
  let monthsToInclude: string[] = [];
  const allMonths = ["Dec '24", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
  
  if (selectedMonth === "MTD") {
    monthsToInclude = [allMonths[allMonths.length - 1]];
  } else if (selectedMonth === "QTD") {
    monthsToInclude = allMonths.slice(-3);
  } else if (selectedMonth === "YTD") {
    monthsToInclude = allMonths;
  } else {
    const monthMap: Record<string, string> = {
      "December": "Dec '24",
      "January": "Jan",
      "February": "Feb",
      "March": "Mar",
      "April": "Apr",
      "May": "May",
      "June": "Jun",
      "July": "Jul",
      "August": "Aug",
      "September": "Sep",
      "October": "Oct",
      "November": "Nov",
    };
    monthsToInclude = [monthMap[selectedMonth] || "Nov"];
  }
  
  // Filter and sum data
  const filteredData = plData.filter(m => monthsToInclude.includes(m.month));
  
  let revActual = 0, revBudget = 0, revPY = 0;
  let cogsActual = 0, cogsBudget = 0, cogsPY = 0;
  let opexActual = 0, opexBudget = 0, opexPY = 0;
  
  filteredData.forEach(month => {
    revActual += month.revenues.actual;
    revBudget += month.revenues.budget;
    revPY += month.revenues.previousYear;
    cogsActual += month.cogs.actual;
    cogsBudget += month.cogs.budget;
    cogsPY += month.cogs.previousYear;
    opexActual += month.opex.actual;
    opexBudget += month.opex.budget;
    opexPY += month.opex.previousYear;
  });
  
  // Apply scenario adjustments to comparison values
  let revComparison = revBudget;
  let cogsComparison = cogsBudget;
  let opexComparison = opexBudget;
  
  if (selectedScenario === "worst") {
    revComparison = revBudget * 0.8;
    cogsComparison = cogsBudget * 0.8;
    opexComparison = opexBudget * 1.1;
  } else if (selectedScenario === "best") {
    revComparison = revBudget * 1.15;
    cogsComparison = cogsBudget * 1.15;
    opexComparison = opexBudget * 0.95;
  } else if (selectedScenario === "py") {
    revComparison = revPY;
    cogsComparison = cogsPY;
    opexComparison = opexPY;
  }

  const actual = {
    revenues: revActual,
    cogs: cogsActual,
    opex: opexActual,
    da: 0, // Not in JSON yet
    interest: 0,
    taxes: 0
  };

  const comparison = {
    revenues: revComparison,
    cogs: cogsComparison,
    opex: opexComparison,
    da: 0,
    interest: 0,
    taxes: 0
  };

  // Calculate waterfall positions with correct build down logic
  const calculateWaterfallData = () => {
    const revenues = actual.revenues;
    const gm = calculateGM(revenues, actual.cogs);
    const ebitda = calculateEBITDA(revenues, actual.cogs, actual.opex);
    const afterDA = ebitda + actual.da;
    const ebt = afterDA + actual.interest;
    const netIncome = ebt + actual.taxes;

    const revenuesComparison = comparison.revenues;
    const gmComparison = calculateGM(revenuesComparison, comparison.cogs);
    const ebitdaComparison = calculateEBITDA(revenuesComparison, comparison.cogs, comparison.opex);
    const afterDAComparison = ebitdaComparison + comparison.da;
    const ebtComparison = afterDAComparison + comparison.interest;
    const netIncomeComparison = ebtComparison + comparison.taxes;

    const items = [
      { label: "Revenues", value: revenues, comparisonValue: revenuesComparison, type: "total", cumulative: revenues },
      { label: "COGS", value: actual.cogs, comparisonValue: comparison.cogs, type: "decrease", cumulative: gm },
      { label: "GM", value: gm, comparisonValue: gmComparison, type: "subtotal", cumulative: gm },
      { label: "OpEx", value: actual.opex, comparisonValue: comparison.opex, type: "decrease", cumulative: ebitda },
      { label: "EBITDA", value: ebitda, comparisonValue: ebitdaComparison, type: "subtotal", cumulative: ebitda },
      { label: "D&A", value: actual.da, comparisonValue: comparison.da, type: "decrease", cumulative: afterDA },
      { label: "Interest", value: actual.interest, comparisonValue: comparison.interest, type: "decrease", cumulative: ebt },
      { label: "EBT", value: ebt, comparisonValue: ebtComparison, type: "subtotal", cumulative: ebt },
      { label: "Taxes", value: actual.taxes, comparisonValue: comparison.taxes, type: "decrease", cumulative: netIncome },
      { label: "Net Income", value: netIncome, comparisonValue: netIncomeComparison, type: "total", cumulative: netIncome }
    ];

    return items.map((item, index) => {
      if (item.type === "total" || item.type === "subtotal") {
        return {
          label: item.label,
          start: 0,
          end: item.value,
          value: item.value,
          comparisonValue: item.comparisonValue,
          type: item.type,
          revenueBase: revenues
        };
      } else {
        const previousCumulative = index > 0 ? items[index - 1].cumulative : 0;
        return {
          label: item.label,
          start: Math.min(item.cumulative, previousCumulative),
          end: Math.max(item.cumulative, previousCumulative),
          value: item.value,
          comparisonValue: item.comparisonValue,
          type: item.type,
          revenueBase: revenues
        };
      }
    });
  };

  const waterfallData = calculateWaterfallData();

  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value);
    if (absValue >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    return `${(value / 1000).toFixed(0)}K`;
  };

  const getBarColor = (value: number, comparisonValue: number, type: string) => {
    const variance = comparisonValue !== 0 
      ? ((value - comparisonValue) / Math.abs(comparisonValue)) * 100 
      : 0;
    
    if (type === "decrease") {
      // For costs (negative values): lower actual than budget is better
      if (variance <= -5) return "hsl(142, 76%, 36%)"; // Green (spending less)
      if (variance >= 5) return "hsl(0, 84%, 60%)"; // Red (spending more)
      return "hsl(48, 96%, 53%)"; // Yellow (near budget)
    } else {
      // For totals/subtotals: higher actual than budget is better
      if (variance >= 5) return "hsl(142, 76%, 36%)"; // Green (above budget)
      if (variance <= -5) return "hsl(0, 84%, 60%)"; // Red (below budget)
      return "hsl(48, 96%, 53%)"; // Yellow (near budget)
    }
  };

  const renderCustomLabel = (props: any) => {
    const { x, y, width, height, value, index } = props;
    const entry = waterfallData[index];
    if (!entry) return null;
    
    const actualValue = entry.value;
    const comparisonValue = entry.comparisonValue;
    const variance = comparisonValue !== 0
      ? ((actualValue - comparisonValue) / Math.abs(comparisonValue)) * 100
      : 0;
    const displayValue = formatCurrency(Math.abs(actualValue));
    
    return (
      <g>
        <text 
          x={x + width / 2} 
          y={y + height / 2 - 5} 
          fill="hsl(0, 0%, 15%)" 
          textAnchor="middle" 
          fontSize={12}
          fontWeight={600}
        >
          {displayValue}
        </text>
        <text 
          x={x + width / 2} 
          y={y + height / 2 + 10} 
          fill="hsl(0, 0%, 25%)" 
          textAnchor="middle" 
          fontSize={10}
        >
          ({variance > 0 ? '+' : ''}{variance.toFixed(1)}%)
        </text>
      </g>
    );
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">P&L Waterfall - Build Down</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Revenue to Net Income breakdown
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={waterfallData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis 
            dataKey="label" 
            angle={-45}
            textAnchor="end"
            height={80}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
          />
          <YAxis 
            tickFormatter={formatCurrency}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "6px",
              color: "hsl(var(--foreground))"
            }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1.5} />
          
          {/* Invisible bar for positioning */}
          <Bar dataKey="start" stackId="a" fill="transparent" />
          
          {/* Visible bar */}
          <Bar dataKey={(entry) => entry.end - entry.start} stackId="a">
            {waterfallData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.value, entry.comparisonValue, entry.type)} />
            ))}
            <LabelList content={renderCustomLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
