// R1 — the ECONOMIC ANALYSIS tool (the Analysis page IS the full tool;
// the CEO Overview home stays a summary — ratified by Marcello 2026-07-20).
//
// Everything is time-parametric: period options and comparison windows are
// derived from the real clock + the periods actually present in the live
// data, so the tool rolls forward automatically as the daily Qoyod sync
// lands new months. Nothing is hardcoded to a period.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsListPill, TabsTriggerPill } from "@/components/ui/tabs";
import { KPICard } from "@/components/dashboard/KPICard";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { DataFreshnessNote } from "@/components/dashboard/DataFreshnessNote";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { type KPIMetric } from "@/types/dashboard";
import {
  usePnlLeafRows,
  useBudgetMonthly,
  monthKey,
  monthKeyLabel,
  shiftMonthKey,
  previousPeriodRange,
  previousYearRange,
  budgetCoversRange,
  BUDGET_START_KEY,
  LIVE_BU_LABELS,
  LIVE_CURRENT_MONTH,
  UNALLOCATED_BU,
  rangeHasIncompleteMonths,
} from "@/data/liveData";
import {
  buildAnalysisLines,
  COMPARISON_LABELS,
  type AnalysisLine,
  type ComparisonKind,
  type PLViewMode,
} from "@/data/analysisModel";
import { ComparisonToggle } from "@/components/analysis/ComparisonToggle";
import { PnLAnalysisTable } from "@/components/analysis/PnLAnalysisTable";
import { AnalysisWaterfall } from "@/components/analysis/AnalysisWaterfall";
import { AnalysisDrilldownDrawer } from "@/components/analysis/AnalysisDrilldownDrawer";

// ------------------------------------------------------- persisted UI state

const VIEW_KEY = "clever.analysis.view";
const COMPS_KEY = "clever.analysis.comps";

const loadView = (): PLViewMode => {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "management" ? "management" : "reported";
  } catch { return "reported"; }
};

const loadComps = (): ComparisonKind[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(COMPS_KEY) ?? "null");
    if (Array.isArray(raw)) {
      const valid = raw.filter((c): c is ComparisonKind => c === "BUD" || c === "PY" || c === "PP");
      return valid.slice(0, 2);
    }
  } catch { /* fall through */ }
  return ["BUD", "PY"]; // default: sold vs SHOULD have sold + trajectory
};

// ------------------------------------------------------------------ periods

interface PeriodRange { startKey: string; endKey: string; label: string }

const quarterOf = (key: string): { q: number; y: number; startKey: string } => {
  const [y, m] = key.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  return { q, y, startKey: `${y}-${String((q - 1) * 3 + 1).padStart(2, "0")}` };
};

const rangeLabel = (startKey: string, endKey: string): string =>
  startKey === endKey
    ? monthKeyLabel(startKey)
    : `${monthKeyLabel(startKey)}–${monthKeyLabel(endKey)}`;

/** Resolve the selected period value into an inclusive month-key range.
 * Anchored on the REAL current month — never on a hardcoded date. */
const resolvePeriod = (sel: string): PeriodRange => {
  const cur = LIVE_CURRENT_MONTH;
  const [curYear] = cur.split("-").map(Number);
  if (sel === "MTD") return { startKey: cur, endKey: cur, label: `${monthKeyLabel(cur)} (MTD)` };
  if (sel === "QTD") {
    const { q, y, startKey } = quarterOf(cur);
    return { startKey, endKey: cur, label: `Q${q} ${y} (QTD)` };
  }
  if (sel === "YTD") return { startKey: `${curYear}-01`, endKey: cur, label: `YTD ${curYear}` };
  if (sel === "LTM") {
    const startKey = shiftMonthKey(cur, -11);
    return { startKey, endKey: cur, label: `LTM ${rangeLabel(startKey, cur)}` };
  }
  if (sel.startsWith("Q:")) {
    const startKey = sel.slice(2);
    const { q, y } = quarterOf(startKey);
    return { startKey, endKey: shiftMonthKey(startKey, 2), label: `Q${q} ${y}` };
  }
  const m = sel.startsWith("M:") ? sel.slice(2) : sel;
  return { startKey: m, endKey: m, label: monthKeyLabel(m) };
};

// ---------------------------------------------------------------- component

export const EconomicAnalysis = () => {
  const { data: leafRows, isLoading, isError } = usePnlLeafRows();
  const { data: budgetRows } = useBudgetMonthly();

  const [periodSel, setPeriodSel] = useState("MTD");
  const [selectedBU, setSelectedBU] = useState("ALL");
  const [view, setViewState] = useState<PLViewMode>(loadView);
  const [comps, setCompsState] = useState<ComparisonKind[]>(loadComps);
  const [drillKey, setDrillKey] = useState<string | null>(null);

  const setView = (v: PLViewMode) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* non-blocking */ }
  };
  const setComps = (c: ComparisonKind[]) => {
    setCompsState(c);
    try { localStorage.setItem(COMPS_KEY, JSON.stringify(c)); } catch { /* non-blocking */ }
  };

  // BU options discovered from the live rows (ADR-003 taxonomy order)
  const buOptions = useMemo(() => {
    const present = new Set<string>();
    for (const r of leafRows ?? []) present.add(r.bu ?? UNALLOCATED_BU);
    const order = Object.keys(LIVE_BU_LABELS);
    const codes = order.filter((b) => present.has(b))
      .concat([...present].filter((b) => !order.includes(b)).sort());
    return [
      { value: "ALL", label: "All Company" },
      ...codes.map((b) => ({ value: b, label: `${LIVE_BU_LABELS[b] ?? b} (${b})` })),
    ];
  }, [leafRows]);

  // Period options: aggregates + last 4 closed quarters + live months (max 14)
  const periodOptions = useMemo(() => {
    const livePeriods = [...new Set((leafRows ?? []).map((r) => monthKey(r.period_month)))].sort();
    const last = livePeriods.length > 0 ? livePeriods[livePeriods.length - 1] : LIVE_CURRENT_MONTH;
    const opts: { value: string; label: string }[] = [
      { value: "MTD", label: "MTD (Month to Date)" },
      { value: "QTD", label: "QTD (Quarter to Date)" },
      { value: "YTD", label: "YTD (Year to Date)" },
      { value: "LTM", label: "LTM (12m Rolling)" },
    ];
    const curQ = quarterOf(LIVE_CURRENT_MONTH);
    for (let i = 1; i <= 4; i++) {
      const startKey = shiftMonthKey(curQ.startKey, -3 * i);
      const { q, y } = quarterOf(startKey);
      opts.push({ value: `Q:${startKey}`, label: `Q${q} ${y}` });
    }
    const monthKeys: string[] = [];
    for (let i = 0; i < 14; i++) monthKeys.push(shiftMonthKey(last, -i));
    for (const k of monthKeys.filter((k) => livePeriods.length === 0 || livePeriods.includes(k))) {
      opts.push({ value: `M:${k}`, label: monthKeyLabel(k) });
    }
    return opts;
  }, [leafRows]);

  const range = resolvePeriod(periodSel);
  const pyRange = previousYearRange(range.startKey, range.endKey);
  const ppRange = previousPeriodRange(range.startKey, range.endKey);
  const buCode = selectedBU === "ALL" ? undefined : selectedBU;
  const scope = selectedBU === "ALL"
    ? "Consolidated"
    : `${LIVE_BU_LABELS[selectedBU] ?? selectedBU} (${selectedBU})`;

  const lines: AnalysisLine[] = useMemo(
    () =>
      buildAnalysisLines({
        leafRows, budgetRows,
        startKey: range.startKey, endKey: range.endKey,
        bu: buCode, comps, view, pyRange, ppRange,
      }),
    [leafRows, budgetRows, range.startKey, range.endKey, buCode, comps, view, pyRange.startKey, ppRange.startKey],
  );

  const compRangeLabels: Partial<Record<ComparisonKind, string>> = {
    PY: rangeLabel(pyRange.startKey, pyRange.endKey),
    PP: rangeLabel(ppRange.startKey, ppRange.endKey),
  };

  // ------------------------------------------------------------- KPI strip

  const primary: ComparisonKind | undefined = comps[0];
  const lineByKey = useMemo(() => new Map(lines.map((l) => [l.key, l])), [lines]);
  const opexKeys = view === "management" ? ["opexPeople", "opexMs", "opexGaU"] : ["opexPeople", "opexMs", "opexGa"];

  const kpiMetrics: KPIMetric[] = useMemo(() => {
    const pick = (key: string): { actual: number; comp: number | null } => {
      const l = lineByKey.get(key);
      const c = primary ? l?.comps[primary] : null;
      return { actual: l?.actual ?? 0, comp: c === undefined ? null : c };
    };
    const opexActual = opexKeys.reduce((a, k) => a + Math.abs(lineByKey.get(k)?.actual ?? 0), 0);
    const opexComp = primary
      ? opexKeys.reduce<number | null>((a, k) => {
          const v = lineByKey.get(k)?.comps[primary];
          return a === null || v === null || v === undefined ? null : a + Math.abs(v);
        }, 0)
      : null;
    const mk = (label: string, actual: number, comp: number | null): KPIMetric => ({
      label,
      actual,
      budget: comp ?? 0,
      variance: actual - (comp ?? 0),
      variancePercent: comp ? ((actual - comp) / Math.abs(comp)) * 100 : 0,
      format: "currency" as const,
      isOppositeSigns: comp !== null && ((actual >= 0 && comp < 0) || (actual < 0 && comp >= 0)),
    });
    const rev = pick("revenue");
    const gm = pick("gm");
    const ebitdaKey = view === "management" ? "ebitdaU" : "ebitda";
    const ebitda = pick(ebitdaKey);
    return [
      mk("Revenue", rev.actual, rev.comp),
      mk("Gross Margin", gm.actual, gm.comp),
      mk("OpEx", opexActual, opexComp),
      // G3 headline: the true recurring EBITDA, pre Leveredge/F&F project fees
      mk(view === "management" ? "EBITDA Underlying" : "Recurring EBITDA", ebitda.actual, ebitda.comp),
    ];
  }, [lineByKey, primary, view]);

  // -------------------------------------------------------------- drilling

  const drillLine: AnalysisLine | null = useMemo(() => {
    if (!drillKey) return null;
    if (drillKey === "opex") {
      // Synthetic OpEx bar from the waterfall: merge the OpEx lines' clusters
      // (+ the Unmapped slice when present, so the drawer total matches the bar)
      const parts = [...opexKeys, "unmapped"]
        .map((k) => lineByKey.get(k))
        .filter(Boolean) as AnalysisLine[];
      const sumComp = (c: ComparisonKind): number | null => {
        let acc = 0;
        for (const p of parts) {
          const v = p.comps[c];
          if (v === null || v === undefined) {
            if (p.key === "unmapped") continue; // never budgeted — count as 0
            return null;
          }
          acc += v;
        }
        return acc;
      };
      return {
        key: "opex",
        label: view === "management" ? "OpEx (underlying)" : "OpEx",
        actual: parts.reduce((a, p) => a + p.actual, 0),
        comps: Object.fromEntries(comps.map((c) => [c, sumComp(c)])),
        clusters: parts.flatMap((p) => p.clusters ?? [])
          .sort((a, b) => Math.abs(b.actual) - Math.abs(a.actual)),
      };
    }
    return lineByKey.get(drillKey) ?? null;
  }, [drillKey, lineByKey, comps, view]);

  // ------------------------------------------------------------------ view

  const budgetInWindow = budgetCoversRange(range.startKey, range.endKey);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Data freshness — June 2026 close complete; July partial */}
      <DataFreshnessNote showIncompleteWarning={rangeHasIncompleteMonths(range.startKey, range.endKey)} />

      {/* Header + filters */}
      <div className="flex flex-wrap items-center gap-4">
        <Select value={periodSel} onValueChange={setPeriodSel}>
          <SelectTrigger className="w-56 bg-background font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[320px]">
            {periodOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedBU} onValueChange={setSelectedBU}>
          <SelectTrigger className="w-56 bg-background font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {buOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ComparisonToggle active={comps} onChange={setComps} />
        <Tabs value={view} onValueChange={(v) => setView(v as PLViewMode)}>
          <TabsListPill className="shadow-sm">
            <TabsTriggerPill value="reported">IFRS — Reported</TabsTriggerPill>
            <TabsTriggerPill value="management">Management — Adjusted</TabsTriggerPill>
          </TabsListPill>
        </Tabs>
      </div>

      {/* Comparison-window transparency */}
      <p className="text-xs text-muted-foreground -mt-2">
        Period: <span className="font-medium text-foreground">{range.label}</span>
        {comps.includes("PY") && <> · Prev Year = {compRangeLabels.PY}</>}
        {comps.includes("PP") && <> · Prev Period = {compRangeLabels.PP}</>}
        {comps.includes("BUD") && !budgetInWindow && (
          <> · Budget starts {monthKeyLabel(BUDGET_START_KEY)} — no budget for this period (columns show n/a)</>
        )}
      </p>

      {/* Live status banners */}
      {!isSupabaseConfigured && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
          Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing) — live figures show as zero.
        </div>
      )}
      {isSupabaseConfigured && isError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          Could not load live P&amp;L data from Supabase — figures show as zero.
        </div>
      )}
      {isSupabaseConfigured && isLoading && (
        <div className="text-sm text-muted-foreground">Loading live P&amp;L data…</div>
      )}

      {/* KPI strip vs primary comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiMetrics.map((metric) => (
          <KPICard
            key={metric.label}
            metric={metric}
            periodLabel={range.label}
            scenario={primary === "PY" ? "py" : "base"}
            comparisonLabel={primary ? COMPARISON_LABELS[primary] : undefined}
            comparisonSource={primary ? "live" : undefined}
          />
        ))}
      </div>

      {/* The core: side-by-side P&L, expandable to the MoA leaf */}
      <PnLAnalysisTable
        lines={lines}
        comps={comps}
        periodLabel={range.label}
        scope={scope}
        compRangeLabels={compRangeLabels}
      />

      {/* Build-down waterfall, click to drill */}
      <AnalysisWaterfall
        lines={lines}
        comps={comps}
        view={view}
        periodLabel={range.label}
        scope={scope}
        onDrill={setDrillKey}
      />

      {/* Provenance footer */}
      <Card className="p-4">
        <p className="text-xs text-muted-foreground">
          <DataSourceBadge source="live" className="mr-1.5" />
          All figures from Supabase (Qoyod daily sync): actuals from{" "}
          <span className="font-mono">pnl_management</span> at MoA leaf grain — since migration 018
          the COMPLETE P&amp;L (invoices + bills + manual journal entries, incl. payroll and
          JE-paid costs; data starts 2022-01). Headline = <strong>Recurring EBITDA (pre Project
          Costs)</strong>; the Leveredge/F&amp;F project fees (TPC) sit below it, with EBITDA incl.
          Project Costs beneath — the budget plans those same fees as GA-NRP lines, mapped onto
          the Project Costs line for like-for-like comparison. Budget BASE from{" "}
          <span className="font-mono">v_budget_monthly</span> (approved 2026-07-16, Jul-2026 → Dec-2027).
          Prev Year = same window −12 months · Prev Period = the preceding window of equal length.
          Known limits (not adjusted here): revenue is gross of credit notes (none mirrored);
          Draft invoices pending posting are excluded (SAR 296,356 in 2026); bill items without a
          MoA tag are excluded (SAR 44,048 in 2026); a residual unmapped JE slice (−SAR 1,905)
          stays inside recurring EBITDA until decision D378 lands. Cost-center pivot is not in R1
          (facility sqm allocation data pending). The tool rolls forward automatically as new
          months sync — nothing is anchored to a fixed date.
        </p>
      </Card>

      {/* Drill drawer */}
      <AnalysisDrilldownDrawer
        isOpen={drillKey !== null}
        onClose={() => setDrillKey(null)}
        line={drillLine}
        lines={lines}
        comps={comps}
        periodLabel={range.label}
        scope={scope}
      />
    </div>
  );
};
