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
//   4. Only the as-of/completeness badge + the net-of-credit-notes footnote.
//
// BUDGET comparison (migration 068, scripts/build_budget_balance_sheet.py):
// a SIMPLE DERIVED balance-sheet budget — no client-approved line-by-line BS
// budget exists in budget_2026 (P&L + cash flow only). Covers Jul-2026 ->
// Dec-2027 only; any other as-of month shows the honest "—" (never a
// fabricated figure). UI label is plain "Budget" everywhere — no
// "derived"/badge wording per figure (Marcello, follow-up 2026-08-03); the
// one explanatory tooltip lives on the Comparison toggle itself
// (BsControls.tsx). Full method: Budget_Load_Report_2026-07-19.md addendum.
import { Fragment, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronRight, ChevronDown, Scale, HardHat, ShieldCheck, CalendarClock } from "lucide-react";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { monthKey, monthKeyLabel, shiftMonthKey, endOfMonthLabel } from "@/data/liveData";
import {
  useBalanceSheet, useBudgetBalanceSheet, useBankBalances,
  type BalanceSheetRow, type BudgetBalanceSheetRow,
} from "@/data/statementsLive";
import { fmtSAR, fmtDeltaSAR, fmtDeltaPct, fmtOrDash, pctChange } from "@/lib/format";
import { AsOfSelect, BsComparisonToggle, BS_TODAY_VALUE, type BsComparisonMode } from "@/components/balancesheet/BsControls";
import { BsKpiCircles, type BsKpiMetric } from "@/components/balancesheet/BsKpiCircles";

// Negative-zero guard: rounding a tiny negative must render "0", never "(0)".
const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);

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
      <td className="py-1.5 pr-3">
        <span style={{ paddingLeft: `${indent * 18}px` }} className="inline-flex items-center gap-1.5">
          {onToggle ? (
            <button type="button" onClick={onToggle} className="inline-flex items-center justify-center h-4 w-4 rounded hover:bg-muted/60 text-muted-foreground shrink-0">
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
  title, groups, total, comparisonTotal, comparisonLabel, expanded, onToggle, extraGrandTotals,
}: {
  title: string;
  groups: { key: string; subsection: string; group: SubsectionGroup }[];
  total: number;
  comparisonTotal: number | null;
  comparisonLabel: string;
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
            <th className="text-right py-1 px-3 font-semibold whitespace-nowrap">As of</th>
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

  const budgetRowsForMonth = useMemo((): BudgetBalanceSheetRow[] => {
    if (comparisonMode !== "BUDGET" || !budgetData?.available || !resolvedAsOfKey) return [];
    return budgetData.rows.filter((r) => monthKey(r.period_month) === resolvedAsOfKey);
  }, [budgetData, comparisonMode, resolvedAsOfKey]);

  const budgetMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of budgetRowsForMonth) m.set(r.line_code, (m.get(r.line_code) ?? 0) + r.budget_amount_sar);
    return m;
  }, [budgetRowsForMonth]);

  const isBudgetMode = comparisonMode === "BUDGET";
  const budgetUnavailableReason = resolvedAsOfKey
    ? `No Budget available for ${monthKeyLabel(resolvedAsOfKey)} (the derived balance-sheet budget covers Jul '26 → Dec '27 only).`
    : undefined;
  const budgetHasData = isBudgetMode && budgetRowsForMonth.length > 0;

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

  /** Groups a section's rows by subsection (Map preserves first-seen order = sort_order order). */
  const groupSection = (section: "Assets" | "Liabilities" | "Equity") => {
    const bySubsection = new Map<string, DisplayLine[]>();
    for (const r of monthRows) {
      if (r.section !== section) continue;
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

  const totalLE_actual = liabilitiesTotalActual + equity.actualTotal;
  const totalLE_comparison = liabilitiesTotalComparison !== null || equity.comparisonTotal !== null
    ? (liabilitiesTotalComparison ?? 0) + (equity.comparisonTotal ?? 0)
    : null;

  // Tie-check — ALWAYS on the actual as-of statement, independent of the
  // comparison mode (§3: "they must always tie").
  const checkDelta = assets.actualTotal - totalLE_actual;
  const isBalanced = Math.abs(checkDelta) < 1;

  const comparisonLabel = comparisonMode === "PY_DATE" ? "Same Date Last Year" : comparisonMode === "START_OF_YEAR" ? "Start of Year" : "Budget";

  // ------------------------------------------------------------ circles
  const fixedAssetsActual = monthRows.filter((r) => r.section === "Assets" && r.subsection === "Fixed Assets").reduce((s, r) => s + r.amount, 0);
  const fixedAssetsComparison = isBudgetMode
    ? (budgetHasData ? budgetRowsForMonth.filter((r) => r.section === "Assets" && r.subsection === "Fixed Assets").reduce((s, r) => s + r.budget_amount_sar, 0) : null)
    : (comparisonActualMap ? comparisonActualRows.filter((r) => r.section === "Assets" && r.subsection === "Fixed Assets").reduce((s, r) => s + r.amount, 0) : null);

  const circleMetrics: BsKpiMetric[] = [
    {
      key: "fixedAssets", label: "Fixed Assets", actual: fixedAssetsActual, comparison: fixedAssetsComparison,
      comparisonUnavailableReason: isBudgetMode ? budgetUnavailableReason : undefined,
    },
    {
      key: "equity", label: "Equity", actual: equity.actualTotal, comparison: equity.comparisonTotal,
      comparisonUnavailableReason: isBudgetMode ? budgetUnavailableReason : undefined,
    },
    {
      key: "liabilities", label: "Liabilities", actual: liabilitiesTotalActual, comparison: liabilitiesTotalComparison,
      comparisonUnavailableReason: isBudgetMode ? budgetUnavailableReason : undefined,
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

      {/* As-of badge (kept per spec: completeness/as-of + net-of-credit-notes footnote, nothing else) */}
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
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-help w-fit">
            <ShieldCheck className="h-3.5 w-3.5 text-sky-400/80" />
            Figures net of customer credit notes
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-xs">
          Receivables are net of the customer credit notes back-loaded to the ledger on 2026-07-21 — the conservative, fully-reconciled basis, same as the rest of the cockpit.
        </TooltipContent>
      </Tooltip>

      {isLoading && <p className="text-sm text-muted-foreground">Loading the balance sheet…</p>}
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
                expanded={expanded}
                onToggle={toggle}
              />
              <StatementCard
                title="Liabilities & Equity"
                groups={[
                  ...liabilitiesGroups.map((g) => ({ key: `L::${g.subsection}`, subsection: g.subsection, group: g })),
                  ...equity.groups.map((g) => ({ key: `E::${g.subsection}`, subsection: g.subsection, group: g })),
                ]}
                total={totalLE_actual}
                comparisonTotal={totalLE_comparison}
                comparisonLabel={comparisonLabel}
                expanded={expanded}
                onToggle={toggle}
                extraGrandTotals={[
                  { afterKey: `L::${liabilitiesGroups[liabilitiesGroups.length - 1]?.subsection ?? ""}`, label: "Total Liabilities", actual: liabilitiesTotalActual, comparison: liabilitiesTotalComparison },
                  { afterKey: `E::${equity.groups[equity.groups.length - 1]?.subsection ?? ""}`, label: "Total Equity", actual: equity.actualTotal, comparison: equity.comparisonTotal },
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
