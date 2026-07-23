// Cash-Flow screen — LIVE from Supabase v_cashflow_statement_monthly.
// Alignment additions (spec §1.3, 2026-07-21):
//   - basis toggle DISABLED here with tooltip (cash is basis-independent);
//   - anchor tiles rendered from views (BS cash lines, bank_balances, CF
//     financing series) — no literals in code;
//   - YTD cash walk waterfall (opening → operating → investing → financing →
//     other → closing);
//   - actual-vs-budget operating CF from v_cashflow_budget_comparison with
//     the documented proxy labeling before the forward budget window;
//   - months after the CF horizon show collections only (no MTD operating
//     result tile).
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Cell, LabelList,
} from "recharts";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { DataFreshnessNote } from "@/components/dashboard/DataFreshnessNote";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { BasisToggle } from "@/components/chrome/AlignmentChrome";
import { useIsMobile } from "@/hooks/use-mobile";
import { monthKey, monthKeyLabel, shiftMonthKey } from "@/data/liveData";
import {
  useCashflowMonthly, useWorkingCapitalMonthly, useBalanceSheet,
  useBankBalances, useCashflowBudgetComparison, type CashflowMonthRow,
} from "@/data/statementsLive";
import { useBudgetMonthly } from "@/data/liveData";
import { fmtSAR, fmtDeltaSAR, fmtCompact, fmtOrDash } from "@/lib/format";
import { buildCashFlowExport, exportStatementCsv } from "@/lib/exportStatements";

const n = (v: number | null | undefined): number => v ?? 0;
const fmt = (v: number) => (v === 0 ? "—" : fmtSAR(v));

interface LineDef {
  label: string;
  value: (r: CashflowMonthRow) => number;
  emphasis?: boolean;
  indent?: boolean;
  topBorder?: boolean;
}

const LINES: LineDef[] = [
  { label: "Operating result", value: (r) => n(r.operating_result), indent: true },
  { label: "Working-capital change", value: (r) => n(r.operating_wc_change), indent: true },
  { label: "D&A add-back (non-cash)", value: (r) => n(r.operating_da_noncash), indent: true },
  { label: "Operating cash flow", value: (r) => n(r.operating_cash_flow), emphasis: true },
  { label: "Investing cash flow", value: (r) => n(r.investing_cash_flow), emphasis: true },
  { label: "Financing — equity", value: (r) => n(r.financing_equity), indent: true },
  { label: "Financing — intercompany", value: (r) => n(r.financing_intercompany), indent: true },
  { label: "Financing cash flow", value: (r) => n(r.financing_cash_flow), emphasis: true },
  { label: "Other cash flow", value: (r) => n(r.other_cash_flow) },
  { label: "Net cash flow", value: (r) => n(r.net_cash_flow), emphasis: true, topBorder: true },
];

type WindowSize = 6 | 12 | 24;

// -------------------------------------------------------------- waterfall

const CashWalk = ({ steps }: { steps: { label: string; short?: string; value: number; kind: "anchor" | "delta" }[] }) => {
  const isMobile = useIsMobile();
  const data = useMemo(() => {
    let running = 0;
    return steps.map((s) => {
      // Mobile (punch item 7): compact x labels — the full anchor labels
      // ("Opening (1-Jan-26)") collide at 390px.
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
  return (
    <ResponsiveContainer width="100%" height={isMobile ? 272 : 250}>
      <ComposedChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
        <XAxis
          dataKey="label"
          stroke="hsl(var(--muted-foreground))"
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: isMobile ? 9.5 : 11 }}
          tickLine={false}
          interval={0}
          angle={isMobile ? -32 : 0}
          textAnchor={isMobile ? "end" : "middle"}
          height={isMobile ? 50 : 30}
        />
        <YAxis tickFormatter={fmtCompact} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={isMobile ? 42 : 54} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload || payload.length === 0) return null;
            const d = payload[0].payload as (typeof data)[number];
            return (
              <div className="chart-tooltip">
                <p className="chart-tooltip-title">{label}</p>
                <p className="chart-tooltip-content chart-tooltip-actual">{d.kind === "anchor" ? fmtSAR(d.raw) : fmtDeltaSAR(d.raw)}</p>
              </div>
            );
          }}
        />
        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
        <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="size" stackId="wf" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={64}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.kind === "anchor" ? "hsl(var(--gold) / 0.9)" : d.kind === "up" ? "hsl(195 75% 55% / 0.8)" : "hsl(0 70% 60% / 0.75)"} />
          ))}
          <LabelList dataKey="raw" position="top" formatter={(v: number) => fmtCompact(v)} style={{ fill: "hsl(var(--foreground))", fontSize: 10.5, fontWeight: 600 }} />
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
};

export const CashFlowStatementLive = () => {
  const { data: rows, isLoading, isError, error } = useCashflowMonthly();
  const { data: wcRows } = useWorkingCapitalMonthly();
  const { data: bsData } = useBalanceSheet();
  const { data: bankRows } = useBankBalances();
  const { data: cfBudget } = useCashflowBudgetComparison();
  const { data: budgetRows } = useBudgetMonthly();
  const [windowSize, setWindowSize] = useState<WindowSize>(12);

  const { window: windowRows, cumulativeByMonth, firstKey, lastCfKey } = useMemo(() => {
    const all = rows ?? [];
    const cum = new Map<string, number>();
    let running = 0;
    for (const r of all) {
      running += n(r.net_cash_flow);
      cum.set(monthKey(r.period_month), running);
    }
    return {
      window: all.slice(-windowSize),
      cumulativeByMonth: cum,
      firstKey: all.length > 0 ? monthKey(all[0].period_month) : null,
      lastCfKey: all.length > 0 ? monthKey(all[all.length - 1].period_month) : null,
    };
  }, [rows, windowSize]);

  // ----------------------------------------------------------- anchors
  // Book cash by month from the BS view (cash/bank/petty asset lines).
  const bookCashByMonth = useMemo(() => {
    const map = new Map<string, number>();
    if (!bsData?.available) return map;
    for (const r of bsData.rows) {
      if (r.section !== "Assets") continue;
      if (!/cash|bank|petty/i.test(r.line_item)) continue;
      const k = monthKey(r.month);
      map.set(k, (map.get(k) ?? 0) + r.amount);
    }
    return map;
  }, [bsData]);

  const latestYear = lastCfKey ? lastCfKey.slice(0, 4) : null;
  const openKey = latestYear ? `${Number(latestYear) - 1}-12` : null; // Dec of prior year
  const openingCash = openKey ? bookCashByMonth.get(openKey) ?? null : null;
  const closingBookCash = lastCfKey ? bookCashByMonth.get(lastCfKey) ?? null : null;
  const liveBankTotal = useMemo(
    () => (bankRows && bankRows.length > 0 ? bankRows.reduce((s, r) => s + n(r.current_balance), 0) : null),
    [bankRows],
  );
  const lastSynced = bankRows && bankRows.length > 0 ? bankRows[0].last_synced.slice(0, 10) : null;
  const equityFundingCum = useMemo(
    () => (rows ? rows.reduce((s, r) => s + n(r.financing_equity), 0) : null),
    [rows],
  );

  // YTD cash walk (calendar year of the CF horizon).
  const walk = useMemo(() => {
    if (!rows || !latestYear || openingCash === null) return null;
    const ytdRows = rows.filter((r) => monthKey(r.period_month) >= `${latestYear}-01`);
    const sum = (f: (r: CashflowMonthRow) => number) => ytdRows.reduce((s, r) => s + f(r), 0);
    const op = sum((r) => n(r.operating_cash_flow));
    const inv = sum((r) => n(r.investing_cash_flow));
    const fin = sum((r) => n(r.financing_cash_flow));
    const oth = sum((r) => n(r.other_cash_flow));
    return [
      { label: `Opening (1-Jan-${latestYear.slice(2)})`, short: "Opening", value: openingCash, kind: "anchor" as const },
      { label: "Operating", short: "Op", value: op, kind: "delta" as const },
      { label: "Investing", short: "Inv", value: inv, kind: "delta" as const },
      { label: "Financing", short: "Fin", value: fin, kind: "delta" as const },
      { label: "Other", short: "Other", value: oth, kind: "delta" as const },
      { label: `Book cash (${lastCfKey ? monthKeyLabel(lastCfKey) : ""})`, short: "Book cash", value: openingCash + op + inv + fin + oth, kind: "anchor" as const },
    ];
  }, [rows, latestYear, openingCash, lastCfKey]);

  // Budget CF comparison: proxy boundary = first month of the forward budget
  // version (derived from data — the version whose window starts last).
  const proxyBoundary = useMemo(() => {
    if (!budgetRows || budgetRows.length === 0) return null;
    const minByVersion = new Map<string, string>();
    for (const r of budgetRows) {
      const k = monthKey(r.period_month);
      const cur = minByVersion.get(r.version_id);
      if (!cur || k < cur) minByVersion.set(r.version_id, k);
    }
    return [...minByVersion.values()].sort().pop() ?? null;
  }, [budgetRows]);

  const cfBudgetChart = useMemo(() => {
    if (!cfBudget || !lastCfKey) return [];
    // Window: trailing 12 actual months + 6 forward plan months.
    const lo = shiftMonthKey(lastCfKey, -11);
    const hi = shiftMonthKey(lastCfKey, 6);
    return cfBudget
      .filter((r) => { const k = monthKey(r.period_month); return k >= lo && k <= hi; })
      .filter((r) => n(r.operating_budget) !== 0 || n(r.operating_actual) !== 0)
      .map((r) => {
        const k = monthKey(r.period_month);
        return {
          key: k,
          label: monthKeyLabel(k),
          actual: r.operating_actual,
          budget: r.operating_budget,
          isProxy: proxyBoundary ? k < proxyBoundary : true,
        };
      });
  }, [cfBudget, proxyBoundary, lastCfKey]);

  // Chart pairs monthly net CF with the BOOK CASH LEVEL (BS view) — the
  // level line answers "where is cash heading", which a cumulative sum of
  // net flows since the first synced month does not.
  const chartData = windowRows.map((r) => {
    const k = monthKey(r.period_month);
    return {
      month: monthKeyLabel(k),
      net: n(r.net_cash_flow),
      level: bookCashByMonth.has(k) ? bookCashByMonth.get(k)! : null,
    };
  });

  const ChartTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ dataKey: string; value: number }>;
    label?: string;
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    const net = payload.find((p) => p.dataKey === "net")?.value ?? 0;
    const level = payload.find((p) => p.dataKey === "level")?.value;
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-title">{label}</p>
        <div className="chart-tooltip-content">
          <p className={net >= 0 ? "chart-tooltip-delta-positive" : "chart-tooltip-delta-negative"}>
            Net cash flow: {fmtSAR(net)}
          </p>
          <p className="chart-tooltip-actual">Book cash level: {level === null || level === undefined ? "—" : fmtSAR(level)}</p>
        </div>
      </div>
    );
  };

  // Audit-ready export: the monthly CF statement (indirect) + book cash +
  // working-capital block for the visible window, stamped with source & asOf.
  const handleExport = () => {
    if (windowRows.length === 0) return;
    exportStatementCsv(
      buildCashFlowExport({
        windowRows,
        lines: LINES,
        bookCashByMonth,
        wcRows,
        windowSize,
        meta: {
          entity: "Trio Sporting Club",
          statement: "Cash Flow Statement (indirect) — monthly",
          period: `Last ${windowSize} months${lastCfKey ? ` to ${monthKeyLabel(lastCfKey)}` : ""}`,
          basis: "n/a — cash flows are basis-independent (the basis toggle applies to the P&L only)",
          source: "Supabase · v_cashflow_statement_monthly + v_working_capital_monthly (Qoyod-certified warehouse)",
          dataAsOf: lastCfKey ? `${monthKeyLabel(lastCfKey)} (latest cash-flow month)` : undefined,
        },
        notes: [
          "Indirect method: Operating = operating result + working-capital change + D&A add-back.",
          "Financing splits equity injections from intercompany movements.",
          "Book cash = balance-sheet cash & bank lines at month end (as booked, not bank-confirmed); reconciles with bs_cash_movement by construction.",
        ],
      }),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DataFreshnessNote />
        <div className="flex items-center gap-3">
          <BasisToggle
            disabled
            disabledReason="Cash flows are unaffected by the VAT/credit-note presentation — credit notes affect receivables, not collections. The basis toggle applies to the P&L screens only."
          />
          <Select value={String(windowSize)} onValueChange={(v) => setWindowSize(Number(v) as WindowSize)}>
            <SelectTrigger className="w-44 bg-background font-medium"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
              <SelectItem value="24">Last 24 months</SelectItem>
            </SelectContent>
          </Select>
          <ExportButton onClick={handleExport} />
        </div>
      </div>

      {/* Anchor tiles — every figure from a view */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Opening book cash {latestYear ? `(1-Jan-${latestYear.slice(2)})` : ""}
          </p>
          <p className="text-2xl font-heading tracking-tight tabular-nums">{fmtOrDash(openingCash)}</p>
          <p className="text-[11px] text-muted-foreground/80">Balance-sheet cash & bank lines, as booked.</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Book cash {lastCfKey ? `(${monthKeyLabel(lastCfKey)})` : ""}
          </p>
          <p className="text-2xl font-heading tracking-tight tabular-nums">{fmtOrDash(closingBookCash)}</p>
          <p className="text-[11px] text-muted-foreground/80">As booked — not yet bank-confirmed.</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Live bank &amp; cash position</p>
          <p className="text-2xl font-heading tracking-tight tabular-nums text-gold">{fmtOrDash(liveBankTotal)}</p>
          <p className="text-[11px] text-muted-foreground/80">
            Σ bank_balances (Qoyod sync{lastSynced ? ` · ${lastSynced}` : ""}) — the canonical cash
            definition, as booked / not bank-confirmed.
          </p>
          {/* Coherence guard (punch item 8): the canonical position and the
              statement's book cash must never diverge SILENTLY — any delta is
              computed and shown, never a stale citation. */}
          {liveBankTotal !== null && closingBookCash !== null && (
            Math.abs(liveBankTotal - closingBookCash) < 0.5 ? (
              <p className="text-[11px] text-muted-foreground/80">
                Ties book cash at {lastCfKey ? monthKeyLabel(lastCfKey) : "close"} to the cent.
              </p>
            ) : (
              <p className="text-[11px] text-amber-300/90 tabular-nums">
                Δ vs book cash at {lastCfKey ? monthKeyLabel(lastCfKey) : "close"}:{" "}
                {fmtDeltaSAR(liveBankTotal - closingBookCash)} — post-close cash movements (the bank
                sync is daily; the statement is as-at month end).
              </p>
            )
          )}
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Shareholder funding (cumulative)</p>
          <p className="text-2xl font-heading tracking-tight tabular-nums">{fmtOrDash(equityFundingCum)}</p>
          <p className="text-[11px] text-muted-foreground/80">Σ financing — equity since {firstKey ? monthKeyLabel(firstKey) : "start"} (CF statement).</p>
        </Card>
      </div>

      {/* Cash walk — the CFO question: where did the cash go this year? */}
      {walk && (
        <Card className="dashboard-card group">
          <h3 className="dashboard-card-title mb-4">
            CASH WALK — YTD {latestYear} <DataSourceBadge source="live" className="ml-2" />
          </h3>
          <CashWalk steps={walk} />
          <p className="mt-2 text-xs text-muted-foreground">
            Opening book cash + YTD operating/investing/financing/other flows (v_cashflow_statement_monthly).
            Months after {lastCfKey ? monthKeyLabel(lastCfKey) : "the CF horizon"} track collections only —
            no MTD operating result is shown while costs are unposted.
          </p>
        </Card>
      )}

      {/* Net + cumulative chart */}
      <Card className="dashboard-card group">
        <h3 className="dashboard-card-title mb-6">
          NET CASH FLOW &amp; BOOK CASH LEVEL <DataSourceBadge source="live" className="ml-2" />
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
            <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }} />
            <YAxis yAxisId="net" tickFormatter={fmtCompact} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
            <YAxis yAxisId="cum" orientation="right" tickFormatter={fmtCompact} stroke="hsl(var(--gold) / 0.7)" tick={{ fill: "hsl(var(--gold) / 0.8)", fontSize: 12 }} />
            <Tooltip content={<ChartTooltip />} />
            <Legend className="chart-legend" />
            <ReferenceLine yAxisId="net" y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
            <Bar yAxisId="net" dataKey="net" name="Net cash flow (left)" fill="hsl(195 75% 55% / 0.75)" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.net >= 0 ? "hsl(195 75% 55% / 0.75)" : "hsl(0 70% 60% / 0.65)"} />
              ))}
            </Bar>
            <Line yAxisId="cum" type="monotone" dataKey="level" name="Book cash level (right)" stroke="hsl(var(--gold))" strokeWidth={3} dot={{ fill: "hsl(var(--gold))", r: 3, strokeWidth: 0 }} connectNulls isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* Operating CF vs budget — with the documented proxy labeling */}
      {cfBudgetChart.length > 0 && (
        <Card className="dashboard-card group">
          <h3 className="dashboard-card-title mb-4">
            OPERATING CASH FLOW — ACTUAL vs BUDGET <DataSourceBadge source="live" className="ml-2" />
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={cfBudgetChart} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} />
              <YAxis tickFormatter={fmtCompact} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={54} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const row = payload[0].payload as (typeof cfBudgetChart)[number];
                  return (
                    <div className="chart-tooltip">
                      <p className="chart-tooltip-title">{label}</p>
                      <p className="chart-tooltip-content chart-tooltip-actual">Actual operating CF: {row.actual === null ? "—" : fmtSAR(row.actual)}</p>
                      <p className="chart-tooltip-content chart-tooltip-budget">
                        {row.isProxy ? "Budget EBITDA (proxy)" : "Budget operating CF"}: {row.budget === null ? "—" : fmtSAR(row.budget)}
                      </p>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
              <Bar dataKey="actual" name="Actual operating CF" radius={[3, 3, 0, 0]} isAnimationActive={false} maxBarSize={26}>
                {cfBudgetChart.map((d, i) => (
                  <Cell key={i} fill={(d.actual ?? 0) >= 0 ? "hsl(var(--gold) / 0.85)" : "hsl(0 70% 60% / 0.7)"} />
                ))}
              </Bar>
              <Line dataKey="budget" name={`Budget${proxyBoundary ? ` (EBITDA proxy before ${monthKeyLabel(proxyBoundary)})` : " (EBITDA proxy)"}`} stroke="hsl(var(--foreground) / 0.75)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 2.5, fill: "hsl(var(--foreground))", strokeWidth: 0 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="mt-2 text-xs text-muted-foreground">
            Before {proxyBoundary ? monthKeyLabel(proxyBoundary) : "the forward budget window"} no CF budget lines
            exist — the budget series is budget EBITDA used as an operating-CF proxy. From
            {" "}{proxyBoundary ? monthKeyLabel(proxyBoundary) : "the forward window"} it is the approved budget operating CF.
          </p>
        </Card>
      )}

      {/* Monthly cash-flow statement table */}
      <Card className="p-6 overflow-x-auto shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <h3 className="text-xl font-heading tracking-wide">CASH FLOW STATEMENT — MONTHLY</h3>
          <DataSourceBadge source="live" />
          <span className="text-xs text-muted-foreground">
            Supabase · v_cashflow_statement_monthly · SAR
          </span>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading live cash-flow data…</p>}
        {isError && (
          <p className="text-sm text-destructive">
            {(error as Error | null)?.name === "PermissionDeniedError"
              ? (error as Error).message
              : "Could not load the cash-flow statement from Supabase."}
          </p>
        )}

        {!isLoading && !isError && windowRows.length > 0 && (
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-semibold">SAR</th>
                {windowRows.map((r) => (
                  <th key={r.period_month} className="text-right py-2 px-2 font-semibold whitespace-nowrap">
                    {monthKeyLabel(monthKey(r.period_month))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LINES.map((line) => (
                <tr
                  key={line.label}
                  className={[
                    line.emphasis ? "border-b border-border/40 font-semibold" : "border-b border-border/10",
                    line.topBorder ? "border-t-2 border-t-border" : "",
                  ].join(" ")}
                >
                  <td className={`py-2 pr-4 whitespace-nowrap ${line.indent ? "pl-4 text-muted-foreground font-normal" : ""}`}>
                    {line.label}
                  </td>
                  {windowRows.map((r) => {
                    const v = line.value(r);
                    return (
                      <td key={r.period_month} className={`text-right py-2 px-2 tabular-nums whitespace-nowrap ${v < 0 ? "text-muted-foreground" : ""}`}>
                        {fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="font-semibold text-gold">
                <td className="py-2 pr-4 whitespace-nowrap" title="Balance-sheet cash & bank lines at month end (as booked)">
                  Book cash (end of month)
                </td>
                {windowRows.map((r) => {
                  const k = monthKey(r.period_month);
                  return (
                    <td key={r.period_month} className="text-right py-2 px-2 tabular-nums whitespace-nowrap">
                      {bookCashByMonth.has(k) ? fmt(bookCashByMonth.get(k)!) : "—"}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Indirect-method statement derived from the synced Qoyod ledger. Operating =
          operating result + working-capital change + D&amp;A add-back. Financing splits
          equity injections from intercompany movements. Book cash = balance-sheet cash &
          bank lines at month end. Reconciles with the balance-sheet cash
          movement (bs_cash_movement) by construction.
        </p>
      </Card>

      {/* Working capital — LIVE */}
      {wcRows && wcRows.length > 0 && (
        <Card className="p-6 overflow-x-auto shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <h3 className="text-xl font-heading tracking-wide">WORKING CAPITAL — MONTHLY</h3>
            <DataSourceBadge source="live" />
            <span className="text-xs text-muted-foreground">
              Supabase · v_working_capital_monthly · SAR
            </span>
          </div>
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-semibold">SAR</th>
                {wcRows.slice(-windowSize).map((r) => (
                  <th key={r.period_month} className="text-right py-2 px-2 font-semibold whitespace-nowrap">
                    {monthKeyLabel(monthKey(r.period_month))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {([
                { label: "Receivables", value: (r: typeof wcRows[number]) => n(r.receivables) },
                { label: "Inventory", value: (r: typeof wcRows[number]) => n(r.inventory) },
                { label: "Payables", value: (r: typeof wcRows[number]) => -Math.abs(n(r.payables)) },
              ] as const).map((line) => (
                <tr key={line.label} className="border-b border-border/10">
                  <td className="py-2 pr-4 pl-4 text-muted-foreground whitespace-nowrap">{line.label}</td>
                  {wcRows.slice(-windowSize).map((r) => {
                    const v = line.value(r);
                    return (
                      <td key={r.period_month} className={`text-right py-2 px-2 tabular-nums whitespace-nowrap ${v < 0 ? "text-muted-foreground" : ""}`}>
                        {fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="border-b border-border/40 font-semibold">
                <td className="py-2 pr-4 whitespace-nowrap">Net working capital</td>
                {wcRows.slice(-windowSize).map((r) => (
                  <td key={r.period_month} className="text-right py-2 px-2 tabular-nums whitespace-nowrap">
                    {fmt(n(r.net_working_capital))}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          {/* Punch item 8: explain negative receivables WHEN they occur —
              conditioned on the data, never asserted. */}
          {wcRows.slice(-windowSize).some((r) => n(r.receivables) < -0.5) && (
            <p className="mt-3 text-xs text-amber-300/90">
              Receivables print negative in some months: the customer credit notes back-loaded to the
              ledger on 21-Jul-2026 are booked against AR, and as booked they exceed the open invoice
              balance — see the AR note on the Balance Sheet for the underlying position.
            </p>
          )}
        </Card>
      )}
    </div>
  );
};
