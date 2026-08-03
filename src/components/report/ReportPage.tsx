// REPORT — Trio Sporting CFO cockpit "Report" section (Marcello's live-review
// spec, 2026-08-03): the ONE export place. Pick a report type (Monthly /
// Quarterly / Yearly) and a period — from CLOSED periods where possible, the
// current open one allowed with the honesty badge — then "Generate PDF"
// produces a branded, board-ready snapshot (cover + Economics + Cash Flow +
// Balance Sheet) built from the SAME warehouse-backed figures the live pages
// already show (see reportData.ts). The scattered per-page "Export (audit
// CSV)" buttons are superseded by this page; the CSV capability survives
// here as a secondary "Data (CSV)" download (reportCsv.ts).
//
// Standalone route component (NOT wired through pages/Index.tsx's PageType
// switch): fix-1-nav owns DashboardNav.tsx/App.tsx/roles.ts and is mid-rework
// of the nav IA, so this page is self-contained — its own role gate, its own
// <DashboardNav/> mount — so it never depends on a file another squad is
// actively editing. Once fix-1-nav wires the "Report" nav item + the /report
// route + ceo access, this component just needs to be the route's element.
import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { FileText, Download, Loader2, Radio } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useAlignment } from "@/contexts/AlignmentContext";
import { resolveRole } from "@/lib/roles";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { fmtSAR, fmtDeltaSAR, fmtDeltaPct, fmtOrDash, pctChange } from "@/lib/format";
import {
  type ReportKind, type ReportPeriodOption, type MacroRow,
  buildPeriodOptions, defaultOptionFor, useReportMonths, useReportSnapshot,
} from "./reportData";
import { generateReportPdf } from "./reportPdf";
import { downloadReportCsvs } from "./reportCsv";
import tsLogo from "@/assets/ts-logo.png";

const KIND_LABELS: Record<ReportKind, string> = { monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };

const toneClass = (delta: number | null): string =>
  delta === null || Math.abs(delta) < 0.5 ? "text-muted-foreground" : delta > 0 ? "text-success" : "text-destructive";

const KpiTile = ({ label, row, comparisonLabel }: { label: string; row: MacroRow; comparisonLabel: string }) => {
  const deltaAbs = row.comparison === null ? null : row.actual - row.comparison;
  const deltaPct = row.comparison === null ? null : pctChange(row.actual, row.comparison);
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-border bg-background/40 p-4 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-heading text-2xl tracking-tight tabular-nums">{fmtSAR(row.actual)}</p>
      <p className={`text-xs font-semibold ${toneClass(deltaAbs)}`}>
        {deltaAbs === null ? "—" : `${fmtDeltaSAR(deltaAbs)}${deltaPct !== null ? ` · ${fmtDeltaPct(deltaPct)}` : ""}`}
      </p>
      <p className="text-[10px] text-muted-foreground">vs {comparisonLabel}</p>
    </div>
  );
};

export const ReportPage = () => {
  const { session, loading: authLoading } = useAuth();
  const role = resolveRole(session?.user?.email);
  // "leveredge+ceo roles only" (spec) — administration has no Economics
  // access at all today, so it has no business generating a P&L snapshot.
  const allowed = role === "leveredge" || role === "ceo";

  const { comparisonMode } = useAlignment();
  const comparisonLabel = comparisonMode === "BUDGET" ? "Budget" : "Previous Year";
  const { months, lastComplete, todayKey } = useReportMonths();

  const [kind, setKind] = useState<ReportKind>("monthly");
  const options = useMemo(
    () => buildPeriodOptions(kind, months, lastComplete, todayKey),
    [kind, months, lastComplete, todayKey],
  );
  const [periodId, setPeriodId] = useState<string | null>(null);

  useEffect(() => {
    // Default to the newest CLOSED period whenever the report kind changes
    // or the month list first loads — the open (current) period is always
    // reachable manually, never the silent default.
    const def = defaultOptionFor(options);
    setPeriodId(def?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, months.length]);

  const selectedPeriod: ReportPeriodOption | null = options.find((o) => o.id === periodId) ?? options[0] ?? null;
  const snapshot = useReportSnapshot(selectedPeriod);

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
      const filename = await generateReportPdf(snapshot, kind, tsLogo);
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
            Export a branded, board-ready PDF — Economics, Cash Flow and Balance Sheet for the period you pick.
          </p>
        </div>

        <Card className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
              {(["monthly", "quarterly", "yearly"] as ReportKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[36px] ${
                    kind === k ? "bg-gold text-gold-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>

            <Select value={periodId ?? undefined} onValueChange={setPeriodId}>
              <SelectTrigger className="w-64 bg-background font-medium">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                {options.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    <span className="inline-flex items-center gap-2">
                      {o.isOpen && <Radio className="h-3 w-3 text-amber-400" />}
                      {o.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground cursor-help">
                  Comparison: <span className="font-semibold text-foreground">{comparisonLabel}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                Follows the global Comparison toggle (Economics / Cash Flow) — switch it there to change what the
                report compares against.
              </TooltipContent>
            </Tooltip>

            {selectedPeriod?.isOpen && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300 cursor-help">
                    <Radio className="h-3 w-3" />
                    Includes open period
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs">
                  This period reaches into a month that hasn't closed yet — revenue is live, but supplier bills and
                  other costs may not be fully posted. The PDF carries the same note.
                </TooltipContent>
              </Tooltip>
            )}
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
                {KIND_LABELS[kind]} report · vs {snapshot.comparisonLabel}
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
          </Card>
        )}
      </main>
    </div>
  );
};

export default ReportPage;
