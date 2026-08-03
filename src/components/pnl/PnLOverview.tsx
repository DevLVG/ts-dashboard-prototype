// P&L OVERVIEW — spec §1.1 (rewired to the two-basis engine).
//
// One P&L matrix, 5 comparison columns for the selected window:
//   Actual · Budget · Δ Bud (SAR + %) · PY · Δ PY (SAR + %)
// Structure toggle: View A "Statutory (as booked)" (statutory shape) · View B
// "Management · recurring split" (the package §2 shape — DB-1 gated). Plain-
// language labels only — the internal view keys ("A" / "B") are unchanged.
// Budget rules (register §E): Jun-26 = "n/a — no budget exists (by design)";
// TTM aggregates disclose coverage; basis footnote on every comparison;
// budget is EBITDA-deep (D&A/EBIT/Net = "—").
// Charts answer the screen's CFO question — "am I on plan, and vs last
// year?": monthly Revenue and EBITDA, Actual bars vs Budget tick vs PY line.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsListPill, TabsTriggerPill } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Star } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, ReferenceLine, Legend, Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { useAlignment } from "@/contexts/AlignmentContext";
import { BasisBadge, BasisToggle, WindowPicker, OpenMonthsBadge, CompletenessBanner, BudgetBasisFootnote, IncompleteMark, ScrollHint } from "@/components/chrome/AlignmentChrome";
import {
  useBasisRows, useRecurrence, useModelAdjustments, aggregatePL, aggregateRecurring,
  aggregateBudgetWindow, budgetMonthsSet, monthlySeries, deriveCompleteness,
  adjustmentLadder, factMonths, winLabel, BASIS_LABELS, computeMtdProration,
  prorateAgg, prorateRecurring, prorateBudget, type PLAgg, type Win,
} from "@/data/alignment";
import { useBudgetMonthly, LIVE_BU_LABELS, monthKeyLabel, shiftMonthKey } from "@/data/liveData";
import { fmtSAR, fmtDeltaSAR, fmtDeltaPct, fmtCompact, pctChange, comparePct } from "@/lib/format";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { buildPnlExport, exportStatementCsv } from "@/lib/exportStatements";

// ---------------------------------------------------------------- helpers

// Signed storage (revenue +, costs −, profit +): a POSITIVE SAR delta is
// always favourable — more revenue, less cost, more profit.
const deltaColor = (v: number | null): string => {
  if (v === null || Math.abs(v) < 0.05) return "text-muted-foreground";
  return v > 0 ? "text-success" : "text-destructive";
};

interface MatrixRow {
  label: string;
  indent?: boolean;
  emphasis?: boolean;
  topBorder?: boolean;
  /** invert = a HIGHER value is BAD (cost lines). */
  invert?: boolean;
  actual: number | null;
  budget: number | null;
  budgetNote?: string;
  py: number | null;
  badge?: string; // e.g. "model adj — not in books"
  pctOfRevenue?: number | null;
}

const MatrixTable = ({
  rows, winText, pyText, budgetHeader, budgetNa,
}: {
  rows: MatrixRow[];
  winText: string;
  pyText: string;
  budgetHeader: string;
  budgetNa: string | null; // non-null => whole budget column is n/a with this reason
}) => (
  // Layout (punch item 7): the label column is STICKY so horizontal scrolling
  // never strands the reader; labels wrap instead of forcing column blow-out
  // (the old nowrap labels clipped the Δ-PY columns at 1440 in View B and left
  // only the label column visible on first paint at 390); ScrollHint adds a
  // visible affordance whenever the table still overflows.
  <ScrollHint>
    <table className="w-full min-w-[760px] text-sm">
      <thead>
        <tr className="border-b-2 border-border text-xs uppercase tracking-wider text-muted-foreground">
          <th className="text-left py-2.5 pr-3 font-semibold sticky left-0 z-10 bg-card">SAR</th>
          <th className="text-right py-2.5 px-2 font-semibold whitespace-nowrap">Actual ({winText})</th>
          <th className="text-right py-2.5 px-2 font-semibold whitespace-nowrap">{budgetHeader}</th>
          <th className="text-right py-2.5 px-2 font-semibold whitespace-nowrap">Δ Bud</th>
          <th className="text-right py-2.5 px-2 font-semibold whitespace-nowrap">Δ Bud %</th>
          <th className="text-right py-2.5 px-2 font-semibold whitespace-nowrap">PY ({pyText})</th>
          <th className="text-right py-2.5 px-2 font-semibold whitespace-nowrap">Δ PY</th>
          <th className="text-right py-2.5 px-2 font-semibold whitespace-nowrap">Δ PY %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const dBud = r.actual !== null && r.budget !== null ? r.actual - r.budget : null;
          const dBudPct = r.actual !== null && r.budget !== null ? comparePct(r.actual, r.budget, r.invert) : null;
          const dPy = r.actual !== null && r.py !== null ? r.actual - r.py : null;
          const dPyPct = r.actual !== null && r.py !== null ? comparePct(r.actual, r.py, r.invert) : null;
          return (
            <tr
              key={r.label}
              className={[
                r.emphasis ? "border-b border-border/50 font-semibold bg-muted/20" : "border-b border-border/10",
                r.topBorder ? "border-t-2 border-t-border" : "",
              ].join(" ")}
            >
              <td className={`py-2 pr-3 sticky left-0 z-10 bg-card min-w-[140px] max-w-[46vw] md:min-w-[170px] md:max-w-[260px] ${r.indent ? "pl-5 text-muted-foreground font-normal" : ""}`}>
                {r.label}
                {r.pctOfRevenue !== null && r.pctOfRevenue !== undefined && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">({r.pctOfRevenue.toFixed(1)}%)</span>
                )}
                {r.badge && (
                  <span className="ml-2 inline-flex items-center rounded bg-amber-500/15 border border-amber-500/30 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-amber-400">
                    {r.badge}
                  </span>
                )}
              </td>
              <td className="text-right py-2 px-2 tabular-nums whitespace-nowrap">{r.actual === null ? "—" : fmtSAR(r.actual)}</td>
              <td className="text-right py-2 px-2 tabular-nums whitespace-nowrap text-muted-foreground">
                {budgetNa !== null || r.budget === null ? (
                  <Tooltip>
                    <TooltipTrigger asChild><span className="cursor-help">{budgetNa !== null ? "n/a" : "—"}</span></TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      {budgetNa !== null ? budgetNa : (r.budgetNote ?? "Budget is EBITDA-deep — no budget exists below EBITDA (D&A, EBIT, non-operating, net result).")}
                    </TooltipContent>
                  </Tooltip>
                ) : fmtSAR(r.budget)}
              </td>
              <td className={`text-right py-2 px-2 tabular-nums whitespace-nowrap ${deltaColor(dBud)}`}>{dBud === null ? "—" : fmtDeltaSAR(dBud)}</td>
              <td className={`text-right py-2 px-2 tabular-nums whitespace-nowrap ${deltaColor(dBud)}`}>{dBudPct === null ? "—" : fmtDeltaPct(dBudPct)}</td>
              <td className="text-right py-2 px-2 tabular-nums whitespace-nowrap text-muted-foreground">{r.py === null ? "—" : fmtSAR(r.py)}</td>
              <td className={`text-right py-2 px-2 tabular-nums whitespace-nowrap ${deltaColor(dPy)}`}>{dPy === null ? "—" : fmtDeltaSAR(dPy)}</td>
              <td className={`text-right py-2 px-2 tabular-nums whitespace-nowrap ${deltaColor(dPy)}`}>{dPyPct === null ? "—" : fmtDeltaPct(dPyPct)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </ScrollHint>
);

// ------------------------------------------------------- monthly chart

const MonthlyVarianceChart = ({
  title, data, winText,
}: {
  title: string;
  data: { label: string; key: string; actual: number; budget: number | null; py: number }[];
  winText: string;
}) => {
  const ChartTip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ dataKey: string; value: number | null }>; label?: string }) => {
    if (!active || !payload || payload.length === 0) return null;
    const get = (k: string) => payload.find((p) => p.dataKey === k)?.value;
    const actual = get("actual") as number | undefined;
    const budget = get("budget") as number | null | undefined;
    const py = get("py") as number | undefined;
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-title">{label}</p>
        <div className="chart-tooltip-content space-y-0.5">
          {actual !== undefined && <p className="chart-tooltip-actual">Actual: {fmtSAR(actual)}</p>}
          <p className="chart-tooltip-budget">Budget: {budget === null || budget === undefined ? "n/a" : fmtSAR(budget)}</p>
          {py !== undefined && <p className="chart-tooltip-budget">PY (same month −12): {fmtSAR(py)}</p>}
          {actual !== undefined && budget !== null && budget !== undefined && (
            <p className={actual - budget >= 0 ? "chart-tooltip-delta-positive" : "chart-tooltip-delta-negative"}>
              Δ Bud: {fmtDeltaSAR(actual - budget)}
            </p>
          )}
        </div>
      </div>
    );
  };
  return (
    <Card className="p-5 shadow-sm">
      <div className="flex items-baseline justify-between mb-4 gap-2 flex-wrap">
        <h3 className="text-lg font-heading tracking-wide">{title}</h3>
        <span className="text-xs text-muted-foreground">{winText} · monthly</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
          <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
          <YAxis tickFormatter={fmtCompact} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
          <RTooltip content={<ChartTip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
          <Bar dataKey="actual" name="Actual" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={26}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.actual >= 0 ? "hsl(var(--gold) / 0.85)" : "hsl(0 70% 60% / 0.7)"} />
            ))}
          </Bar>
          <Line dataKey="budget" name="Budget" stroke="hsl(var(--foreground) / 0.75)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2.5, fill: "hsl(var(--foreground))", strokeWidth: 0 }} connectNulls={false} isAnimationActive={false} />
          <Line dataKey="py" name="PY (−12m)" stroke="hsl(195 75% 55% / 0.8)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </Card>
  );
};

// ------------------------------------------------------------- the screen

export const PnLOverview = () => {
  // memoOn = the FOUNDER GATE on the model-adjustment memo layer (item 3):
  // opt-in, default OFF on load, persisted; shared with the Performance P3
  // ladder so the memo layer is never half-visible across screens.
  const { basis, win, py, winLabelText, pyLabelText, windowName, memoOn, setMemoOn, lastComplete, preset, todayKey } = useAlignment();
  const { data: basisData, isLoading, isError, error } = useBasisRows();
  const { data: rec } = useRecurrence();
  const { data: budgetRows } = useBudgetMonthly();
  const { data: adjState } = useModelAdjustments();
  const [selectedBU, setSelectedBU] = useState("ALL");
  const [view, setView] = useState<"A" | "B">("A");

  const rows = basisData?.rows;
  const bu = selectedBU === "ALL" ? undefined : selectedBU;

  // MTD proration (Marcello, live-review addendum 2026-08-03): a partial
  // current month can't be honestly compared to a FULL prior-year month or a
  // FULL month's budget — Budget and PY are linearly pro-rated to elapsed
  // calendar days (e.g. August budget × 3/31); Actual is never touched, it
  // already only reflects what's posted so far. `null` outside the MTD
  // preset — every other window compares full periods as before.
  const mtdPro = useMemo(() => (preset === "MTD" ? computeMtdProration(todayKey) : null), [preset, todayKey]);

  const actual = useMemo(() => aggregatePL(rows, basis, win, bu), [rows, basis, win, bu]);
  const priorRaw = useMemo(() => aggregatePL(rows, basis, py, bu), [rows, basis, py, bu]);
  const prior = useMemo(() => (mtdPro ? prorateAgg(priorRaw, mtdPro.fraction) : priorRaw), [priorRaw, mtdPro]);
  const budgetRaw = useMemo(() => aggregateBudgetWindow(budgetRows, win, bu), [budgetRows, win, bu]);
  const budget = useMemo(() => (mtdPro ? prorateBudget(budgetRaw, mtdPro.fraction) : budgetRaw), [budgetRaw, mtdPro]);
  const budMonths = useMemo(() => budgetMonthsSet(budgetRows), [budgetRows]);
  const completeness = useMemo(() => deriveCompleteness(rows), [rows]);
  const flaggedKeys = useMemo(() => new Set(completeness.filter((f) => f.kind !== "lev-unbooked").map((f) => f.key)), [completeness]);

  const recActual = useMemo(() => aggregateRecurring(rows, basis, win, rec, bu), [rows, basis, win, rec, bu]);
  const recPriorRaw = useMemo(() => aggregateRecurring(rows, basis, py, rec, bu), [rows, basis, py, rec, bu]);
  const recPrior = useMemo(() => (mtdPro ? prorateRecurring(recPriorRaw, mtdPro.fraction) : recPriorRaw), [recPriorRaw, mtdPro]);

  const buList = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows ?? []) if (r.bu) set.add(r.bu);
    const order = Object.keys(LIVE_BU_LABELS);
    return order.filter((b) => set.has(b)).concat([...set].filter((b) => !order.includes(b)).sort());
  }, [rows]);

  // Budget n/a reason: whole window has zero budget coverage.
  const budgetNa = budget === null
    ? `n/a — no budget exists for ${winLabelText} (historical budget covers Jun-25→May-26; approved forward budget covers Jul-26→Dec-27; Jun-26 has no budget by design).`
    : null;
  const coverageNote = budget !== null && budget.coveredMonths.length < budget.monthsInWindow
    ? `Budget covers ${budget.coveredMonths.length} of ${budget.monthsInWindow} months (Revenue ${fmtSAR(budget.revenue)} · EBITDA ${fmtSAR(budget.ebitdaAll)}); ${(() => {
        const missing: string[] = [];
        let k = win.startKey;
        while (k <= win.endKey) { if (!budMonths.has(k)) missing.push(monthKeyLabel(k)); k = shiftMonthKey(k, 1); }
        return missing.join(", ");
      })()} ${budget.monthsInWindow - budget.coveredMonths.length === 1 ? "has" : "have"} no budget.`
    : null;

  // ------------------------------------------------------ View A rows
  const viewARows: MatrixRow[] = useMemo(() => {
    const b = budget;
    const mk = (label: string, a: number, bud: number | null, p: number, opts: Partial<MatrixRow> = {}): MatrixRow => ({
      label, actual: a, budget: bud, py: p, ...opts,
    });
    return [
      mk("Revenue", actual.revenue, b?.revenue ?? null, prior.revenue),
      mk("Cost of revenue", actual.cogs, b?.cogs ?? null, prior.cogs, { indent: true, invert: true }),
      mk("Gross margin", actual.grossMargin, b ? b.revenue + b.cogs : null, prior.grossMargin, { emphasis: true }),
      mk("OpEx — G&A", actual.opexGa, b?.opexGa ?? null, prior.opexGa, { indent: true, invert: true, budgetNote: "Budget G&A includes the planned Leveredge line (GA-NRP-*)." }),
      mk("OpEx — Marketing & Sales", actual.opexMs, b?.opexMs ?? null, prior.opexMs, { indent: true, invert: true, budgetNote: "Budget M&S includes the planned F&F non-recurring line (MS-FFC)." }),
      mk("OpEx — People", actual.opexPeople, b?.opexPeople ?? null, prior.opexPeople, { indent: true, invert: true }),
      mk("EBITDA (5-section)", actual.ebitda5, b?.ebitdaPreNrp ?? null, prior.ebitda5, {
        emphasis: true,
        budgetNote: "Budget EBITDA excluding the planned Leveredge/F&F non-recurring lines (GA-NRP-*, MS-FFC) — like-for-like with the actual 5-section EBITDA, which sits above project costs.",
      }),
      mk("Project costs (Leveredge · F&F)", actual.projectCosts, b?.nonRecLines ?? null, prior.projectCosts, {
        indent: true, invert: true,
        budgetNote: "Budget plans these fees on GA-NRP-* / MS-FFC lines; actuals book them as Project-Costs (TPC-*).",
      }),
      mk("EBITDA reported", actual.ebitdaReported, b?.ebitdaAll ?? null, prior.ebitdaReported, { emphasis: true }),
      mk("D&A", actual.da, null, prior.da, { indent: true, invert: true }),
      mk("EBIT", actual.ebit, null, prior.ebit, { emphasis: true }),
      mk("Non-operating", actual.nonOp, null, prior.nonOp, { indent: true }),
      mk("Net result", actual.netResult, null, prior.netResult, { emphasis: true, topBorder: true }),
    ];
  }, [actual, prior, budget]);

  // Budget recurring mapping rule (spec §1.1 View B): DRIFT budget line =
  // COMP-IA (non-recurring by the validated perimeter); NRP lines = GA-NRP-*
  // + MS-FFC. Shared by the View-B matrix AND the recurring headline cards so
  // both read the identical figure. Computed off the RAW (un-prorated)
  // budget so the drift split stays proportionally correct, then the pair is
  // pro-rated together for MTD — never mix a prorated total with a raw slice.
  const recBudgetRaw = useMemo(() => {
    if (!budgetRaw || !budgetRows) return { budRecRevenue: null as number | null, budDrift: null as number | null };
    let drift = 0;
    for (const r of budgetRows) {
      const k = r.period_month.slice(0, 7);
      if (k < win.startKey || k > win.endKey) continue;
      if (bu && r.bu_code !== bu) continue;
      if (r.section === "Revenue" && r.moa_code.startsWith("COMP-IA")) drift += r.budget_amount_sar;
    }
    return { budRecRevenue: budgetRaw.revenue - drift, budDrift: drift };
  }, [budgetRaw, budgetRows, win, bu]);
  const recBudget = useMemo(() => {
    if (!mtdPro) return recBudgetRaw;
    return {
      budRecRevenue: recBudgetRaw.budRecRevenue !== null ? recBudgetRaw.budRecRevenue * mtdPro.fraction : null,
      budDrift: recBudgetRaw.budDrift !== null ? recBudgetRaw.budDrift * mtdPro.fraction : null,
    };
  }, [recBudgetRaw, mtdPro]);

  // ------------------------------------------------------ View B rows
  // Recurring-tagged memo rows only — the ladder from as-booked to the
  // model's clean recurring EBITDA (spec §1.1 View B).
  const ladder = useMemo(() => adjustmentLadder(adjState, win, "recurring"), [adjState, win]);
  const viewBRows: MatrixRow[] | null = useMemo(() => {
    if (!recActual) return null;
    const { budRecRevenue, budDrift } = recBudget;
    const out: MatrixRow[] = [
      { label: "Recurring revenue", actual: recActual.recRevenue, budget: budRecRevenue, py: recPrior?.recRevenue ?? null, emphasis: true },
      { label: "Non-recurring revenue (DRIFT)", actual: recActual.nonRecRevenue, budget: budDrift, py: recPrior?.nonRecRevenue ?? null, indent: true },
      { label: "Total revenue", actual: recActual.totalRevenue, budget: budget?.revenue ?? null, py: recPrior?.totalRevenue ?? null, emphasis: true },
      { label: "Recurring direct costs", actual: recActual.recDirect, budget: null, py: recPrior?.recDirect ?? null, indent: true, invert: true, budgetNote: "Budget COGS is not split by recurrence." },
      { label: "Non-recurring direct costs", actual: recActual.nonRecDirect, budget: null, py: recPrior?.nonRecDirect ?? null, indent: true, invert: true, budgetNote: "Budget COGS is not split by recurrence." },
      {
        label: "Recurring gross profit", actual: recActual.recGrossProfit, budget: null, py: recPrior?.recGrossProfit ?? null, emphasis: true,
        pctOfRevenue: recActual.recRevenue !== 0 ? (recActual.recGrossProfit / recActual.recRevenue) * 100 : null,
      },
      { label: "Recurring OpEx", actual: recActual.recOpex, budget: null, py: recPrior?.recOpex ?? null, indent: true, invert: true },
      { label: "Recurring EBITDA (as booked)", actual: recActual.recEbitda, budget: null, py: recPrior?.recEbitda ?? null, emphasis: true },
    ];
    if (memoOn && ladder.length > 0) {
      let running = recActual.recEbitda;
      for (const step of ladder) {
        running += step.amount;
        out.push({
          label: `${step.label}`, actual: step.amount, budget: null, py: null, indent: true,
          badge: "model adj — not in books",
          budgetNote: step.sourceRef ? `Source: ${step.sourceRef}` : undefined,
        });
      }
      out.push({ label: "Recurring EBITDA (clean, model-adjusted)", actual: running, budget: null, py: null, emphasis: true, badge: "model adj — not in books" });
    }
    out.push(
      ...recActual.nonRecOpexLines.map((l) => ({
        label: `Non-recurring — ${l.label}`, actual: l.amount, budget: null, py: null, indent: true, invert: true,
      })),
      { label: "Reported EBITDA", actual: recActual.reportedEbitda, budget: budget?.ebitdaAll ?? null, py: recPrior?.reportedEbitda ?? null, emphasis: true, topBorder: true },
      { label: "D&A", actual: actual.da, budget: null, py: prior.da, indent: true, invert: true },
      { label: "EBIT", actual: actual.ebit, budget: null, py: prior.ebit, emphasis: true },
      { label: "Net result", actual: actual.netResult, budget: null, py: prior.netResult, emphasis: true },
    );
    return out;
  }, [recActual, recPrior, budget, budgetRows, win, bu, memoOn, ladder, actual, prior]);

  // ------------------------------------------------------ monthly charts
  const chartWin: Win = useMemo(() => {
    // Chart always shows a month-grain series: the selected window if multi-
    // month, else the 12 months ending at the selected month.
    if (win.startKey !== win.endKey) return win;
    return { startKey: shiftMonthKey(win.endKey, -11), endKey: win.endKey };
  }, [win]);
  const chartData = useMemo(() => {
    const series = monthlySeries(rows, basis, chartWin, bu);
    return series.map((p) => {
      const budM = budMonths.has(p.key) ? aggregateBudgetWindow(budgetRows, { startKey: p.key, endKey: p.key }, bu) : null;
      const pyM = aggregatePL(rows, basis, { startKey: shiftMonthKey(p.key, -12), endKey: shiftMonthKey(p.key, -12) }, bu);
      return {
        key: p.key, label: p.label,
        actual: p.agg.revenue, budget: budM ? budM.revenue : null, py: pyM.revenue,
        actualEbitda: p.agg.ebitdaReported, budgetEbitda: budM ? budM.ebitdaAll : null, pyEbitda: pyM.ebitdaReported,
      };
    });
  }, [rows, basis, chartWin, bu, budgetRows, budMonths]);

  // Audit-ready export of the CURRENTLY displayed matrix (view A or B), stamped
  // with window, basis, structure, BU, live source object and data-as-of.
  const handleExport = () => {
    const displayRows = view === "A" ? viewARows : (viewBRows ?? []);
    const notes: string[] = [];
    const flagged = [...flaggedKeys].some((k) => k >= win.startKey && k <= win.endKey);
    if (displayRows.length === 0) notes.push("Management · recurring split view is pending the recurrence dimension — no rows to export yet.");
    if (flagged) notes.push("Window includes months with partial or missing cost postings — see the completeness banner in the cockpit.");
    if (coverageNote) notes.push(coverageNote);
    if (budgetNa) notes.push(budgetNa);
    notes.push("Signed storage: revenue positive, costs negative; a positive delta is favourable. PY = the same window shifted -12 months, same basis and perimeter.");
    if (mtdPro) notes.push(`Month-to-date window: Budget and PY pro-rated linearly to elapsed calendar days (day ${mtdPro.elapsedDays} of ${mtdPro.daysInMonth}, ${Math.round(mtdPro.fraction * 100)}%). Actual is not pro-rated.`);
    exportStatementCsv(
      buildPnlExport({
        displayRows,
        meta: {
          entity: "Trio Sporting Club",
          statement: `Profit & Loss — ${windowName}`,
          period: `${windowName} · Actual ${winLabelText} vs PY ${mtdPro ? "same days (pro-rated)" : pyLabelText}`,
          basis: BASIS_LABELS[basis],
          structure: view === "A" ? "Statutory (as booked)" : "Management · recurring split",
          businessUnit: selectedBU === "ALL" ? "All Company" : `${LIVE_BU_LABELS[selectedBU] ?? selectedBU} (${selectedBU})`,
          source: `Supabase · ${basisData?.sourceObject ?? "pnl_management"} + v_budget_monthly (Qoyod-certified warehouse)`,
          dataAsOf: `${monthKeyLabel(lastComplete)} close complete`,
        },
        notes,
      }),
    );
  };

  if (isError) {
    return (
      <Card className="p-6">
        <p className="text-sm text-destructive">{(error as Error | null)?.message ?? "Could not load the P&L fact rows."}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <WindowPicker months={factMonths(rows)} />
        <OpenMonthsBadge />
        <BasisToggle />
        <Select value={selectedBU} onValueChange={setSelectedBU}>
          <SelectTrigger className="w-52 bg-background font-medium"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Company</SelectItem>
            {buList.map((b) => (
              <SelectItem key={b} value={b}>{LIVE_BU_LABELS[b] ?? b} ({b})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Tabs value={view} onValueChange={(v) => setView(v as "A" | "B")}>
          <TabsListPill>
            <TabsTriggerPill value="A">Statutory (as booked)</TabsTriggerPill>
            <TabsTriggerPill value="B">Management · recurring split</TabsTriggerPill>
          </TabsListPill>
        </Tabs>
        {view === "B" && adjState?.available && (
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={memoOn} onChange={(e) => setMemoOn(e.target.checked)} className="accent-[hsl(var(--gold))]" />
            Model-adjustment memo lines
          </label>
        )}
        <ExportButton className="ml-auto" onClick={handleExport} />
      </div>

      <CompletenessBanner rows={rows} />
      {isLoading && <p className="text-sm text-muted-foreground">Loading live P&L fact rows…</p>}

      {/* Headline strip — View A: statutory headline metrics. View B: the
          recurring split, Recurring EBITDA visually emphasized (spec §1.1:
          "make sure the recurring lines are prominent in View B"). Falls
          back to View A cards if the recurrence dimension isn't live yet. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {((view === "B" && recActual
          ? [
              { label: "Recurring revenue", a: recActual.recRevenue, b: recBudget.budRecRevenue, p: recPrior?.recRevenue ?? 0, emphasize: false },
              { label: "Recurring gross profit", a: recActual.recGrossProfit, b: null, p: recPrior?.recGrossProfit ?? 0, emphasize: false },
              { label: "Recurring EBITDA", a: recActual.recEbitda, b: null, p: recPrior?.recEbitda ?? 0, emphasize: true },
              { label: "Reported EBITDA", a: recActual.reportedEbitda, b: budget?.ebitdaAll ?? null, p: recPrior?.reportedEbitda ?? 0, emphasize: false },
            ]
          : [
              { label: "Revenue", a: actual.revenue, b: budget?.revenue ?? null, p: prior.revenue, emphasize: false },
              { label: "Gross margin", a: actual.grossMargin, b: budget ? budget.revenue + budget.cogs : null, p: prior.grossMargin, emphasize: false },
              { label: "EBITDA reported", a: actual.ebitdaReported, b: budget?.ebitdaAll ?? null, p: prior.ebitdaReported, emphasize: false },
              { label: "Net result", a: actual.netResult, b: null, p: prior.netResult, emphasize: false },
            ]
        ) as { label: string; a: number; b: number | null; p: number; emphasize: boolean }[]).map((k) => {
          const dP = comparePct(k.a, k.p ?? 0);
          return (
            <Card
              key={k.label}
              className={cn(
                "p-4 space-y-1.5",
                k.emphasize && "border-gold/60 ring-1 ring-gold/40 bg-gold/[0.04] shadow-md",
              )}
            >
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
                {k.label} <BasisBadge basis={basis} className="ml-1" />
                {k.emphasize && <Star className="h-3 w-3 text-gold fill-gold/40" aria-hidden />}
              </p>
              <p className={cn("text-2xl font-heading tracking-tight tabular-nums", k.emphasize && "text-gold")}>{fmtSAR(k.a)}</p>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>
                  vs Budget{mtdPro ? ` (pro-rated ${mtdPro.elapsedDays}/${mtdPro.daysInMonth})` : ""}:{" "}
                  {k.b === null ? (
                    budgetNa ? (
                      <Tooltip>
                        <TooltipTrigger asChild><span className="cursor-help">—</span></TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs text-xs">{budgetNa}</TooltipContent>
                      </Tooltip>
                    ) : "—"
                  ) : (
                    <span className={deltaColor(k.a - k.b)}>{fmtDeltaSAR(k.a - k.b)}</span>
                  )}
                </p>
                <p>
                  vs PY ({mtdPro ? "same days" : pyLabelText}):{" "}
                  <span className={deltaColor(k.a - k.p)}>
                    {fmtDeltaSAR(k.a - k.p)}{dP !== null ? ` · ${fmtDeltaPct(dP)}` : ""}
                  </span>
                </p>
              </div>
            </Card>
          );
        })}
      </div>
      {mtdPro && (
        <p className="text-xs text-muted-foreground -mt-2 flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 mt-px shrink-0 text-amber-400/80" />
          Month-to-date Budget and PY are pro-rated linearly to elapsed calendar days — day{" "}
          {mtdPro.elapsedDays} of {mtdPro.daysInMonth} ({Math.round(mtdPro.fraction * 100)}%). Actual is
          never pro-rated: an open month's actual already reflects only what's posted so far.
        </p>
      )}

      {/* Trend charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <MonthlyVarianceChart
          title="REVENUE — ACTUAL vs BUDGET vs PY"
          winText={winLabel(chartWin)}
          data={chartData.map((d) => ({ key: d.key, label: d.label, actual: d.actual, budget: d.budget, py: d.py }))}
        />
        <MonthlyVarianceChart
          title="EBITDA REPORTED — ACTUAL vs BUDGET vs PY"
          winText={winLabel(chartWin)}
          data={chartData.map((d) => ({ key: d.key, label: d.label, actual: d.actualEbitda, budget: d.budgetEbitda, py: d.pyEbitda }))}
        />
      </div>

      {/* The matrix */}
      <Card className="p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h3 className="text-xl font-heading tracking-wide">P&amp;L — {windowName.toUpperCase()}</h3>
          <BasisBadge basis={basis} />
          {budget && (
            <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground border border-border">
              Budget · {budget.versions.join(" + ")}
            </span>
          )}
          {(() => {
            const flagged = [...flaggedKeys].some((k) => k >= win.startKey && k <= win.endKey);
            return <IncompleteMark flagged={flagged} className="text-base" />;
          })()}
        </div>
        {/* Provenance note (Fix A, live review 2026-08-03): the budget series
            spans two vintages plus a documented gap — spelled out once, near
            the badge, so "no budget" in Jun-26 reads as by-design rather than
            a bug. */}
        <p className="text-[11px] text-muted-foreground/80 mb-2">
          Budget: approved 16 Jul (from Jul '26) · historical to May '26 · Jun '26: no approved budget.
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          {view === "A" ? "Statutory shape — as booked in the ledger." : "Management shape — the validated package structure (recurring lens)."}
          {" "}Every column header names its window; PY is the same window shifted −12 months, same basis, same perimeter.
        </p>

        {view === "A" && (
          <MatrixTable
            rows={viewARows}
            winText={winLabelText}
            pyText={mtdPro ? "same days" : pyLabelText}
            budgetHeader={`Budget${budget ? ` · ${budget.versions.length > 1 ? "blend" : budget.versions[0]}` : ""}${mtdPro ? ` (pro-rated ${mtdPro.elapsedDays}/${mtdPro.daysInMonth})` : ""}`}
            budgetNa={budgetNa}
          />
        )}
        {view === "B" && (
          viewBRows ? (
            <MatrixTable
              rows={viewBRows}
              winText={winLabelText}
              pyText={mtdPro ? "same days" : pyLabelText}
              budgetHeader={`Budget${mtdPro ? ` (pro-rated ${mtdPro.elapsedDays}/${mtdPro.daysInMonth})` : ""}`}
              budgetNa={budgetNa}
            />
          ) : (
            <div className="rounded-md border border-border bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">
              Recurring view pending recurrence dimension — the validated recurring/DRIFT perimeter
              (dim_recurrence) has not landed in the warehouse yet. This view activates automatically
              when it does; no reload needed.
            </div>
          )
        )}

        <div className="mt-4 space-y-1.5">
          {coverageNote && <p className="text-xs text-amber-300/90">{coverageNote}</p>}
          <BudgetBasisFootnote />
          {bu && (
            <p className="text-xs text-muted-foreground">
              BU view: revenue and directly-attributed costs only — budget costs largely unallocated
              to BUs and actual costs partly unallocated (UNALL) until the allocation engine closes.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Source: {basisData?.sourceObject ?? "…"} + v_budget_monthly (live warehouse). Drill to MoA
            leaf on the Drill screen — the drill inherits the active basis (credit-note rows excluded
            on Validated, netted off on Strict, with an on-screen count either way).
          </p>
        </div>
      </Card>
    </div>
  );
};
