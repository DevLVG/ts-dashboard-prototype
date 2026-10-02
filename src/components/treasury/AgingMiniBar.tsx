// AGING MINI BAR — compact per-row aging summary (stacked segments by
// bucket) used in the customer/vendor lines tables' "Aging summary" column.
// Same bucket palette as AgingExplodable/TreasuryCash for one visual system.
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AGING_BUCKET_ORDER, type AgingBucket } from "@/data/statementsLive";
import { fmtSAR } from "@/lib/format";

const BUCKET_META: Record<AgingBucket, { label: string; short: string; bar: string; text: string }> = {
  current: { label: "Current (not due)", short: "Current", bar: "bg-muted-foreground/40", text: "text-muted-foreground" },
  "1-30": { label: "1–30 days overdue", short: "1–30", bar: "bg-sky-400/70", text: "text-foreground" },
  "31-60": { label: "31–60 days overdue", short: "31–60", bar: "bg-warning/70", text: "text-warning" },
  "61-90": { label: "61–90 days overdue", short: "61–90", bar: "bg-amber-500/80", text: "text-warning" },
  ">90": { label: "90+ days overdue", short: "90+", bar: "bg-destructive/70", text: "text-destructive" },
};

/** Which bucket a row's worst (oldest) balance sits in, for the compact
 * "Worst: X" label — the buckets are ordered oldest-last by construction
 * (AGING_BUCKET_ORDER), so the last one with a non-zero amount wins. */
export const worstBucket = (amountsByBucket: Partial<Record<AgingBucket, number>>): AgingBucket | null => {
  let worst: AgingBucket | null = null;
  for (const b of AGING_BUCKET_ORDER) if ((amountsByBucket[b] ?? 0) > 0.5) worst = b;
  return worst;
};

export const AgingMiniBar = ({
  amountsByBucket, total, className,
}: {
  amountsByBucket: Partial<Record<AgingBucket, number>>;
  total: number;
  className?: string;
}) => {
  const worst = worstBucket(amountsByBucket);
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="h-2 w-24 rounded-full bg-muted/40 overflow-hidden flex cursor-help">
            {AGING_BUCKET_ORDER.map((b) => {
              const amt = amountsByBucket[b] ?? 0;
              const share = total > 0.5 ? (amt / total) * 100 : 0;
              if (share <= 0) return null;
              return <span key={b} className={BUCKET_META[b].bar} style={{ width: `${share}%` }} />;
            })}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-0.5">
            {AGING_BUCKET_ORDER.filter((b) => (amountsByBucket[b] ?? 0) > 0.5).map((b) => (
              <div key={b} className={BUCKET_META[b].text}>
                {BUCKET_META[b].label}: {fmtSAR(amountsByBucket[b] ?? 0)} SAR
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
      {worst && (
        <span className={`text-[10px] ${BUCKET_META[worst].text}`}>
          Worst: {BUCKET_META[worst].short}
        </span>
      )}
    </div>
  );
};
