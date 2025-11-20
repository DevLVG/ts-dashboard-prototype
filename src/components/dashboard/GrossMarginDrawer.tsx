import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVarianceTextColor } from "@/lib/varianceColors";

interface GrossMarginBreakdown {
  buName: string;
  serviceName?: string;
  revenue: number;
  directCosts: {
    personnel?: { items: { label: string; amount: number }[] };
    operations?: { items: { label: string; amount: number }[] };
    cogs?: { items: { label: string; amount: number }[] };
    total: number;
    budget: number;
  };
  grossMargin: {
    actual: number;
    actualPercent: number;
    budget: number;
    budgetPercent: number;
  };
}

interface GrossMarginDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  breakdown: GrossMarginBreakdown | null;
}

export const GrossMarginDrawer = ({ isOpen, onClose, breakdown }: GrossMarginDrawerProps) => {
  if (!breakdown) return null;

  const gmVariance = breakdown.grossMargin.actual - breakdown.grossMargin.budget;
  const gmVariancePercent = (gmVariance / breakdown.grossMargin.budget) * 100;
  const cogsVariance = breakdown.directCosts.total - breakdown.directCosts.budget;
  const cogsVariancePercent = (cogsVariance / breakdown.directCosts.budget) * 100;


  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-SA", {
      style: "currency",
      currency: "SAR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const displayName = breakdown.serviceName 
    ? `${breakdown.serviceName} (${breakdown.buName})`
    : breakdown.buName;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        className={`fixed top-0 right-0 h-full bg-card border-l border-border z-50 shadow-2xl transition-transform duration-300 overflow-y-auto ${
          isOpen ? "translate-x-0" : "translate-x-full"
        } w-full md:w-[400px]`}
      >
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-xl font-heading tracking-wide mb-2">
                Gross Margin Breakdown
              </h2>
              <p className="text-lg font-semibold text-foreground">
                {displayName}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Revenue Section */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Revenue
            </h3>
            <div className="pl-3 border-l-2 border-[#22d3ee]">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">Total Revenue</span>
                <span className="text-lg font-bold text-foreground">
                  {formatCurrency(breakdown.revenue)}
                </span>
              </div>
            </div>
          </div>

          {/* Direct Costs Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Minus: Direct Costs (COGS)
            </h3>
            
            {/* Personnel */}
            {breakdown.directCosts.personnel && breakdown.directCosts.personnel.items.length > 0 && (
              <div className="space-y-2 pl-3 border-l-2 border-[#dc3545]">
                <p className="text-sm font-semibold">Personnel (Direct):</p>
                {breakdown.directCosts.personnel.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center pl-2">
                    <span className="text-sm">- {item.label}</span>
                    <span className="text-sm font-semibold">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Operations */}
            {breakdown.directCosts.operations && breakdown.directCosts.operations.items.length > 0 && (
              <div className="space-y-2 pl-3 border-l-2 border-[#dc3545]">
                <p className="text-sm font-semibold">Operations:</p>
                {breakdown.directCosts.operations.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center pl-2">
                    <span className="text-sm">- {item.label}</span>
                    <span className="text-sm font-semibold">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* COGS (for Retail) */}
            {breakdown.directCosts.cogs && breakdown.directCosts.cogs.items.length > 0 && (
              <div className="space-y-2 pl-3 border-l-2 border-[#dc3545]">
                <p className="text-sm font-semibold">Cost of Goods Sold:</p>
                {breakdown.directCosts.cogs.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center pl-2">
                    <span className="text-sm">- {item.label}</span>
                    <span className="text-sm font-semibold">
                      {formatCurrency(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Total Direct Costs */}
            <div className="pt-2 border-t border-border space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold">TOTAL DIRECT COSTS</span>
                <span className="text-base font-bold">
                  {formatCurrency(breakdown.directCosts.total)}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Budget</span>
                <span>{formatCurrency(breakdown.directCosts.budget)}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Variance</span>
                <span className={`font-semibold ${getVarianceTextColor(cogsVariancePercent, "COGS")}`}>
                  {cogsVariancePercent >= 0 ? "+" : ""}{cogsVariancePercent.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Gross Margin Result */}
          <div className="pt-4 border-t-2 border-border space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-lg font-bold">GROSS MARGIN</span>
              <span className="text-2xl font-bold text-[#22d3ee]">
                {formatCurrency(breakdown.grossMargin.actual)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-base font-semibold">GM %</span>
              <span className="text-xl font-bold text-[#22d3ee]">
                {breakdown.grossMargin.actualPercent.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Budget GM</span>
              <span>
                {formatCurrency(breakdown.grossMargin.budget)} ({breakdown.grossMargin.budgetPercent.toFixed(1)}%)
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Variance</span>
              <span className={`font-semibold ${getVarianceTextColor(gmVariancePercent, "GM")}`}>
                {gmVariancePercent >= 0 ? "+" : ""}{gmVariancePercent.toFixed(1)}%
              </span>
            </div>
          </div>

          {/* Footer Button */}
          <Button className="w-full" variant="outline">
            View Transactions
          </Button>
        </div>
      </div>
    </>
  );
};
