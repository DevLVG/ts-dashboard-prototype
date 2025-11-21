import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { RevenueDrilldownTable } from "@/components/drilldown/RevenueDrilldownTable";
import { OpexDrilldownTable } from "@/components/drilldown/OpexDrilldownTable";
import { SummaryPanel } from "@/components/drilldown/SummaryPanel";
import { ConcentrationPanel } from "@/components/drilldown/ConcentrationPanel";
import { getRevenueBreakdown, getCogsBreakdown, getOpexBreakdown, getGMBreakdown } from "@/lib/drilldownData";
import { calculateConcentration } from "@/lib/concentration";

interface WaterfallDrilldownDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  drilldownType: 'revenue' | 'cogs' | 'gm' | 'opex' | 'ebitda' | 'net_income' | null;
  period: { start: string; end: string; label: string };
  scenario: string;
  comparison: string; // "Budget_Base" | "Budget_Worst" | "Budget_Best" | "Actual" (for PY)
  bu?: string;
}

export function WaterfallDrilldownDrawer({
  isOpen,
  onClose,
  drilldownType,
  period,
  scenario,
  comparison,
  bu
}: WaterfallDrilldownDrawerProps) {
  
  // Keyboard shortcut: ESC to close drawer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
  
  if (!drilldownType) return null;

  // Get the appropriate data based on drilldown type
  const getData = () => {
    const buCode = bu === "All Company" ? undefined : bu;
    
    switch (drilldownType) {
      case 'revenue':
        return getRevenueBreakdown(period.start, period.end, scenario, comparison, buCode);
      case 'cogs': {
        const revenueData = getRevenueBreakdown(period.start, period.end, scenario, comparison, buCode);
        return getCogsBreakdown(period.start, period.end, scenario, comparison, buCode, {
          actual: revenueData.totalActual,
          comparison: revenueData.totalComparison
        });
      }
      case 'gm':
        return getGMBreakdown(period.start, period.end, scenario, comparison, buCode);
      case 'opex': {
        const revenueData = getRevenueBreakdown(period.start, period.end, scenario, comparison, buCode);
        return getOpexBreakdown(period.start, period.end, scenario, comparison, buCode, {
          actual: revenueData.totalActual,
          comparison: revenueData.totalComparison
        });
      }
      case 'ebitda': {
        const revenueData = getRevenueBreakdown(period.start, period.end, scenario, comparison, buCode);
        const gmData = getGMBreakdown(period.start, period.end, scenario, comparison, buCode);
        const opexData = getOpexBreakdown(period.start, period.end, scenario, comparison, buCode);
        const totalActual = gmData.totalActual - opexData.totalActual;
        const totalComparison = gmData.totalComparison - opexData.totalComparison;
        const actualPercent = revenueData.totalActual !== 0 ? (totalActual / revenueData.totalActual) * 100 : 0;
        const comparisonPercent = revenueData.totalComparison !== 0 ? (totalComparison / revenueData.totalComparison) * 100 : 0;
        return {
          rows: [],
          totalActual,
          totalComparison,
          totalDelta: totalActual - totalComparison,
          totalDeltaPercent: totalComparison !== 0 ? ((totalActual - totalComparison) / Math.abs(totalComparison)) * 100 : 0,
          actualPercent,
          comparisonPercent,
          deltaPP: actualPercent - comparisonPercent
        };
      }
      default:
        return { rows: [], totalActual: 0, totalComparison: 0, totalDelta: 0, totalDeltaPercent: 0 };
    }
  };

  const data = getData();

  // Get title based on drilldown type
  const getTitle = () => {
    switch (drilldownType) {
      case 'revenue':
        return 'Revenue Breakdown';
      case 'cogs':
        return 'COGS Breakdown';
      case 'gm':
        return 'Gross Margin Breakdown';
      case 'opex':
        return 'Operating Expenses Breakdown';
      case 'ebitda':
        return 'EBITDA Breakdown';
      case 'net_income':
        return 'Net Income Breakdown';
      default:
        return 'Breakdown';
    }
  };

  const getSubtitle = () => {
    const comparisonLabel = comparison === "Actual" ? "vs Previous Year" : 
                           comparison === "Budget_Base" ? "vs Base Budget" :
                           comparison === "Budget_Worst" ? "vs Worst Case" :
                           comparison === "Budget_Best" ? "vs Best Case" : "vs Budget";
    
    return `${period.label} • ${bu || "All Company"} • ${comparisonLabel}`;
  };

  return (
    <Drawer open={isOpen} onOpenChange={onClose}>
      <DrawerContent className="h-[90vh]">
        <DrawerHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle className="text-xl">{getTitle()}</DrawerTitle>
              <p className="text-sm text-muted-foreground mt-1">{getSubtitle()}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DrawerHeader>
        
        <div className="overflow-y-auto p-6">
          {drilldownType === 'revenue' && (
            <>
              <RevenueDrilldownTable 
                rows={data.rows}
                totalActual={data.totalActual}
                totalComparison={data.totalComparison}
                totalDelta={data.totalDelta}
                totalDeltaPercent={data.totalDeltaPercent}
              />
              <ConcentrationPanel metrics={calculateConcentration(data.rows, data.totalActual)} />
            </>
          )}
          
          {drilldownType === 'cogs' && (
            <>
              {data.actualPercent !== undefined && data.comparisonPercent !== undefined && data.deltaPP !== undefined && (
                <SummaryPanel
                  label="COGS % of Revenue"
                  actualPercent={data.actualPercent}
                  comparisonPercent={data.comparisonPercent}
                  deltaPP={data.deltaPP}
                  colorLogic="lower-is-better"
                />
              )}
              <RevenueDrilldownTable 
                rows={data.rows}
                totalActual={data.totalActual}
                totalComparison={data.totalComparison}
                totalDelta={data.totalDelta}
                totalDeltaPercent={data.totalDeltaPercent}
              />
            </>
          )}
          
          {drilldownType === 'gm' && (
            <>
              {data.actualPercent !== undefined && data.comparisonPercent !== undefined && data.deltaPP !== undefined && (
                <SummaryPanel
                  label="Gross Margin %"
                  actualPercent={data.actualPercent}
                  comparisonPercent={data.comparisonPercent}
                  deltaPP={data.deltaPP}
                  colorLogic="higher-is-better"
                />
              )}
              <RevenueDrilldownTable 
                rows={data.rows}
                totalActual={data.totalActual}
                totalComparison={data.totalComparison}
                totalDelta={data.totalDelta}
                totalDeltaPercent={data.totalDeltaPercent}
              />
            </>
          )}
          
          {drilldownType === 'opex' && (
            <>
              {data.actualPercent !== undefined && data.comparisonPercent !== undefined && data.deltaPP !== undefined && (
                <SummaryPanel
                  label="OpEx % of Revenue"
                  actualPercent={data.actualPercent}
                  comparisonPercent={data.comparisonPercent}
                  deltaPP={data.deltaPP}
                  colorLogic="lower-is-better"
                />
              )}
              <OpexDrilldownTable 
                rows={data.rows}
                totalActual={data.totalActual}
                totalComparison={data.totalComparison}
                totalDelta={data.totalDelta}
                totalDeltaPercent={data.totalDeltaPercent}
              />
            </>
          )}
          
          {drilldownType === 'ebitda' && (
            <>
              {data.actualPercent !== undefined && data.comparisonPercent !== undefined && data.deltaPP !== undefined && (
                <SummaryPanel
                  label="EBITDA %"
                  actualPercent={data.actualPercent}
                  comparisonPercent={data.comparisonPercent}
                  deltaPP={data.deltaPP}
                  colorLogic="higher-is-better"
                />
              )}
              <div className="text-center text-muted-foreground py-8">
                Detailed breakdown coming soon
              </div>
            </>
          )}
          
          {drilldownType === 'net_income' && (
            <div className="text-center text-muted-foreground py-8">
              Drill-down coming soon
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
