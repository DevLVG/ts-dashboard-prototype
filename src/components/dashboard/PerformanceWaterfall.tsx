import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList } from "recharts";
import { useState } from "react";

interface PerformanceWaterfallProps {
  selectedMonth: string;
  selectedScenario: string;
  selectedBU: string;
}

export const PerformanceWaterfall = ({ selectedMonth, selectedScenario, selectedBU }: PerformanceWaterfallProps) => {
  // Mock data - this will be replaced with actual data based on filters
  const buildDownData = {
    actual: {
      revenues: 850000,
      cogs: -440300,
      opex: -550000,
      da: -20000,
      interest: -5000,
      taxes: -33060
    },
    budget: {
      revenues: 1000000,
      cogs: -500000,
      opex: -565000,
      da: -22000,
      interest: -5500,
      taxes: -18500
    }
  };

  const actual = buildDownData.actual;
  const budget = buildDownData.budget;
  const dataSource = selectedScenario === "actual" ? actual : budget;

  // Calculate waterfall positions
  const calculateWaterfallData = () => {
    const revenues = dataSource.revenues;
    const gm = revenues + dataSource.cogs;
    const ebitda = gm + dataSource.opex;
    const ebt = ebitda + dataSource.da + dataSource.interest;
    const netIncome = ebt + dataSource.taxes;

    const revenuesBudget = budget.revenues;
    const gmBudget = revenuesBudget + budget.cogs;
    const ebitdaBudget = gmBudget + budget.opex;
    const ebtBudget = ebitdaBudget + budget.da + budget.interest;
    const netIncomeBudget = ebtBudget + budget.taxes;

    const items = [
      { label: "Revenues", value: revenues, budgetValue: revenuesBudget, type: "total" },
      { label: "COGS", value: dataSource.cogs, budgetValue: budget.cogs, type: "decrease" },
      { label: "GM", value: gm, budgetValue: gmBudget, type: "subtotal" },
      { label: "OpEx", value: dataSource.opex, budgetValue: budget.opex, type: "decrease" },
      { label: "EBITDA", value: ebitda, budgetValue: ebitdaBudget, type: "subtotal" },
      { label: "D&A", value: dataSource.da, budgetValue: budget.da, type: "decrease" },
      { label: "Interest", value: dataSource.interest, budgetValue: budget.interest, type: "decrease" },
      { label: "EBT", value: ebt, budgetValue: ebtBudget, type: "subtotal" },
      { label: "Taxes", value: dataSource.taxes, budgetValue: budget.taxes, type: "decrease" },
      { label: "Net Income", value: netIncome, budgetValue: netIncomeBudget, type: "total" }
    ];

    return items.map((item, index) => {
      if (item.type === "total" || item.type === "subtotal") {
        return {
          label: item.label,
          start: 0,
          end: item.value,
          value: item.value,
          budgetValue: item.budgetValue,
          type: item.type,
          revenueBase: revenues
        };
      } else {
        const previousTotal = index > 0 ? items[index - 1].value : 0;
        return {
          label: item.label,
          start: Math.min(previousTotal + item.value, previousTotal),
          end: Math.max(previousTotal + item.value, previousTotal),
          value: item.value,
          budgetValue: item.budgetValue,
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

  const getBarColor = (value: number, budgetValue: number, type: string) => {
    if (type === "decrease") {
      // For decreases (negative values), lower is better
      const variance = ((value - budgetValue) / budgetValue) * 100;
      if (variance <= -5) return "hsl(142, 76%, 36%)"; // Green (better than budget)
      if (variance >= 5) return "hsl(0, 84%, 60%)"; // Red (worse than budget)
      return "hsl(48, 96%, 53%)"; // Yellow (near budget)
    } else {
      // For totals/subtotals, higher is better
      const variance = ((value - budgetValue) / budgetValue) * 100;
      if (variance >= 5) return "hsl(142, 76%, 36%)"; // Green (above budget)
      if (variance <= -5) return "hsl(0, 84%, 60%)"; // Red (below budget)
      return "hsl(48, 96%, 53%)"; // Yellow (near budget)
    }
  };

  const renderCustomLabel = (props: any) => {
    const { x, y, width, height, value, revenueBase } = props;
    const percentage = ((Math.abs(value) / Math.abs(revenueBase)) * 100).toFixed(1);
    const displayValue = formatCurrency(Math.abs(value));
    
    return (
      <g>
        <text 
          x={x + width / 2} 
          y={y + height / 2 - 5} 
          fill="hsl(var(--foreground))" 
          textAnchor="middle" 
          fontSize={12}
          fontWeight={600}
        >
          {displayValue}
        </text>
        <text 
          x={x + width / 2} 
          y={y + height / 2 + 10} 
          fill="hsl(var(--muted-foreground))" 
          textAnchor="middle" 
          fontSize={10}
        >
          ({percentage}%)
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
              <Cell key={`cell-${index}`} fill={getBarColor(entry.value, entry.budgetValue, entry.type)} />
            ))}
            <LabelList content={renderCustomLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
