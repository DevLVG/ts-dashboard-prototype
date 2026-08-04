// DSO CARD — Days Sales Outstanding, the average time to collect a sale
// (Marcello's spec, item 2).
//
// CURRENT DSO — unchanged formula, the trailing-twelve-month method:
//
//   DSO = Receivables (today's open AR book, ar_aging_v2) / Trailing-12-month
//         revenue x 365
//
// TRAILING-12-MONTHS REFERENCE — REBUILT 2026-08-04 (fix-28-treasury-align,
// Marcello live on /treasury, mandate extension #1, item 4). The card used to
// try to recompute each trailing month's OWN DSO from
// v_working_capital_monthly's receivables column — but that figure is a NET
// book value (net of customer deposits/advances) that is negative in every
// one of the last 12 months, on a different basis than Current DSO's
// always-non-negative gross AR figure. Averaging a negative "days of
// receivables" is meaningless, so every month got excluded and the card
// permanently showed "n/m" — honest, but a dead end (no historical GROSS AR
// series exists anywhere in the warehouse to replace it with — checked; see
// migration 075's header).
//
// FIX: v_ar_realized_dso_trailing12m (migration 075) — a genuinely
// comparable, always-non-negative reference built a DIFFERENT way: for every
// payment actually allocated to a customer invoice in the trailing 12
// months, the amount-weighted average of (payment date - invoice date). This
// is REALIZED collection time, not a book-value ratio — the method differs
// from Current DSO's formula (disclosed on screen below, not hidden), but
// both readings answer the same real question — "how long does it take to
// collect a sale" — on data that is inherently gross. Legacy 2020-2021
// invoices are excluded (same cutoff as the segregated legacy pool
// elsewhere in Treasury) so a handful of very old settlements don't skew the
// trailing figure to hundreds of days.
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, Minus, Info, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useArAging, useRealizedDsoTrailing12m } from "@/data/statementsLive";
import { useBasisRows, aggregatePL, lastCompleteFromBasis } from "@/data/alignment";
import { shiftMonthKey, monthKeyLabel } from "@/data/liveData";
import { fmtDeltaPct, pctChange } from "@/lib/format";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";

const n = (v: number | null | undefined): number => v ?? 0;

const trailingRevenue = (basisData: ReturnType<typeof useBasisRows>["data"], endKey: string): number => {
  const win = { startKey: shiftMonthKey(endKey, -11), endKey };
  return aggregatePL(basisData?.rows, "STRICT", win).revenue;
};

export const DsoCard = ({ className }: { className?: string }) => {
  const { data: basis, isLoading: basisLoading } = useBasisRows();
  const ar = useArAging();
  const realized = useRealizedDsoTrailing12m();

  const arTotal = useMemo(
    () => (ar.data?.available ? ar.data.rows.reduce((s, r) => s + n(r.residual_amount), 0) : null),
    [ar.data],
  );

  const lastComplete = useMemo(() => lastCompleteFromBasis(basis?.rows), [basis]);

  const currentDso = useMemo(() => {
    if (arTotal === null || !lastComplete) return null;
    const rev = trailingRevenue(basis, lastComplete);
    if (rev <= 0) return null;
    return (arTotal / rev) * 365;
  }, [arTotal, basis, lastComplete]);

  const refReady = realized.data?.available === true;
  const refRow = refReady ? realized.data!.rows[0] : null;
  const refDays = refRow?.weighted_avg_days ?? null;
  const refSampleCount = refRow?.sample_count ?? 0;

  const isLoading = basisLoading || (ar.isLoading && !ar.data) || (realized.isLoading && !realized.data);
  const deltaAbs = currentDso !== null && refDays !== null ? currentDso - refDays : null;
  const deltaPct = currentDso !== null && refDays !== null ? pctChange(currentDso, refDays) : null;
  const tone = deltaAbs === null ? "na" : Math.abs(deltaAbs) < 0.5 ? "flat" : deltaAbs > 0 ? "up" : "down";
  // "up" (slower collection) uses the same mechanical up=azure/down=red rule
  // as every other circle/card in the cockpit — a plain direction-of-change
  // signal, not a value judgement baked into the color.
  const TONE_TEXT: Record<string, string> = { up: "text-success", down: "text-destructive", flat: "text-muted-foreground", na: "text-muted-foreground" };
  const Icon = tone === "up" ? TrendingUp : tone === "down" ? TrendingDown : Minus;

  return (
    <Card className={cn("p-6 shadow-sm animate-fade-in", className)}>
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h3 className="text-xl font-heading tracking-wide inline-flex items-center gap-2">
          <Clock3 className="h-5 w-5 text-gold" /> DSO — DAYS SALES OUTSTANDING
        </h3>
        <DataSourceBadge source="live" sourceLabel="Live data from Supabase (ar_aging_v2 + v_pnl_basis + v_ar_realized_dso_trailing12m)" />
      </div>

      <p className="text-sm text-muted-foreground mb-4 inline-flex items-start gap-1.5">
        <span>
          The average time it takes to collect a sale, in days. Current = today's open receivables ÷
          trailing-12-month revenue × 365. Reference = the actual, realized average collection time over the last
          12 months.
        </span>
        <Tooltip>
          <TooltipTrigger asChild><Info className="h-3.5 w-3.5 mt-0.5 text-gold/80 cursor-help shrink-0" /></TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm text-xs space-y-1.5">
            <p>
              <strong>Current DSO</strong>: a live, precise "as of today" AR figure (ar_aging_v2) divided by a real
              trailing-12-month revenue figure (P&amp;L basis rows), annualised ×365.
            </p>
            <p>
              <strong>Trailing-12m reference</strong>: a DIFFERENT method by necessity — the amount-weighted average
              of (payment date − invoice date) for every invoice actually collected in the last 12 months
              (2020-2021 legacy invoices excluded). No historical GROSS AR book-value series exists in the
              warehouse to compute this the same way as Current DSO — this realized-collection method is the honest
              alternative, not a fabricated fallback.
            </p>
          </TooltipContent>
        </Tooltip>
      </p>

      {isLoading ? (
        <div className="h-28 rounded-lg bg-muted animate-pulse" />
      ) : currentDso === null ? (
        <p className="text-sm text-muted-foreground">
          Not enough data yet to compute DSO (needs a posted-cost month for trailing revenue, and a live AR
          aging figure).
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
          <div className="flex flex-col items-center sm:items-start">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Current DSO</span>
            <span className="font-heading text-4xl md:text-5xl tracking-tight tabular-nums">
              {currentDso.toFixed(0)} <span className="text-lg text-muted-foreground font-sans">days</span>
            </span>
            <span className="text-xs text-muted-foreground mt-1">
              trailing 12m revenue to {lastComplete ? monthKeyLabel(lastComplete) : "—"}
            </span>
          </div>

          <div className="flex flex-col items-center sm:items-start border-t sm:border-t-0 sm:border-l border-border/60 pt-4 sm:pt-0 sm:pl-6">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Last-12-months reference</span>
            {!refReady || refDays === null ? (
              <span className="text-sm text-muted-foreground mt-1">
                {refReady ? "No qualifying collections in the last 12 months." : "Reference view not yet available."}
              </span>
            ) : (
              <>
                <span className="font-heading text-3xl md:text-4xl tracking-tight tabular-nums">
                  {refDays.toFixed(0)} <span className="text-base text-muted-foreground font-sans">days</span>
                </span>
                <span className={cn("inline-flex items-center gap-1 text-sm font-semibold mt-1", TONE_TEXT[tone])}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {deltaAbs !== null ? `${deltaAbs > 0 ? "+" : ""}${deltaAbs.toFixed(0)} days` : "—"}
                  {deltaPct !== null && <span> · {fmtDeltaPct(deltaPct)}</span>}
                  <span className="font-normal text-muted-foreground">vs reference</span>
                </span>
                <span className="text-[11px] text-muted-foreground mt-1">
                  based on {refSampleCount} collections, realized method (not the book-value method Current DSO uses)
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
