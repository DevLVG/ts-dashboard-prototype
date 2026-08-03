// CASH BY BANK ACCOUNT — small clean composition list beside the big cash
// circle (spec item 3). Always the LIVE bank_balances snapshot: the
// warehouse carries no historical per-account balances, only a live Qoyod
// sync, so this section is independent of the selected window on purpose —
// never a fabricated per-account history. The as-of date is always visible;
// a stale badge appears honestly when the sync is more than 36h old (bank
// statements are a known open item with the client).
//
// One hue (gold), light -> proportional bar length only (magnitude, not
// identity) — a composition of ONE total, not a categorical comparison, so
// a single sequential hue is the correct encoding (dataviz: sequential =
// one hue). Account names are always direct-labeled; color never carries
// meaning alone.
import { Landmark, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { BankSplitData } from "@/hooks/useCashFlowPageData";
import { fmtSAR } from "@/lib/format";

const fmtAsOf = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
};

export const CashByBankSplit = ({ data, note, className }: { data: BankSplitData; note: string | null; className?: string }) => {
  const { accounts, total, asOfIso, stale } = data;
  const maxBalance = accounts.reduce((m, a) => Math.max(m, Math.abs(a.balance)), 0);

  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs md:text-sm uppercase tracking-wider text-muted-foreground font-semibold inline-flex items-center gap-1.5">
          <Landmark className="h-3.5 w-3.5 text-gold" />
          Cash by bank account
        </p>
        {asOfIso && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider cursor-help",
                  stale ? "border border-amber-500/40 bg-amber-500/10 text-amber-300" : "text-muted-foreground",
                )}
              >
                {stale && <AlertTriangle className="h-3 w-3" />}
                Balances as of {fmtAsOf(asOfIso)}{stale ? " — bank feed pending" : ""}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              {stale
                ? "The Qoyod bank sync is more than 36 hours old — bank statement reconciliation is a known open item with the client."
                : "Live Qoyod bank sync — every account balance below ties to this total."}
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">Bank balances not yet available.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((a) => {
            const width = maxBalance > 0 ? Math.max(2, (Math.abs(a.balance) / maxBalance) * 100) : 0;
            const zero = Math.abs(a.balance) < 0.5;
            return (
              <div key={a.code} className="flex items-center gap-3">
                <span className={cn("w-40 shrink-0 truncate text-xs", zero ? "text-muted-foreground/60" : "text-foreground")} title={a.name}>
                  {a.name}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <div className="h-full rounded-full bg-gold/70" style={{ width: `${width}%` }} />
                </div>
                <span className={cn("w-24 shrink-0 text-right text-xs tabular-nums", zero ? "text-muted-foreground/60" : "text-foreground font-medium")}>
                  {fmtSAR(a.balance)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border/60 pt-2.5 mt-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Total</span>
        <span className="text-sm font-heading tabular-nums text-gold">{total === null ? "—" : fmtSAR(total)}</span>
      </div>

      {note && <p className="text-[11px] text-muted-foreground/80">{note}</p>}
    </div>
  );
};
