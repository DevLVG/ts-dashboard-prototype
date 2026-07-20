// P&L LIVE monthly table — R1 Tab 1 MVP core.
// Rows = P&L lines (Revenue / COGS / GM / OpEx People / OpEx M&S / OpEx G&A /
// EBITDA / D&A / EBIT), columns = last N months, straight from the Supabase
// view pnl_by_bu (via the shared usePnlByBu query). Each line carries a muted
// "Budget" sub-row from v_budget_monthly (BASE scenario, Jul-2026..Dec-2027):
// months outside that window show "—" (no budget, not zero), and D&A / EBIT
// always show "—" because the approved budget stops at EBITDA. Respects the
// global BU filter. Costs are shown as negatives (natural P&L presentation).
import { Fragment } from "react";
import { Card } from "@/components/ui/card";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import {
  usePnlByBu,
  useBudgetMonthly,
  getLiveMonthlySeries,
  budgetForMonth,
  type LiveMonthlyPoint,
  type LivePLTotals,
} from "@/data/liveData";

interface PnLLiveTableProps {
  /** Live BU code (LIV/HSE/RET/MEM/B2B/COMP/EVT/CORP) or undefined = consolidated */
  buCode?: string;
  buLabel?: string;
  monthsBack?: number;
}

interface LineDef {
  label: string;
  value: (t: LivePLTotals) => number;
  sign: 1 | -1; // -1 = cost line, displayed negative
  emphasis?: boolean;
  indent?: boolean;
  /** No budget exists for this line (budget stops at EBITDA) */
  noBudget?: boolean;
}

const NO_BUDGET_TOOLTIP =
  "No budget for this line — the approved budget (2026-07-16) stops at EBITDA; no D&A or EBIT budget exists.";

// G3 structure (migration 018): the complete P&L, with the true recurring
// EBITDA as headline and the Leveredge/F&F project fees as their own line.
const LINES: LineDef[] = [
  { label: "Revenue", value: (t) => t.revenue, sign: 1, emphasis: true },
  { label: "COGS", value: (t) => t.cogs, sign: -1 },
  { label: "Gross Margin", value: (t) => t.grossMargin, sign: 1, emphasis: true },
  { label: "OpEx — People", value: (t) => t.opexPeople, sign: -1, indent: true },
  { label: "OpEx — Marketing & Sales", value: (t) => t.opexMs, sign: -1, indent: true },
  { label: "OpEx — G&A", value: (t) => t.opexGa, sign: -1, indent: true },
  { label: "Recurring EBITDA", value: (t) => t.ebitda, sign: 1, emphasis: true },
  { label: "Project Costs (LVG/F&F)", value: (t) => t.projectCosts, sign: -1, indent: true },
  { label: "EBITDA incl. Project Costs", value: (t) => t.ebitdaIncl, sign: 1, emphasis: true },
  { label: "D&A", value: (t) => t.da, sign: -1, noBudget: true },
  { label: "EBIT", value: (t) => t.ebitdaIncl - t.da, sign: 1, emphasis: true, noBudget: true },
];

const fmt = (v: number) =>
  v === 0
    ? "—"
    : new Intl.NumberFormat("en-SA", { maximumFractionDigits: 0 }).format(v);

export const PnLLiveTable = ({ buCode, buLabel, monthsBack = 12 }: PnLLiveTableProps) => {
  const { data: rows, isLoading, isError } = usePnlByBu();
  const { data: budgetRows } = useBudgetMonthly();
  const series: LiveMonthlyPoint[] = getLiveMonthlySeries(rows, buCode, monthsBack);
  // LIVE budget per column month (null = month outside the budget window)
  const budgetByMonth: (LivePLTotals | null)[] = series.map((p) =>
    budgetForMonth(budgetRows, p.monthKey, buCode),
  );

  const scope = buCode ? buLabel ?? buCode : "Consolidated";

  return (
    <Card className="p-6 overflow-x-auto shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
      <div className="flex items-center gap-3 mb-6">
        <h3 className="text-xl font-heading tracking-wide">
          P&amp;L MONTHLY — {scope.toUpperCase()}
        </h3>
        <DataSourceBadge source="live" />
        <span className="text-xs text-muted-foreground">
          Supabase · pnl_by_bu + v_budget_monthly · SAR
        </span>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading live P&amp;L…</p>
      )}
      {isError && (
        <p className="text-sm text-destructive">
          Could not load live data from Supabase. Check VITE_SUPABASE_URL /
          VITE_SUPABASE_ANON_KEY.
        </p>
      )}

      {!isLoading && !isError && series.length > 0 && (
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4 font-semibold">SAR</th>
              {series.map((p) => (
                <th key={p.monthKey} className="text-right py-2 px-2 font-semibold whitespace-nowrap">
                  {p.month}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {LINES.map((line) => (
              <Fragment key={line.label}>
                <tr
                  className={
                    line.emphasis
                      ? "border-b border-border/20 font-semibold"
                      : "border-b border-border/10"
                  }
                >
                  <td className={`py-2 pr-4 whitespace-nowrap ${line.indent ? "pl-4 text-muted-foreground" : ""}`}>
                    {line.label}
                  </td>
                  {series.map((p) => {
                    const raw = line.value(p.actual) * line.sign;
                    return (
                      <td
                        key={p.monthKey}
                        className={`text-right py-2 px-2 tabular-nums whitespace-nowrap ${
                          raw < 0 ? "text-muted-foreground" : ""
                        }`}
                      >
                        {fmt(raw)}
                      </td>
                    );
                  })}
                </tr>
                <tr
                  className={`text-xs text-muted-foreground ${
                    line.emphasis ? "border-b border-border/60" : "border-b border-border/30"
                  }`}
                >
                  <td className={`pb-2 pr-4 whitespace-nowrap ${line.indent ? "pl-8" : "pl-4"}`}>
                    Budget
                  </td>
                  {series.map((p, i) => {
                    const budget = budgetByMonth[i];
                    const noValue = line.noBudget || budget === null;
                    const title = line.noBudget
                      ? NO_BUDGET_TOOLTIP
                      : budget === null
                        ? "No budget for this month — the approved budget covers Jul-2026 to Dec-2027."
                        : undefined;
                    return (
                      <td
                        key={p.monthKey}
                        className="text-right pb-2 px-2 tabular-nums whitespace-nowrap"
                        title={title}
                      >
                        {noValue ? "—" : fmt(line.value(budget!) * line.sign)}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Actuals synced from Qoyod — since migration 018 the COMPLETE P&amp;L
        (invoices + bills + manual journal entries, incl. payroll and JE-paid
        costs). Recurring EBITDA = pre Project Costs; the Leveredge/F&amp;F fees
        (TPC, planned as GA-NRP in the budget) sit on their own line below it.
        Budget rows <DataSourceBadge source="live" className="mx-0.5" /> come
        from Supabase v_budget_monthly (BASE scenario approved 2026-07-16,
        Jul-2026 → Dec-2027); months outside that window and D&amp;A/EBIT lines
        show "—" — the budget stops at EBITDA. Revenue is gross of credit notes;
        Draft invoices pending posting are excluded.
      </p>
    </Card>
  );
};
