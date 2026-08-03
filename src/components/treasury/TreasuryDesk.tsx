// TREASURY DESK — the operational surface (Marcello's live-review spec,
// items 1-5, top to bottom): circles, DSO card, receivables aging +
// customer-lines ladder (with the legacy pool inner-tab), payables mirror.
// This is the "Receivables & Payables" tab of TreasuryWorkspace — "Cash &
// Working Capital" (TreasuryCash) and "Confirmations" survive as their own
// reachable tabs, unchanged.
import { useMemo } from "react";
import { TreasuryCircles } from "@/components/treasury/TreasuryCircles";
import { DsoCard } from "@/components/treasury/DsoCard";
import { ReceivablesUnified } from "@/components/treasury/ReceivablesUnified";
import { PayablesDesk } from "@/components/treasury/PayablesDesk";
import { useArAging, useApAging, useWorkingCapitalMonthly } from "@/data/statementsLive";
import { monthKey, monthKeyLabel } from "@/data/liveData";

const n = (v: number | null | undefined): number => v ?? 0;

export const TreasuryDesk = () => {
  const ar = useArAging();
  const ap = useApAging();
  const { data: wcRows } = useWorkingCapitalMonthly();

  const arSummary = useMemo(() => {
    const rows = ar.data?.available ? ar.data.rows : [];
    let total = 0, overdue = 0, overdueCount = 0;
    for (const r of rows) { const amt = n(r.residual_amount); total += amt; if (r.aging_bucket !== "current") { overdue += amt; overdueCount += 1; } }
    return { total, count: rows.length, overdue, overdueCount };
  }, [ar.data]);

  const apSummary = useMemo(() => {
    const rows = ap.data?.available ? ap.data.rows : [];
    let total = 0, overdue = 0, overdueCount = 0;
    for (const r of rows) { const amt = n(r.residual_amount); total += amt; if (r.aging_bucket !== "current") { overdue += amt; overdueCount += 1; } }
    return { total, count: rows.length, overdue, overdueCount };
  }, [ap.data]);

  const lastMonth = useMemo(() => {
    if (!wcRows || wcRows.length === 0) return { receivables: null as number | null, payables: null as number | null, label: null as string | null };
    const sorted = [...wcRows].sort((a, b) => a.period_month.localeCompare(b.period_month));
    const last = sorted[sorted.length - 1];
    return { receivables: n(last.receivables), payables: n(last.payables), label: monthKeyLabel(monthKey(last.period_month)) };
  }, [wcRows]);

  const circlesLoading = (ar.isLoading && !ar.data) || (ap.isLoading && !ap.data);

  return (
    <div className="space-y-6">
      <TreasuryCircles
        arTotal={arSummary.total} arCount={arSummary.count}
        arOverdue={arSummary.overdue} arOverdueCount={arSummary.overdueCount}
        apTotal={apSummary.total} apCount={apSummary.count}
        apOverdue={apSummary.overdue} apOverdueCount={apSummary.overdueCount}
        lastMonthReceivables={lastMonth.receivables} lastMonthPayables={lastMonth.payables} lastMonthLabel={lastMonth.label}
        isLoading={!!circlesLoading}
      />

      <DsoCard />

      <div>
        <h4 className="text-sm font-heading uppercase tracking-widest text-muted-foreground mb-3">Receivables</h4>
        <ReceivablesUnified />
      </div>

      <div>
        <h4 className="text-sm font-heading uppercase tracking-widest text-muted-foreground mb-3">Payables</h4>
        <PayablesDesk />
      </div>
    </div>
  );
};
