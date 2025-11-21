import { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { RevenueDrilldownTable } from "@/components/drilldown/RevenueDrilldownTable";
import { OpexDrilldownTable } from "@/components/drilldown/OpexDrilldownTable";
import { EBITDADrilldownTable } from "@/components/drilldown/EBITDADrilldownTable";
import { SummaryPanel } from "@/components/drilldown/SummaryPanel";
import { ConcentrationPanel } from "@/components/drilldown/ConcentrationPanel";
import { getRevenueBreakdown, getCogsBreakdown, getOpexBreakdown, getGMBreakdown, getEBITDABreakdown } from "@/lib/drilldownData";
import { calculateConcentration } from "@/lib/concentration";

interface WaterfallDrilldownDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  drilldownType: 'revenue' | 'cogs' | 'gm' | 'opex' | 'ebitda' | 'netIncome' | 'da' | 'interest' | 'taxes' | 'ebt' | null;
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
      case 'netIncome':
        return 'Net Income Breakdown';
      case 'da':
        return 'Depreciation & Amortization';
      case 'interest':
        return 'Interest';
      case 'taxes':
        return 'Taxes';
      case 'ebt':
        return 'EBT';
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

  // Check if this is a zero-amount metric (D&A, Interest, Taxes)
  if (['da', 'interest', 'taxes'].includes(drilldownType || '')) {
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
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-center">No data for this period</p>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // Get data for each type
  const buCode = bu === "All Company" ? undefined : bu;
  
  let revenueData, cogsData, gmData, opexData, ebitdaData;
  
  if (drilldownType === 'revenue') {
    revenueData = getRevenueBreakdown(period.start, period.end, scenario, comparison, buCode);
  } else if (drilldownType === 'cogs') {
    const revData = getRevenueBreakdown(period.start, period.end, scenario, comparison, buCode);
    cogsData = getCogsBreakdown(period.start, period.end, scenario, comparison, buCode, {
      actual: revData.totalActual,
      comparison: revData.totalComparison
    });
  } else if (drilldownType === 'gm') {
    gmData = getGMBreakdown(period.start, period.end, scenario, comparison, buCode);
  } else if (drilldownType === 'opex') {
    const revData = getRevenueBreakdown(period.start, period.end, scenario, comparison, buCode);
    opexData = getOpexBreakdown(period.start, period.end, scenario, comparison, buCode, {
      actual: revData.totalActual,
      comparison: revData.totalComparison
    });
  } else if (drilldownType === 'ebitda' || drilldownType === 'netIncome' || drilldownType === 'ebt') {
    ebitdaData = getEBITDABreakdown(period.start, period.end, scenario, comparison, buCode);
  }

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
        
        <div className="overflow-y-auto p-6 space-y-6">
          {drilldownType === 'revenue' && revenueData && (
            <>
              <RevenueDrilldownTable 
                rows={revenueData.rows as any}
                totalActual={revenueData.totalActual}
                totalComparison={revenueData.totalComparison}
                totalDelta={revenueData.totalDelta}
                totalDeltaPercent={revenueData.totalDeltaPercent}
              />
              <ConcentrationPanel metrics={calculateConcentration(revenueData.rows as any, revenueData.totalActual)} />
            </>
          )}
          
          {drilldownType === 'cogs' && cogsData && (
            <>
              {cogsData.actualPercent !== undefined && cogsData.comparisonPercent !== undefined && cogsData.deltaPP !== undefined && (
                <SummaryPanel
                  label="COGS % of Revenue"
                  actualPercent={cogsData.actualPercent}
                  comparisonPercent={cogsData.comparisonPercent}
                  deltaPP={cogsData.deltaPP}
                  colorLogic="lower-is-better"
                />
              )}
              <RevenueDrilldownTable 
                rows={cogsData.rows as any}
                totalActual={cogsData.totalActual}
                totalComparison={cogsData.totalComparison}
                totalDelta={cogsData.totalDelta}
                totalDeltaPercent={cogsData.totalDeltaPercent}
              />
            </>
          )}
          
          {drilldownType === 'gm' && gmData && (
            <>
              {gmData.actualPercent !== undefined && gmData.comparisonPercent !== undefined && gmData.deltaPP !== undefined && (
                <SummaryPanel
                  label="Gross Margin %"
                  actualPercent={gmData.actualPercent}
                  comparisonPercent={gmData.comparisonPercent}
                  deltaPP={gmData.deltaPP}
                  colorLogic="higher-is-better"
                />
              )}
              <RevenueDrilldownTable 
                rows={gmData.rows as any}
                totalActual={gmData.totalActual}
                totalComparison={gmData.totalComparison}
                totalDelta={gmData.totalDelta}
                totalDeltaPercent={gmData.totalDeltaPercent}
              />
            </>
          )}
          
          {drilldownType === 'opex' && opexData && (
            <>
              {opexData.actualPercent !== undefined && opexData.comparisonPercent !== undefined && opexData.deltaPP !== undefined && (
                <SummaryPanel
                  label="OpEx % of Revenue"
                  actualPercent={opexData.actualPercent}
                  comparisonPercent={opexData.comparisonPercent}
                  deltaPP={opexData.deltaPP}
                  colorLogic="lower-is-better"
                />
              )}
              <OpexDrilldownTable 
                rows={opexData.rows as any}
                totalActual={opexData.totalActual}
                totalComparison={opexData.totalComparison}
                totalDelta={opexData.totalDelta}
                totalDeltaPercent={opexData.totalDeltaPercent}
              />
            </>
          )}
          
          {(drilldownType === 'ebitda' || drilldownType === 'netIncome' || drilldownType === 'ebt') && ebitdaData && (
            <>
              <SummaryPanel
                label={drilldownType === 'ebitda' ? 'EBITDA Margin' : drilldownType === 'ebt' ? 'EBT Margin' : 'Net Income Margin'}
                actualPercent={ebitdaData.totalMargin}
                comparisonPercent={ebitdaData.comparisonMargin}
                deltaPP={ebitdaData.deltaPP}
                colorLogic="higher-is-better"
              />
              <EBITDADrilldownTable data={ebitdaData} />
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
