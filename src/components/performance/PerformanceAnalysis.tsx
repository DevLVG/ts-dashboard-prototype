// PERFORMANCE ANALYSIS — spec §1.2, the package-story screen.
//
// Reproduces, live from the warehouse, the validated performance-analysis
// storyline delivered 18-Jul. Default basis: Validated. Default window: TTM
// at the latest complete month; the "As delivered (Jun-25→May-26)" preset is
// one click away. Information hierarchy (spec frontend #5):
//   headline KPIs (P1 recurring YoY · P2 total YoY · P3 recurring EBITDA)
//   → the anti-confusion devices (P6 basis & window bridge · P5 CN anomaly)
//   → composition (P4 per-BU growth · P7 fiscal quarters)
//   → budget story (P8) → multi-year clean series (P9).
// Every figure arrives via queries — the traceability gate (§5.D) forbids any
// golden number as a literal in this bundle.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Info, TrendingUp, TrendingDown, FileSearch } from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, ReferenceLine, Legend, Cell, LabelList,
} from "recharts";
import { useAlignment } from "@/contexts/AlignmentContext";
import { BasisBadge, BasisToggle, WindowPicker, CompletenessBanner, FrozenRefChip } from "@/components/chrome/AlignmentChrome";
import {
  useBasisRows, useRecurrence, useModelAdjustments, useCreditNoteAudit,
  useCollectionsMonthly, collectionsInWin,
  aggregatePL, aggregateRecurring, aggregateBudgetWindow, recurrenceIsLive,
  creditNotesInWin, adjustmentLadder, resolveRecurrence, fiscalQuarters,
  factMonths, winLabel, pyWin, AS_DELIVERED_WIN, BASIS_SHORT,
  type Basis, type BasisRow, type Win, type RecurrenceState,
} from "@/data/alignment";
import { useBudgetMonthly, useBudgetAllVersions, LIVE_BU_LABELS, monthKey, monthKeyLabel, shiftMonthKey } from "@/data/liveData";
import { fmtSAR, fmtDeltaSAR, fmtDeltaPct, fmtPct, fmtCompact, pctChange, fmtOrDash } from "@/lib/format";
import { useIsMobile } from "@/hooks/use-mobile";

// ------------------- FROZEN PACKAGE CITATIONS (punch item 6, spec §0.3/§5-A)
// These strings/values are QUOTATIONS of the delivered 18-Jul package (12-Jun
// extraction / 16-Jul model freeze). They legitimately exist nowhere in the
// live warehouse — they render ONLY inside <FrozenRefChip>, clearly labeled
// "as delivered", visually distinct from live figures. The §5-D traceability
// gate excepts exactly these labeled citations (they are citations of the
// delivered package, not figures of the panel).
const DELIVERED_P1_PY_TEXT = "PY 3,027,897 · +29.3%";
const DELIVERED_P3_CLEAN_SAR = 80942; // "Recurring EBITDA (clean)" as delivered

// ------------------------------------------------------------- primitives

const YoYChip = ({ pct, positiveIsGood = true }: { pct: number | null; positiveIsGood?: boolean }) => {
  if (pct === null) return <span className="text-sm text-muted-foreground">n/a</span>;
  const good = positiveIsGood ? pct >= 0 : pct < 0;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-bold tabular-nums ${good ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
      {pct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
      {fmtDeltaPct(pct)}
    </span>
  );
};

const TileHeader = ({ title, basis, hint }: { title: string; basis?: Basis; hint?: string }) => (
  <div className="flex items-center gap-2 flex-wrap">
    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
    {basis && <BasisBadge basis={basis} />}
    {hint && (
      <Tooltip>
        <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground/70 cursor-help" /></TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm text-xs">{hint}</TooltipContent>
      </Tooltip>
    )}
  </div>
);

const PendingRecurrence = () => (
  <p className="text-sm text-muted-foreground py-4">
    Recurring view pending recurrence dimension — activates automatically once
    dim_recurrence is live in the warehouse.
  </p>
);

const DataStateFootnote = () => (
  <p className="text-[11px] leading-snug text-muted-foreground/80 mt-2">
    PY computed live from the warehouse — includes the post-delivery remediation of
    Dec-24/Jan-25/Feb-25 postings; the delivered package quoted the 12-Jun frozen extraction.
  </p>
);

// ------------------------------------------------------------- waterfall

interface WaterfallStep {
  label: string;
  /** Compact x-axis label for narrow viewports (≤768px) — punch item 7. */
  short?: string;
  value: number;
  kind: "anchor" | "delta";
}

const Waterfall = ({ steps, height = 260 }: { steps: WaterfallStep[]; height?: number }) => {
  const isMobile = useIsMobile();
  // Build float bars: anchors run 0→value; deltas run prev→prev+value.
  const data = useMemo(() => {
    let running = 0;
    return steps.map((s) => {
      const label = isMobile && s.short ? s.short : s.label;
      if (s.kind === "anchor") {
        running = s.value;
        return { label, base: Math.min(0, s.value), size: Math.abs(s.value), kind: "anchor" as const, raw: s.value };
      }
      const from = running;
      running += s.value;
      return { label, base: Math.min(from, running), size: Math.abs(s.value), kind: s.value >= 0 ? ("up" as const) : ("down" as const), raw: s.value };
    });
  }, [steps, isMobile]);
  const Tip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: (typeof data)[number] }>; label?: string }) => {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0].payload;
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-title">{label}</p>
        <p className="chart-tooltip-content chart-tooltip-actual">
          {d.kind === "anchor" ? fmtSAR(d.raw) : fmtDeltaSAR(d.raw)}
        </p>
      </div>
    );
  };
  return (
    <ResponsiveContainer width="100%" height={isMobile ? height + 26 : height}>
      <ComposedChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
        <XAxis
          dataKey="label"
          stroke="hsl(var(--muted-foreground))"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: isMobile ? 9.5 : 10.5 }}
          tickLine={false}
          interval={0}
          angle={isMobile ? -32 : 0}
          textAnchor={isMobile ? "end" : "middle"}
          height={isMobile ? 54 : 30}
        />
        <YAxis tickFormatter={fmtCompact} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={isMobile ? 42 : 54} />
        <RTooltip content={<Tip />} />
        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
        <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="size" stackId="wf" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={56}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.kind === "anchor" ? "hsl(var(--gold) / 0.9)" : d.kind === "up" ? "hsl(195 75% 55% / 0.8)" : "hsl(0 70% 60% / 0.75)"}
            />
          ))}
          <LabelList
            dataKey="raw"
            position="top"
            formatter={(v: number) => fmtCompact(v)}
            style={{ fill: "hsl(var(--foreground))", fontSize: 10.5, fontWeight: 600 }}
          />
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
};

// --------------------------------------------------------------- screen

export const PerformanceAnalysis = () => {
  const { basis, win, py, winLabelText, pyLabelText, windowName, lastComplete, memoOn, setMemoOn } = useAlignment();
  const { data: basisData, isLoading } = useBasisRows();
  const { data: rec } = useRecurrence();
  const { data: budgetRows } = useBudgetMonthly();
  const { data: adjState } = useModelAdjustments();
  const { data: collState } = useCollectionsMonthly();
  const [cnDrillOpen, setCnDrillOpen] = useState(false);
  const cnAudit = useCreditNoteAudit(cnDrillOpen);

  const rows = basisData?.rows;
  const recLive = recurrenceIsLive(rows, rec);

  // ---------------------------------------------------------- aggregates
  const recCur = useMemo(() => aggregateRecurring(rows, basis, win, rec), [rows, basis, win, rec]);
  const recPy = useMemo(() => aggregateRecurring(rows, basis, py, rec), [rows, basis, py, rec]);
  // BOTH bases, current AND PY — the Strict-basis explainer chip (item 1) is
  // DATA-CONDITIONED: it states the actual live relationship between the two
  // bases' YoY, so it needs the full 2×2 (basis × period) grid.
  const otherBasis: Basis = basis === "VALIDATED" ? "STRICT" : "VALIDATED";
  const recCurOther = useMemo(() => aggregateRecurring(rows, otherBasis, win, rec), [rows, otherBasis, win, rec]);
  const recPyOther = useMemo(() => aggregateRecurring(rows, otherBasis, py, rec), [rows, otherBasis, py, rec]);
  const totCur = useMemo(() => aggregatePL(rows, basis, win), [rows, basis, win]);
  const totPy = useMemo(() => aggregatePL(rows, basis, py), [rows, basis, py]);
  const cnCur = useMemo(() => creditNotesInWin(rows, win), [rows, win]);
  const cnPy = useMemo(() => creditNotesInWin(rows, py), [rows, py]);
  // Collections (migration 032) — denominator of the CN/collections ratio (P5).
  const collCur = useMemo(() => collectionsInWin(collState?.rows, win), [collState, win]);
  const collPy = useMemo(() => collectionsInWin(collState?.rows, py), [collState, py]);
  // Recurring-tagged memo adjustments only: the ladder from AS-BOOKED to the
  // model's CLEAN recurring EBITDA (non-recurring memo rows sit elsewhere).
  const ladder = useMemo(() => adjustmentLadder(adjState, win, "recurring"), [adjState, win]);

  const recYoY = recCur && recPy ? pctChange(recCur.recRevenue, recPy.recRevenue) : null;
  const recYoYOther = recCurOther && recPyOther ? pctChange(recCurOther.recRevenue, recPyOther.recRevenue) : null;
  const totYoY = pctChange(totCur.revenue, totPy.revenue);

  // ------------------------------------------------------------- bridge
  const bridge = useMemo(() => {
    if (!rows) return null;
    const presetValidated = aggregatePL(rows, "VALIDATED", AS_DELIVERED_WIN);
    const winValidated = aggregatePL(rows, "VALIDATED", win);
    const winStrict = aggregatePL(rows, "STRICT", win);
    return { presetValidated, winValidated, winStrict };
  }, [rows, win]);

  // ------------------------------------------------------ per-BU (P4)
  const buTable = useMemo(() => {
    if (!rows || !recLive) return null;
    const acc = new Map<string, { cur: number; py: number }>();
    for (const r of rows) {
      if (r.section !== "Revenue") continue;
      if (basis === "VALIDATED" && r.source === "credit_note") continue;
      const rc = resolveRecurrence(r, rec);
      if (rc === "non-recurring") continue; // recurring perimeter (validated DRIFT tags)
      const k = monthKey(r.period_month);
      const b = r.bu ?? "—";
      const slot = acc.get(b) ?? { cur: 0, py: 0 };
      if (k >= win.startKey && k <= win.endKey) slot.cur += r.amount_sar;
      if (k >= py.startKey && k <= py.endKey) slot.py += r.amount_sar;
      acc.set(b, slot);
    }
    return [...acc.entries()]
      .map(([bu, v]) => ({ bu, label: LIVE_BU_LABELS[bu] ?? bu, ...v, yoy: pctChange(v.cur, v.py) }))
      .filter((r) => Math.abs(r.cur) > 0.5 || Math.abs(r.py) > 0.5)
      .sort((a, b) => b.cur - a.cur);
  }, [rows, rec, recLive, basis, win, py]);

  // --------------------------------------------------- fiscal quarters (P7)
  const quarters = useMemo(() => {
    if (!rows || !recLive) return null;
    // FY containing the window end (fiscal year starts June). If fewer than
    // 3 months of that FY have elapsed, show the PREVIOUS fiscal year — a
    // quarter chart with one elapsed month answers nothing.
    const [y, m] = win.endKey.split("-").map(Number);
    let fyStart = m >= 6 ? `${y}-06` : `${y - 1}-06`;
    const elapsed = (Number(win.endKey.slice(0, 4)) * 12 + Number(win.endKey.slice(5, 7))) -
      (Number(fyStart.slice(0, 4)) * 12 + Number(fyStart.slice(5, 7))) + 1;
    if (elapsed < 3) fyStart = shiftMonthKey(fyStart, -12);
    return fiscalQuarters(fyStart).map((q) => {
      const cur = aggregateRecurring(rows, basis, q.win, rec);
      const prior = aggregateRecurring(rows, basis, pyWin(q.win), rec);
      return {
        label: `${q.label} (${winLabel(q.win)})`,
        short: q.label,
        cur: cur?.recRevenue ?? 0,
        py: prior?.recRevenue ?? 0,
        future: q.win.startKey > lastComplete,
      };
    });
  }, [rows, rec, recLive, basis, win, lastComplete]);

  const ytd = useMemo(() => {
    if (!rows || !recLive) return null;
    const yr = lastComplete.slice(0, 4);
    const w: Win = { startKey: `${yr}-01`, endKey: lastComplete };
    const cur = aggregateRecurring(rows, basis, w, rec);
    const prior = aggregateRecurring(rows, basis, pyWin(w), rec);
    return cur && prior ? { w, cur: cur.recRevenue, py: prior.recRevenue, yoy: pctChange(cur.recRevenue, prior.recRevenue) } : null;
  }, [rows, rec, recLive, basis, lastComplete]);

  // ------------------------------------------------------- budget (P8)
  const budgetStory = useMemo(() => {
    if (!budgetRows) return null;
    const hist = aggregateBudgetWindow(budgetRows, AS_DELIVERED_WIN);
    if (!rows || !hist) return null;
    const actualHistValidated = aggregatePL(rows, "VALIDATED", AS_DELIVERED_WIN);
    const recHist = aggregateRecurring(rows, "VALIDATED", AS_DELIVERED_WIN, rec);
    // Budget recurring = revenue excl. the DRIFT line (COMP-IA*).
    let drift = 0;
    for (const r of budgetRows) {
      const k = monthKey(r.period_month);
      if (k < AS_DELIVERED_WIN.startKey || k > AS_DELIVERED_WIN.endKey) continue;
      if (r.section === "Revenue" && r.moa_code.startsWith("COMP-IA")) drift += r.budget_amount_sar;
    }
    // Forward: first forward month, H2-26 (Jul→Dec-26), FY27.
    const forwardMonths = [...budgetMonthsSetLocal(budgetRows)].filter((m) => m > lastComplete).sort();
    const firstFwd = forwardMonths[0];
    const fwdFirst = firstFwd ? aggregateBudgetWindow(budgetRows, { startKey: firstFwd, endKey: firstFwd }) : null;
    const fwdYear = firstFwd ? firstFwd.slice(0, 4) : null;
    const h2 = fwdYear ? aggregateBudgetWindow(budgetRows, { startKey: firstFwd!, endKey: `${fwdYear}-12` }) : null;
    const nextYear = fwdYear ? String(Number(fwdYear) + 1) : null;
    const fy27 = nextYear ? aggregateBudgetWindow(budgetRows, { startKey: `${nextYear}-01`, endKey: `${nextYear}-12` }) : null;
    return {
      hist, drift, histRecBudget: hist.revenue - drift,
      actualHistValidated, recHist,
      firstFwd, fwdFirst, h2, fy27, fwdYear, nextYear,
    };
  }, [budgetRows, rows, rec, lastComplete]);

  // --------------------------------------- budget vintages strip (P8/DB-6)
  const { data: allBudgetRows } = useBudgetAllVersions();
  const vintageStrip = useMemo(() => {
    if (!allBudgetRows || allBudgetRows.length === 0) return [];
    const byVersion = new Map<string, { revenue: number; minKey: string }>();
    for (const r of allBudgetRows) {
      if (r.section !== "Revenue") continue;
      const slot = byVersion.get(r.version_id) ?? { revenue: 0, minKey: "9999-99" };
      slot.revenue += r.budget_amount_sar;
      const k = monthKey(r.period_month);
      if (k < slot.minKey) slot.minKey = k;
      byVersion.set(r.version_id, slot);
    }
    const label = (id: string): string => {
      if (/-V1-/.test(id)) return "V1 original";
      if (/-V2-/.test(id)) return "V2 revised Dec-May";
      if (/APPROVED/.test(id)) return "Approved forward";
      return "Deck blend";
    };
    return [...byVersion.entries()]
      .map(([id, v]) => ({ id, label: label(id), revenue: v.revenue, minKey: v.minKey, isDefault: !/-V\d+-/.test(id) }))
      .sort((a, b) => (/-V1-/.test(a.id) ? 0 : /-V2-/.test(a.id) ? 1 : /APPROVED/.test(a.id) ? 3 : 2) - (/-V1-/.test(b.id) ? 0 : /-V2-/.test(b.id) ? 1 : /APPROVED/.test(b.id) ? 3 : 2));
  }, [allBudgetRows]);

  // ----------------------------------------------------- multi-year (P9)
  const multiYear = useMemo(() => {
    if (!rows) return [];
    const years = [...new Set(factMonths(rows).map((m) => m.slice(0, 4)))].sort();
    return years.map((y) => {
      const w: Win = { startKey: `${y}-01`, endKey: `${y}-12` };
      const agg = aggregatePL(rows, basis, w);
      const recAgg = recLive ? aggregateRecurring(rows, basis, w, rec) : null;
      const partial = `${y}-12` > lastComplete;
      return {
        year: partial ? `${y}*` : y,
        revenue: recAgg ? recAgg.recRevenue : agg.revenue,
        ebitda: agg.ebitda5,
        partial,
      };
    });
  }, [rows, basis, rec, recLive, lastComplete]);

  const hasDriftInPy = (recPy?.nonRecRevenue ?? 0) !== 0;

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <WindowPicker months={factMonths(rows)} />
        <BasisToggle />
        <span className="text-xs text-muted-foreground">
          Window: <strong className="text-foreground">{windowName}</strong> · PY = {pyLabelText} (same window −12 months)
        </span>
      </div>

      <CompletenessBanner rows={rows} />
      {isLoading && <p className="text-sm text-muted-foreground">Loading live warehouse rows…</p>}

      {/* ---------- headline row: P1 · P2 · P3 ---------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* P1 — Recurring revenue YoY (THE headline) */}
        <Card className="p-5 space-y-2.5 border-2 border-gold/40">
          <TileHeader
            title={`Recurring revenue — ${winLabelText}`}
            basis={basis}
            hint="Validated DRIFT perimeter from the recurrence dimension (dim_recurrence). PY = same window −12 months, same basis, same perimeter."
          />
          {!recLive || !recCur ? <PendingRecurrence /> : (
            <>
              <div className="flex items-end gap-3 flex-wrap">
                <p className="text-4xl font-heading tracking-tight tabular-nums">{fmtSAR(recCur.recRevenue)}</p>
                <YoYChip pct={recYoY} />
              </div>
              <p className="text-xs text-muted-foreground">
                PY ({pyLabelText}): <span className="tabular-nums">{fmtOrDash(recPy?.recRevenue)}</span>
              </p>
              {basis === "STRICT" && recYoY !== null && recYoYOther !== null && (() => {
                // DATA-CONDITIONED explainer (punch item 1): states the ACTUAL
                // live relationship between the two bases' YoY — direction and
                // magnitude computed from the fetched rows, never asserted.
                const sameDirection = (recYoY >= 0) === (recYoYOther >= 0);
                const relation = Math.abs(recYoY - recYoYOther) < 0.05
                  ? "in line with"
                  : recYoY < recYoYOther ? "lower than" : "higher than";
                const cnRatio = cnPy > 0.5 ? cnCur / cnPy : null;
                const cnPhrase = cnRatio === null
                  ? (cnCur > 0.5 ? "appeared this window (none in PY)" : "are immaterial in both periods")
                  : cnRatio >= 2 ? "more than doubled YoY"
                  : cnRatio > 1.005 ? `rose ${fmtDeltaPct(pctChange(cnCur, cnPy) ?? 0)} YoY`
                  : cnRatio >= 0.995 ? "were flat YoY"
                  : `declined ${fmtDeltaPct(pctChange(cnCur, cnPy) ?? 0)} YoY`;
                return (
                  <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
                    {sameDirection ? (
                      <>Strict basis: <strong className="tabular-nums">{fmtDeltaPct(recYoY)}</strong> — same direction
                      as the Validated basis, {relation} its <span className="tabular-nums">{fmtDeltaPct(recYoYOther)}</span>{" "}
                      because customer credit notes {cnPhrase} ({fmtSAR(cnCur)} vs {fmtSAR(cnPy)} net of VAT) —
                      see the credit-note tile.</>
                    ) : (
                      <>Direction differs from the Validated basis (<span className="tabular-nums">{fmtDeltaPct(recYoY)}</span> Strict
                      vs <span className="tabular-nums">{fmtDeltaPct(recYoYOther)}</span> Validated) because customer credit
                      notes {cnPhrase} ({fmtSAR(cnCur)} vs {fmtSAR(cnPy)} net of VAT) — see the credit-note tile.</>
                    )}
                  </div>
                );
              })()}
              {basis === "VALIDATED" && recYoY !== null && (
                <p className="text-xs text-muted-foreground">
                  {recYoY > 0
                    ? "The package headline: recurring club growth on the validated basis — the growth story the founder delivered."
                    : "Recurring revenue is not above PY on this window — the delivered growth headline applies to the As-delivered TTM window."}
                </p>
              )}
              <div className="pt-0.5">
                <FrozenRefChip label="As delivered · 12-Jun extraction">
                  {DELIVERED_P1_PY_TEXT} <span className="text-muted-foreground/70">({winLabel(AS_DELIVERED_WIN)} window)</span>
                </FrozenRefChip>
              </div>
              <DataStateFootnote />
            </>
          )}
        </Card>

        {/* P2 — Total revenue YoY */}
        <Card className="p-5 space-y-2.5">
          <TileHeader title={`Total revenue — ${winLabelText}`} basis={basis} />
          <div className="flex items-end gap-3 flex-wrap">
            <p className="text-4xl font-heading tracking-tight tabular-nums">{fmtSAR(totCur.revenue)}</p>
            <YoYChip pct={totYoY} />
          </div>
          <p className="text-xs text-muted-foreground">
            PY ({pyLabelText}): <span className="tabular-nums">{fmtSAR(totPy.revenue)}</span>
          </p>
          {/* DATA-CONDITIONED narrative (punch item 4): the DRIFT roll-off
              reading renders only when the window actually shows it — total
              below PY while the recurring perimeter grows. */}
          {totYoY !== null && (
            <p className="text-xs text-muted-foreground">
              {totYoY < 0 && recYoY !== null && recYoY > 0
                ? "Total revenue below PY (non-recurring DRIFT roll-off), as in the delivered analysis — the recurring club is the growth story."
                : totYoY < 0
                  ? "Total revenue below PY on this window."
                  : "Total revenue above PY on this window."}
            </p>
          )}
        </Card>

        {/* P3 — Recurring EBITDA */}
        <Card className="p-5 space-y-2.5">
          <TileHeader
            title={`Recurring EBITDA — ${winLabelText}`}
            basis={basis}
            hint="As-booked recurring EBITDA (recurring revenue + recurring direct costs + recurring OpEx). The model-adjusted 'clean' ladder renders only when the model-adjustment memo layer is loaded (founder decision gate)."
          />
          {!recLive || !recCur ? <PendingRecurrence /> : (
            <>
              <div className="flex items-end gap-3 flex-wrap">
                <p className={`text-4xl font-heading tracking-tight tabular-nums ${recCur.recEbitda >= 0 ? "text-success" : "text-destructive"}`}>
                  {fmtSAR(recCur.recEbitda)}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                PY ({pyLabelText}): <span className="tabular-nums">{fmtOrDash(recPy?.recEbitda)}</span>
                {recPy && recCur.recEbitda >= 0 && recPy.recEbitda < 0 && (
                  <span className="ml-1.5 text-success font-semibold">
                    sign flipped to positive · {fmtDeltaSAR(recCur.recEbitda - recPy.recEbitda)} swing
                  </span>
                )}
              </p>
              {/* Founder gate (punch item 3): the memo ladder is OPT-IN —
                  default OFF on load, persisted; never rendered unrequested
                  in client viewing. */}
              {ladder.length > 0 ? (
                <div className="text-xs text-muted-foreground space-y-1 border-t border-border/40 pt-2">
                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={memoOn}
                      onChange={(e) => setMemoOn(e.target.checked)}
                      className="accent-[hsl(var(--gold))]"
                    />
                    <span className="font-semibold text-foreground/80">
                      Model-adjustment ladder <span className="text-amber-400">[model adj — not in books]</span>
                    </span>
                  </label>
                  {!memoOn && (
                    <p className="text-[10px] text-muted-foreground/70">
                      Off by default for client viewing (founder gate) — tick to reconcile to the
                      package's clean recurring EBITDA.
                    </p>
                  )}
                  {memoOn && (() => {
                    let running = recCur.recEbitda;
                    const stepsOut = [
                      <p key="start" className="tabular-nums">As booked: {fmtSAR(recCur.recEbitda)}</p>,
                    ];
                    for (const s of ladder) {
                      running += s.amount;
                      stepsOut.push(
                        <p key={s.code} className="tabular-nums">{s.label}: {fmtDeltaSAR(s.amount)}</p>,
                      );
                    }
                    const isPresetWin = win.startKey === AS_DELIVERED_WIN.startKey && win.endKey === AS_DELIVERED_WIN.endKey;
                    stepsOut.push(<p key="end" className="tabular-nums font-semibold text-foreground">Clean (model-adjusted): {fmtSAR(running)}</p>);
                    stepsOut.push(
                      <div key="ref" className="pt-1">
                        <FrozenRefChip label="As delivered · 16-Jul freeze">
                          Recurring EBITDA (clean) +{fmtSAR(DELIVERED_P3_CLEAN_SAR)}
                          {isPresetWin && (
                            <> · live re-computation {fmtSAR(running)} — post-freeze bookings {fmtDeltaSAR(running - DELIVERED_P3_CLEAN_SAR)}</>
                          )}
                        </FrozenRefChip>
                      </div>,
                    );
                    stepsOut.push(
                      <p key="fn" className="text-[10px] text-muted-foreground/70 pt-1">
                        Computed live — the warehouse has moved since the package's 12-Jun/16-Jul freeze
                        (remediated postings); the delivered clean figure is not restated here.
                      </p>,
                    );
                    return stepsOut;
                  })()}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground/70">
                  Model-adjustment memo layer not loaded — ladder to the package's clean figure renders
                  once the founder-gated adjustment layer lands (default off for client viewing).
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      {/* ---------- anti-confusion row: P6 bridge + P5 CN ---------- */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* P6 — basis & window bridge */}
        <Card className="p-5 xl:col-span-2 space-y-2">
          <TileHeader
            title="Basis & window bridge — revenue"
            hint="From the delivered package figure (Validated basis, As-delivered window) to the certified Strict figure for the selected window. Terms computed live from the fact rows — nothing typed in."
          />
          {bridge && (
            <>
              <Waterfall
                steps={[
                  { label: `Package (Validated, ${winLabel(AS_DELIVERED_WIN)})`, short: "Package", value: bridge.presetValidated.revenue, kind: "anchor" },
                  { label: "Window roll", short: "Window", value: bridge.winValidated.revenue - bridge.presetValidated.revenue, kind: "delta" },
                  { label: `Validated (${winLabelText})`, short: "Validated", value: bridge.winValidated.revenue, kind: "anchor" },
                  { label: "Credit notes", short: "CN", value: bridge.winStrict.revenue - bridge.winValidated.revenue, kind: "delta" },
                  { label: `Strict (${winLabelText})`, short: "Strict", value: bridge.winStrict.revenue, kind: "anchor" },
                ]}
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                Revenue: {fmtSAR(bridge.presetValidated.revenue)} (package, Validated, {winLabel(AS_DELIVERED_WIN)})
                {" → "}window {fmtDeltaSAR(bridge.winValidated.revenue - bridge.presetValidated.revenue)}
                {" → "}{fmtSAR(bridge.winValidated.revenue)} (Validated, {winLabelText})
                {" → "}credit notes {fmtDeltaSAR(bridge.winStrict.revenue - bridge.winValidated.revenue)}
                {" → "}<strong className="text-foreground">{fmtSAR(bridge.winStrict.revenue)} (Strict)</strong>
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                EBITDA (5-section) bridge: {fmtSAR(bridge.presetValidated.ebitda5)} (Validated, {winLabel(AS_DELIVERED_WIN)})
                {" → "}window {fmtDeltaSAR(bridge.winValidated.ebitda5 - bridge.presetValidated.ebitda5)}
                {" → "}{fmtSAR(bridge.winValidated.ebitda5)} (Validated, {winLabelText})
                {" → "}credit notes {fmtDeltaSAR(bridge.winStrict.ebitda5 - bridge.winValidated.ebitda5)}
                {" → "}<strong className="text-foreground">{fmtSAR(bridge.winStrict.ebitda5)} (Strict)</strong>
              </p>
            </>
          )}
        </Card>

        {/* P5 — credit-note anomaly (always visible, both bases) */}
        <Card className="p-5 space-y-2.5 border border-amber-500/30">
          <TileHeader
            title={`Credit-note anomaly — ${winLabelText}`}
            hint="Customer credit notes net of VAT; ratio denominator = collections allocated to invoices (v_collections_monthly, register P5 definition). Real business signal already flagged to the client — this is what explains the basis toggle. Drill: v_credit_note_audit (authenticated)."
          />
          <div className="flex items-end gap-3 flex-wrap">
            <p className="text-3xl font-heading tracking-tight tabular-nums text-amber-400">{fmtSAR(cnCur)}</p>
            <YoYChip pct={pctChange(cnCur, cnPy)} positiveIsGood={false} />
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            PY ({pyLabelText}): {fmtSAR(cnPy)}
            {pctChange(cnCur, cnPy) !== null && <> · net {fmtDeltaPct(pctChange(cnCur, cnPy)!)} YoY</>}
          </p>
          {/* Spec P5: CN ÷ collections, BOTH periods, computed live (item 5). */}
          {collCur !== null && collCur > 0 && collPy !== null && collPy > 0 ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              CN ÷ collections: <strong className="text-amber-400">{fmtPct((cnCur / collCur) * 100)}</strong> ({winLabelText})
              {" "}vs <strong className="text-foreground">{fmtPct((cnPy / collPy) * 100)}</strong> (PY {pyLabelText})
              {" "}· collections {fmtSAR(collCur)} vs {fmtSAR(collPy)}
            </p>
          ) : (
            <p className="text-[11px] text-muted-foreground/70">
              CN/collections ratio pending — v_collections_monthly not reachable for this window.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Validated basis shows revenue BEFORE these credit notes (as the package did); Strict basis
            nets them off. The anomaly is open with the client.
          </p>
          <button
            type="button"
            onClick={() => setCnDrillOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            <FileSearch className="h-3.5 w-3.5" /> Open credit-note audit drill
          </button>
        </Card>
      </div>

      {/* ---------- composition: P4 per-BU + P7 quarters ---------- */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* P4 — per-BU growth */}
        <Card className="p-5 space-y-3">
          <TileHeader
            title={`Recurring revenue by business unit — ${winLabelText} vs PY`}
            basis={basis}
            hint="Recurring perimeter per the model's own recurrence tags (dim_recurrence) — Competitions follows the tagged recurring total, resolving the deck's dual convention to one number."
          />
          {!buTable ? <PendingRecurrence /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-semibold">Business unit</th>
                    <th className="text-right py-2 px-3 font-semibold">{winLabelText}</th>
                    <th className="text-right py-2 px-3 font-semibold">PY ({pyLabelText})</th>
                    <th className="text-right py-2 pl-3 font-semibold">Δ %</th>
                  </tr>
                </thead>
                <tbody>
                  {buTable.map((r) => (
                    <tr key={r.bu} className="border-b border-border/10">
                      <td className="py-1.5 pr-3">{r.label}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{fmtSAR(r.cur)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{fmtSAR(r.py)}</td>
                      <td className={`py-1.5 pl-3 text-right tabular-nums font-semibold ${r.yoy === null ? "text-muted-foreground" : r.yoy >= 0 ? "text-success" : "text-destructive"}`}>
                        {r.yoy === null ? "n/a" : fmtDeltaPct(r.yoy)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-t-border font-semibold">
                    <td className="py-2 pr-3">Total recurring</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmtOrDash(recCur?.recRevenue)}</td>
                    <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{fmtOrDash(recPy?.recRevenue)}</td>
                    <td className={`py-2 pl-3 text-right tabular-nums ${recYoY !== null && recYoY >= 0 ? "text-success" : "text-destructive"}`}>
                      {recYoY === null ? "n/a" : fmtDeltaPct(recYoY)}
                    </td>
                  </tr>
                </tbody>
              </table>
              {hasDriftInPy && (
                <p className="text-[11px] text-muted-foreground/80 mt-2">
                  PY window contains DRIFT/non-recurring revenue — excluded here by the recurrence tags.
                </p>
              )}
              <DataStateFootnote />
            </div>
          )}
        </Card>

        {/* P7 — fiscal quarters + YTD momentum */}
        <Card className="p-5 space-y-3">
          <TileHeader
            title="Recurring revenue — fiscal quarters vs PY"
            basis={basis}
            hint="Fiscal year starts June: Q1=Jun-Aug · Q2=Sep-Nov · Q3=Dec-Feb · Q4=Mar-May (package convention)."
          />
          {!quarters ? <PendingRecurrence /> : (
            <>
              <ResponsiveContainer width="100%" height={210}>
                <ComposedChart data={quarters} margin={{ top: 14, right: 8, bottom: 0, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                  <XAxis dataKey="short" stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} />
                  <YAxis tickFormatter={fmtCompact} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={50} />
                  <RTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      const cur = payload.find((p) => p.dataKey === "cur")?.value as number | undefined;
                      const prior = payload.find((p) => p.dataKey === "py")?.value as number | undefined;
                      return (
                        <div className="chart-tooltip">
                          <p className="chart-tooltip-title">{label}</p>
                          <p className="chart-tooltip-content chart-tooltip-actual">Actual: {cur !== undefined ? fmtSAR(cur) : "—"}</p>
                          <p className="chart-tooltip-content chart-tooltip-budget">PY: {prior !== undefined ? fmtSAR(prior) : "—"}</p>
                        </div>
                      );
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="cur" name="Actual" fill="hsl(var(--gold) / 0.85)" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={34} />
                  <Bar dataKey="py" name="PY (same quarter −12m)" fill="hsl(36 18% 70% / 0.45)" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={34} />
                </ComposedChart>
              </ResponsiveContainer>
              {quarters.some((q) => q.future) && (
                <p className="text-[11px] text-muted-foreground/80">Quarters extending beyond the last closed month are partial.</p>
              )}
              {ytd && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  Calendar YTD ({winLabel(ytd.w)}): <strong className="text-foreground">{fmtSAR(ytd.cur)}</strong> vs {fmtSAR(ytd.py)} PY
                  {ytd.yoy !== null && <span className={`ml-1.5 font-semibold ${ytd.yoy >= 0 ? "text-success" : "text-destructive"}`}>{fmtDeltaPct(ytd.yoy)}</span>}
                </p>
              )}
            </>
          )}
        </Card>
      </div>

      {/* ---------- P8 budget story ---------- */}
      <Card className="p-5 space-y-3">
        <TileHeader
          title="Budget story — history and forward plan"
          hint="Historical vintage BUD-HIST-2025-26 (ties the delivered deck to the cent) and the approved forward budget BUD-2026-07-16-APPROVED, both from budget_2026."
        />
        {budgetStory ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Backward — {winLabel(AS_DELIVERED_WIN)} <BasisBadge basis="VALIDATED" className="ml-1" /></p>
              <p className="text-sm tabular-nums">Recurring: {fmtOrDash(budgetStory.recHist?.recRevenue)} vs bud {fmtSAR(budgetStory.histRecBudget)}
                {budgetStory.recHist && <span className={`ml-1 font-semibold ${budgetStory.recHist.recRevenue >= budgetStory.histRecBudget ? "text-success" : "text-destructive"}`}>{fmtDeltaPct(pctChange(budgetStory.recHist.recRevenue, budgetStory.histRecBudget) ?? 0)}</span>}
              </p>
              <p className="text-sm tabular-nums">Total: {fmtSAR(budgetStory.actualHistValidated.revenue)} vs bud {fmtSAR(budgetStory.hist.revenue)}
                <span className={`ml-1 font-semibold ${budgetStory.actualHistValidated.revenue >= budgetStory.hist.revenue ? "text-success" : "text-destructive"}`}>{fmtDeltaPct(pctChange(budgetStory.actualHistValidated.revenue, budgetStory.hist.revenue) ?? 0)}</span>
              </p>
              <p className="text-sm tabular-nums">EBITDA: {fmtSAR(budgetStory.actualHistValidated.ebitdaReported)} vs bud {fmtSAR(budgetStory.hist.ebitdaAll)}</p>
              {/* DATA-CONDITIONED (item 4): the DRIFT-slip attribution renders
                  only when the DRIFT gap actually carries the total miss. */}
              {(() => {
                const totalGap = budgetStory.actualHistValidated.revenue - budgetStory.hist.revenue;
                const driftGap = (budgetStory.recHist?.nonRecRevenue ?? 0) - budgetStory.drift;
                const recGapPct = budgetStory.recHist ? pctChange(budgetStory.recHist.recRevenue, budgetStory.histRecBudget) : null;
                if (totalGap < 0 && driftGap < 0 && Math.abs(driftGap) >= 0.5 * Math.abs(totalGap)) {
                  return (
                    <p className="text-[11px] text-muted-foreground/80 tabular-nums">
                      DRIFT slip drives the total-revenue miss ({fmtSAR(driftGap)} of the {fmtSAR(totalGap)} gap);
                      recurring core {recGapPct !== null ? (Math.abs(recGapPct) <= 10 ? `near plan (${fmtDeltaPct(recGapPct)})` : `${fmtDeltaPct(recGapPct)} vs plan`) : "—"}.
                    </p>
                  );
                }
                return recGapPct !== null ? (
                  <p className="text-[11px] text-muted-foreground/80 tabular-nums">Recurring core {fmtDeltaPct(recGapPct)} vs plan.</p>
                ) : null;
              })()}
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                Next budget month {budgetStory.firstFwd ? `(${monthKeyLabel(budgetStory.firstFwd)})` : ""}
              </p>
              <p className="text-sm tabular-nums">Revenue: {fmtOrDash(budgetStory.fwdFirst?.revenue)}</p>
              <p className="text-sm tabular-nums">EBITDA: {fmtOrDash(budgetStory.fwdFirst?.ebitdaAll)}</p>
              <p className="text-[11px] text-muted-foreground/80">Approved 2026-07-16 · BUD-2026-07-16-APPROVED</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                H2-{budgetStory.fwdYear?.slice(2)} plan {budgetStory.firstFwd ? `(${monthKeyLabel(budgetStory.firstFwd)}→Dec)` : ""}
              </p>
              <p className="text-sm tabular-nums">Revenue: {fmtOrDash(budgetStory.h2?.revenue)}</p>
              <p className="text-sm tabular-nums">EBITDA: {fmtOrDash(budgetStory.h2?.ebitdaAll)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">FY{budgetStory.nextYear?.slice(2)} plan</p>
              <p className="text-sm tabular-nums">Revenue: {fmtOrDash(budgetStory.fy27?.revenue)}</p>
              <p className="text-sm tabular-nums">EBITDA: {fmtOrDash(budgetStory.fy27?.ebitdaAll)}</p>
              {/* Conditioned (item 4): only claim the turn when planned EBITDA IS positive. */}
              {budgetStory.fy27 && budgetStory.fy27.ebitdaAll > 0 && (
                <p className="text-[11px] text-muted-foreground/80">Self-financing plan — planned EBITDA turns structurally positive.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading budget series…</p>
        )}
        {vintageStrip.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget history:</span>
            {vintageStrip.map((v, i) => (
              <span key={v.id} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`rounded border px-2 py-0.5 tabular-nums ${v.isDefault ? "border-gold/40 bg-gold/10 text-gold" : "border-border bg-muted/30"}`}>
                  {v.label}: {fmtSAR(v.revenue)}
                </span>
                {i < vintageStrip.length - 1 && <span className="text-muted-foreground/50">→</span>}
              </span>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground/80">
          {/* Coverage gap DERIVED from the loaded budget months (item 4) —
              no hardcoded month list. */}
          {(() => {
            if (!budgetRows || budgetRows.length === 0) return null;
            const covered = [...budgetMonthsSetLocal(budgetRows)].sort();
            const missing: string[] = [];
            let k = covered[0];
            while (k <= covered[covered.length - 1]) {
              if (!covered.includes(k)) missing.push(k);
              k = shiftMonthKey(k, 1);
            }
            if (missing.length === 0) return null;
            return (
              <>No budget exists for {missing.map(monthKeyLabel).join(", ")} — by design: the historical
              vintage ends {monthKeyLabel(shiftMonthKey(missing[0], -1))}, the approved forward budget
              starts {monthKeyLabel(shiftMonthKey(missing[missing.length - 1], 1))}.{" "}</>
            );
          })()}
          Budget is net of VAT with no credit-note concept. Pre-blend vintages (V1 original, V2 revised)
          are storytelling only — never the default comparison.
        </p>
      </Card>

      {/* ---------- P9 multi-year ---------- */}
      <Card className="p-5 space-y-3">
        <TileHeader
          title={`Multi-year clean series — ${recLive ? "recurring revenue" : "revenue"} & 5-section EBITDA by calendar year`}
          basis={basis}
          hint="Yearly series computed live from the fact rows on the active basis. * = partial year (through the last closed month)."
        />
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={multiYear} margin={{ top: 14, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
            <XAxis dataKey="year" stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} tickLine={false} />
            <YAxis tickFormatter={fmtCompact} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={54} />
            <RTooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                const rev = payload.find((p) => p.dataKey === "revenue")?.value as number | undefined;
                const eb = payload.find((p) => p.dataKey === "ebitda")?.value as number | undefined;
                return (
                  <div className="chart-tooltip">
                    <p className="chart-tooltip-title">{label}</p>
                    <p className="chart-tooltip-content chart-tooltip-actual">{recLive ? "Recurring revenue" : "Revenue"}: {rev !== undefined ? fmtSAR(rev) : "—"}</p>
                    <p className="chart-tooltip-content chart-tooltip-budget">EBITDA (5-section): {eb !== undefined ? fmtSAR(eb) : "—"}</p>
                  </div>
                );
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
            <Bar dataKey="revenue" name={recLive ? "Recurring revenue" : "Revenue"} fill="hsl(var(--gold) / 0.85)" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={48} />
            <Line dataKey="ebitda" name="EBITDA (5-section)" stroke="hsl(195 75% 55%)" strokeWidth={2.5} dot={{ r: 3.5, fill: "hsl(195 75% 55%)", strokeWidth: 0 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* ---------- CN audit drill ---------- */}
      <Sheet open={cnDrillOpen} onOpenChange={setCnDrillOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-heading tracking-wide">CREDIT-NOTE AUDIT</SheetTitle>
            <SheetDescription>
              v_credit_note_audit — duplication/anomaly findings on customer credit notes (net of VAT).
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {cnAudit.isLoading && <p className="text-sm text-muted-foreground">Loading audit rows…</p>}
            {cnAudit.data && cnAudit.data.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left py-2 pr-2 font-semibold">Date</th>
                    <th className="text-left py-2 pr-2 font-semibold">Ref</th>
                    <th className="text-left py-2 pr-2 font-semibold">Finding</th>
                    <th className="text-right py-2 pl-2 font-semibold">Net of VAT</th>
                  </tr>
                </thead>
                <tbody>
                  {cnAudit.data.map((r, i) => (
                    <tr key={`${r.qoyod_credit_note_id}-${i}`} className="border-b border-border/10">
                      <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">{r.issue_date}</td>
                      <td className="py-1.5 pr-2">{r.reference ?? r.qoyod_credit_note_id}</td>
                      <td className="py-1.5 pr-2">
                        <span className="inline-flex rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-px text-[10px] text-amber-300">{r.finding}</span>
                      </td>
                      <td className="py-1.5 pl-2 text-right tabular-nums">{fmtSAR(r.net_of_vat)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {cnAudit.data && cnAudit.data.length === 0 && !cnAudit.isLoading && (
              <p className="text-sm text-muted-foreground">No audit rows.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

// local helper (kept here to avoid re-export churn)
const budgetMonthsSetLocal = (budgetRows: { period_month: string; section: string }[]): Set<string> => {
  const s = new Set<string>();
  for (const r of budgetRows) if (r.section !== "CASHFLOW") s.add(r.period_month.slice(0, 7));
  return s;
};
