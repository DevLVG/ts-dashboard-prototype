// P&L LIVE monthly table — R1 Tab 1 MVP core.
// Rows = P&L lines (Revenue / COGS / GM / OpEx People / OpEx M&S / OpEx G&A /
// EBITDA / D&A / EBIT), columns = last N months, straight from the Supabase
// view pnl_by_bu (via the shared usePnlByBu query). Respects the global BU
// filter. Costs are shown as negatives (natural P&L presentation).
import { Card } from "@/components/ui/card";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import {
  usePnlByBu,
  getLiveMonthlySeries,
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
}

const LINES: LineDef[] = [
  { label: "Revenue", value: (t) => t.revenue, sign: 1, emphasis: true },
  { label: "COGS", value: (t) => t.cogs, sign: -1 },
  { label: "Gross Margin", value: (t) => t.grossMargin, sign: 1, emphasis: true },
  { label: "OpEx — People", value: (t) => t.opexPeople, sign: -1, indent: true },
  { label: "OpEx — Marketing & Sales", value: (t) => t.opexMs, sign: -1, indent: true },
  { label: "OpEx — G&A", value: (t) => t.opexGa, sign: -1, indent: true },
  { label: "EBITDA", value: (t) => t.ebitda, sign: 1, emphasis: true },
  { label: "D&A", value: (t) => t.da, sign: -1 },
  { label: "EBIT", value: (t) => t.ebitda - t.da, sign: 1, emphasis: true },
];

const fmt = (v: number) =>
  v === 0
    ? "—"
    : new Intl.NumberFormat("en-SA", { maximumFractionDigits: 0 }).format(v);

export const PnLLiveTable = ({ buCode, buLabel, monthsBack = 12 }: PnLLiveTableProps) => {
  const { data: rows, isLoading, isError } = usePnlByBu();
  const series: LiveMonthlyPoint[] = getLiveMonthlySeries(rows, buCode, monthsBack);

  const scope = buCode ? buLabel ?? buCode : "Consolidated";

  return (
    <Card className="p-6 overflow-x-auto shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
      <div className="flex items-center gap-3 mb-6">
        <h3 className="text-xl font-heading tracking-wide">
          P&amp;L MONTHLY — {scope.toUpperCase()}
        </h3>
        <DataSourceBadge source="live" />
        <span className="text-xs text-muted-foreground">
          Supabase · pnl_by_bu · SAR
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
              <tr
                key={line.label}
                className={
                  line.emphasis
                    ? "border-b border-border/60 font-semibold"
                    : "border-b border-border/30"
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
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Actuals synced from Qoyod. Costs (COGS/OpEx) appear only where bill
        line-items carry MoA tags; D&amp;A derives from depreciation journal
        entries (503xx accounts). Budget comparatives are not shown here —
        budget table not yet populated.
      </p>
    </Card>
  );
};
