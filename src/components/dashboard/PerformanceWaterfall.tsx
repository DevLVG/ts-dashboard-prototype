import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LabelList } from "recharts";
import { useState } from "react";
import { getMonthlyPLData, calculateGM, calculateEBITDA } from "@/data/financialData";
import { getVarianceHexColor } from "@/lib/varianceColors";
import { WaterfallDrilldownDrawer } from "./WaterfallDrilldownDrawer";

interface PerformanceWaterfallProps {
  selectedMonth: string;
  selectedScenario: 'Budget_Base' | 'Budget_Worst' | 'Budget_Best' | 'PY';
  selectedBU: string;
}

export const PerformanceWaterfall = ({ selectedMonth, selectedScenario, selectedBU }: PerformanceWaterfallProps) => {
  const { toast } = useToast();
  
  // Drill-down state
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownType, setDrilldownType] = useState<'revenue' | 'cogs' | 'gm' | 'opex' | 'ebitda' | 'netIncome' | 'da' | 'interest' | 'taxes' | 'ebt' | null>(null);

  // Get data using the new financial data system
  const buCode = selectedBU === "All Company" ? undefined : 
    selectedBU === "Equestrian" ? "BU1_Equestrian" :
    selectedBU === "Events" ? "BU2_Events" :
    selectedBU === "Retail" ? "BU3_Retail" :
    selectedBU === "Advisory" ? "BU4_Advisory" : undefined;
  
  // Use the appropriate budget scenario
  const budgetScenario = selectedScenario === "PY" ? "Budget_Base" : selectedScenario;
  const plData = getMonthlyPLData(buCode, budgetScenario);
  
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
  
  // Select comparison values based on scenario
  let revComparison: number;
  let cogsComparison: number;
  let opexComparison: number;
  
  if (selectedScenario === "PY") {
    // Compare against Previous Year
    revComparison = revPY;
    cogsComparison = cogsPY;
    opexComparison = opexPY;
  } else {
    // Use budget from selected scenario (already loaded with correct scenario)
    revComparison = revBudget;
    cogsComparison = cogsBudget;
    opexComparison = opexBudget;
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

  // Handle bar click for drill-down
  const handleBarClick = (data: any) => {
    const typeMap: Record<string, 'revenue' | 'cogs' | 'gm' | 'opex' | 'ebitda' | 'netIncome' | 'da' | 'interest' | 'taxes' | 'ebt'> = {
      'Revenues': 'revenue',
      'COGS': 'cogs',
      'GM': 'gm',
      'OpEx': 'opex',
      'EBITDA': 'ebitda',
      'D&A': 'da',
      'Interest': 'interest',
      'EBT': 'ebt',
      'Taxes': 'taxes',
      'Net Income': 'netIncome'
    };
    
    const type = typeMap[data.label];
    if (type) {
      // Check if the amount is zero for certain types
      if (data.value === 0 && ['da', 'interest', 'taxes', 'ebt'].includes(type)) {
        toast({
          title: "No data available",
          description: "No data for this period",
        });
        return;
      }
      
      setDrilldownType(type);
      setDrilldownOpen(true);
    }
  };

  // Get period dates for drill-down
  const getPeriodDates = (): { start: string; end: string; label: string } => {
    const today = "2025-11-30";
    
    if (selectedMonth === "MTD") {
      return { start: "2025-11-01", end: today, label: "November MTD" };
    }
    if (selectedMonth === "QTD") {
      return { start: "2025-09-01", end: today, label: "Q4 QTD" };
    }
    if (selectedMonth === "YTD") {
      return { start: "2024-12-01", end: today, label: "YTD 2025" };
    }
    
    // Specific month mapping
    const monthMap: Record<string, { start: string; end: string; label: string }> = {
      "December": { start: "2024-12-01", end: "2024-12-31", label: "December 2024" },
      "January": { start: "2025-01-01", end: "2025-01-31", label: "January 2025" },
      "February": { start: "2025-02-01", end: "2025-02-28", label: "February 2025" },
      "March": { start: "2025-03-01", end: "2025-03-31", label: "March 2025" },
      "April": { start: "2025-04-01", end: "2025-04-30", label: "April 2025" },
      "May": { start: "2025-05-01", end: "2025-05-31", label: "May 2025" },
      "June": { start: "2025-06-01", end: "2025-06-30", label: "June 2025" },
      "July": { start: "2025-07-01", end: "2025-07-31", label: "July 2025" },
      "August": { start: "2025-08-01", end: "2025-08-31", label: "August 2025" },
      "September": { start: "2025-09-01", end: "2025-09-30", label: "September 2025" },
      "October": { start: "2025-10-01", end: "2025-10-31", label: "October 2025" },
      "November": { start: "2025-11-01", end: "2025-11-30", label: "November 2025" },
    };
    
    return monthMap[selectedMonth] || { start: "2025-11-01", end: "2025-11-30", label: "November 2025" };
  };

  const formatCurrency = (value: number) => {
    return Math.round(value).toLocaleString('en-US');
  };

  const getBarColor = (value: number, comparisonValue: number, type: string, label: string) => {
    const variance = comparisonValue !== 0 
      ? ((value - comparisonValue) / Math.abs(comparisonValue)) * 100 
      : 0;
    
    // Determine metric label for color logic
    let metricLabel = "Revenue";
    if (label.includes("OpEx") || type === "decrease") {
      metricLabel = "OpEx"; // Costs use inverted logic
    } else if (label.includes("GM") || label.includes("Gross")) {
      metricLabel = "GM";
    } else if (label.includes("EBITDA")) {
      metricLabel = "EBITDA";
    }
    
    // Get base color and apply KPI card transparency (10-15%)
    const baseColor = getVarianceHexColor(variance, metricLabel);
    
    // Convert hex to rgba with KPI card opacity (matching overview cards)
    const hexToRgba = (hex: string, opacity: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };
    
    // Use 15% opacity for warning (yellow), 10% for success/destructive (matching KPI cards)
    const opacity = baseColor === "#ffc107" ? 0.15 : 0.10;
    return hexToRgba(baseColor, opacity);
  };

  const getBarStroke = (value: number, comparisonValue: number, type: string, label: string) => {
    const variance = comparisonValue !== 0 
      ? ((value - comparisonValue) / Math.abs(comparisonValue)) * 100 
      : 0;
    
    // Determine metric label for color logic
    let metricLabel = "Revenue";
    if (label.includes("OpEx") || type === "decrease") {
      metricLabel = "OpEx";
    } else if (label.includes("GM") || label.includes("Gross")) {
      metricLabel = "GM";
    } else if (label.includes("EBITDA")) {
      metricLabel = "EBITDA";
    }
    
    // Get base color for border (30-40% opacity like KPI cards)
    const baseColor = getVarianceHexColor(variance, metricLabel);
    
    const hexToRgba = (hex: string, opacity: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    };
    
    // Border opacity: 40% for warning, 30% for others (matching KPI cards)
    const strokeOpacity = baseColor === "#ffc107" ? 0.40 : 0.30;
    return hexToRgba(baseColor, strokeOpacity);
  };

  const renderCustomLabel = (props: any) => {
    const { x, y, width, height, index } = props;
    const entry = waterfallData[index];
    if (!entry) return null;
    
    const actualValue = entry.value;
    // Show negative sign for negative values, format absolute value
    const displayValue = actualValue < 0 
      ? `-${formatCurrency(Math.abs(actualValue))}`
      : formatCurrency(actualValue);
    
    // Calculate text height requirements
    const lineHeight = 14; // fontSize for value
    const totalTextHeight = lineHeight; // Only value text, no percentage
    
    // Bar must be at least 10% taller than text to fit inside
    const barHeight = Math.abs(height);
    const minBarHeightForInside = totalTextHeight * 1.1;
    const hasSpaceInside = barHeight >= minBarHeightForInside;
    
    // Chart configuration
    const chartTopMargin = 20;
    const chartHeight = 400;
    const chartBottomMargin = 60;
    
    // Calculate where the X-axis (0 line) is positioned in pixel coordinates
    // Based on yAxisDomain from the chart config
    const yAxisDomain = [-300000, 900000];
    const chartDrawHeight = chartHeight - chartTopMargin - chartBottomMargin; // 320px
    const zeroPixelY = chartTopMargin + (chartDrawHeight * (yAxisDomain[1] - 0) / (yAxisDomain[1] - yAxisDomain[0]));
    // This gives us the Y pixel position where value=0 is drawn
    
    // Define exclusion zones
    const xAxisZoneHeight = 18; // Pixels to avoid around the X-axis line
    const xAxisTopBoundary = zeroPixelY - xAxisZoneHeight;
    const xAxisBottomBoundary = zeroPixelY + xAxisZoneHeight;
    
    const minYForText = chartTopMargin + 15; // Avoid top margin
    const maxYForText = chartHeight - chartBottomMargin - 15; // Avoid bottom X-axis labels
    
    // Determine position based on bar direction and available space
    let valueY: number;
    let textColor: string;
    
    if (hasSpaceInside) {
      // Place inside the bar
      valueY = y + height / 2 + 5; // Center vertically
      textColor = "hsl(0, 0%, 15%)";
    } else {
      // Place outside the bar
      const isPositiveBar = height > 0;
      
      // Helper function to check if a Y position overlaps with X-axis
      const overlapsXAxis = (textY: number) => {
        return textY >= xAxisTopBoundary && textY <= xAxisBottomBoundary;
      };
      
      if (isPositiveBar) {
        // Bar goes up - try placing text above first
        let proposedValueY = y - 12;
        
        // Check if above position is valid (not too high, not overlapping X-axis)
        const aboveIsValid = proposedValueY >= minYForText && 
                            !overlapsXAxis(proposedValueY);
        
        if (aboveIsValid) {
          valueY = proposedValueY;
        } else {
          // Try below
          let belowValueY = y + Math.abs(height) + 15;
          
          const belowIsValid = belowValueY <= maxYForText && 
                               !overlapsXAxis(belowValueY);
          
          if (belowIsValid) {
            valueY = belowValueY;
          } else {
            // Neither position is perfect - use the one further from X-axis
            const distanceAbove = Math.abs(proposedValueY - zeroPixelY);
            const distanceBelow = Math.abs(belowValueY - zeroPixelY);
            
            if (distanceAbove > distanceBelow) {
              // Above is safer
              valueY = Math.max(minYForText, proposedValueY);
            } else {
              // Below is safer
              valueY = Math.min(maxYForText, belowValueY);
            }
          }
        }
      } else {
        // Bar goes down - try placing text below first
        let proposedValueY = y + Math.abs(height) + 15;
        
        const belowIsValid = proposedValueY <= maxYForText && 
                            !overlapsXAxis(proposedValueY);
        
        if (belowIsValid) {
          valueY = proposedValueY;
        } else {
          // Try above
          let aboveValueY = y - 12;
          
          const aboveIsValid = aboveValueY >= minYForText && 
                              !overlapsXAxis(aboveValueY);
          
          if (aboveIsValid) {
            valueY = aboveValueY;
          } else {
            // Neither position is perfect - use the one further from X-axis
            const distanceBelow = Math.abs(proposedValueY - zeroPixelY);
            const distanceAbove = Math.abs(aboveValueY - zeroPixelY);
            
            if (distanceBelow > distanceAbove) {
              // Below is safer
              valueY = Math.min(maxYForText, proposedValueY);
            } else {
              // Above is safer
              valueY = Math.max(minYForText, aboveValueY);
            }
          }
        }
      }
      
      textColor = "hsl(var(--foreground))";
    }
    
    return (
      <g>
        <text 
          x={x + width / 2} 
          y={valueY} 
          fill={textColor} 
          textAnchor="middle" 
          fontSize={12}
          fontWeight={600}
        >
          {displayValue}
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
            Revenue to Net Income breakdown<br/>
            <span className="text-xs">SAR</span>
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
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                const actualValue = data.value;
                const comparisonValue = data.comparisonValue;
                const variance = comparisonValue !== 0
                  ? ((actualValue - comparisonValue) / Math.abs(comparisonValue)) * 100
                  : 0;
                
                return (
                  <div className="chart-tooltip">
                    <p className="chart-tooltip-title">{data.label}</p>
                    <div className="chart-tooltip-content space-y-1">
                      <p className="text-popover-foreground">
                        <span className="font-semibold">Actual:</span> {formatCurrency(actualValue)}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-semibold">Budget:</span> {formatCurrency(comparisonValue)}
                      </p>
                      <p className="text-muted-foreground">
                        <span className="font-semibold">Variance:</span> {variance > 0 ? '+' : ''}{variance.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                );
              }
              return null;
            }}
            cursor={{ fill: 'hsl(var(--muted))' }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeWidth={1.5} />
          
          {/* Invisible bar for positioning */}
          <Bar dataKey="start" stackId="a" fill="transparent" />
          
          {/* Visible bar */}
          <Bar 
            dataKey={(entry) => entry.end - entry.start} 
            stackId="a"
            strokeWidth={2}
            radius={[8, 8, 8, 8]}
            onClick={handleBarClick}
            cursor="pointer"
          >
            {waterfallData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={getBarColor(entry.value, entry.comparisonValue, entry.type, entry.label)}
                stroke={getBarStroke(entry.value, entry.comparisonValue, entry.type, entry.label)}
              />
            ))}
            <LabelList content={renderCustomLabel} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Drill-down Drawer */}
      <WaterfallDrilldownDrawer
        isOpen={drilldownOpen}
        onClose={() => setDrilldownOpen(false)}
        drilldownType={drilldownType}
        period={getPeriodDates()}
        scenario="Actual"
        comparison={selectedScenario === "PY" ? "Actual" : selectedScenario}
        bu={selectedBU}
      />
    </Card>
  );
};
