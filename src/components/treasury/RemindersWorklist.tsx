// Reminders — dunning worklist (Treasury workspace, sub-tab 3/4).
//
// SCOPE: the prepare→approve queue for the client dunning ladder
// (Treasury-Decision-Rules-DRAFT-2026-07-23 §A.3/§A.5, migration 051's
// v_dunning_worklist_v2). Per Marcello's explicit rule (§A.5 "the core of
// the panel"): the system PREPARES, a human APPROVES, and only THEN would a
// message go out. Sending stays OFF in this build — the buttons record a
// decision (to treasury_action_log, migration 059) and nothing else. No
// email/WhatsApp dispatch happens from this screen.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Send, Pencil, PauseCircle, Clock, HardHat, ShieldAlert, History, Snowflake, ChevronDown, ChevronUp,
} from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ProposedBadge } from "@/components/dashboard/ProposedBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useDunningWorklist, useTreasuryActionLog, useRecordTreasuryAction, type DunningWorklistRow,
} from "@/data/treasuryLive";
import { fmtSAR } from "@/lib/format";

const n = (v: number | null | undefined): number => v ?? 0;
const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);

type ReminderAction = "approve_send" | "edit" | "hold" | "snooze";

const ACTION_META: Record<ReminderAction, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string; ring: string }> = {
  approve_send: { label: "Approve & Send", icon: Send, tone: "text-emerald-400", ring: "border-emerald-500/40 hover:bg-emerald-500/10" },
  edit:         { label: "Edit",           icon: Pencil, tone: "text-sky-400",    ring: "border-sky-500/40 hover:bg-sky-500/10" },
  hold:         { label: "Hold",           icon: PauseCircle, tone: "text-warning", ring: "border-warning/40 hover:bg-warning/10" },
  snooze:       { label: "Snooze",         icon: Clock, tone: "text-gold",        ring: "border-gold/40 hover:bg-gold/10" },
};

const STAGE_TONE: Record<number, string> = {
  1: "text-muted-foreground", 2: "text-warning", 3: "text-amber-400", 4: "text-destructive",
};

export const RemindersWorklist = () => {
  const { session } = useAuth();
  const { toast } = useToast();
  const worklist = useDunningWorklist();
  const log = useTreasuryActionLog("REMINDER");
  const record = useRecordTreasuryAction();

  const rows = useMemo<DunningWorklistRow[]>(() => (worklist.data?.available ? worklist.data.rows : []), [worklist.data]);
  const decided = useMemo(() => {
    const m = new Map<string, string>();
    if (log.data?.available) for (const r of log.data.rows) if (!m.has(r.entity_ref)) m.set(r.entity_ref, r.action);
    return m;
  }, [log.data]);

  const active = useMemo(() => rows.filter((r) => !r.is_blocked), [rows]);
  const blocked = useMemo(() => rows.filter((r) => r.is_blocked), [rows]);
  const [showBlocked, setShowBlocked] = useState(false);

  const [adjust, setAdjust] = useState<{ row: DunningWorklistRow; kind: ReminderAction } | null>(null);
  const [note, setNote] = useState("");
  const [snoozeDate, setSnoozeDate] = useState("");

  const actorEmail = session?.user?.email ?? null;

  const doRecord = (row: DunningWorklistRow, kind: ReminderAction, opts?: { reason?: string; snoozeUntil?: string }) => {
    record.mutate(
      {
        domain: "REMINDER",
        entity_ref: row.qoyod_invoice_id,
        action: kind,
        actor: actorEmail,
        reason: opts?.reason,
        payload: {
          customer_name: row.customer_name,
          invoice_number: row.invoice_number,
          residual_amount: row.residual_amount,
          dunning_stage: row.dunning_stage,
          snooze_until: opts?.snoozeUntil,
        },
      },
      {
        onSuccess: () =>
          toast({
            title: ACTION_META[kind].label + " recorded",
            description: "Sending activates at go-live — nothing was sent. Decision logged to the audit trail.",
          }),
        onError: (err) => toast({ title: "Could not record decision", description: String(err), variant: "destructive" }),
      },
    );
  };

  const onQuick = (row: DunningWorklistRow, kind: ReminderAction) => {
    if (kind === "approve_send") { doRecord(row, kind); return; }
    setAdjust({ row, kind });
    setNote("");
    setSnoozeDate("");
  };

  const confirmAdjust = () => {
    if (!adjust) return;
    doRecord(adjust.row, adjust.kind, { reason: note || undefined, snoozeUntil: adjust.kind === "snooze" ? snoozeDate || undefined : undefined });
    setAdjust(null);
  };

  const ready = worklist.data?.available === true;
  const stageCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of active) m.set(r.dunning_stage, (m.get(r.dunning_stage) ?? 0) + 1);
    return m;
  }, [active]);
  const totalResidual = useMemo(() => active.reduce((s, r) => s + n(r.residual_amount), 0), [active]);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <strong>Sending activates at go-live.</strong> The system prepares each reminder; a human approves
          from this queue. Buttons here only record the decision — no email/WhatsApp is dispatched by this
          build (Treasury-Decision-Rules §A.5). Cadences, stage boundaries and channel are all
          <ProposedBadge className="ml-1.5" detail="§A.2/§A.3/§Decisions-needed #5-6." />
        </span>
      </div>

      {worklist.isError ? (
        <Card className="p-6"><p className="text-sm text-destructive">
          {(worklist.error as Error | null)?.name === "PermissionDeniedError"
            ? (worklist.error as Error).message
            : "Could not load the dunning worklist from Supabase."}
        </p></Card>
      ) : !ready ? (
        <Card className="p-8 text-center space-y-3 animate-fade-in">
          <HardHat className="h-7 w-7 mx-auto text-gold/70" />
          <h3 className="text-lg font-heading tracking-wide">REMINDERS — NOT YET AVAILABLE</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The dunning worklist (<code className="text-xs">v_dunning_worklist_v2</code>) is not yet mirrored.
            This queue will populate automatically once the data lands.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card className="p-4 border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Active queue</div>
              <div className="mt-1 text-xl font-heading tabular-nums">{active.length}</div>
              <div className="text-xs text-muted-foreground">{fmt(totalResidual)} SAR</div>
            </Card>
            {[1, 2, 3, 4].map((stage) => (
              <Card key={stage} className="p-4 border-border">
                <div className={`text-xs uppercase tracking-wider ${STAGE_TONE[stage]}`}>
                  {stage === 1 ? "1-30d" : stage === 2 ? "31-60d" : stage === 3 ? "61-90d" : "90+d"}
                </div>
                <div className="mt-1 text-xl font-heading tabular-nums">{stageCounts.get(stage) ?? 0}</div>
              </Card>
            ))}
          </div>

          {active.length === 0 ? (
            <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">
              Nothing in the active reminder queue right now.
            </p></Card>
          ) : (
            <Card className="p-6 shadow-sm animate-fade-in">
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h3 className="text-xl font-heading tracking-wide">PREPARE → APPROVE QUEUE</h3>
                <DataSourceBadge source="live" />
                <span className="text-xs text-muted-foreground">Supabase · v_dunning_worklist_v2 · SAR</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Sorted most-overdue first. Legacy 2020-2021 invoices never appear here — see Receivables →
                Legacy pool.
              </p>
              <ScrollHint>
                <table className="w-full min-w-[920px] text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                      <th className="text-left py-1 pr-2 font-semibold">Customer</th>
                      <th className="text-left py-1 px-2 font-semibold">Invoice</th>
                      <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Residual SAR</th>
                      <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Overdue</th>
                      <th className="text-left py-1 px-2 font-semibold">Stage</th>
                      <th className="text-left py-1 px-2 font-semibold">Suggested action</th>
                      <th className="text-right py-1 pl-2 font-semibold">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.map((r) => {
                      const already = decided.get(r.qoyod_invoice_id);
                      return (
                        <tr key={r.qoyod_invoice_id} className="border-b border-border/10">
                          <td className="py-2 pr-2 max-w-[180px] truncate" title={r.customer_name ?? ""}>{r.customer_name ?? "—"}</td>
                          <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{r.invoice_number ?? "—"}</td>
                          <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">{fmt(n(r.residual_amount))}</td>
                          <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">{n(r.days_overdue)}d</td>
                          <td className={`py-2 px-2 whitespace-nowrap ${STAGE_TONE[r.dunning_stage]}`}>{r.dunning_stage_label}</td>
                          <td className="py-2 px-2 max-w-[260px] truncate text-xs text-muted-foreground" title={r.suggested_action ?? ""}>
                            {r.suggested_action ?? "—"}
                          </td>
                          <td className="py-2 pl-2">
                            {already ? (
                              <div className="flex items-center justify-end gap-2">
                                <span className={`text-xs font-semibold ${ACTION_META[already as ReminderAction]?.tone ?? ""}`}>
                                  {ACTION_META[already as ReminderAction]?.label ?? already}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-1 flex-wrap">
                                {(Object.keys(ACTION_META) as ReminderAction[]).map((k) => {
                                  const m = ACTION_META[k];
                                  return (
                                    <Button key={k} variant="outline" size="sm"
                                      className={`h-7 px-2 gap-1 text-[11px] ${m.ring}`}
                                      disabled={record.isPending}
                                      onClick={() => onQuick(r, k)} title={m.label}>
                                      <m.icon className={`h-3.5 w-3.5 ${m.tone}`} />
                                      <span className="hidden xl:inline">{m.label}</span>
                                    </Button>
                                  );
                                })}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollHint>
            </Card>
          )}

          {blocked.length > 0 && (
            <Card className="p-4 shadow-sm animate-fade-in">
              <button
                type="button"
                onClick={() => setShowBlocked((v) => !v)}
                className="flex w-full items-center justify-between text-left"
              >
                <span className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Snowflake className="h-4 w-4" /> Excluded from active dunning ({blocked.length}) — old / paused / resolved / escalated
                </span>
                {showBlocked ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {showBlocked && (
                <ScrollHint className="mt-3">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                        <th className="text-left py-1 pr-2 font-semibold">Customer</th>
                        <th className="text-left py-1 px-2 font-semibold">Invoice</th>
                        <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Residual SAR</th>
                        <th className="text-left py-1 pl-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blocked.map((r) => (
                        <tr key={r.qoyod_invoice_id} className="border-b border-border/10">
                          <td className="py-1.5 pr-2 max-w-[180px] truncate" title={r.customer_name ?? ""}>{r.customer_name ?? "—"}</td>
                          <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{r.invoice_number ?? "—"}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{fmt(n(r.residual_amount))}</td>
                          <td className="py-1.5 pl-2 text-muted-foreground capitalize">{r.effective_status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollHint>
              )}
            </Card>
          )}
        </>
      )}

      {/* Decision log */}
      {log.data?.available && log.data.rows.length > 0 && (
        <Card className="p-6 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h3 className="text-lg font-heading tracking-wide">DECISION LOG</h3>
            <History className="h-4 w-4 text-gold" />
          </div>
          <ScrollHint>
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="text-left py-1 pr-2 font-semibold">When</th>
                  <th className="text-left py-1 px-2 font-semibold">Actor</th>
                  <th className="text-left py-1 px-2 font-semibold">Invoice</th>
                  <th className="text-left py-1 pl-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {log.data.rows.slice(0, 20).map((d) => (
                  <tr key={d.id} className="border-b border-border/10">
                    <td className="py-1.5 pr-2 text-muted-foreground whitespace-nowrap">{new Date(d.occurred_at).toLocaleString()}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap">{d.actor ?? "—"}</td>
                    <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{d.entity_ref}</td>
                    <td className="py-1.5 pl-2 font-semibold">{ACTION_META[d.action as ReminderAction]?.label ?? d.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollHint>
        </Card>
      )}

      <Dialog open={!!adjust} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {adjust && (() => { const M = ACTION_META[adjust.kind].icon; return <M className={`h-4 w-4 ${ACTION_META[adjust.kind].tone}`} />; })()}
              {adjust ? ACTION_META[adjust.kind].label : ""} — {adjust?.row.customer_name}
            </DialogTitle>
            <DialogDescription>
              {adjust?.kind === "edit" && "Note what needs changing before this reminder goes out. Nothing is sent from here."}
              {adjust?.kind === "hold" && "Hold this reminder and record why. Nothing is sent."}
              {adjust?.kind === "snooze" && "Push the next reminder to a later date."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {adjust?.kind === "snooze" && (
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Snooze until</label>
                <Input type="date" value={snoozeDate} onChange={(e) => setSnoozeDate(e.target.value)} className="mt-1" />
              </div>
            )}
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                {adjust?.kind === "hold" ? "Reason" : "Note (optional)"}
              </label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjust(null)}>Cancel</Button>
            <Button onClick={confirmAdjust} disabled={record.isPending}>Record decision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
