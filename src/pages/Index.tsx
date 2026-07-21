import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { KPICard } from "@/components/dashboard/KPICard";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { BUPerformanceChart } from "@/components/dashboard/BUPerformanceChart";
import { EconomicAnalysis } from "@/components/analysis/EconomicAnalysis";
import { CashFlowStatementLive } from "@/components/cashflow/CashFlowStatementLive";
import { BalanceSheetLive } from "@/components/balancesheet/BalanceSheetLive";
import { PageType, type KPIMetric } from "@/types/dashboard";
// LIVE data layer (Supabase pnl_by_bu + v_budget_monthly). ALL mock data
// paths were removed for the production go-live (2026-07-21): Actual, PY and
// Budget BASE are LIVE; the Worst/Best mock scenarios no longer exist.
import {
  usePnlByBu,
  useBudgetMonthly,
  aggregateLivePL,
  aggregateBudgetPL,
  budgetCoversRange,
  BUDGET_START_KEY,
  listLiveBUs,
  listLivePeriods,
  shiftMonthKey,
  monthKeyLabel,
  LIVE_BU_LABELS,
  LIVE_CURRENT_MONTH,
  LIVE_TODAY,
  rangeHasIncompleteMonths,
  type LivePLTotals,
} from "@/data/liveData";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { PnLLiveTable } from "@/components/dashboard/PnLLiveTable";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { DataFreshnessNote } from "@/components/dashboard/DataFreshnessNote";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tabs, TabsListPill, TabsTriggerPill } from "@/components/ui/tabs";


const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Derive current page from URL path
  const getCurrentPageFromPath = (): PageType => {
    const path = location.pathname.slice(1); // Remove leading slash
    if (path === "overview" || path === "performance" || path === "cash" || path === "ratios" || path === "statements") {
      return path as PageType;
    }
    return "overview";
  };
  
  const [currentPage, setCurrentPage] = useState<PageType>(getCurrentPageFromPath());
  // LIVE P&L rows from Supabase (pnl_by_bu) — single cached fetch
  const { data: liveRows, isLoading: liveLoading, isError: liveError } = usePnlByBu();
  // LIVE budget rows (v_budget_monthly, BASE scenario, Jul-2026..Dec-2027)
  const { data: budgetRows } = useBudgetMonthly();
  const [selectedMonth, setSelectedMonth] = useState("MTD");
  const [selectedScenario, setSelectedScenario] = useState<'Budget_Base' | 'PY'>("Budget_Base");
  const [selectedBU, setSelectedBU] = useState("All Company");
  const [currentView, setCurrentView] = useState<'economics' | 'cashflow' | 'balancesheet'>('economics');

  // Sync currentPage state with URL changes
  useEffect(() => {
    setCurrentPage(getCurrentPageFromPath());
  }, [location.pathname]);

  // Period selector — built from the REAL periods available in the live view
  // (falls back to the current month while loading). Values are "YYYY-MM" keys
  // or the aggregate keywords MTD/QTD/YTD/LTM.
  const livePeriods = listLivePeriods(liveRows);
  const lastLivePeriod = livePeriods.length > 0 ? livePeriods[livePeriods.length - 1] : LIVE_CURRENT_MONTH;
  const monthOptions = (() => {
    const keys: string[] = [];
    for (let i = 0; i < 14; i++) keys.push(shiftMonthKey(lastLivePeriod, -i));
    return keys
      .filter((k) => livePeriods.length === 0 || livePeriods.includes(k))
      .map((k) => ({ value: k, label: monthKeyLabel(k) }));
  })();
  const months = [
    { value: "MTD", label: "MTD (Month to Date)" },
    { value: "QTD", label: "QTD (Quarter to Date)" },
    { value: "YTD", label: "YTD (Year to Date)" },
    { value: "LTM", label: "LTM (12m Rolling)" },
    ...monthOptions,
  ];

  // BU selector — ADR-003 live taxonomy, discovered from the live rows
  const businessUnits = [
    { value: "All Company", label: "All Company" },
    ...listLiveBUs(liveRows).map((b) => ({
      value: b,
      label: `${LIVE_BU_LABELS[b] ?? b} (${b})`,
    })),
  ];

  // Only LIVE comparisons: Budget BASE (v_budget_monthly) and Previous Year.
  // The old Worst/Best mock scenarios were removed for the production go-live.
  const scenarioOptions = [
    { value: "Budget_Base", label: "Actual vs Budget" },
    { value: "PY", label: "Actual vs PY" },
  ];

  // Calculate the selected period as an inclusive month-key range, anchored on
  // the REAL current date (live data is monthly-grained). Also exposes ISO
  // dates for the legacy mock-budget lookup.
  const getPeriodRange = (): { startKey: string; endKey: string; startDate: string; endDate: string } => {
    const toDates = (startKey: string, endKey: string) => {
      const [ey, em] = endKey.split("-").map(Number);
      const lastDay = new Date(ey, em, 0).getDate();
      return {
        startKey,
        endKey,
        startDate: `${startKey}-01`,
        endDate: `${endKey}-${String(lastDay).padStart(2, "0")}`,
      };
    };

    const cur = LIVE_CURRENT_MONTH; // "YYYY-MM" of today
    const [curYear, curMonth] = cur.split("-").map(Number);

    if (selectedMonth === "MTD") {
      return { startKey: cur, endKey: cur, startDate: `${cur}-01`, endDate: LIVE_TODAY };
    } else if (selectedMonth === "QTD") {
      const qStartMonth = Math.floor((curMonth - 1) / 3) * 3 + 1;
      const startKey = `${curYear}-${String(qStartMonth).padStart(2, "0")}`;
      return { startKey, endKey: cur, startDate: `${startKey}-01`, endDate: LIVE_TODAY };
    } else if (selectedMonth === "YTD") {
      const startKey = `${curYear}-01`;
      return { startKey, endKey: cur, startDate: `${startKey}-01`, endDate: LIVE_TODAY };
    } else if (selectedMonth === "LTM") {
      const startKey = shiftMonthKey(cur, -11);
      return { startKey, endKey: cur, startDate: `${startKey}-01`, endDate: LIVE_TODAY };
    }
    // Specific month key "YYYY-MM"
    return toDates(selectedMonth, selectedMonth);
  };

  // Selected live BU code (undefined = consolidated)
  const selectedBUCode = selectedBU === "All Company" ? undefined : selectedBU;

  // KPI data — Actual, PY and Budget BASE are LIVE (Supabase pnl_by_bu +
  // v_budget_monthly). Budget Worst/Best scenarios are not loaded in Supabase
  // and remain MOCK, badged as such.
  const getFilteredKPIData = (): { metrics: KPIMetric[]; comparisonSource: "live" | "mock" } => {
    const { startKey, endKey } = getPeriodRange();

    const actual = aggregateLivePL(liveRows, startKey, endKey, selectedBUCode);

    let comparison: Pick<LivePLTotals, "revenue" | "cogs" | "opex" | "grossMargin" | "ebitda">;
    let comparisonSource: "live" | "mock";

    if (selectedScenario === "PY") {
      // Previous Year — LIVE, computed by shifting the period -12 months
      comparison = aggregateLivePL(
        liveRows,
        shiftMonthKey(startKey, -12),
        shiftMonthKey(endKey, -12),
        selectedBUCode,
      );
      comparisonSource = "live";
    } else {
      // Budget BASE — LIVE from v_budget_monthly. Budget starts Jul-2026;
      // ranges not fully inside the window get NO comparative (zeros ->
      // card shows "No budget comparison" — absent, not zero).
      const budget = aggregateBudgetPL(budgetRows, startKey, endKey, selectedBUCode);
      comparison = budget ?? { revenue: 0, cogs: 0, opex: 0, grossMargin: 0, ebitda: 0 };
      comparisonSource = "live";
    }

    // Helper to detect opposite signs
    const hasOppositeSigns = (a: number, c: number): boolean =>
      (a >= 0 && c < 0) || (a < 0 && c >= 0);

    const pct = (a: number, c: number) => (c !== 0 ? ((a - c) / Math.abs(c)) * 100 : 0);

    const metrics: KPIMetric[] = [
      {
        label: "Revenue",
        actual: actual.revenue,
        budget: comparison.revenue,
        variance: actual.revenue - comparison.revenue,
        variancePercent: pct(actual.revenue, comparison.revenue),
        format: "currency" as const,
        isOppositeSigns: hasOppositeSigns(actual.revenue, comparison.revenue),
      },
      {
        label: "Gross Margin",
        actual: actual.grossMargin,
        budget: comparison.grossMargin,
        variance: actual.grossMargin - comparison.grossMargin,
        variancePercent: pct(actual.grossMargin, comparison.grossMargin),
        format: "currency" as const,
        isOppositeSigns: hasOppositeSigns(actual.grossMargin, comparison.grossMargin),
      },
      {
        label: "OpEx",
        actual: Math.abs(actual.opex),
        budget: Math.abs(comparison.opex),
        variance: Math.abs(actual.opex) - Math.abs(comparison.opex),
        variancePercent: pct(Math.abs(actual.opex), Math.abs(comparison.opex)),
        format: "currency" as const,
        isOppositeSigns: hasOppositeSigns(Math.abs(actual.opex), Math.abs(comparison.opex)),
      },
      {
        label: "Recurring EBITDA", // G3: pre project costs (migration 018)
        actual: actual.ebitda,
        budget: comparison.ebitda,
        variance: actual.ebitda - comparison.ebitda,
        variancePercent: pct(actual.ebitda, comparison.ebitda),
        format: "currency" as const,
        isOppositeSigns: hasOppositeSigns(actual.ebitda, comparison.ebitda),
      },
    ];

    return { metrics, comparisonSource };
  };

  // Per-BU performance — LIVE actuals for every BU present in the live data.
  // Comparison: PY (LIVE) for the PY scenario; Budget BASE (LIVE, from
  // v_budget_monthly filtered by bu_code) when the period is inside the
  // budget window. Worst/Best have no live budget -> zeros (actual only).
  // NB: budget costs are largely unallocated (recurring COGS bu NULL, OpEx on
  // CORP) — mirrors the same allocation limitation as the live actuals.
  const getFilteredBUPerformance = () => {
    if (selectedBU !== "All Company") return [];

    const { startKey, endKey } = getPeriodRange();

    return listLiveBUs(liveRows).map((bu) => {
      const actual = aggregateLivePL(liveRows, startKey, endKey, bu);
      const py = aggregateLivePL(
        liveRows,
        shiftMonthKey(startKey, -12),
        shiftMonthKey(endKey, -12),
        bu,
      );
      const comparison = selectedScenario === "PY"
        ? py
        : (selectedScenario === "Budget_Base"
            ? aggregateBudgetPL(budgetRows, startKey, endKey, bu)
            : null) ?? { revenue: 0, grossMargin: 0, opex: 0, ebitda: 0 };

      return {
        name: LIVE_BU_LABELS[bu] ?? bu,
        revenue: { actual: actual.revenue, budget: comparison.revenue },
        grossMargin: { actual: actual.grossMargin, budget: comparison.grossMargin },
        opex: { actual: Math.abs(actual.opex), budget: Math.abs(comparison.opex) },
        ebitda: { actual: actual.ebitda, budget: comparison.ebitda },
        services: undefined,
      };
    });
  };

  const { metrics: filteredKPIData, comparisonSource } = getFilteredKPIData();
  const filteredBUPerformance = getFilteredBUPerformance();

  const renderEconomicsContent = () => (
    <div className="space-y-6">
      {/* Data freshness — figures complete through the June 2026 close; the
          warning appears when the selected window touches July (revenue
          synced, costs not yet posted). */}
      <DataFreshnessNote
        showIncompleteWarning={(() => {
          const { startKey, endKey } = getPeriodRange();
          return rangeHasIncompleteMonths(startKey, endKey);
        })()}
      />

      {/* Filter Controls */}
      <div className="flex gap-4">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-56 bg-background font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {months.map((month) => (
              <SelectItem key={month.value} value={month.value}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select 
          value={selectedScenario} 
          onValueChange={(value) => setSelectedScenario(value as typeof selectedScenario)}
        >
          <SelectTrigger className="w-56 bg-background font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scenarioOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedBU} onValueChange={setSelectedBU}>
          <SelectTrigger className="w-56 bg-background font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {businessUnits.map((bu) => (
              <SelectItem key={bu.value} value={bu.value}>
                {bu.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Live data status banner */}
      {!isSupabaseConfigured && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
          Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing) — live figures show as zero.
        </div>
      )}
      {isSupabaseConfigured && liveError && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          Could not load live P&amp;L data from Supabase — figures show as zero.
        </div>
      )}
      {isSupabaseConfigured && liveLoading && (
        <div className="text-sm text-muted-foreground">Loading live P&amp;L data…</div>
      )}

      {/* KPI Cards — Actual/PY LIVE, Budget MOCK */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filteredKPIData.map((metric, index) => (
          <KPICard
            key={index}
            metric={metric}
            periodLabel={selectedMonth}
            scenario={selectedScenario}
            comparisonSource={comparisonSource}
            onClick={() => {
              if (metric.label.includes("Revenue") || metric.label.includes("EBITDA") || metric.label.includes("OpEx")) {
                setCurrentPage("performance");
              } else if (metric.label.includes("Cash")) {
                setCurrentPage("cash");
              }
            }}
          />
        ))}
      </div>

      {/* P&L Monthly table — LIVE (Supabase pnl_by_bu) */}
      <PnLLiveTable
        buCode={selectedBUCode}
        buLabel={selectedBUCode ? LIVE_BU_LABELS[selectedBUCode] ?? selectedBUCode : undefined}
      />

      {/* Charts */}
      <RevenueTrendChart scenario={selectedScenario} selectedBU={selectedBU} />
      {selectedBU === "All Company" && (
        <div className="space-y-2">
          <BUPerformanceChart data={filteredBUPerformance} onClick={() => setCurrentPage("performance")} />
          {selectedScenario === "Budget_Base" && (() => {
            const { startKey, endKey } = getPeriodRange();
            return budgetCoversRange(startKey, endKey) ? (
              <p className="text-xs text-muted-foreground px-1">
                <DataSourceBadge source="live" className="mr-1.5" />
                Budget comparatives from Supabase v_budget_monthly (BASE scenario, approved 2026-07-16).
                Budget costs are largely unallocated to BUs (recurring COGS, OpEx on Corporate) — same
                limitation as the live actuals.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground px-1">
                Budget starts {monthKeyLabel(BUDGET_START_KEY)} — no budget comparative for this period;
                bars show LIVE actuals only.
              </p>
            );
          })()}
        </div>
      )}
    </div>
  );

  const renderOverview = () => (
    <div className="space-y-8 animate-fade-in">
      {/* Centered Pill Tab — the three statements ("i tre prospetti") */}
      <div className="flex justify-center pt-4">
        <Tabs value={currentView} onValueChange={(v) => setCurrentView(v as typeof currentView)}>
          <TabsListPill className="shadow-lg">
            <TabsTriggerPill value="economics">P&amp;L</TabsTriggerPill>
            <TabsTriggerPill value="cashflow">Cash Flow</TabsTriggerPill>
            <TabsTriggerPill value="balancesheet">Balance Sheet</TabsTriggerPill>
          </TabsListPill>
        </Tabs>
      </div>

      {/* Content with proper spacing */}
      <div className="pt-2">
        {currentView === 'economics' && renderEconomicsContent()}
        {currentView === 'cashflow' && <CashFlowStatementLive />}
        {currentView === 'balancesheet' && <BalanceSheetLive />}
      </div>
    </div>
  );

  // Analysis page = the FULL economic-analysis tool (R1, ratified 2026-07-20).
  // It manages its own filters/state; the home Overview stays a summary.
  const renderPerformance = () => <EconomicAnalysis />;

  const renderCash = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-4">Recommendation</h2>
        <p className="text-muted-foreground">This page is under construction.</p>
      </Card>
    </div>
  );

  const renderRatios = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-4">Action</h2>
        <p className="text-muted-foreground">This page is under construction.</p>
      </Card>
    </div>
  );

  const renderStatements = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-4">Communication</h2>
        <p className="text-muted-foreground">This page is under construction.</p>
      </Card>
    </div>
  );

  const renderContent = () => {
    switch (currentPage) {
      case "overview":
        return renderOverview();
      case "performance":
        return renderPerformance();
      case "cash":
        return renderCash();
      case "ratios":
        return renderRatios();
      case "statements":
        return renderStatements();
      default:
        return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav currentPage={currentPage} />
      <main className="container mx-auto px-4 py-6">
        {renderContent()}
      </main>
    </div>
  );
};

export default Index;
