// PnlEstimateCard — "People Costs & Depreciation: Actual vs Estimate"
// (Marcello, 2026-10-01). A SEPARATE, self-contained card rather than a
// rework of the explodable P&L table below it — that table carries the
// full section/EBITDA/net-result breakdown; this card is a quick,
// always-visible breakdown of the two line items business rule A/B name
// explicitly (salaries/GOSI/EOSB and depreciation).
//
// FOLLOWS THE PAGE'S GLOBAL WINDOW (fixed 2026-10-01 — found live: the
// card kept showing October while the page had September selected).
// Reads v_pnl_ytd_monthly (one row per month, Jan of the current year ->
// now) and sums whichever months fall inside the active `win` from
// useAlignment() — the SAME window the big table and the KPI circles use,
// via the SAME inWin-style month-key comparison. No more local MTD/YTD
// toggle: "follow the selected month" means following THE selection, not
// offering a second, independent one.
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { usePnlYtdMonthly, sectionTotalInWin } from "@/data/pnlEstimates";
import { useAlignment } from "@/contexts/AlignmentContext";
import { fmtSAR } from "@/lib/format";

const METHOD_LABELS: Record<string, string> = {
  carry_forward_prior_month_prorated: "carried forward from the last actual month, pro-rated to today",
  carry_forward_prior_month_full: "carried forward from the last actual month (this month has already closed)",
  unbilled_outflow_bank_evidence: "a real bank payment with no supplier bill booked yet",
};

const SECTIONS: { key: string; label: string }[] = [
  { key: "OPEX-People", label: "People costs" },
  { key: "D&A", label: "Depreciation & amortisation" },
];

const methodLabel = (m: string): string => {
  if (METHOD_LABELS[m]) return METHOD_LABELS[m];
  if (m.startsWith("run_rate_clean_12mo_median")) return `median of up to 12 clean months ${m.slice("run_rate_clean_12mo_median".length)}`.trim();
  if (m.startsWith("cost_to_revenue_ratio_clean_window")) return `cost-to-revenue ratio, clean baseline window ${m.slice("cost_to_revenue_ratio_clean_window".length)}`.trim();
  if (m.startsWith("run_rate_3mo_avg")) return `3-month run-rate average ${m.slice("run_rate_3mo_avg".length)}`.trim();
  if (m.startsWith("contract")) return `contractual schedule ${m.slice("contract".length)}`.trim();
  return m;
};

const Row = ({ label, data }: { label: string; data: ReturnType<typeof sectionTotalInWin> }) => {
  if (!data) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-border/10 last:border-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">—</span>
      </div>
    );
  }
  const methodText = data.methods.map(methodLabel).join("; ");
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/10 last:border-0 gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-medium tabular-nums ${data.is_estimate ? "italic text-amber-400" : ""}`}>
          {fmtSAR(data.total_sar)}
        </span>
        {data.is_estimate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="cursor-help text-[9px] font-bold uppercase tracking-wider border-amber-500/40 bg-amber-500/10 text-amber-400"
              >
                est.
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs space-y-1">
              <p>
                Actual booked so far: {fmtSAR(data.actual_sar)} · Estimated: {fmtSAR(data.estimate_sar)}
              </p>
              <p className="text-muted-foreground">{methodText || "Estimated — actual not posted yet."}</p>
              <p className="text-muted-foreground">
                Disappears automatically once the real posting lands — this is never written to Qoyod.
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export const PnlEstimateCard = () => {
  const { win, windowName } = useAlignment();
  const { data: rows, isLoading } = usePnlYtdMonthly();

  return (
    <Card className="p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-1 gap-2 flex-wrap">
        <h3 className="text-base font-heading tracking-wide flex items-center gap-1.5">
          People Costs &amp; Depreciation
          <Tooltip>
            <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              Salaries, GOSI, end-of-service and depreciation are allowed to show as an estimate
              (carried forward from the last real posting, pro-rated for the days elapsed this
              month) whenever the real posting hasn't landed yet — never as a false zero. Follows
              the period selector above. Marcello's rule, 2026-10-01.
            </TooltipContent>
          </Tooltip>
        </h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{windowName}</p>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && (
        <div>
          {SECTIONS.map((s) => (
            <Row key={s.key} label={s.label} data={sectionTotalInWin(rows, s.key, win)} />
          ))}
        </div>
      )}
    </Card>
  );
};
