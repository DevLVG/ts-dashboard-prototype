// CASH FORECAST — standalone page (route /cash-forecast).
//
// Handbook package job (2026-08-07): v_cash_forecast_13w and
// v_cash_forecast_monthly (migration 045) existed live with real data since
// they were built, but nothing in the cockpit ever read them — grepped src/
// end to end, zero references. This page is the first consumer.
//
// Standalone route component (fix-1-nav pattern, see ReportPage.tsx /
// ConfirmationsPage.tsx): its own role gate + its own <DashboardNav/> mount.
// Read-only — no write path exists or is added here.
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { HardHat, TrendingUp, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { resolveRole, landingPageFor } from "@/lib/roles";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { useCashForecast13w, useCashForecastMonthly } from "@/data/forecastLive";
import { fmtSAR } from "@/lib/format";

const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

type Horizon = "13w" | "12m";

export const CashForecastPage = () => {
  const { session, loading: authLoading } = useAuth();
  const role = resolveRole(session?.user?.email);
  // Leveredge + CEO + Administration — same three roles the "Cash Flow" page
  // grants (roles.ts), since this is a forward extension of that same cash
  // view, not a new sensitivity class.
  const allowed = role === "leveredge" || role === "ceo" || role === "administration";

  const [horizon, setHorizon] = useState<Horizon>("13w");
  const weekly = useCashForecast13w();
  const monthly = useCashForecastMonthly();

  if (authLoading) return null;
  if (!allowed) return <Navigate to={`/${landingPageFor(role)}`} replace />;

  const active = horizon === "13w" ? weekly : monthly;
  const ready = active.data?.available === true;
  const weekRows = weekly.data?.available ? weekly.data.rows : [];
  const monthRows = monthly.data?.available ? monthly.data.rows : [];
  const rows = horizon === "13w" ? weekRows : monthRows;
  const anchor = rows[0];

  const isLoading = horizon === "13w" ? weekly.isLoading && !weekly.data : monthly.isLoading && !monthly.data;
  const isError = horizon === "13w" ? weekly.isError : monthly.isError;

  const lastRow = rows[rows.length - 1];

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav currentPage="cash-forecast" />
      <main className="container mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="font-heading text-2xl tracking-wide text-foreground flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-gold" /> Cash Forecast
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Forward cash position, anchored on the latest live bank balance and rolled forward with the approved
            budget's net cash movement — 13 rolling weeks or 12 full months ahead. Does not include AR/AP-timing
            weighting (budget net is spread evenly across calendar days); see the method note below.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={horizon === "13w" ? "default" : "outline"}
            onClick={() => setHorizon("13w")}
          >
            13-Week
          </Button>
          <Button
            type="button"
            size="sm"
            variant={horizon === "12m" ? "default" : "outline"}
            onClick={() => setHorizon("12m")}
          >
            12-Month
          </Button>
          <DataSourceBadge
            source="live"
            sourceLabel={horizon === "13w" ? "Live data from Supabase (v_cash_forecast_13w)" : "Live data from Supabase (v_cash_forecast_monthly)"}
          />
        </div>

        {isError ? (
          <Card className="p-6">
            <p className="text-sm text-destructive">
              {(active.error as Error | null)?.name === "PermissionDeniedError"
                ? (active.error as Error).message
                : "Could not load the cash forecast from Supabase."}
            </p>
          </Card>
        ) : isLoading ? (
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
        ) : !ready ? (
          <Card className="p-8 text-center space-y-3 animate-fade-in">
            <HardHat className="h-7 w-7 mx-auto text-gold/70" />
            <h3 className="text-lg font-heading tracking-wide">CASH FORECAST — NOT YET AVAILABLE</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              The forecast view is not yet mirrored. This section will populate automatically once it lands.
            </p>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">No forecast rows returned.</p></Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="p-4 border-border">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Anchor date</div>
                <div className="mt-1 text-xl font-heading tabular-nums">{fmtDate(anchor.anchor_date)}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">latest bank_balances sync</div>
              </Card>
              <Card className="p-4 border-border">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Opening cash</div>
                <div className="mt-1 text-xl font-heading tabular-nums">{fmtSAR(anchor.anchor_opening_cash)}</div>
              </Card>
              <Card className="p-4 border-border">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Closing at {horizon === "13w" ? "week 13" : "month 12"}
                </div>
                <div className="mt-1 text-xl font-heading tabular-nums">{fmtSAR(lastRow.closing_balance)}</div>
              </Card>
              <Card className="p-4 border-border">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Net movement, full horizon</div>
                <div className={`mt-1 text-xl font-heading tabular-nums ${lastRow.closing_balance - anchor.anchor_opening_cash >= 0 ? "text-success" : "text-destructive"}`}>
                  {fmtSAR(lastRow.closing_balance - anchor.anchor_opening_cash)}
                </div>
              </Card>
            </div>

            <Card className="p-6 shadow-sm animate-fade-in">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <h3 className="text-lg font-heading tracking-wide">
                  {horizon === "13w" ? "13-WEEK ROLLING FORECAST" : "12-MONTH FORECAST"}
                </h3>
                <Tooltip>
                  <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-gold/80 cursor-help" /></TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm text-xs space-y-1.5">
                    <p>
                      Budget version <strong>{anchor.budget_version}</strong>. Net cash movement = the approved
                      budget's net cash flow for the period (EBITDA + all CF-* lines).
                      {horizon === "13w" && " Each month's net is spread evenly across its calendar days; a week's net is the sum of its 7 daily rates."}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <ScrollHint>
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                      <th className="text-left py-1 pr-2 font-semibold">{horizon === "13w" ? "Week" : "Month"}</th>
                      {horizon === "13w" && <th className="text-left py-1 px-2 font-semibold">Dates</th>}
                      <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Opening SAR</th>
                      <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Net movement SAR</th>
                      <th className="text-right py-1 pl-2 font-semibold whitespace-nowrap">Closing SAR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {horizon === "13w"
                      ? weekRows.map((r) => (
                          <tr key={r.week_no} className="border-b border-border/10">
                            <td className="py-2 pr-2 whitespace-nowrap">Week {r.week_no}</td>
                            <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{fmtDate(r.week_start)} – {fmtDate(r.week_end)}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{fmtSAR(r.opening_balance)}</td>
                            <td className={`py-2 px-2 text-right tabular-nums ${r.net_cash_movement >= 0 ? "text-success" : "text-destructive"}`}>{fmtSAR(r.net_cash_movement)}</td>
                            <td className="py-2 pl-2 text-right tabular-nums font-semibold">{fmtSAR(r.closing_balance)}</td>
                          </tr>
                        ))
                      : monthRows.map((r) => (
                          <tr key={r.month_no} className="border-b border-border/10">
                            <td className="py-2 pr-2 whitespace-nowrap">{r.period_label}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{fmtSAR(r.opening_balance)}</td>
                            <td className={`py-2 px-2 text-right tabular-nums ${r.net_cash_movement >= 0 ? "text-success" : "text-destructive"}`}>{fmtSAR(r.net_cash_movement)}</td>
                            <td className="py-2 pl-2 text-right tabular-nums font-semibold">{fmtSAR(r.closing_balance)}</td>
                          </tr>
                        ))}
                  </tbody>
                </table>
              </ScrollHint>
            </Card>
          </>
        )}
      </main>
    </div>
  );
};

export default CashForecastPage;
