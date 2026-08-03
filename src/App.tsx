import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, RequireAuth, useAuth } from "@/contexts/AuthContext";
import { AlignmentProvider } from "@/contexts/AlignmentContext";
import { resolveRole, landingPageFor } from "@/lib/roles";
import Login from "./pages/Login";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { ReportPage } from "@/components/report/ReportPage";
import { ConfirmationsPage } from "@/components/confirmations/ConfirmationsPage";

const queryClient = new QueryClient();

// Root ("/") redirect, role-aware: not every role lands on /performance
// (e.g. administration has no Economics access, only Treasury + Cash Flow —
// see src/lib/roles.ts) — send each signed-in user straight to the first
// page their role can see.
const RootRedirect = () => {
  const { session } = useAuth();
  const role = resolveRole(session?.user?.email);
  return <Navigate to={`/${landingPageFor(role)}`} replace />;
};

const App = () => {
  // Set dark mode as default
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add('dark');
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AlignmentProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              {/* EVERYTHING below sits behind the auth guard */}
              <Route element={<RequireAuth />}>
                <Route path="/" element={<RootRedirect />} />
                {/* P&L Overview and Drill retired from the nav (live review
                    #2, 2026-08-03) — /performance ("Economics") replaces
                    both. Hard redirect, not a route to <Index/>: neither
                    path should ever render, even by direct URL/bookmark.
                    The PnLOverview/EconomicAnalysis components and the
                    "overview"/"analysis" PageType values are left in the
                    codebase untouched — nav + routing only. */}
                <Route path="/overview" element={<Navigate to="/performance" replace />} />
                <Route path="/performance" element={<Index />} />
                <Route path="/cash" element={<Index />} />
                <Route path="/treasury" element={<Index />} />
                <Route path="/payments" element={<Index />} />
                <Route path="/balance" element={<Index />} />
                {/* Report (fix-6-report, 2026-08-03): standalone route, NOT
                    through Index.tsx's PageType switch — ReportPage mounts
                    its own <DashboardNav/> + role gate. */}
                <Route path="/report" element={<ReportPage />} />
                {/* Confirmations (live review #3, 2026-08-03): promoted out of
                    the Treasury workspace tabs into its own page. Standalone
                    route, same pattern as /report — ConfirmationsPage mounts
                    its own <DashboardNav/> + role gate. */}
                <Route path="/confirmations" element={<ConfirmationsPage />} />
                <Route path="/analysis" element={<Navigate to="/performance" replace />} />
                <Route path="/catalog" element={<Index />} />
                <Route path="/media" element={<Index />} />
                <Route path="/copy" element={<Index />} />
                <Route path="/competitions" element={<Index />} />
                <Route path="/instructors" element={<Index />} />
                <Route path="/slot-priority" element={<Index />} />
                {/* Legacy routes from the pre-alignment IA */}
                <Route path="/ratios" element={<Navigate to="/performance" replace />} />
                <Route path="/statements" element={<Navigate to="/performance" replace />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
            </AlignmentProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
