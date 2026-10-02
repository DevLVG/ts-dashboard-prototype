// TREASURY CIRCLES — the operational desk's top strip.
//
// REBUILT 2026-08-04 (fix-28-treasury-align, Marcello live on /treasury,
// mandate extension #1) — three changes from the original 2026-08-03 build:
//
//   1. DROPPED the "vs last month-end book value" comparison entirely.
//      Marcello, live: "non voglio confrontarlo con l'anno precedente, non
//      ha senso" — v_working_capital_monthly's book value is a different,
//      NET basis than ar_aging_v2/ap_aging_v2's gross open-invoice snapshot
//      (see the retired basis-mismatch guard this file used to carry), so
//      the comparison was never honestly load-bearing anyway. Gone, not
//      replaced with anything invented.
//   2. TWO cards, not four circles. Receivables and Payables each render
//      ONCE, as a total with its Current (not yet due) / Overdue split
//      shown as the two components of that ONE amount — not as a second
//      circle carrying what read as a near-duplicate number.
//   3. Every block gets a one-line plain-language explainer, and a Info
//      tooltip spells out what "Current" / "Overdue" mean here.
import { ArrowDownCircle, ArrowUpCircle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fmtSAR } from "@/lib/format";

const valueSizeClass = (formatted: string): string => {
  const len = formatted.length;
  if (len <= 7) return "text-3xl md:text-4xl";
  if (len <= 10) return "text-2xl md:text-3xl";
  return "text-xl md:text-2xl";
};

const pctOf = (part: number, whole: number) => (Math.abs(whole) < 0.5 ? 0 : (part / whole) * 100);

export interface TreasurySideMetric {
  key: "receivables" | "payables";
  label: string;
  explainer: string;
  total: number;
  totalCount: number;
  current: number;
  currentCount: number;
  overdue: number;
  overdueCount: number;
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind color token for the "current" segment / dot. */
  currentTone: string;
  /** Tailwind color token for the "overdue" segment / dot. */
  overdueTone: string;
}

const noun = (count: number, singular: string, plural: string) => (count === 1 ? singular : plural);

const SideCard = ({ metric }: { metric: TreasurySideMetric }) => {
  const valueStr = fmtSAR(metric.total);
  const currentShare = pctOf(metric.current, metric.total);
  const overdueShare = pctOf(metric.overdue, metric.total);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm animate-fade-in">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs md:text-sm uppercase tracking-wider text-muted-foreground font-semibold inline-flex items-center gap-1.5">
          <metric.icon className="h-3.5 w-3.5 text-gold/80 shrink-0" aria-hidden />
          {metric.label}
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3.5 w-3.5 text-muted-foreground/70 hover:text-gold cursor-help shrink-0 mt-0.5" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            <strong>Current</strong> = not yet due (inside its payment terms). <strong>Overdue</strong> = past its
            due date. Both are counted in the total above; this card just shows how the total splits between them.
          </TooltipContent>
        </Tooltip>
      </div>

      <p className="text-xs text-muted-foreground -mt-2">{metric.explainer}</p>

      <div className="flex items-center gap-5">
        <div
          className="relative flex h-28 w-28 md:h-32 md:w-32 shrink-0 items-center justify-center rounded-full border-[3px] border-border bg-background/60"
          role="img"
          aria-label={`${metric.label}: ${valueStr} SAR total across ${metric.totalCount} ${noun(metric.totalCount, "item", "items")} — ${fmtSAR(metric.current)} SAR current, ${fmtSAR(metric.overdue)} SAR overdue`}
        >
          <div className="flex flex-col items-center px-2 text-center">
            <p className={cn("font-heading tracking-tight leading-none", valueSizeClass(valueStr))}>{valueStr}</p>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">SAR total</p>
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-2.5">
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {metric.totalCount} {metric.key === "receivables" ? noun(metric.totalCount, "invoice", "invoices") : noun(metric.totalCount, "bill", "bills")}
          </p>

          {/* Two-part segmented bar — current vs overdue share of the same total */}
          <div className="h-2.5 w-full rounded-full bg-muted/40 overflow-hidden flex">
            {currentShare > 0 && <div className={cn("h-full", metric.currentTone)} style={{ width: `${Math.max(currentShare, 2)}%` }} />}
            {overdueShare > 0 && <div className={cn("h-full", metric.overdueTone)} style={{ width: `${Math.max(overdueShare, 2)}%` }} />}
          </div>

          <div className="flex flex-col gap-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full shrink-0", metric.currentTone)} />
                Current ({metric.currentCount})
              </span>
              <span className="font-medium tabular-nums">{fmtSAR(metric.current)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full shrink-0", metric.overdueTone)} />
                Overdue ({metric.overdueCount})
              </span>
              <span className={cn("font-medium tabular-nums", metric.overdue > 0.5 ? "text-destructive" : "")}>
                {fmtSAR(metric.overdue)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export interface TreasuryCirclesProps {
  arTotal: number; arCount: number;
  arOverdue: number; arOverdueCount: number;
  apTotal: number; apCount: number;
  apOverdue: number; apOverdueCount: number;
  isLoading: boolean;
  className?: string;
}

export const TreasuryCircles = ({
  arTotal, arCount, arOverdue, arOverdueCount, apTotal, apCount, apOverdue, apOverdueCount,
  isLoading, className,
}: TreasuryCirclesProps) => {
  const metrics: TreasurySideMetric[] = [
    {
      key: "receivables",
      label: "Receivables",
      explainer: "Money customers owe the club, right now — open invoices only.",
      total: arTotal, totalCount: arCount,
      current: Math.max(arTotal - arOverdue, 0), currentCount: Math.max(arCount - arOverdueCount, 0),
      overdue: arOverdue, overdueCount: arOverdueCount,
      icon: ArrowDownCircle,
      currentTone: "bg-sky-400/70", overdueTone: "bg-destructive/70",
    },
    {
      key: "payables",
      label: "Payables",
      explainer: "Money the club owes vendors, right now — open bills only.",
      total: apTotal, totalCount: apCount,
      current: Math.max(apTotal - apOverdue, 0), currentCount: Math.max(apCount - apOverdueCount, 0),
      overdue: apOverdue, overdueCount: apOverdueCount,
      icon: ArrowUpCircle,
      currentTone: "bg-emerald-400/60", overdueTone: "bg-amber-500/80",
    },
  ];

  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4", className)}>
      {isLoading
        ? [0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
              <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              <div className="flex items-center gap-5">
                <div className="h-28 w-28 md:h-32 md:w-32 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-full rounded bg-muted animate-pulse" />
                  <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                </div>
              </div>
            </div>
          ))
        : metrics.map((m) => <SideCard key={m.key} metric={m} />)}
    </div>
  );
};
