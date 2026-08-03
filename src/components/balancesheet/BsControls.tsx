// BALANCE SHEET — stock-logic chrome (Marcello, live review 2026-08-03,
// mandate extension: "the balance sheet is point-in-time" — supersedes the
// original spec's shared WindowPicker/ComparisonToggle for this page only).
//
// The shared chrome (AlignmentContext / components/chrome/AlignmentChrome)
// models FLOW windows (MTD/YTD/TTM + PY|Budget) — the right shape for a P&L
// or a Cash Flow statement, wrong shape for a balance sheet, which is a
// snapshot as of one date. Two page-owned controls replace it here, styled
// to match the shared chrome's visual language exactly (Select trigger,
// segmented-toggle pill) so the page still FEELS symmetric to Economics/
// Cash Flow even though the controls underneath are different:
//   1. AsOfSelect    — "Today" + every CLOSED month-end the warehouse has.
//   2. BsComparisonToggle — exactly 3 options, one at a time:
//        (a) Same Date Last Year (default) — as-of shifted -12 months.
//        (b) Start of Year        — the prior year-end closing balance.
//        (c) Budget                — the derived balance-sheet budget
//            (migration 068) — ONE info tooltip lives here, nowhere else
//            (Marcello, follow-up: no "derived" badges/tags per figure,
//            plain "Budget" label everywhere; the method is documented in
//            Budget_Load_Report_2026-07-19.md, not surfaced per-line).
import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarClock, CalendarRange, Wallet, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type BsComparisonMode = "PY_DATE" | "START_OF_YEAR" | "BUDGET";
export const BS_TODAY_VALUE = "TODAY";

interface AsOfSelectProps {
  /** Closed month-ends available in the warehouse, "YYYY-MM" keys, any order. */
  months: string[];
  value: string; // a month key, or BS_TODAY_VALUE
  onChange: (v: string) => void;
  monthLabel: (m: string) => string;
}

export const AsOfSelect = ({ months, value, onChange, monthLabel }: AsOfSelectProps) => {
  const sorted = useMemo(() => [...months].sort().reverse(), [months]);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-56 bg-background font-medium">
        <SelectValue placeholder="As of" />
      </SelectTrigger>
      <SelectContent className="max-h-[340px]">
        <SelectItem value={BS_TODAY_VALUE}>
          <span className="inline-flex items-center gap-2">
            <CalendarClock className="h-3.5 w-3.5 text-amber-400" />
            Today
          </span>
        </SelectItem>
        {sorted.map((m) => (
          <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

const BUDGET_TOOLTIP =
  "Balance-sheet Budget figures are derived from the approved P&L and cash-flow budgets (a balance-sheet budget follows by definition), not an independently approved line-by-line budget. Covers Jul '26 → Dec '27 — method: Budget_Load_Report_2026-07-19.md.";

interface BsComparisonToggleProps {
  value: BsComparisonMode;
  onChange: (m: BsComparisonMode) => void;
}

export const BsComparisonToggle = ({ value, onChange }: BsComparisonToggleProps) => {
  const seg = (m: BsComparisonMode, label: string, Icon: typeof CalendarRange) => (
    <button
      key={m}
      type="button"
      onClick={() => onChange(m)}
      aria-pressed={value === m}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[36px]",
        value === m ? "bg-gold text-gold-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 flex-wrap">
        {seg("PY_DATE", "Same Date Last Year", CalendarClock)}
        {seg("START_OF_YEAR", "Start of Year", CalendarRange)}
        {seg("BUDGET", "Budget", Wallet)}
      </div>
      {/* THE one info tooltip (Marcello: at most one, on the toggle itself). */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center justify-center h-6 w-6 rounded-full text-muted-foreground/70 hover:text-muted-foreground cursor-help">
            <Info className="h-4 w-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">{BUDGET_TOOLTIP}</TooltipContent>
      </Tooltip>
    </div>
  );
};
