// Cash-Flow screen — LIVE from Supabase v_cashflow_statement_monthly.
// Structure follows the view: Operating (result + WC change + D&A add-back),
// Investing, Financing (equity + intercompany), Other, Net cash flow, plus a
// cumulative cash-flow line (running sum of net CF since the first synced
// month). Same visual grammar as the P&L monthly table + a net/cumulative
// chart in the house palette (gold line, muted bars).
import { Fragment, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Cell,
} from "recharts";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { DataFreshnessNote } from "@/components/dashboard/DataFreshnessNote";
import { monthKey, monthKeyLabel } from "@/data/liveData";
import { useCashflowMonthly, useWorkingCapitalMonthly, type CashflowMonthRow } from "@/data/statementsLive";

const n = (v: number | null | undefined): number => v ?? 0;

const fmt = (v: number) =>
  v === 0 ? "—" : new Intl.NumberFormat("en-SA", { maximumFractionDigits: 0 }).format(v);

const fmtShort = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toFixed(0);
};

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

export const CashFlowStatementLive = () => {
  const { data: rows, isLoading, isError, error } = useCashflowMonthly();
  const { data: wcRows } = useWorkingCapitalMonthly();
  const [windowSize, setWindowSize] = useState<WindowSize>(12);

  // Cumulative net cash flow computed over the FULL synced history, so the
  // cumulative line is meaningful regardless of the displayed window.
  const { window: windowRows, cumulativeByMonth, firstKey } = useMemo(() => {
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
    };
  }, [rows, windowSize]);

  const chartData = windowRows.map((r) => {
    const k = monthKey(r.period_month);
    return {
      month: monthKeyLabel(k),
      net: n(r.net_cash_flow),
      cumulative: cumulativeByMonth.get(k) ?? 0,
    };
  });

  const ChartTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ dataKey: string; value: number }>;
    label?: string;
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    const net = payload.find((p) => p.dataKey === "net")?.value ?? 0;
    const cumulative = payload.find((p) => p.dataKey === "cumulative")?.value ?? 0;
    const f = (v: number) =>
      new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 0 }).format(v);
    return (
      <div className="chart-tooltip">
        <p className="chart-tooltip-title">{label}</p>
        <div className="chart-tooltip-content">
          <p className={net >= 0 ? "chart-tooltip-delta-positive" : "chart-tooltip-delta-negative"}>
            Net cash flow: {f(net)}
          </p>
          <p className="chart-tooltip-actual">Cumulative: {f(cumulative)}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DataFreshnessNote />
        <Select
          value={String(windowSize)}
          onValueChange={(v) => setWindowSize(Number(v) as WindowSize)}
        >
          <SelectTrigger className="w-44 bg-background font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="6">Last 6 months</SelectItem>
            <SelectItem value="12">Last 12 months</SelectItem>
            <SelectItem value="24">Last 24 months</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Net + cumulative chart */}
      <Card className="dashboard-card group">
        <h3 className="dashboard-card-title mb-6">
          NET CASH FLOW &amp; CUMULATIVE <DataSourceBadge source="live" className="ml-2" />
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
            <XAxis
              dataKey="month"
              stroke="hsl(var(--muted-foreground))"
              tick={{ fill: "hsl(var(--foreground))", fontSize: 13 }}
            />
            <YAxis
              yAxisId="net"
              tickFormatter={fmtShort}
              stroke="hsl(var(--muted-foreground))"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 13 }}
            />
            <YAxis
              yAxisId="cum"
              orientation="right"
              tickFormatter={fmtShort}
              stroke="hsl(var(--gold) / 0.7)"
              tick={{ fill: "hsl(var(--gold) / 0.8)", fontSize: 13 }}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend className="chart-legend" />
            <ReferenceLine yAxisId="net" y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
            <Bar
              yAxisId="net"
              dataKey="net"
              name="Net cash flow (left)"
              fill="hsl(195 75% 55% / 0.75)"
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            >
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.net >= 0 ? "hsl(195 75% 55% / 0.75)" : "hsl(0 70% 60% / 0.65)"} />
              ))}
            </Bar>
            <Line
              yAxisId="cum"
              type="monotone"
              dataKey="cumulative"
              name={`Cumulative (right${firstKey ? `, since ${monthKeyLabel(firstKey)}` : ""})`}
              stroke="hsl(var(--gold))"
              strokeWidth={3}
              dot={{ fill: "hsl(var(--gold))", r: 3, strokeWidth: 0 }}
              // Animation off — a re-animating line blanks out on remounts
              // (tab switches / resizes), same bug class as the waterfall.
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

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
                      <td
                        key={r.period_month}
                        className={`text-right py-2 px-2 tabular-nums whitespace-nowrap ${v < 0 ? "text-muted-foreground" : ""}`}
                      >
                        {fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Cumulative cash flow since first synced month */}
              <tr className="font-semibold text-gold">
                <td
                  className="py-2 pr-4 whitespace-nowrap"
                  title={firstKey ? `Running sum of net cash flow since ${monthKeyLabel(firstKey)}` : undefined}
                >
                  Cumulative{firstKey ? ` (since ${monthKeyLabel(firstKey)})` : ""}
                </td>
                {windowRows.map((r) => (
                  <td key={r.period_month} className="text-right py-2 px-2 tabular-nums whitespace-nowrap">
                    {fmt(cumulativeByMonth.get(monthKey(r.period_month)) ?? 0)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Indirect-method statement derived from the synced Qoyod ledger. Operating =
          operating result + working-capital change + D&amp;A add-back. Financing splits
          equity injections from intercompany movements. Cumulative = running sum of net
          cash flow since the first synced month. Reconciles with the balance-sheet cash
          movement (bs_cash_movement) by construction.
        </p>
      </Card>

      {/* Working capital — LIVE (replaces the former mock panel) */}
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
        </Card>
      )}
    </div>
  );
};
