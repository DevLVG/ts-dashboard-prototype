// REPORT — Trio Sporting CFO cockpit "Report" section (Marcello's live-review
// spec, 2026-08-03; PDF v2 second-round fix squad, same date): the ONE export
// place. Pick a window using the SAME global period selector and Versus
// Previous Year / Versus Budget toggle Economics and Cash Flow use — then
// "Generate PDF" produces a branded, board-ready, WHITE-background PDF
// (cover + Economics + Cash Flow + Balance Sheet, each opening with
// deterministic executive commentary) built from the SAME warehouse-backed
// figures the live pages already show (see reportData.ts). The scattered
// per-page "Export (audit CSV)" buttons are superseded by this page; the CSV
// capability survives here as a secondary "Data (CSV)" download
// (reportCsv.ts).
//
// v2 filter rework: the report previously had its OWN Monthly/Quarterly/
// Yearly period model — a different set of windows than Economics/Cash Flow
// offered, and a read-only comparison badge instead of a real toggle
// (live-review complaint: "same filters as Economics"). It now mounts the
// EXACT SAME `WindowPicker` / `ComparisonToggle` / `OpenMonthsBadge`
// components those pages use, wired to the same global `AlignmentContext` —
// see reportData.ts's `periodFromPreset`.
//
// Standalone route component (NOT wired through pages/Index.tsx's PageType
// switch): fix-1-nav owns DashboardNav.tsx/App.tsx/roles.ts, so this page is
// self-contained — its own role gate, its own <DashboardNav/> mount — so it
// never depends on a file another squad is actively editing. fix-1-nav wires
// the "Report" nav item + the /report route + ceo access; this component is
// just the route's element.
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FileText, Download, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAlignment } from "@/contexts/AlignmentContext";
import { resolveRole } from "@/lib/roles";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { WindowPicker, ComparisonToggle, ScopeToggle, OpenMonthsBadge } from "@/components/chrome/AlignmentChrome";
import { fmtSAR, fmtDeltaSAR, fmtDeltaPct, fmtOrDash, comparePct } from "@/lib/format";
import { periodFromPreset, useReportLastComplete, useReportSnapshot, type MacroRow } from "./reportData";
import { buildEconomicsCommentary } from "./reportCommentary";
import { generateReportPdf } from "./reportPdf";
import { downloadReportCsvs } from "./reportCsv";
import tsLogo from "@/assets/ts-logo.png";

const toneClass = (delta: number | null): string =>
  delta === null || Math.abs(delta) < 0.5 ? "text-muted-foreground" : delta > 0 ? "text-success" : "text-destructive";

const KpiTile = ({ label, row, comparisonLabel }: { label: string; row: MacroRow; comparisonLabel: string }) => {
  // owner-audit #14 (2026-08-04): row.actual can now be null (costs not yet
  // posted for an open window) — the delta/tile must go honestly blank, not
  // silently treat the missing figure as a comparable number.
  const deltaAbs = row.actual === null || row.comparison === null ? null : row.actual - row.comparison;
  // comparePct (not pctChange): 2026-08-04, owner-audit recheck fix-22 — a
  // comparison base that's negative/near-zero (loss-to-profit swing on
  // Gross Margin, e.g.) must render "—" (deltaPct === null below), never a
  // clean-looking but meaningless +1026.2%-style artifact. Same guard
  // PerformanceAnalysis.tsx already applies on /performance (owner-audit #7).
  const deltaPct = row.actual === null || row.comparison === null ? null : comparePct(row.actual, row.comparison);
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-background/40 p-4 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl tracking-tight tabular-nums">{fmtOrDash(row.actual)}</p>
      <p className={`text-xs font-semibold ${toneClass(deltaAbs)}`}>
        {deltaAbs === null ? "—" : `${fmtDeltaSAR(deltaAbs)}${deltaPct !== null ? ` · ${fmtDeltaPct(deltaPct)}` : ""}`}
      </p>
      <p className="text-[10px] text-muted-foreground">
        {row.actual === null ? "Not yet posted" : `vs ${comparisonLabel}`}
      </p>
    </div>
  );
};

export const ReportPage = () => {
  const { session, loading: authLoading } = useAuth();
  const role = resolveRole(session?.user?.email);
  // "leveredge+ceo roles only" (spec) — administration has no Economics
  // access at all today, so it has no business generating a P&L snapshot.
  const allowed = role === "leveredge" || role === "ceo";

  const { preset, comparisonMode, todayKey } = useAlignment();
  const lastComplete = useReportLastComplete();
  const period = useMemo(() => periodFromPreset(preset, lastComplete, todayKey), [preset, lastComplete, todayKey]);
  const snapshot = useReportSnapshot(period);

  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  // Wait for the persisted session to resolve before gating on role — role
  // reads session?.user?.email, which is only meaningful once auth has
  // finished restoring (RequireAuth already guarantees this upstream in the
  // real app; guarding here too keeps the component correct standalone).
  if (authLoading) return null;
  if (!allowed) return <Navigate to="/performance" replace />;

  const handleGeneratePdf = async () => {
    if (!snapshot) return;
    setIsGenerating(true);
    try {
      const filename = await generateReportPdf(snapshot, tsLogo);
      toast({ title: "Report generated", description: filename });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not generate the PDF", description: (err as Error).message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadCsv = () => {
    if (!snapshot) return;
    downloadReportCsvs(snapshot);
    toast({ title: "Data (CSV) exported", description: "Economics · Cash Flow · Balance Sheet" });
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav currentPage="report" />
      <main className="container mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="font-heading text-2xl tracking-wide text-foreground">Report</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Export a branded, board-ready PDF — Economics, Cash Flow and Balance Sheet for the window you pick. Same
            period, comparison and scope controls as Economics / Cash Flow.
          </p>
        </div>

        <Card className="p-5 space-y-4">
          {/* ScopeToggle added 2026-08-08 (CEO live review — "nel report
              manca il bottone recurring e non recurring"): Economics and
              Cash Flow both let the CEO switch All/Only Recurring; the
              report had no such control at all, so an exported document
              could never reflect that choice. Same shared control, same
              global AlignmentContext — see reportData.ts's scope-filtered
              snapshot. */}
          <div className="flex flex-wrap items-center gap-3">
            <WindowPicker />
            <ComparisonToggle />
            <ScopeToggle />
            <OpenMonthsBadge />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              type="button"
              onClick={handleGeneratePdf}
              disabled={!snapshot || snapshot.isLoading || isGenerating}
              className="gap-2 bg-gold text-gold-foreground hover:bg-gold/90"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Generate PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownloadCsv}
              disabled={!snapshot || snapshot.isLoading}
              className="gap-2 border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
              title="Download the underlying figures as audit-ready CSV (Economics · Cash Flow · Balance Sheet)"
            >
              <Download className="h-4 w-4" />
              Data (CSV)
            </Button>
          </div>
        </Card>

        {snapshot?.hasError && (
          <p className="text-sm text-destructive/90">Could not load some of the live figures — try again shortly.</p>
        )}

        {snapshot && !snapshot.isLoading && (
          <Card className="p-5 space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Preview — {snapshot.period.label}
              </h2>
              <span className="text-[11px] text-muted-foreground">
                vs {snapshot.comparisonLabel} · {snapshot.scopeLabel}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <KpiTile label="Revenue" row={snapshot.kpi.revenue} comparisonLabel={snapshot.comparisonLabel} />
              <KpiTile label="Gross Margin" row={snapshot.kpi.grossMargin} comparisonLabel={snapshot.comparisonLabel} />
              <KpiTile label="EBITDA (reported)" row={snapshot.kpi.ebitda} comparisonLabel={snapshot.comparisonLabel} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Opening book cash</p>
                <p className="text-lg font-heading tabular-nums">{fmtOrDash(snapshot.cashFlow.openingBookCash)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Closing book cash</p>
                <p className="text-lg font-heading tabular-nums">{fmtOrDash(snapshot.cashFlow.closingBookCash)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Live bank position</p>
                <p className="text-lg font-heading tabular-nums text-gold">{fmtOrDash(snapshot.cashFlow.liveBankTotal)}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Balance sheet</p>
                {snapshot.balanceSheet.available ? (
                  <>
                    <p className={`text-sm font-semibold ${snapshot.balanceSheet.isBalanced ? "text-success" : "text-amber-400"}`}>
                      {snapshot.balanceSheet.isBalanced ? "Balanced" : `Δ ${fmtSAR(snapshot.balanceSheet.checkDelta)}`}
                    </p>
                    {snapshot.balanceSheet.fellBackFrom && (
                      <p className="text-[10px] text-muted-foreground">as at {snapshot.asAtLabel}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Not yet available</p>
                )}
              </div>
            </div>

            {snapshot.budgetNaNote && (
              <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
                {snapshot.budgetNaNote}
              </p>
            )}

            <div className="rounded-lg border border-gold/30 bg-gold/5 p-3.5 space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gold">
                Executive commentary preview — Economics
              </p>
              <p className="text-xs text-foreground/90 leading-relaxed">
                {buildEconomicsCommentary(snapshot).join(" ")}
              </p>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
};

export default ReportPage;
