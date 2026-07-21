// Global chrome — basis toggle, window preset picker, basis badge and the
// warehouse-driven completeness banner (spec §1 global chrome + §1.5).
import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Scale, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlignment } from "@/contexts/AlignmentContext";
import {
  BASIS_LABELS, deriveCompleteness, useCompletenessMonthly,
  flagsFromCompletenessView, type Basis, type BasisRow,
} from "@/data/alignment";
import { monthKeyLabel, shiftMonthKey } from "@/data/liveData";

// ------------------------------------------------------------ basis badge

/** Per-tile basis chip (spec §0.1: every figure carries its basis badge). */
export const BasisBadge = ({ basis, className }: { basis: Basis; className?: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        className={cn(
          "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider align-middle cursor-help",
          basis === "VALIDATED"
            ? "bg-gold/15 text-gold border border-gold/40"
            : "bg-sky-500/15 text-sky-400 border border-sky-500/40",
          className,
        )}
      >
        {basis === "VALIDATED" ? "Validated" : "Strict"}
      </span>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs text-xs">{BASIS_LABELS[basis]}</TooltipContent>
  </Tooltip>
);

// ------------------------------------------------------------ basis toggle

export const BasisToggle = ({ disabled, disabledReason }: { disabled?: boolean; disabledReason?: string }) => {
  const { basis, setBasis } = useAlignment();
  const seg = (b: Basis, label: string) => (
    <button
      type="button"
      onClick={() => !disabled && setBasis(b)}
      disabled={disabled}
      aria-pressed={basis === b}
      className={cn(
        "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[36px]",
        basis === b && !disabled
          ? b === "VALIDATED"
            ? "bg-gold text-gold-foreground shadow-sm"
            : "bg-sky-500 text-white shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        disabled && "opacity-50 cursor-not-allowed",
      )}
      title={BASIS_LABELS[b]}
    >
      {label}
    </button>
  );
  const control = (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {seg("VALIDATED", "Validated · pre-CN")}
      {seg("STRICT", "Strict · net-CN")}
      {disabled && <Lock className="h-3.5 w-3.5 text-muted-foreground mr-1" />}
    </div>
  );
  if (!disabled) return control;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm text-xs">
        {disabledReason ?? "The basis toggle does not apply to this statement."}
      </TooltipContent>
    </Tooltip>
  );
};

// ---------------------------------------------------------- window picker

export const WindowPicker = ({ months }: { months?: string[] }) => {
  const { preset, setPreset, lastComplete } = useAlignment();
  const monthItems = useMemo(() => {
    const src = months && months.length > 0
      ? [...months].filter((m) => m <= lastComplete).slice(-18).reverse()
      : Array.from({ length: 14 }, (_, i) => shiftMonthKey(lastComplete, -i));
    return src;
  }, [months, lastComplete]);
  return (
    <Select value={preset} onValueChange={setPreset}>
      <SelectTrigger className="w-[290px] bg-background font-medium">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[340px]">
        <SelectItem value="AS_DELIVERED">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" />
            As delivered (TTM Jun-25→May-26)
          </span>
        </SelectItem>
        <SelectItem value="TTM">{`TTM (${monthKeyLabel(shiftMonthKey(lastComplete, -11))}→${monthKeyLabel(lastComplete)})`}</SelectItem>
        <SelectItem value="LAST_MONTH">{`Last closed month (${monthKeyLabel(lastComplete)})`}</SelectItem>
        <SelectItem value="YTD">{`YTD (Jan→${monthKeyLabel(lastComplete)})`}</SelectItem>
        <SelectItem value="FY">FY to date (fiscal year starts June)</SelectItem>
        {monthItems.map((m) => (
          <SelectItem key={m} value={`M:${m}`}>{monthKeyLabel(m)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

// ----------------------------------------------------- completeness banner

/** §1.5 — single warehouse-driven banner; no hardcoded month list.
 * Prefers the DB-7 view (v_data_completeness_monthly); falls back to the
 * client heuristic on the fact rows until DB-7 lands. */
export const CompletenessBanner = ({ rows }: { rows: BasisRow[] | undefined }) => {
  const { data: viewState } = useCompletenessMonthly();
  const flags = useMemo(() => {
    const all = viewState?.available
      ? flagsFromCompletenessView(viewState.rows)
      : deriveCompleteness(rows);
    // Recency filter: the banner is about the CURRENT close state — keep the
    // trailing 13 months (historical partial closes live in the fix reports).
    const monthFlags = all.filter((f) => f.kind !== "lev-unbooked");
    const maxKey = monthFlags.reduce((m, f) => (f.key > m ? f.key : m), "");
    const cutoff = maxKey ? shiftMonthKey(maxKey, -12) : "";
    return all.filter((f) => f.kind === "lev-unbooked" || f.key >= cutoff);
  }, [viewState, rows]);
  if (flags.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300 flex items-start gap-2.5">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
      <div className="space-y-0.5">
        <p className="font-semibold text-amber-300">
          Data completeness — certified figures are as-booked; supplier bills and LEV fees outstanding.
        </p>
        <p className="text-amber-300/90">
          {flags.map((f) => f.detail).join(" · ")}
        </p>
      </div>
    </div>
  );
};

/** Cell-level marker for incomplete months (tables). */
export const IncompleteMark = ({ flagged, className }: { flagged: boolean; className?: string }) => {
  if (!flagged) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("text-amber-400 cursor-help select-none", className)}>◦</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">Month incomplete — costs not fully posted.</TooltipContent>
    </Tooltip>
  );
};

// -------------------------------------------------------- basis footnote

export const BudgetBasisFootnote = () => (
  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
    <Scale className="h-3.5 w-3.5 mt-px shrink-0 text-gold/70" />
    Budget is net of VAT and has no credit-note concept. On Strict basis, actuals are net of
    credit notes (conservative vs budget); on Validated basis the comparison is like-for-like
    with the delivered deck.
  </p>
);
