import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getVarianceTextColor } from "@/lib/varianceColors";

interface OpExBreakdown {
  buName: string;
  serviceName?: string;
  actual: number;
  budget: number;
  directCosts: {
    personnel: number;
    operations: number;
    facilities: number;
  };
  allocatedCosts: {
    adminPersonnel: { amount: number; method: string };
    utilities: { amount: number; method: string };
    marketing: { amount: number; method: string };
  };
}

interface OpExDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  breakdown: OpExBreakdown | null;
}

export const OpExDrawer = ({ isOpen, onClose, breakdown }: OpExDrawerProps) => {
  if (!breakdown) return null;

  const variance = breakdown.actual - breakdown.budget;
  const variancePercent = (variance / breakdown.budget) * 100;


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
                OpEx Breakdown
              </h2>
              <p className="text-lg font-semibold text-foreground">
                {displayName}
              </p>
              <p className="text-2xl font-bold text-foreground mt-1">
                {formatCurrency(breakdown.actual)}
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

          {/* Direct Costs Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Direct Costs
            </h3>
            <div className="space-y-2 pl-3 border-l-2 border-[#22d3ee]">
              <div className="flex justify-between items-center">
                <span className="text-sm">Personnel (Instructors)</span>
                <span className="text-sm font-semibold">
                  {formatCurrency(breakdown.directCosts.personnel)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Operations (Care, Materials)</span>
                <span className="text-sm font-semibold">
                  {formatCurrency(breakdown.directCosts.operations)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Facilities (Direct use)</span>
                <span className="text-sm font-semibold">
                  {formatCurrency(breakdown.directCosts.facilities)}
                </span>
              </div>
            </div>
          </div>

          {/* Allocated Costs Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Allocated Costs
            </h3>
            <div className="space-y-3 pl-3 border-l-2 border-[#ffc107]">
              <div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Personnel (Admin & Support)</span>
                  <span className="text-sm font-semibold">
                    {formatCurrency(breakdown.allocatedCosts.adminPersonnel.amount)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  (Allocated by: {breakdown.allocatedCosts.adminPersonnel.method})
                </p>
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Facilities (Utilities, Maintenance)</span>
                  <span className="text-sm font-semibold">
                    {formatCurrency(breakdown.allocatedCosts.utilities.amount)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  (Allocated by: {breakdown.allocatedCosts.utilities.method})
                </p>
              </div>
              <div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Marketing (Shared campaigns)</span>
                  <span className="text-sm font-semibold">
                    {formatCurrency(breakdown.allocatedCosts.marketing.amount)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  (Allocated by: {breakdown.allocatedCosts.marketing.method})
                </p>
              </div>
            </div>
          </div>

          {/* Summary Section */}
          <div className="pt-4 border-t border-border space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-base font-semibold">TOTAL OPEX</span>
              <span className="text-lg font-bold">
                {formatCurrency(breakdown.actual)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Budget</span>
              <span>{formatCurrency(breakdown.budget)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Variance</span>
              <span className={`font-semibold ${getVarianceTextColor(variancePercent, "OpEx")}`}>
                {variancePercent >= 0 ? "+" : ""}{variancePercent.toFixed(1)}%
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
