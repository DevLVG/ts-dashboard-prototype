// EOSB & LEAVE ACCRUALS — standalone page (route /accruals).
//
// Handbook package job (2026-08-07): v_eosb_accrual / v_leave_accrual
// (migration 035) existed live with real data (37 rows each, one per active
// employee) but were never surfaced anywhere in the cockpit — grepped src/
// end to end, zero references to EOSB/leave. This page is the first
// consumer, read-only. The computed managerial journal (v_accrual_monthly_je)
// still isn't merged into the P&L/BS views the rest of the cockpit reads —
// that's a separate, larger change (touches the certified statement views)
// and is out of scope for this read-only display job.
import { Navigate } from "react-router-dom";
import { HardHat, ShieldAlert, Receipt } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { resolveRole, landingPageFor } from "@/lib/roles";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { useEosbAccrual, useLeaveAccrual } from "@/data/accrualsLive";
import { fmtSAR } from "@/lib/format";

export const AccrualsPage = () => {
  const { session, loading: authLoading } = useAuth();
  const role = resolveRole(session?.user?.email);
  // Leveredge + CEO only — per-employee wage-derived figures are the same
  // sensitivity class as CeoApprovalPanel (payments), which Administration
  // does not see either (roles.ts). First-pass call, proposed — confirm
  // with Marcello/Luca if Administration (Trio's own finance staff) should
  // also see this.
  const allowed = role === "leveredge" || role === "ceo";

  const eosb = useEosbAccrual();
  const leave = useLeaveAccrual();

  if (authLoading) return null;
  if (!allowed) return <Navigate to={`/${landingPageFor(role)}`} replace />;

  const ready = eosb.data?.available === true && leave.data?.available === true;
  const isLoading = (eosb.isLoading && !eosb.data) || (leave.isLoading && !leave.data);
  const isError = eosb.isError || leave.isError;

  const eosbRows = eosb.data?.available ? eosb.data.rows : [];
  const leaveByEmployee = new Map((leave.data?.available ? leave.data.rows : []).map((r) => [r.employee_id, r]));

  const combined = eosbRows.map((e) => {
    const l = leaveByEmployee.get(e.employee_id);
    return {
      employee_id: e.employee_id,
      bu: e.bu,
      tenure_years: e.tenure_years,
      eosb_month: e.eosb_accrual_month_sar,
      eosb_cum: e.eosb_liability_cum_sar,
      leave_month: l?.leave_accrual_month_sar ?? 0,
      leave_cum: l?.leave_liability_cum_est_sar ?? 0,
    };
  });

  const totalEosbCum = eosbRows.reduce((s, r) => s + r.eosb_liability_cum_sar, 0);
  const totalEosbMonth = eosbRows.reduce((s, r) => s + r.eosb_accrual_month_sar, 0);
  const totalLeaveCum = combined.reduce((s, r) => s + r.leave_cum, 0);
  const totalLeaveMonth = combined.reduce((s, r) => s + r.leave_month, 0);
  const totalLiability = totalEosbCum + totalLeaveCum;

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav currentPage="accruals" />
      <main className="container mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="font-heading text-2xl tracking-wide text-foreground flex items-center gap-2">
            <Receipt className="h-5 w-5 text-gold" /> End-of-Service &amp; Leave Accruals
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Computed managerial accrual — end-of-service benefit (KSA Labour Law Art. 84-85) and annual-leave
            liability, per active employee. This is a MEMO layer, not booked in Qoyod, and is not yet merged into the
            P&amp;L/Balance Sheet the rest of the cockpit shows (flagged, see note below).
          </p>
        </div>

        <Card className="p-3.5 border-amber-500/30 bg-amber-500/5 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-foreground/90">
            <strong>Confirm with HR before treating as authoritative</strong> — the wage basis (which pay components
            count toward EOSB) and per-employee leave-days-already-taken are config-driven defaults, not yet
            HR-ratified. Cumulative leave liability is an upper-bound estimate (full entitlement, not net of leave
            taken — the HR leave-balance feed this needs does not exist yet). Employees are shown by ID only —
            the underlying employee-name table is not readable from this app (only the derived accrual figures are).
          </p>
        </Card>

        {isError ? (
          <Card className="p-6">
            <p className="text-sm text-destructive">
              {(eosb.error as Error | null)?.name === "PermissionDeniedError"
                ? (eosb.error as Error).message
                : "Could not load the accrual views from Supabase."}
            </p>
          </Card>
        ) : isLoading ? (
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
        ) : !ready ? (
          <Card className="p-8 text-center space-y-3 animate-fade-in">
            <HardHat className="h-7 w-7 mx-auto text-gold/70" />
            <h3 className="text-lg font-heading tracking-wide">ACCRUALS — NOT YET AVAILABLE</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              The accrual views are not yet mirrored. This section will populate automatically once they land.
            </p>
          </Card>
        ) : combined.length === 0 ? (
          <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">No active employees found.</p></Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="p-4 border-border">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Total accrued liability</div>
                <div className="mt-1 text-xl font-heading tabular-nums">{fmtSAR(totalLiability)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">EOSB + leave, cumulative</div>
              </Card>
              <Card className="p-4 border-border">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">EOSB liability</div>
                <div className="mt-1 text-xl font-heading tabular-nums">{fmtSAR(totalEosbCum)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{fmtSAR(totalEosbMonth)} / month accrual</div>
              </Card>
              <Card className="p-4 border-border">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Leave liability (est.)</div>
                <div className="mt-1 text-xl font-heading tabular-nums">{fmtSAR(totalLeaveCum)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{fmtSAR(totalLeaveMonth)} / month accrual</div>
              </Card>
              <Card className="p-4 border-border">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Active employees</div>
                <div className="mt-1 text-xl font-heading tabular-nums">{combined.length}</div>
                <div className="mt-1"><DataSourceBadge source="live" sourceLabel="Live data from Supabase (v_eosb_accrual + v_leave_accrual)" /></div>
              </Card>
            </div>

            <Card className="p-6 shadow-sm animate-fade-in">
              <h3 className="text-lg font-heading tracking-wide mb-4">ACCRUAL BY EMPLOYEE</h3>
              <ScrollHint>
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                      <th className="text-left py-1 pr-2 font-semibold">Employee</th>
                      <th className="text-left py-1 px-2 font-semibold">BU</th>
                      <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Tenure (yrs)</th>
                      <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">EOSB / month</th>
                      <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">EOSB cumulative</th>
                      <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Leave / month</th>
                      <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Leave cumulative (est.)</th>
                      <th className="text-right py-1 pl-2 font-semibold whitespace-nowrap">Total liability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combined.map((r) => (
                      <tr key={r.employee_id} className="border-b border-border/10">
                        <td className="py-2 pr-2 whitespace-nowrap font-medium">{r.employee_id}</td>
                        <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{r.bu}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.tenure_years.toFixed(1)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtSAR(r.eosb_month)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtSAR(r.eosb_cum)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtSAR(r.leave_month)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtSAR(r.leave_cum)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums font-semibold">{fmtSAR(r.eosb_cum + r.leave_cum)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border/40 font-semibold">
                      <td className="py-2 pr-2" colSpan={3}>Total</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtSAR(totalEosbMonth)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtSAR(totalEosbCum)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtSAR(totalLeaveMonth)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtSAR(totalLeaveCum)}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{fmtSAR(totalLiability)}</td>
                    </tr>
                  </tfoot>
                </table>
              </ScrollHint>
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

export default AccrualsPage;
