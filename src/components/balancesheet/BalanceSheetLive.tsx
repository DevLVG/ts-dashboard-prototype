// BALANCE SHEET — Marcello's live-review rebuild, 2026-08-03.
//
// STOCK LOGIC, NOT A FLOW WINDOW (mandate extension, same session): the
// balance sheet is point-in-time, so this page does NOT use the shared
// window/PY|Budget chrome (AlignmentContext / components/chrome/
// AlignmentChrome) — that model fits Economics/Cash Flow (flow statements
// over a window), not a snapshot as of one date. Two page-owned controls
// (BsControls.tsx) replace it here, styled to match the shared chrome's
// visual language so the page still FEELS symmetric: an AS-OF selector
// (Today + every closed month-end) and a 3-way Comparison choice (Same Date
// Last Year [default] / Start of Year / Budget). "No other views" — nothing
// else is offered (no scope toggle: recurring/non-recurring has no meaning
// for a balance-sheet line).
//
// PAGE CONTENT — everything else is REMOVED (no tags, no journal-entry
// annotations, no verbose captions, no extra panels):
//   1. Global controls (this page's own, see above).
//   2. Three circles: Fixed Assets · Equity · Liabilities, delta vs the
//      active comparison, colored literally by delta sign (azure/red).
//   3. Two tying statements — Assets; Liabilities & Equity — current
//      structure (section -> subsection -> line item) but cleaned: ONE
//      comparison column (value + %), rows explode by subsection (click),
//      always tying (footer line, honest on any discrepancy).
//   4. Only the as-of/completeness badge, plus (Budget mode only, when
//      relevant) the one-line horizon explainer — see the fallback note
//      below. The net-of-credit-notes footnote is REMOVED (fix-25,
//      2026-08-04, Marcello — CEO Cockpit chrome cleanup): STRICT basis is
//      the only basis shown anywhere, restating it here was noise; this page
//      had its own hardcoded copy left behind when the shared chrome's
//      `StrictBasisNote` was retired — removed to match.
//
// BUDGET comparison (migration 068, scripts/build_budget_balance_sheet.py):
// a SIMPLE DERIVED balance-sheet budget — no client-approved line-by-line BS
// budget exists in budget_2026 (P&L + cash flow only). Covers Jul-2026 ->
// Dec-2027 only; any other as-of month shows the honest "—" (never a
// fabricated figure). UI label is plain "Budget" everywhere — no
// "derived"/badge wording per figure (Marcello, follow-up 2026-08-03); the
// one explanatory tooltip lives on the Comparison toggle itself
// (BsControls.tsx). Full method: Budget_Load_Report_2026-07-19.md addendum.
//
// BUDGET FALLBACK for "Today" (fix-27, 2026-08-04): as-of "Today" resolves
// to the last CLOSED month (July isn't accounting-closed yet -> resolves to
// 30 Jun '26), which sits before the budget horizon starts (Jul '26) -> a
// literal same-month lookup is always empty here, so Budget mode looked dead
// ("—" everywhere, no explanation on-screen). Root-caused via authenticated
// Playwright repro against clever.leveredge.pro (2026-08-04): production
// already renders honest "—" dashes, not fabricated zeros (that part was
// already correct) — the bug is that the comparison had NO useful fallback
// and NO on-screen explanation, so it read as broken/empty at a glance.
// Fix: when as-of is "Today" AND the last-closed month predates the horizon,
// compare last-close ACTUALS against the CURRENT CALENDAR month's PLAN
// (today: 30-Jun actual vs Aug '26 plan) instead of showing nothing — every
// column/circle that uses this fallback is explicitly relabeled ("Actual —
// last close 30 Jun '26" / "Plan — Aug '26") so it can never read as a
// same-date comparison, plus a permanent one-line on-screen explainer (not
// hover-only) states the mechanism. Scoped to isToday only: an explicitly
// selected past closed month (e.g. picking "May 2026" from the as-of
// dropdown) keeps the honest "—" — substituting today's plan for an
// arbitrary historical actual the user deliberately chose would misrepresent
// the comparison they asked for, not clarify it. Once July closes in the
// books, resolvedAsOfKey lands inside the horizon on its own and the exact
// same-month match below takes over automatically — no extra gating needed.
import { Fragment, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronRight, ChevronDown, Scale, HardHat, Info, CalendarClock } from "lucide-react";
import { ScrollHint, LoadingState } from "@/components/chrome/AlignmentChrome";
import { monthKey, monthKeyLabel, shiftMonthKey, endOfMonthLabel, todayMonthKey } from "@/data/liveData";
import {
  useBalanceSheet, useBudgetBalanceSheet, useBankBalances,
  type BalanceSheetRow, type BudgetBalanceSheetRow,
} from "@/data/statementsLive";
import { fmtSAR, fmtDeltaSAR, fmtDeltaPct, fmtOrDash, pctChange } from "@/lib/format";
import { AsOfSelect, BsComparisonToggle, BS_TODAY_VALUE, type BsComparisonMode } from "@/components/balancesheet/BsControls";
import { BsKpiCircles, type BsKpiMetric } from "@/components/balancesheet/BsKpiCircles";

// Negative-zero guard: rounding a tiny negative must render "0", never "(0)".
const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);

// SHAREHOLDER-ADVANCE REGROUP (Marcello, mandate 2026-08-03, fix-20-bs-equity)
// — presentation-only, books/view untouched, keyed on the already-stable
// `line_code` so it needs no migration and no view change.
//
// Statutory (Qoyod's own classification, "formally correct") books the
// family's funding of Trio's operating burn as a Liability: line IC_1108002
// "Due to related parties — Family Office" (flat SAR 9,663,599.45 across
// the whole ledger, 2021-01 -> today — migration 023 flagged it explicitly
// "classification decision pending (Marcello)"). Decision made: for a
// managerial read this is equity-equivalent (same economic substance as the
// 4 individual shareholder current accounts, E_OWN_302xx, which migration
// 023 ALREADY presents inside Equity — nothing to change there).
//
// IC_1108001 "Due to related parties — Hospital Jeddah New" is NOT in this
// set: a different related party (a sister operating company, not the
// family/holding funding vehicle) and immaterial (~SAR 32.9k) — stays an
// ordinary intercompany liability.
//
// Guarded to section === "Liabilities": if this balance ever flips sign
// (shows as a Due-FROM receivable under Assets), it is a receivable from the
// family, not an advance BY the family — correctly excluded from the regroup
// automatically, no code change needed.
const SHAREHOLDER_ADVANCE_LINE_CODES = new Set(["IC_1108002"]);
const SHAREHOLDER_ADVANCE_SUBSECTION = "Shareholder advances (equity-equivalent)";
const isShareholderAdvanceRow = (r: Pick<BalanceSheetRow, "section" | "line_code">): boolean =>
  r.section === "Liabilities" && SHAREHOLDER_ADVANCE_LINE_CODES.has(r.line_code);

interface DisplayLine {
  key: string;
  label: string;
  actual: number | null; // null = budget-only line, no actual-side equivalent
  comparison: number | null;
}
interface SubsectionGroup {
  subsection: string;
  lines: DisplayLine[];
  actualTotal: number;
  comparisonTotal: number | null;
}

const compKey = (r: { section: string; subsection: string; line_item: string }) =>
  `${r.section}|${r.subsection}|${r.line_item}`;

const ExpandRow = ({
  label, actual, comparison, expandable, expanded, onToggle, emphasis, indent = 0,
}: {
  label: string; actual: number | null; comparison: number | null;
  expandable: boolean; expanded: boolean; onToggle?: () => void; emphasis?: boolean; indent?: number;
}) => {
  const deltaAbs = comparison === null || actual === null ? null : actual - comparison;
  const deltaPct = comparison === null || actual === null ? null : pctChange(actual, comparison);
  const good = deltaAbs === null ? null : deltaAbs >= 0;
  return (
    <tr className={`border-b border-border/10 ${emphasis ? "font-semibold border-t border-t-border" : ""}`}>
      {/* owner-audit #11 (2026-08-04): 16x16 chevron tap target with the
          label outside it — same systemic fix as PerformanceAnalysis.tsx /
          CashFlowTable.tsx (whole cell shares onToggle; button keeps its own
          stopPropagation'd handler). */}
      <td
        className={`py-1.5 pr-3 ${onToggle ? "cursor-pointer select-none" : ""}`}
        onClick={onToggle}
      >
        <span style={{ paddingLeft: `${indent * 18}px` }} className="inline-flex items-center gap-1.5">
          {onToggle ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted/60 text-muted-foreground shrink-0"
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ) : indent > 0 ? <span className="inline-block h-4 w-4 shrink-0" /> : null}
          <span>{label}</span>
        </span>
      </td>
      <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap">{actual === null ? "—" : fmt(actual)}</td>
      <td className="py-1.5 px-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">{fmtOrDash(comparison)}</td>
      <td className={`py-1.5 px-3 text-right tabular-nums whitespace-nowrap ${good === null ? "text-muted-foreground" : good ? "text-success" : "text-destructive"}`}>
        {deltaAbs === null ? "—" : fmtDeltaSAR(deltaAbs)}
      </td>
      <td className={`py-1.5 pl-3 text-right tabular-nums whitespace-nowrap font-semibold ${good === null ? "text-muted-foreground" : good ? "text-success" : "text-destructive"}`}>
        {deltaPct === null ? "—" : fmtDeltaPct(deltaPct)}
      </td>
    </tr>
  );
};

const StatementCard = ({
  title, groups, total, comparisonTotal, comparisonLabel, asOfLabel = "As of", expanded, onToggle, extraGrandTotals,
}: {
  title: string;
  groups: { key: string; subsection: string; group: SubsectionGroup }[];
  total: number;
  comparisonTotal: number | null;
  comparisonLabel: string;
  /** Overrides the "As of" header — used by the Budget-fallback comparison
   *  (fix-27, 2026-08-04) so the actual-side column reads "Actual — last
   *  close 30 Jun '26" instead of the ambiguous default. */
  asOfLabel?: string;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  /** Extra subtotal rows to render inline (e.g. "Total Liabilities" before Equity starts). */
  extraGrandTotals?: { afterKey: string; label: string; actual: number; comparison: number | null }[];
}) => (
  <div>
    <h4 className="font-heading text-lg tracking-wide mb-2 text-gold">{title.toUpperCase()}</h4>
    <ScrollHint>
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
            <th className="text-left py-1 pr-2 font-semibold">SAR</th>
            <th className="text-right py-1 px-3 font-semibold whitespace-nowrap">{asOfLabel}</th>
            <th className="text-right py-1 px-3 font-semibold whitespace-nowrap">{comparisonLabel}</th>
            <th className="text-right py-1 px-3 font-semibold whitespace-nowrap">Δ value</th>
            <th className="text-right py-1 pl-3 font-semibold whitespace-nowrap">Δ %</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ key, subsection, group }) => (
            <Fragment key={key}>
              <ExpandRow
                label={subsection}
                actual={group.actualTotal}
                comparison={group.comparisonTotal}
                expandable
                expanded={expanded.has(key)}
                onToggle={() => onToggle(key)}
              />
              {expanded.has(key) && group.lines.map((l) => (
                <ExpandRow key={l.key} label={l.label} actual={l.actual} comparison={l.comparison} expandable={false} expanded={false} indent={1} />
              ))}
              {extraGrandTotals?.filter((g) => g.afterKey === key).map((g) => (
                <ExpandRow key={g.label} label={g.label} actual={g.actual} comparison={g.comparison} expandable={false} expanded={false} emphasis />
              ))}
            </Fragment>
          ))}
          <tr className="border-t-2 border-t-border font-semibold text-base">
            <td className="py-2.5 pr-3">Total {title}</td>
            <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap">{fmt(total)}</td>
            <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">{fmtOrDash(comparisonTotal)}</td>
            <td className="py-2.5 px-3 text-right tabular-nums whitespace-nowrap" colSpan={2} />
          </tr>
        </tbody>
      </table>
    </ScrollHint>
  </div>
);

const startOfYearKey = (asOfKey: string): string => `${Number(asOfKey.slice(0, 4)) - 1}-12`;

export const BalanceSheetLive = () => {
  const { data, isLoading, isError, error } = useBalanceSheet();
  const { data: budgetData } = useBudgetBalanceSheet();
  const { data: bankRows } = useBankBalances();

  const [asOfSel, setAsOfSel] = useState<string>(BS_TODAY_VALUE);
  const [comparisonMode, setComparisonMode] = useState<BsComparisonMode>("PY_DATE");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const months = useMemo(() => {
    if (!data?.available) return [] as string[];
    return [...new Set(data.rows.map((r) => monthKey(r.month)))].sort();
  }, [data]);
  const lastClosedKey = months.length > 0 ? months[months.length - 1] : null;

  const resolvedAsOfKey = asOfSel === BS_TODAY_VALUE ? lastClosedKey : asOfSel;
  const isToday = asOfSel === BS_TODAY_VALUE;

  const pyDateKey = resolvedAsOfKey ? shiftMonthKey(resolvedAsOfKey, -12) : null;
  const startOfYearKeyResolved = resolvedAsOfKey ? startOfYearKey(resolvedAsOfKey) : null;
  const comparisonMonthKey = comparisonMode === "PY_DATE" ? pyDateKey : comparisonMode === "START_OF_YEAR" ? startOfYearKeyResolved : null;

  const rowsFor = (key: string | null): BalanceSheetRow[] =>
    !data?.available || !key ? [] : data.rows.filter((r) => monthKey(r.month) === key);

  const monthRows = useMemo(
    () => rowsFor(resolvedAsOfKey).slice().sort((a, b) => a.sort_order - b.sort_order),
    [data, resolvedAsOfKey],
  );
  const comparisonActualRows = useMemo(() => rowsFor(comparisonMonthKey), [data, comparisonMonthKey]);

  const comparisonActualMap = useMemo(() => {
    if (comparisonMode === "BUDGET" || comparisonActualRows.length === 0) return null;
    const m = new Map<string, number>();
    for (const r of comparisonActualRows) m.set(compKey(r), (m.get(compKey(r)) ?? 0) + r.amount);
    return m;
  }, [comparisonActualRows, comparisonMode]);

  const isBudgetMode = comparisonMode === "BUDGET";

  // Exact same-month match — the normal path once resolvedAsOfKey falls
  // inside the Jul '26 -> Dec '27 budget horizon (see fallback note above).
  const budgetRowsExact = useMemo((): BudgetBalanceSheetRow[] => {
    if (!isBudgetMode || !budgetData?.available || !resolvedAsOfKey) return [];
    return budgetData.rows.filter((r) => monthKey(r.period_month) === resolvedAsOfKey);
  }, [budgetData, isBudgetMode, resolvedAsOfKey]);

  // Fallback: as-of "Today" resolving to a last-closed month before the
  // horizon -> compare against the CURRENT calendar month's plan instead of
  // showing a dead "—". Only engages when the exact match above is empty.
  const currentCalendarMonthKey = todayMonthKey();
  const budgetRowsFallback = useMemo((): BudgetBalanceSheetRow[] => {
    if (!isBudgetMode || !isToday || !resolvedAsOfKey || !budgetData?.available || budgetRowsExact.length > 0) return [];
    if (currentCalendarMonthKey === resolvedAsOfKey) return []; // already covered by the exact match
    return budgetData.rows.filter((r) => monthKey(r.period_month) === currentCalendarMonthKey);
  }, [budgetData, isBudgetMode, isToday, budgetRowsExact, currentCalendarMonthKey, resolvedAsOfKey]);

  const budgetFallbackActive = isBudgetMode && budgetRowsExact.length === 0 && budgetRowsFallback.length > 0;
  const budgetRowsForMonth = budgetFallbackActive ? budgetRowsFallback : budgetRowsExact;

  const budgetMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of budgetRowsForMonth) m.set(r.line_code, (m.get(r.line_code) ?? 0) + r.budget_amount_sar);
    return m;
  }, [budgetRowsForMonth]);

  const budgetUnavailableReason = resolvedAsOfKey
    ? `No Budget available for ${monthKeyLabel(resolvedAsOfKey)} (the derived balance-sheet budget covers Jul '26 → Dec '27 only)${
        isToday ? "" : " — try \"Today\", which compares against the current month's plan instead."
      }`
    : undefined;
  const budgetHasData = isBudgetMode && budgetRowsForMonth.length > 0;

  // Column/circle labels — plain "Budget"/"As of" for the normal case;
  // explicit dated labels the moment the fallback is active so it can never
  // be mistaken for a same-date comparison (Marcello, mandate 2026-08-04).
  const budgetAsOfColumnLabel = budgetFallbackActive && resolvedAsOfKey
    ? `Actual — last close ${endOfMonthLabel(resolvedAsOfKey)}`
    : "As of";
  const budgetComparisonColumnLabel = budgetFallbackActive
    ? `Plan — ${monthKeyLabel(currentCalendarMonthKey)}`
    : "Budget";

  // On-screen (never hover-only) one-line explainer — shown whenever Budget
  // mode isn't doing a plain same-month comparison, i.e. exactly when the
  // horizon boundary is actually relevant to what's on screen (mandate
  // point 3, 2026-08-04).
  const budgetHorizonExplainer = isBudgetMode && budgetRowsExact.length === 0 && resolvedAsOfKey
    ? budgetFallbackActive
      ? `Budget horizon starts Jul '26 — comparing last-close actuals (${endOfMonthLabel(resolvedAsOfKey)}) against the ${monthKeyLabel(currentCalendarMonthKey)} plan. Full same-month comparison activates automatically once July closes in the books.`
      : `Budget horizon starts Jul '26 → Dec '27 — no plan exists for ${monthKeyLabel(resolvedAsOfKey)}. Full same-month comparison activates automatically once July closes in the books.`
    : undefined;

  // A single lookup used by both the circles and the tables: comparison
  // value for one actual row, whichever comparison mode is active (Budget
  // matches by line_code — the stable key shared with v_budget_balance_
  // sheet_monthly; Same Date Last Year / Start of Year match by the
  // section|subsection|line_item triple against the comparison month's
  // actual rows).
  const comparisonFor = (r: BalanceSheetRow): number | null => {
    if (isBudgetMode) {
      if (!budgetHasData) return null;
      return budgetMap.get(r.line_code) ?? null;
    }
    return comparisonActualMap ? comparisonActualMap.get(compKey(r)) ?? null : null;
  };

  /** Groups a section's rows by subsection (Map preserves first-seen order = sort_order order).
   *  Liabilities excludes shareholder-advance lines — regrouped into the Equity
   *  block below (see SHAREHOLDER_ADVANCE_LINE_CODES). */
  const groupSection = (section: "Assets" | "Liabilities" | "Equity") => {
    const bySubsection = new Map<string, DisplayLine[]>();
    for (const r of monthRows) {
      if (r.section !== section) continue;
      if (section === "Liabilities" && isShareholderAdvanceRow(r)) continue;
      const list = bySubsection.get(r.subsection) ?? [];
      list.push({ key: r.line_code, label: r.line_item, actual: r.amount, comparison: comparisonFor(r) });
      bySubsection.set(r.subsection, list);
    }
    const groups: SubsectionGroup[] = [...bySubsection.entries()].map(([subsection, lines]) => ({
      subsection,
      lines,
      actualTotal: lines.reduce((s, l) => s + (l.actual ?? 0), 0),
      comparisonTotal: lines.some((l) => l.comparison !== null) ? lines.reduce((s, l) => s + (l.comparison ?? 0), 0) : null,
    }));
    const actualTotal = groups.reduce((s, g) => s + g.actualTotal, 0);
    const comparisonTotal = groups.some((g) => g.comparisonTotal !== null) ? groups.reduce((s, g) => s + (g.comparisonTotal ?? 0), 0) : null;
    return { groups, actualTotal, comparisonTotal };
  };

  const assets = groupSection("Assets");
  const liabilities = groupSection("Liabilities");
  const equity = groupSection("Equity");

  // ---------------------------------------------- shareholder-advance regroup
  // Pulled out of monthRows directly (not from `liabilities`, which already
  // excludes them) so they can be re-presented as their own Equity subsection.
  const shareholderAdvanceLines: DisplayLine[] = monthRows
    .filter(isShareholderAdvanceRow)
    .map((r) => ({ key: r.line_code, label: r.line_item, actual: r.amount, comparison: comparisonFor(r) }));
  const shareholderAdvanceActualTotal = shareholderAdvanceLines.reduce((s, l) => s + (l.actual ?? 0), 0);
  const shareholderAdvanceComparisonTotal = shareholderAdvanceLines.some((l) => l.comparison !== null)
    ? shareholderAdvanceLines.reduce((s, l) => s + (l.comparison ?? 0), 0)
    : null;
  const hasShareholderAdvanceLines = shareholderAdvanceLines.length > 0;

  // Equity groups as displayed: statutory subsections + (if any) the new
  // shareholder-advance subsection appended at the end.
  const equityGroupsForDisplay: SubsectionGroup[] = hasShareholderAdvanceLines
    ? [
        ...equity.groups,
        {
          subsection: SHAREHOLDER_ADVANCE_SUBSECTION,
          lines: shareholderAdvanceLines,
          actualTotal: shareholderAdvanceActualTotal,
          comparisonTotal: shareholderAdvanceComparisonTotal,
        },
      ]
    : equity.groups;

  // Two equity readings, same underlying data: "statutory" (Qoyod's own
  // classification — matches Total Liabilities+Equity's old behaviour) and
  // "managerial" (incl. shareholder advances) — the one the circle + the
  // grand total now use, so Assets = Liabilities(reduced) + Equity(managerial)
  // ties by construction (the regroup only moves lines between display
  // buckets, never changes an amount).
  const equityStatutoryActualTotal = equity.actualTotal;
  const equityStatutoryComparisonTotal = equity.comparisonTotal;
  const equityManagerialActualTotal = equityStatutoryActualTotal + shareholderAdvanceActualTotal;
  const equityManagerialComparisonTotal =
    equityStatutoryComparisonTotal !== null || shareholderAdvanceComparisonTotal !== null
      ? (equityStatutoryComparisonTotal ?? 0) + (shareholderAdvanceComparisonTotal ?? 0)
      : null;

  // Budget-only "Financing" line (L_FIN_DERIVED) has no actual-side
  // equivalent — surfaced as its own group so Budget-mode subsection totals
  // still add up to the Budget-mode grand total (never hidden inside an
  // unlabeled number).
  const financingBudgetOnly = isBudgetMode && budgetHasData ? budgetMap.get("L_FIN_DERIVED") ?? null : null;
  const liabilitiesGroups = financingBudgetOnly !== null
    ? [...liabilities.groups, { subsection: "Financing", lines: [{ key: "financing-budget-only", label: "Net financing (budget)", actual: null, comparison: financingBudgetOnly }], actualTotal: 0, comparisonTotal: financingBudgetOnly }]
    : liabilities.groups;
  const liabilitiesTotalActual = liabilities.actualTotal;
  const liabilitiesTotalComparison = financingBudgetOnly !== null
    ? (liabilities.comparisonTotal ?? 0) + financingBudgetOnly
    : liabilities.comparisonTotal;

  // Uses the MANAGERIAL equity total (statutory + shareholder advances) so the
  // regroup nets to zero: Liabilities lost exactly what Equity gained.
  const totalLE_actual = liabilitiesTotalActual + equityManagerialActualTotal;
  const totalLE_comparison = liabilitiesTotalComparison !== null || equityManagerialComparisonTotal !== null
    ? (liabilitiesTotalComparison ?? 0) + (equityManagerialComparisonTotal ?? 0)
    : null;

  // Tie-check — ALWAYS on the actual as-of statement, independent of the
  // comparison mode (§3: "they must always tie").
  const checkDelta = assets.actualTotal - totalLE_actual;
  const isBalanced = Math.abs(checkDelta) < 1;

  const comparisonLabel = comparisonMode === "PY_DATE" ? "Same Date Last Year" : comparisonMode === "START_OF_YEAR" ? "Start of Year" : budgetComparisonColumnLabel;

  // ------------------------------------------------------------ circles
  const fixedAssetsActual = monthRows.filter((r) => r.section === "Assets" && r.subsection === "Fixed Assets").reduce((s, r) => s + r.amount, 0);
  const fixedAssetsComparison = isBudgetMode
    ? (budgetHasData ? budgetRowsForMonth.filter((r) => r.section === "Assets" && r.subsection === "Fixed Assets").reduce((s, r) => s + r.budget_amount_sar, 0) : null)
    : (comparisonActualMap ? comparisonActualRows.filter((r) => r.section === "Assets" && r.subsection === "Fixed Assets").reduce((s, r) => s + r.amount, 0) : null);

  // Value tooltips (independent of comparison mode — disclose the statutory
  // vs shareholder-advance vs managerial breakdown on the two affected circles).
  const equityValueTooltip = hasShareholderAdvanceLines
    ? `Equity (statutory — Qoyod's own classification): ${fmt(equityStatutoryActualTotal)} SAR. Shareholder advances reclassified as equity-equivalent (Family Office intercompany funding, still booked as a liability in the books): +${fmt(shareholderAdvanceActualTotal)} SAR. Equity incl. shareholder advances: ${fmt(equityManagerialActualTotal)} SAR.`
    : undefined;
  const liabilitiesValueTooltip = hasShareholderAdvanceLines
    ? `Excludes ${fmt(shareholderAdvanceActualTotal)} SAR of shareholder/family funding (Family Office intercompany), presented as equity-equivalent above. Statutory liabilities (Qoyod's own classification, incl. that funding): ${fmt(liabilitiesTotalActual + shareholderAdvanceActualTotal)} SAR.`
    : undefined;

  const circleMetrics: BsKpiMetric[] = [
    {
      key: "fixedAssets", label: "Fixed Assets", actual: fixedAssetsActual, comparison: fixedAssetsComparison,
      comparisonUnavailableReason: isBudgetMode ? budgetUnavailableReason : undefined,
    },
    {
      key: "equity", label: "Equity", actual: equityManagerialActualTotal, comparison: equityManagerialComparisonTotal,
      comparisonUnavailableReason: isBudgetMode ? budgetUnavailableReason : undefined,
      valueTooltip: equityValueTooltip,
    },
    {
      key: "liabilities", label: "Liabilities", actual: liabilitiesTotalActual, comparison: liabilitiesTotalComparison,
      comparisonUnavailableReason: isBudgetMode ? budgetUnavailableReason : undefined,
      valueTooltip: liabilitiesValueTooltip,
    },
  ];

  // ---------------------------------------------------------- live cash note
  const liveBankTotal = useMemo(
    () => (bankRows && bankRows.length > 0 ? bankRows.reduce((s, r) => s + r.current_balance, 0) : null),
    [bankRows],
  );
  const lastSynced = bankRows && bankRows.length > 0 ? bankRows[0].last_synced.slice(0, 10) : null;

  if (!isLoading && !isError && data && !data.available) {
    return (
      <div className="space-y-6">
        <Card className="p-10 text-center space-y-3 animate-fade-in">
          <HardHat className="h-8 w-8 mx-auto text-gold/70" />
          <h3 className="text-xl font-heading tracking-wide">BALANCE SHEET — NOT YET AVAILABLE</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The monthly balance-sheet statement (v_balance_sheet_monthly) is being finalised in
            the data layer. This screen will populate automatically as soon as the statement is
            published — no reload needed.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl tracking-wide text-foreground">Balance Sheet</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Live, point-in-time — every figure as of the selected date.</p>
      </div>

      {/* ---------- global controls (page-owned — see BsControls.tsx) ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        {months.length > 0 && (
          <AsOfSelect months={months} value={asOfSel} onChange={setAsOfSel} monthLabel={(m) => monthKeyLabel(m)} />
        )}
        <BsComparisonToggle value={comparisonMode} onChange={setComparisonMode} />
      </div>

      {/* As-of badge (completeness/as-of, nothing else — the net-of-credit-
          notes footnote was removed 2026-08-04, fix-25/fix-27: STRICT basis
          is the only basis shown anywhere now, restating it here was noise) */}
      {resolvedAsOfKey && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-sm">
            <CalendarClock className="h-3.5 w-3.5 text-gold" />
            <strong className="font-semibold">
              {isToday ? `Today — as of last close, ${endOfMonthLabel(resolvedAsOfKey)}` : `As at ${endOfMonthLabel(resolvedAsOfKey)}`}
            </strong>
          </div>
          {isToday && liveBankTotal !== null && (
            <span className="text-xs text-muted-foreground">
              Live bank &amp; cash position: <span className="tabular-nums text-foreground font-medium">{fmt(liveBankTotal)}</span> SAR
              {lastSynced ? ` (Qoyod sync ${lastSynced})` : ""} — informational only, not part of the tying statement below.
            </span>
          )}
        </div>
      )}

      {/* Budget-horizon explainer — ON-SCREEN, not hover-only (mandate point
          3, 2026-08-04): only rendered when it's actually relevant, i.e.
          Budget mode is selected and the plain same-month match came up
          empty (either the fallback engaged, or there's genuinely no plan
          for the selected month at all). */}
      {budgetHorizonExplainer && (
        <p className="inline-flex items-start gap-1.5 text-xs text-muted-foreground max-w-2xl">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-gold/80" />
          <span>{budgetHorizonExplainer}</span>
        </p>
      )}

      {/* 2026-08-08 (CEO live review — mistook a still-loading page for a
          broken one mid-demo): a hard-to-miss spinner + message, replacing
          the previous single small muted sentence. Content below is already
          gated on `!isLoading` (see the conditions further down), so this is
          a pure swap — no change to what renders once data arrives. */}
      {isLoading && <LoadingState label="Loading the balance sheet…" />}
      {isError && (
        <p className="text-sm text-destructive">
          {(error as Error | null)?.name === "PermissionDeniedError" ? (error as Error).message : "Could not load the balance sheet from Supabase."}
        </p>
      )}

      {!isLoading && !isError && monthRows.length > 0 && resolvedAsOfKey && (
        <>
          {/* ---------- the 3 circles ---------- */}
          <BsKpiCircles metrics={circleMetrics} comparisonLabel={comparisonLabel} />

          {/* ---------- the two tying statements ---------- */}
          <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-12 gap-y-8">
              <StatementCard
                title="Assets"
                groups={assets.groups.map((g) => ({ key: `A::${g.subsection}`, subsection: g.subsection, group: g }))}
                total={assets.actualTotal}
                comparisonTotal={assets.comparisonTotal}
                comparisonLabel={comparisonLabel}
                asOfLabel={budgetAsOfColumnLabel}
                expanded={expanded}
                onToggle={toggle}
              />
              <StatementCard
                title="Liabilities & Equity"
                groups={[
                  ...liabilitiesGroups.map((g) => ({ key: `L::${g.subsection}`, subsection: g.subsection, group: g })),
                  ...equityGroupsForDisplay.map((g) => ({ key: `E::${g.subsection}`, subsection: g.subsection, group: g })),
                ]}
                total={totalLE_actual}
                comparisonTotal={totalLE_comparison}
                comparisonLabel={comparisonLabel}
                asOfLabel={budgetAsOfColumnLabel}
                expanded={expanded}
                onToggle={toggle}
                extraGrandTotals={[
                  { afterKey: `L::${liabilitiesGroups[liabilitiesGroups.length - 1]?.subsection ?? ""}`, label: "Total Liabilities", actual: liabilitiesTotalActual, comparison: liabilitiesTotalComparison },
                  ...(hasShareholderAdvanceLines
                    ? [
                        { afterKey: `E::${equity.groups[equity.groups.length - 1]?.subsection ?? ""}`, label: "Equity (statutory)", actual: equityStatutoryActualTotal, comparison: equityStatutoryComparisonTotal },
                        { afterKey: `E::${SHAREHOLDER_ADVANCE_SUBSECTION}`, label: "Equity incl. shareholder advances", actual: equityManagerialActualTotal, comparison: equityManagerialComparisonTotal },
                      ]
                    : [
                        { afterKey: `E::${equity.groups[equity.groups.length - 1]?.subsection ?? ""}`, label: "Total Equity", actual: equityManagerialActualTotal, comparison: equityManagerialComparisonTotal },
                      ]),
                ]}
              />
            </div>

            {/* Tie-check footer — always on the actual as-of statement. */}
            <div
              className={`mt-8 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                isBalanced ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              <Scale className="h-4 w-4" />
              {isBalanced ? (
                <span>Balances ✓ — Assets {fmt(assets.actualTotal)} = Liabilities + Equity {fmt(totalLE_actual)}</span>
              ) : (
                <span>Balance check delta: {fmt(checkDelta)} SAR (Assets {fmt(assets.actualTotal)} vs L+E {fmt(totalLE_actual)})</span>
              )}
            </div>
          </Card>
        </>
      )}

      {!isLoading && !isError && data?.available && monthRows.length === 0 && (
        <p className="text-sm text-muted-foreground">No balance-sheet data for the selected date.</p>
      )}
    </div>
  );
};
