// CONFIRMATIONS — standalone page (route /confirmations).
//
// PROMOTED out of the Treasury workspace (Marcello, live review #3, 2026-08-03):
// "Admin group = Treasury (default) · Confirmations · Approvals." Confirmations
// used to be sub-tab 4/4 inside TreasuryWorkspace; it now gets its own nav item
// and its own page — same clean chrome as Report/Approvals/etc (own header,
// own <DashboardNav/> mount), not buried behind a tab click.
//
// Standalone route component (fix-1-nav pattern, see ReportPage.tsx): its own
// role gate + its own <DashboardNav/> mount so it doesn't depend on
// pages/Index.tsx's PageType switch. The actual data/UI logic is UNCHANGED —
// ConfirmationsWeekly (src/components/treasury/ConfirmationsWeekly.tsx) still
// owns the weekly invoices-to-confirm table, decision buttons, and the honest
// "not yet mirrored" / "nothing to confirm" empty states — this page only
// supplies the standalone chrome around it.
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { resolveRole, landingPageFor } from "@/lib/roles";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { ConfirmationsWeekly } from "@/components/treasury/ConfirmationsWeekly";

export const ConfirmationsPage = () => {
  const { session, loading: authLoading } = useAuth();
  const role = resolveRole(session?.user?.email);
  // leveredge + ceo + administration ("confirmation staff" work per Marcello's
  // spec) — same three roles the nav item is granted to (src/lib/roles.ts).
  const allowed = role === "leveredge" || role === "ceo" || role === "administration";

  // Wait for the persisted session to resolve before gating on role — mirrors
  // ReportPage.tsx's guard (RequireAuth already covers this upstream, but this
  // page mounts its own gate to stay correct standalone).
  if (authLoading) return null;
  if (!allowed) return <Navigate to={`/${landingPageFor(role)}`} replace />;

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav currentPage="confirmations" />
      <main className="container mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="font-heading text-2xl tracking-wide text-foreground">Confirmations</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Weekly review of vendor bills the invoice-inbox agent posted but flagged for a human look —
            confirm, flag a fix, or escalate. Read + record only: nothing is re-posted to Qoyod from here.
          </p>
        </div>
        <ConfirmationsWeekly />
      </main>
    </div>
  );
};

export default ConfirmationsPage;
