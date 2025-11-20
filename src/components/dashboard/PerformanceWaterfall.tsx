import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
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
      grossMargin: 409700,
      opex: -550000,
      ebitda: -140300,
      da: -20000,
      interest: -5000,
      ebt: -165300,
      taxes: -33060,
      netIncome: -198360
    },
    budget: {
      revenues: 1000000,
      cogs: -500000,
      grossMargin: 500000,
      opex: -565000,
      ebitda: -65000,
      da: -22000,
      interest: -5500,
      ebt: -92500,
      taxes: -18500,
      netIncome: -111000
    }
  };

  const dataSource = selectedScenario === "actual" ? buildDownData.actual : buildDownData.budget;

  // Calculate waterfall positions
  const calculateWaterfallData = () => {
    const items = [
      { label: "Revenues", value: dataSource.revenues, type: "total" },
      { label: "COGS", value: dataSource.cogs, type: "decrease" },
      { label: "GM", value: dataSource.revenues + dataSource.cogs, type: "subtotal" },
      { label: "OpEx", value: dataSource.opex, type: "decrease" },
      { label: "EBITDA", value: dataSource.revenues + dataSource.cogs + dataSource.opex, type: "subtotal" },
      { label: "D&A", value: dataSource.da, type: "decrease" },
      { label: "Interest", value: dataSource.interest, type: "decrease" },
      { label: "EBT", value: dataSource.revenues + dataSource.cogs + dataSource.opex + dataSource.da + dataSource.interest, type: "subtotal" },
      { label: "Taxes", value: dataSource.taxes, type: "decrease" },
      { label: "Net Income", value: dataSource.revenues + dataSource.cogs + dataSource.opex + dataSource.da + dataSource.interest + dataSource.taxes, type: "total" }
    ];

    return items.map((item, index) => {
      if (item.type === "total" || item.type === "subtotal") {
        return {
          label: item.label,
          start: 0,
          end: item.value,
          value: item.value,
          type: item.type
        };
      } else {
        // For decreases, we need to show them as bars going down from the previous total
        const previousTotal = index > 0 ? items[index - 1].value : 0;
        return {
          label: item.label,
          start: Math.min(previousTotal + item.value, previousTotal),
          end: Math.max(previousTotal + item.value, previousTotal),
          value: item.value,
          type: item.type
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

  const getBarColor = (type: string) => {
    switch (type) {
      case "total":
        return "hsl(var(--chart-1))";
      case "subtotal":
        return "hsl(var(--chart-2))";
      case "decrease":
        return "hsl(var(--destructive))";
      default:
        return "hsl(var(--chart-3))";
    }
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
              <Cell key={`cell-${index}`} fill={getBarColor(entry.type)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
};
