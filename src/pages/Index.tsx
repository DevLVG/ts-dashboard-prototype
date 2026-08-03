// CFO Cockpit shell — Dashboard Alignment 2026-07-21.
// Four aligned screens (spec §1): P&L Overview · Performance Analysis ·
// Cash Flow · Balance Sheet, plus the R1 drill tool (Analysis) unchanged.
// Global chrome (basis toggle, window presets, completeness banner) lives in
// each screen via AlignmentContext; the shell derives the last complete
// month from the live fact rows and feeds it to the context.
import { useEffect } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { PnLOverview } from "@/components/pnl/PnLOverview";
import { PerformanceAnalysis } from "@/components/performance/PerformanceAnalysis";
import { EconomicAnalysis } from "@/components/analysis/EconomicAnalysis";
import { CashFlowStatementLive } from "@/components/cashflow/CashFlowStatementLive";
import { TreasuryWorkspace } from "@/components/treasury/TreasuryWorkspace";
import { CeoApprovalPanel } from "@/components/payments/CeoApprovalPanel";
import { BalanceSheetLive } from "@/components/balancesheet/BalanceSheetLive";
import { CatalogAdmin } from "@/components/catalog/CatalogAdmin";
import { MediaAdmin } from "@/components/media/MediaAdmin";
import { SiteCopyAdmin } from "@/components/site-copy/SiteCopyAdmin";
import { CompetitionsAdmin } from "@/components/competitions/CompetitionsAdmin";
import { InstructorsAdmin } from "@/components/instructors/InstructorsAdmin";
import { SlotPriorityAdmin } from "@/components/slot-priority/SlotPriorityAdmin";
import { PageType } from "@/types/dashboard";
import { useAlignment } from "@/contexts/AlignmentContext";
import { useBasisRows, lastCompleteFromBasis } from "@/data/alignment";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { useAuth } from "@/contexts/AuthContext";
import { resolveRole, canAccessPage, landingPageFor } from "@/lib/roles";

const Index = () => {
  const location = useLocation();
  const { session } = useAuth();
  const role = resolveRole(session?.user?.email);
  const { setLastComplete } = useAlignment();
  const { data: basisData } = useBasisRows();

  // Derive the last complete close from the live rows (rolls forward at each
  // month-end automatically — never hardcoded).
  useEffect(() => {
    const k = lastCompleteFromBasis(basisData?.rows);
    if (k) setLastComplete(k);
  }, [basisData, setLastComplete]);

  const getCurrentPageFromPath = (): PageType => {
    const path = location.pathname.slice(1);
    if (path === "overview" || path === "performance" || path === "cash" || path === "treasury" || path === "payments" || path === "balance" || path === "analysis" || path === "catalog" || path === "media" || path === "copy" || path === "competitions" || path === "instructors" || path === "slot-priority") {
      return path as PageType;
    }
    return "overview";
  };
  const currentPage = getCurrentPageFromPath();

  const renderContent = () => {
    switch (currentPage) {
      case "overview":
        return <PnLOverview />;
      case "performance":
        return <PerformanceAnalysis />;
      case "cash":
        return <CashFlowStatementLive />;
      case "treasury":
        return <TreasuryWorkspace />;
      case "payments":
        return <CeoApprovalPanel />;
      case "balance":
        return <BalanceSheetLive />;
      case "analysis":
        // R1 economic-analysis drill tool (leaf → cluster → CoA → JE).
        return <EconomicAnalysis />;
      case "catalog":
        return <CatalogAdmin />;
      case "media":
        return <MediaAdmin />;
      case "copy":
        return <SiteCopyAdmin />;
      case "competitions":
        return <CompetitionsAdmin />;
      case "instructors":
        return <InstructorsAdmin />;
      case "slot-priority":
        return <SlotPriorityAdmin />;
      default:
        return <PnLOverview />;
    }
  };

  // Role-based ROUTE gate (nav gating lives in DashboardNav). A signed-in
  // user who is not entitled to `currentPage` is bounced to their role's
  // landing page — this runs for every /route since they all render <Index/>.
  if (!canAccessPage(role, currentPage)) {
    return <Navigate to={`/${landingPageFor(role)}`} replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav currentPage={currentPage} />
      <main className="container mx-auto px-4 py-6">
        {!isSupabaseConfigured && (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
            Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing) — live figures cannot load.
          </div>
        )}
        {renderContent()}
      </main>
    </div>
  );
};

export default Index;
