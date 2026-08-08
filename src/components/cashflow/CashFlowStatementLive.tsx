// CASH FLOW — Marcello's live-review rebuild, 2026-08-03.
//
// Rebuilt to be IDENTICAL in structure and controls to the Economics screen
// (components/performance/PerformanceAnalysis.tsx): same global chrome, same
// look, clean, minimal, symmetric. "Nient'altro, fatto bene, pulito, minimal."
//
// Final page layout, top to bottom (nothing else):
//   global controls (period selector · Comparison — owned by the shared
//   chrome layer, consumed here, never rebuilt). Scope is OMITTED on
//   purpose: v_cashflow_statement_monthly has no recurrence dimension, so
//   "Only Recurring" has no honest meaning here (spec: "Scope where
//   meaningful").
//   -> big cash circle + cash-by-bank-account split (this squad's mount —
//      matches fix-4-kpi's KpiCircles visual language exactly)
//   -> ONE interactive, expandable cash-flow statement table (built here) —
//      the manager statement ONLY (fix-26, 2026-08-04): Operating (cash
//      collected / cash paid out) -> Investing (named movements) ->
//      Financing (owner & capital / Family Office) -> Other -> Net change
//      -> Opening -> Closing. The accounting-ledger reconciliation that used
//      to render underneath is gone from the screen entirely — see
//      useCashFlowPageData.ts header for why and where it still lives as an
//      internal check.
//
// REMOVED from the old page (Marcello, live review):
//   - Working Capital section — lives ONLY in Treasury -> "Cash & Working
//     Capital" tab now (components/treasury/TreasuryCash.tsx, unchanged).
//   - The per-page Export button — a global Report section replaces it
//     (different squad); components/dashboard/ExportButton.tsx and
//     lib/exportStatements.ts are left untouched for that squad and for the
//     other statement screens still using them (P&L Overview, Balance Sheet).
//   - The old 6/12/24-month matrix, the YTD cash-walk waterfall, the
//     book-cash trend chart and the actual-vs-budget operating-CF chart —
//     the single-window statement table below replaces all of them with
//     the same expandable-row idiom Economics uses, so the CFO gets one
//     coherent way to read every statement in the cockpit.
//   - The "Data completeness" boxed disclaimer (2026-08-03, 2nd-round
//     mandate — "kill the banners", Marcello: a manager's cockpit page, not
//     a disclaimer wall). The ONLY completeness signal left on this page is
//     the small inline `OpenMonthsBadge` next to the window picker; the
//     mini `actualDataNote`/`budgetCapNote` lines inside the statement card
//     itself (rendered only when genuinely relevant to the selected window)
//     stay, since those are a single honest sentence, not a boxed banner.
import { WindowPicker, ComparisonToggle, OpenMonthsBadge, LoadingState } from "@/components/chrome/AlignmentChrome";
import { useCashFlowPageData } from "@/hooks/useCashFlowPageData";
import { CashPositionCircle } from "@/components/cashflow/CashPositionCircle";
import { CashByBankSplit } from "@/components/cashflow/CashByBankSplit";
import { CashFlowTable } from "@/components/cashflow/CashFlowTable";

export const CashFlowStatementLive = () => {
  const data = useCashFlowPageData();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl tracking-wide text-foreground">Cash Flow</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Live cash-flow statement — every figure computed from the warehouse for the selected window.</p>
      </div>

      {/* ---------- global controls ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <WindowPicker months={data.factMonths} />
        <ComparisonToggle />
        <OpenMonthsBadge />
      </div>

      {data.isError && (
        <p className="text-sm text-destructive/90">Could not load the cash-flow statement from Supabase.</p>
      )}

      {/* 2026-08-08 (CEO live review): render the loading state INSTEAD OF
          the circle/split/table below, not alongside them — those three
          have no loading-awareness of their own, so leaving them mounted
          during the fetch showed a full-looking page of "—" placeholders
          with only a tiny text line as any hint something was still
          working. That read as frozen mid-demo; this is the clear signal
          fix (see LoadingState's own header comment for the full context). */}
      {data.isLoading ? (
        <LoadingState label="Loading the cash-flow statement…" />
      ) : (
        <>
          {/* ---------- big cash circle + cash-by-bank split ---------- */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
            <CashPositionCircle
              actual={data.circleActual}
              comparison={data.circleComparison}
              comparisonLabel={data.comparisonLabel}
            />
            <CashByBankSplit data={data.bankSplit} note={data.bankSplitNote} />
          </div>

          {/* ---------- the cash-flow statement table ---------- */}
          <CashFlowTable
            rows={data.rows}
            windowName={data.windowName}
            comparisonLabel={data.comparisonLabel}
            mtdProrated={data.mtdProrated}
            mtdHint={data.mtdHint}
            budgetCapNote={data.budgetCapNote}
            actualDataNote={data.actualDataNote}
          />
        </>
      )}
    </div>
  );
};
