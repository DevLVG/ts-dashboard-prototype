// One-click "download this statement as an audit-ready CSV" button.
// Consistent gold-outline styling across the P&L, Balance-Sheet and Cash-Flow
// screens; the actual serialisation lives in @/lib/exportStatements.
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ExportButtonProps {
  onClick: () => void;
  className?: string;
  label?: string;
  disabled?: boolean;
}

export const ExportButton = ({ onClick, className, label = "Export (audit CSV)", disabled }: ExportButtonProps) => (
  <Button
    type="button"
    variant="outline"
    size="sm"
    onClick={onClick}
    disabled={disabled}
    className={cn("gap-2 border-gold/40 text-gold hover:bg-gold/10 hover:text-gold", className)}
    title="Download this statement as an audit-ready CSV (opens in Excel) — stamped with entity, period, basis and the live data source."
  >
    <Download className="h-4 w-4" />
    {label}
  </Button>
);
