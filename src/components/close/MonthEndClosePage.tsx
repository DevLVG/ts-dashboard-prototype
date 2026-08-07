// MONTH-END CLOSE ASSISTANT — standalone page (route /month-close).
//
// Handbook package job (2026-08-07): v_monthly_close_status (migration 042,
// over monthly_close_tasks) existed live with real data (15 tasks for the
// current period) but had zero UI — only a code COMMENT mentioning
// "month-end close" existed in data/liveData.ts, no component, no route.
// This page is the first consumer, STRICTLY read-only: it shows the
// checklist state. Changing a task's status (done/blocked/in_progress) is a
// write action deliberately NOT built here — the migration's own header
// notes that's expected to route through a future role-based panel, out of
// scope for this job (read-only display only, per the brief).
import { Navigate } from "react-router-dom";
import { HardHat, ClipboardCheck, CheckCircle2, TriangleAlert, CircleDot, MinusCircle, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { resolveRole, landingPageFor } from "@/lib/roles";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { useMonthlyCloseStatus, type CloseLight, type MonthlyCloseTaskRow } from "@/data/monthlyCloseLive";

const LIGHT_META: Record<CloseLight, { label: string; tone: string; chip: string; icon: React.ComponentType<{ className?: string }> }> = {
  green: { label: "Done", tone: "text-success", chip: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  amber: { label: "In progress", tone: "text-warning", chip: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: CircleDot },
  red: { label: "Overdue / blocked", tone: "text-destructive", chip: "bg-red-500/15 text-red-400 border-red-500/30", icon: XCircle },
  grey: { label: "N/A", tone: "text-muted-foreground", chip: "bg-muted text-muted-foreground border-border", icon: MinusCircle },
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
  na: "N/A",
};

const BLOCK_LABEL: Record<string, string> = {
  A: "A — Postings completeness",
  B: "B — Anomaly checks",
  C: "C — Trial balance",
  D: "D — Reconcile CLEVER vs Qoyod",
  E: "E — Statements & management report",
  F: "F — Review exceptions",
  G: "G — Sign-off, logged",
};

const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const periodLabel = (p: string) => new Date(p + "T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export const MonthEndClosePage = () => {
  const { session, loading: authLoading } = useAuth();
  const role = resolveRole(session?.user?.email);
  // Leveredge + CEO + Administration — same group as Treasury/Confirmations
  // (roles.ts): close-process VISIBILITY (not payroll-sensitive detail like
  // Accruals) is reasonable for Trio's own finance staff too. First-pass
  // call, proposed — confirm with Marcello/Luca.
  const allowed = role === "leveredge" || role === "ceo" || role === "administration";

  const close = useMonthlyCloseStatus();

  if (authLoading) return null;
  if (!allowed) return <Navigate to={`/${landingPageFor(role)}`} replace />;

  const ready = close.data?.available === true;
  const isLoading = close.isLoading && !close.data;
  const isError = close.isError;
  const rows: MonthlyCloseTaskRow[] = close.data?.available ? close.data.rows : [];
  const first = rows[0];

  const byBlock = new Map<string, MonthlyCloseTaskRow[]>();
  for (const r of rows) {
    const list = byBlock.get(r.block) ?? [];
    list.push(r);
    byBlock.set(r.block, list);
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav currentPage="month-close" />
      <main className="container mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="font-heading text-2xl tracking-wide text-foreground flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-gold" /> Month-End Close Assistant
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            The 15-task monthly closing checklist (Trio Sporting Monthly Closing SOP, Blocks A-G), tracked state —
            who owns each step, due date, and whether it's overdue. Display only: today the SOP is a paper process
            with the Coordinator/accountants updating status elsewhere; changing a task's status here is a future
            write surface, not built in this job.
          </p>
        </div>

        {isError ? (
          <Card className="p-6">
            <p className="text-sm text-destructive">
              {(close.error as Error | null)?.name === "PermissionDeniedError"
                ? (close.error as Error).message
                : "Could not load the month-end close status from Supabase."}
            </p>
          </Card>
        ) : isLoading ? (
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
        ) : !ready ? (
          <Card className="p-8 text-center space-y-3 animate-fade-in">
            <HardHat className="h-7 w-7 mx-auto text-gold/70" />
            <h3 className="text-lg font-heading tracking-wide">MONTH-END CLOSE — NOT YET AVAILABLE</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              The close-status view is not yet mirrored. This section will populate automatically once it lands.
            </p>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">No checklist rows returned.</p></Card>
        ) : (
          <>
            <Card className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Closing period</div>
                  <div className="text-xl font-heading">{periodLabel(first.period)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-bold uppercase tracking-wider border ${LIGHT_META[first.overall_light].chip}`}>
                    {(() => { const Icon = LIGHT_META[first.overall_light].icon; return <Icon className="h-3.5 w-3.5" />; })()}
                    {first.overall_light === "green" ? "Complete" : first.overall_light === "red" ? "Attention needed" : "In progress"}
                  </span>
                  <DataSourceBadge source="live" sourceLabel="Live data from Supabase (v_monthly_close_status)" />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Progress</div>
                  <div className="text-lg font-heading tabular-nums">{first.done_tasks}/{first.total_tasks} · {first.pct_complete}%</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Blocked</div>
                  <div className={`text-lg font-heading tabular-nums ${first.blocked_tasks > 0 ? "text-destructive" : ""}`}>{first.blocked_tasks}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Overdue</div>
                  <div className={`text-lg font-heading tabular-nums ${rows.filter((r) => r.is_overdue).length > 0 ? "text-destructive" : ""}`}>
                    {rows.filter((r) => r.is_overdue).length}
                  </div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Tasks</div>
                  <div className="text-lg font-heading tabular-nums">{first.total_tasks}</div>
                </div>
              </div>
            </Card>

            {Array.from(byBlock.entries()).map(([block, items]) => (
              <Card key={block} className="p-6 shadow-sm animate-fade-in">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {BLOCK_LABEL[block] ?? `Block ${block}`}
                </h3>
                <ScrollHint>
                  <table className="w-full min-w-[820px] text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                        <th className="text-left py-1 pr-2 font-semibold">Task</th>
                        <th className="text-left py-1 px-2 font-semibold">Owner</th>
                        <th className="text-center py-1 px-2 font-semibold">Status</th>
                        <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Due</th>
                        <th className="text-left py-1 pl-2 font-semibold">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((t) => {
                        const meta = LIGHT_META[t.task_light];
                        const Icon = meta.icon;
                        return (
                          <tr key={t.task_key} className="border-b border-border/10 align-top">
                            <td className="py-2 pr-2 max-w-[340px]">
                              <div className="font-medium">{t.task_key}</div>
                              <div className="text-xs text-muted-foreground">{t.description}</div>
                            </td>
                            <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{t.owner}</td>
                            <td className="py-2 px-2 text-center">
                              <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${meta.chip}`}>
                                <Icon className="h-3 w-3" /> {STATUS_LABEL[t.status] ?? t.status}
                              </span>
                            </td>
                            <td className={`py-2 px-2 text-right whitespace-nowrap ${t.is_overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                              {fmtDate(t.due_date)}{t.is_overdue && " · overdue"}
                            </td>
                            <td className="py-2 pl-2 text-xs text-muted-foreground">
                              {t.notes ?? "—"}
                              {t.completed_at && <div className="text-[10px] mt-0.5">done {new Date(t.completed_at).toLocaleDateString()} by {t.completed_by ?? "—"}</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollHint>
              </Card>
            ))}
          </>
        )}
      </main>
    </div>
  );
};

export default MonthEndClosePage;
