// Payables desk — mirror of ReceivablesUnified's current book (Marcello's
// spec, item 5: "payables mirror block below" — aging table (explodable) +
// vendor lines with amount + % of book + status/action per the same-ladder
// request). See VendorLinesTable.tsx header for the ladder interpretation
// (relationship-preserving acknowledgement/justification copy, corrected by
// Marcello 2026-08-03) and the AP data-freshness caveat already carried by
// TreasuryCash's own AgingCard (bills feed lags, bank feed empty) — repeated
// here so the treasurer sees it on THIS desk too, not just the monitoring tab.
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { AlertTriangle, HardHat } from "lucide-react";
import { AgingExplodable, type ExplodableRow } from "@/components/treasury/AgingExplodable";
import { VendorLinesTable } from "@/components/treasury/VendorLinesTable";
import { useApAging, type ApAgingRow } from "@/data/statementsLive";

const n = (v: number | null | undefined): number => v ?? 0;

export const PayablesDesk = () => {
  const ap = useApAging();
  const rows = useMemo<ApAgingRow[]>(() => (ap.data?.available ? ap.data.rows : []), [ap.data]);

  const explodableRows = useMemo<ExplodableRow[]>(
    () =>
      rows.map((r) => ({
        key: String(r.qoyod_bill_id ?? r.bill_number ?? Math.random()),
        partyName: r.vendor_name ?? "—",
        ref: r.bill_number ?? "—",
        amount: n(r.residual_amount),
        daysOverdue: Math.max(0, n(r.days_overdue)),
        bucket: r.aging_bucket,
      })),
    [rows],
  );

  const ready = ap.data?.available === true;

  if (ap.isError) {
    return (
      <Card className="p-6"><p className="text-sm text-destructive">
        {(ap.error as Error | null)?.name === "PermissionDeniedError"
          ? (ap.error as Error).message
          : "Could not load payables from Supabase."}
      </p></Card>
    );
  }
  if (!ready) {
    return (
      <Card className="p-8 text-center space-y-3 animate-fade-in">
        <HardHat className="h-7 w-7 mx-auto text-gold/70" />
        <h3 className="text-lg font-heading tracking-wide">PAYABLES — NOT YET AVAILABLE</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          The payables view (<code className="text-xs">ap_aging_v2</code>) is not yet mirrored. This list will
          populate automatically once the data lands — no reload needed.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          AP mirror lags: vendor bills feed is behind and the bank feed is not yet live — treat payables as
          indicative until the AP/bank sync is brought current (Treasury Decision-Rules §C).
        </span>
      </div>
      <AgingExplodable
        title="PAYABLES AGING"
        subtitle="Supabase · ap_aging_v2 · SAR"
        rows={explodableRows}
        partyLabel="Vendor"
        refLabel="Bill"
      />
      <VendorLinesTable rows={rows} />
    </div>
  );
};
