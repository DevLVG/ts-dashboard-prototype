// TREASURY DESK — the operational surface (Marcello's live-review spec,
// items 1-5, top to bottom/left-to-right): circles, DSO+DPO cards, then a
// two-column layout — Receivables (aging + customer-lines ladder + legacy
// pool inner-tab) on the LEFT, Payables (aging + vendor-lines ladder) on the
// RIGHT, stacking back to one column below ~1024px. This is the
// "Receivables & Payables" tab of TreasuryWorkspace — "Cash & Working
// Capital" (TreasuryCash) and "Confirmations" survive as their own reachable
// tabs, unchanged.
//
// REBUILT 2026-08-04 (fix-28-treasury-align, Marcello live on /treasury):
//   - TreasuryCircles no longer takes a "last month book value" comparison
//     (dropped per mandate extension #1 — see TreasuryCircles.tsx header).
//   - DpoCard added alongside DsoCard (mandate extension #1, item 5).
//   - Receivables/Payables moved from full-width stacked sections into a
//     side-by-side two-column grid (mandate extension #3, item 3), mirroring
//     the circles above.
import { useMemo } from "react";
import { TreasuryCircles } from "@/components/treasury/TreasuryCircles";
import { DsoCard } from "@/components/treasury/DsoCard";
import { DpoCard } from "@/components/treasury/DpoCard";
import { ReceivablesUnified } from "@/components/treasury/ReceivablesUnified";
import { PayablesDesk } from "@/components/treasury/PayablesDesk";
import { useArAging, useApAging } from "@/data/statementsLive";

const n = (v: number | null | undefined): number => v ?? 0;

export const TreasuryDesk = () => {
  const ar = useArAging();
  const ap = useApAging();

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

  const circlesLoading = (ar.isLoading && !ar.data) || (ap.isLoading && !ap.data);

  return (
    <div className="space-y-6">
      <TreasuryCircles
        arTotal={arSummary.total} arCount={arSummary.count}
        arOverdue={arSummary.overdue} arOverdueCount={arSummary.overdueCount}
        apTotal={apSummary.total} apCount={apSummary.count}
        apOverdue={apSummary.overdue} apOverdueCount={apSummary.overdueCount}
        isLoading={!!circlesLoading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DsoCard />
        <DpoCard />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div>
          <h4 className="text-sm font-heading uppercase tracking-widest text-muted-foreground mb-3">Receivables</h4>
          <ReceivablesUnified />
        </div>

        <div>
          <h4 className="text-sm font-heading uppercase tracking-widest text-muted-foreground mb-3">Payables</h4>
          <PayablesDesk />
        </div>
      </div>
    </div>
  );
};
