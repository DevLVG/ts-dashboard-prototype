// MONTH BY MONTH — standalone page (route /monthly).
//
// CEO live-review request, 2026-08-08 (item 6 of that session — "questa è la
// più impegnativa, falla per ultima"): "vede tutti i mesi dell'anno
// affiancati, ciascuno confrontato con lo stesso mese dell'anno precedente,
// per individuare dove qualcosa non quadra." His own objection to a table
// with every value spelled out for both years ("viene una roba larghissima")
// set the shape actually built here: TWELVE columns of DIFFERENCE (value and
// percent, colored the same green/red the rest of the cockpit already uses),
// never twenty-four columns of raw actual/PY values side by side. A single
// month's full actual-vs-PY breakdown opens on demand (click its column
// header) instead of living permanently on screen.
//
// Comparison is FIXED to "same month, previous year" — that is the whole
// point of this screen (a year-over-year monthly scan), independent of the
// global Comparison toggle (PY / Previous Period / Budget) every other page
// reads; a scan built to answer "how does each month compare to itself,
// PP not each other" wouldn't make sense for the other two comparisons.
// Scope (All / Only Recurring) IS the shared global toggle — same rows, same
// filter, same convention as Economics/Report.
//
// Data: reuses `aggregatePL` + `buildMacroRows` (report/reportData.ts)
// UNCHANGED — the exact same line-item list and arithmetic Economics/Report
// already show, just run once per month (12 actual windows + 12 PY windows,
// all in-memory reductions over the SAME `useBasisRows()` rows every other
// page already fetches — zero extra network calls). No new aggregation
// logic, no new numbers invented.
//
// Standalone route component (fix-1-nav pattern — see ReportPage.tsx /
// CashForecastPage.tsx): its own role gate + its own <DashboardNav/> mount.
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { resolveRole, landingPageFor } from "@/lib/roles";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { ScopeToggle, LoadingState, ScrollHint, OpenMonthsBadge } from "@/components/chrome/AlignmentChrome";
import { useAlignment } from "@/contexts/AlignmentContext";
import {
  useBasisRows, useRecurrence, resolveRecurrence, aggregatePL, pyWin,
  type Win,
} from "@/data/alignment";
import { buildMacroRows, type MacroRow } from "@/components/report/reportData";
import { monthKeyLabel, todayMonthKey, monthKey as toMonthKey } from "@/data/liveData";
import { fmtDeltaSAR, fmtDeltaPct, fmtOrDash, fmtCompact, comparePct } from "@/lib/format";

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A single calendar month as a one-month `Win` — `pyWin` on this yields the
 * same month twelve months earlier, exactly the fixed comparison this page
 * always shows regardless of the global Comparison toggle. */
const monthWin = (key: string): Win => ({ startKey: key, endKey: key });

/** Compact signed delta ("+45K" / "(12K)" / "0") — fmtDeltaSAR's own
 * thousands-separated form is too wide for a 12-column grid; fmtCompact's
 * K/M rounding keeps each cell narrow without losing the sign convention
 * (never a bare magnitude — a reader scanning for anomalies needs the sign
 * at a glance, not just at the color). */
const fmtDeltaCompact = (v: number): string =>
  Math.abs(v) < 0.5 ? "0" : `${v > 0 ? "+" : "−"}${fmtCompact(Math.abs(v))}`;

type Tone = "up" | "down" | "flat" | "na";
const toneOf = (deltaAbs: number | null): Tone => {
  if (deltaAbs === null) return "na";
  if (Math.abs(deltaAbs) < 0.5) return "flat";
  return deltaAbs > 0 ? "up" : "down";
};
const TONE_TEXT: Record<Tone, string> = {
  up: "text-success", down: "text-destructive", flat: "text-muted-foreground", na: "text-muted-foreground/50",
};

interface MonthColumn {
  key: string; // "YYYY-MM"
  label: string; // "Jan"
  rows: MacroRow[]; // buildMacroRows output for this one month vs its PY
  hasActual: boolean;
  hasComparison: boolean;
}

export const MonthByMonthPage = () => {
  const { session, loading: authLoading } = useAuth();
  const role = resolveRole(session?.user?.email);
  // Same gate as Report/Economics (roles.ts) — this is a P&L-grade screen,
  // not a CMS/admin one.
  const allowed = role === "leveredge" || role === "ceo";

  const { scope } = useAlignment();
  const { data: basisData, isLoading, isError, error } = useBasisRows();
  const { data: rec } = useRecurrence();
  const rows = basisData?.rows;

  const [viewYear, setViewYear] = useState<number>(() => Number(todayMonthKey().slice(0, 4)));
  const [openMonthKey, setOpenMonthKey] = useState<string | null>(null);

  const scopedRows = useMemo(
    () => (scope === "RECURRING" ? rows?.filter((r) => resolveRecurrence(r, rec) !== "non-recurring") : rows),
    [rows, scope, rec],
  );

  // Earliest/latest month actually in the warehouse — bounds the year nav so
  // "previous year" can't be clicked into a year with no data at all, same
  // "within data history" convention the Custom range calendar uses.
  const dataBounds = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const keys = rows.map((r) => toMonthKey(r.period_month)).sort();
    return { minYear: Number(keys[0].slice(0, 4)), maxYear: Number(keys[keys.length - 1].slice(0, 4)) };
  }, [rows]);

  const months: MonthColumn[] = useMemo(() => {
    return MONTH_ABBR.map((label, i) => {
      const key = `${viewYear}-${String(i + 1).padStart(2, "0")}`;
      const win = monthWin(key);
      const py = pyWin(win);
      const actual = aggregatePL(scopedRows, "STRICT", win);
      const prior = aggregatePL(scopedRows, "STRICT", py);
      const macroRows = buildMacroRows(actual, "PY", prior, null);
      return {
        key,
        label,
        rows: macroRows,
        hasActual: actual.hasRevenue || actual.hasCogs || actual.hasOpexTotal,
        hasComparison: prior.hasRevenue || prior.hasCogs || prior.hasOpexTotal,
      };
    });
  }, [scopedRows, viewYear]);

  if (authLoading) return null;
  if (!allowed) return <Navigate to={`/${landingPageFor(role)}`} replace />;

  // Every month shares the SAME line-item list/order (buildMacroRows always
  // walks the fixed MACRO_DEFS) — safe to read row defs off month 0.
  const lineDefs = months[0]?.rows ?? [];
  const openMonth = openMonthKey ? months.find((m) => m.key === openMonthKey) ?? null : null;

  const minYear = dataBounds?.minYear ?? viewYear;
  const maxYear = dataBounds?.maxYear ?? viewYear;

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav currentPage="monthly" />
      <main className="container mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="font-heading text-2xl tracking-wide text-foreground">Month by Month</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every month of the year, each compared to the same month last year — scan for where something doesn't
            add up. Click a month to open its full breakdown.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
            <button
              type="button"
              aria-label="Previous year"
              disabled={viewYear <= minYear}
              onClick={() => setViewYear((y) => y - 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums">{viewYear}</span>
            <button
              type="button"
              aria-label="Next year"
              disabled={viewYear >= maxYear}
              onClick={() => setViewYear((y) => y + 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <ScopeToggle />
          <OpenMonthsBadge />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground cursor-help">
                <Info className="h-3.5 w-3.5" /> vs same month, previous year
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs">
              Fixed comparison for this screen — each month is always measured against itself twelve months earlier,
              regardless of the Comparison toggle used elsewhere in the cockpit.
            </TooltipContent>
          </Tooltip>
        </div>

        {isError && (
          <p className="text-sm text-destructive/90">
            {(error as Error | null)?.message ?? "Could not load the warehouse figures."}
          </p>
        )}

        {isLoading ? (
          <LoadingState label="Loading the monthly comparison…" />
        ) : (
          <Card className="p-5 space-y-1">
            <p className="text-[11px] text-muted-foreground mb-2">
              Difference vs {viewYear - 1} — value and %, colored green (up) / red (down) the same as the rest of the
              cockpit. A month with no data yet, or with no {viewYear - 1} figure to compare against, shows "—".
            </p>
            <ScrollHint>
              <table className="text-sm border-collapse min-w-[1180px]">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-card text-left py-2 pr-3 font-semibold min-w-[200px]">Line item</th>
                    {months.map((m) => (
                      <th key={m.key} className="text-right py-2 px-2 font-semibold min-w-[78px]">
                        <button
                          type="button"
                          onClick={() => (m.hasActual || m.hasComparison) && setOpenMonthKey(m.key)}
                          disabled={!m.hasActual && !m.hasComparison}
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted/60 hover:text-foreground disabled:opacity-40 disabled:pointer-events-none transition-colors"
                          title={m.hasActual || m.hasComparison ? `Open ${monthKeyLabel(m.key)} detail` : "No data for this month"}
                        >
                          {m.label}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lineDefs.map((def, rowIdx) => (
                    <tr
                      key={def.key}
                      className={`border-b border-border/10 ${def.subtotal ? "border-t-2 border-t-border" : ""} ${def.emphasis ? "font-semibold" : ""}`}
                    >
                      <td className={`sticky left-0 z-10 bg-card py-1.5 pr-3 ${def.subtotal ? "text-foreground" : "text-foreground/90"}`}>
                        {def.label}
                      </td>
                      {months.map((m) => {
                        const r = m.rows[rowIdx];
                        const deltaAbs = r.actual === null || r.comparison === null ? null : r.actual - r.comparison;
                        const deltaPct = r.actual === null || r.comparison === null ? null : comparePct(r.actual, r.comparison);
                        const tone = toneOf(deltaAbs);
                        const Icon = tone === "up" ? TrendingUp : tone === "down" ? TrendingDown : tone === "flat" ? Minus : null;
                        return (
                          <td key={m.key} className="py-1.5 px-2 text-right tabular-nums">
                            {deltaAbs === null ? (
                              <span className="text-muted-foreground/50">—</span>
                            ) : (
                              <span className={`inline-flex flex-col items-end leading-tight ${TONE_TEXT[tone]}`}>
                                <span className="inline-flex items-center gap-0.5 text-xs font-semibold">
                                  {Icon && <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden />}
                                  {fmtDeltaCompact(deltaAbs)}
                                </span>
                                <span className="text-[10px]">{deltaPct === null ? "n/m" : fmtDeltaPct(deltaPct)}</span>
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollHint>
          </Card>
        )}

        {/* ---------- single-month full detail, on demand ---------- */}
        <Dialog open={openMonth !== null} onOpenChange={(v) => !v && setOpenMonthKey(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            {openMonth && (
              <>
                <DialogHeader>
                  <DialogTitle>{monthKeyLabel(openMonth.key)} — full breakdown</DialogTitle>
                  <DialogDescription>
                    Actual vs {monthKeyLabel(pyWin(monthWin(openMonth.key)).startKey)} — every line, same figures as
                    the grid's diff column above, shown in full.
                  </DialogDescription>
                </DialogHeader>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="text-left py-1.5 pr-3 font-semibold">Line item</th>
                      <th className="text-right py-1.5 px-2 font-semibold">{monthKeyLabel(openMonth.key)}</th>
                      <th className="text-right py-1.5 px-2 font-semibold">{monthKeyLabel(pyWin(monthWin(openMonth.key)).startKey)}</th>
                      <th className="text-right py-1.5 px-2 font-semibold">Δ value</th>
                      <th className="text-right py-1.5 pl-2 font-semibold">Δ %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openMonth.rows.map((r) => {
                      const deltaAbs = r.actual === null || r.comparison === null ? null : r.actual - r.comparison;
                      const deltaPct = r.actual === null || r.comparison === null ? null : comparePct(r.actual, r.comparison);
                      const tone = toneOf(deltaAbs);
                      return (
                        <tr key={r.key} className={`border-b border-border/10 ${r.subtotal ? "border-t-2 border-t-border" : ""} ${r.emphasis ? "font-semibold" : ""}`}>
                          <td className="py-1 pr-3">{r.label}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{fmtOrDash(r.actual)}</td>
                          <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{fmtOrDash(r.comparison)}</td>
                          <td className={`py-1 px-2 text-right tabular-nums ${TONE_TEXT[tone]}`}>{deltaAbs === null ? "—" : fmtDeltaSAR(deltaAbs)}</td>
                          <td className={`py-1 pl-2 text-right tabular-nums font-semibold ${TONE_TEXT[tone]}`}>{deltaPct === null ? "—" : fmtDeltaPct(deltaPct)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
};

export default MonthByMonthPage;
