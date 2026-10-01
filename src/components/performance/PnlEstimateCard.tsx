// PnlEstimateCard — "People Costs & Depreciation: Actual vs Estimate"
// (Marcello, 2026-10-01). Deliberately a SEPARATE, self-contained card
// rather than a rework of the existing explodable P&L table below it:
// that table reads v_pnl_basis/pnl_management directly and serves every
// window the global period selector offers; this card answers a narrower,
// always-current question ("what does THIS month and this YTD look like
// right now, including what's still estimated") and is pinned to
// TODAY — v_pnl_mtd/v_pnl_ytd are always "current month" / "Jan->now",
// never the arbitrary window the big table can be scrolled to. Minimal,
// additive, does not touch the big table's logic.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { usePnlMtd, usePnlYtd, sectionTotal } from "@/data/pnlEstimates";
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

const Row = ({ label, data }: { label: string; data: ReturnType<typeof sectionTotal> }) => {
  if (!data) {
    return (
      <div className="flex items-center justify-between py-2 border-b border-border/10 last:border-0">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm text-muted-foreground">—</span>
      </div>
    );
  }
  const methodText = data.methods.map((m) => METHOD_LABELS[m] ?? m).join("; ");
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
              {data.sourceDetails.length > 0 && (
                <p className="text-muted-foreground">{data.sourceDetails.join("; ")}</p>
              )}
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
  const [win, setWin] = useState<"MTD" | "YTD">("MTD");
  const { data: mtdRows, isLoading: mtdLoading } = usePnlMtd();
  const { data: ytdRows, isLoading: ytdLoading } = usePnlYtd();
  const rows = win === "MTD" ? mtdRows : ytdRows;
  const isLoading = win === "MTD" ? mtdLoading : ytdLoading;

  const periodLabel = rows && rows.length > 0
    ? (win === "MTD"
        ? new Date(rows[0].period_month).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
        : `Jan → ${new Date(rows[0].period_month).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`)
    : "";

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
              month) whenever the real posting hasn't landed yet — never as a false zero.
              Supplier costs paid but not yet billed can also appear here, under the section the
              payment was guessed to belong to. Marcello's rule, 2026-10-01.
            </TooltipContent>
          </Tooltip>
        </h3>
        <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
          {(["MTD", "YTD"] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWin(w)}
              className={`px-2.5 py-1 font-medium transition-colors ${
                win === w ? "bg-gold/20 text-gold" : "text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {w === "MTD" ? "Month to date" : "Year to date"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-3">{periodLabel}</p>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && (
        <div>
          {SECTIONS.map((s) => (
            <Row key={s.key} label={s.label} data={sectionTotal(rows, s.key)} />
          ))}
        </div>
      )}
    </Card>
  );
};
