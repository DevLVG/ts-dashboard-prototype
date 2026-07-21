// Data-freshness label + incomplete-month warning.
// Shown on every statement screen: figures are complete through the last
// closed month (LAST_CLOSED_MONTH); later months may show synced revenue
// with no costs posted yet.
import { CalendarCheck, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAST_CLOSED_LABEL, LAST_CLOSED_MONTH, monthKeyLabel, shiftMonthKey } from "@/data/liveData";

interface DataFreshnessNoteProps {
  /** Show the amber incomplete-month warning (the displayed window includes
   * months after the last complete close). */
  showIncompleteWarning?: boolean;
  className?: string;
}

const FIRST_OPEN_LABEL = monthKeyLabel(shiftMonthKey(LAST_CLOSED_MONTH, 1)); // e.g. "Jul '26"

export const DataFreshnessNote = ({
  showIncompleteWarning = false,
  className,
}: DataFreshnessNoteProps) => (
  <div className={cn("flex flex-wrap items-center gap-2", className)}>
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
      <CalendarCheck className="h-3.5 w-3.5 text-gold" />
      Data as of <strong className="text-foreground font-semibold">{LAST_CLOSED_LABEL}</strong>
      <span className="hidden sm:inline">· June close complete</span>
    </span>
    {showIncompleteWarning && (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5" />
        {FIRST_OPEN_LABEL} is incomplete — revenue synced, costs not yet posted.
      </span>
    )}
  </div>
);
