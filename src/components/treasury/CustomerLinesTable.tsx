// CUSTOMER LINES TABLE — the debtors desk (Marcello's spec, item 4). Per
// customer: amount, % of the total book, aging summary, dunning STATUS
// chip, and a "Send reminder" action button. This is where the old
// Reminders tab's job now lives (Marcello: "one operational surface, not
// two") — the invoice-level approve/edit/hold/snooze worklist is retired in
// favour of this customer-level ladder, which is what the mandate actually
// specifies.
//
// LADDER (Marcello, 2026-08-03 cadence — see src/lib/dunningLadder.ts for
// the state machine): Stage 1 first reminder -> Stage 2 after
// dunning_config.stage2_after_days (default 7) with no payment/response ->
// Stage 3 after stage3_after_days (default 30, "after 1 month") with a
// firmer template -> automatic "Escalate to CEO" after escalate_grace_days
// with still no resolution. State is derived from treasury_action_log
// (domain DUNNING_CUSTOMER, migration 070) — see dunningLadder.ts header.
//
// SEND GOVERNANCE: the button always records the decision + advances the
// status (treasury_action_log insert). Real dispatch only happens when
// dunning_config.dunning_send_enabled is true (src/lib/dunningSend.ts) —
// with it false (the default, and the only state until Marcello/Arwa arm
// go-live) every click still fully exercises the mechanism end-to-end
// except the network call.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, ShieldAlert, CheckCircle2, Clock, Users, MailX } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { AgingMiniBar } from "@/components/treasury/AgingMiniBar";
import { ReminderTemplateModal } from "@/components/treasury/ReminderTemplateModal";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { type AgingBucket, type ArAgingRow } from "@/data/statementsLive";
import {
  useCustomerContacts, useDunningConfig, useTreasuryActionLog, useRecordTreasuryAction,
} from "@/data/treasuryLive";
import {
  deriveLadderState, ladderConfigFromDb, nextAction, computeLadderStatus, isEscalationDue,
  type LadderState,
} from "@/lib/dunningLadder";
import { fillCustomerTemplate, CUSTOMER_TEMPLATE_LABEL, type CustomerTemplateStage } from "@/data/dunningTemplates";
import { sendDunningEmail, type DunningSendResult } from "@/lib/dunningSend";
import { fmtSAR } from "@/lib/format";

const n = (v: number | null | undefined): number => v ?? 0;
const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);
const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

interface CustomerAgg {
  customerId: string;
  customerName: string;
  amount: number;
  invoiceCount: number;
  amountsByBucket: Partial<Record<AgingBucket, number>>;
  maxDaysOverdue: number;
  oldestInvoiceNumber: string;
}

const STAGE_CHIP: Record<number, string> = {
  1: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  2: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  3: "border-orange-500/40 bg-orange-500/10 text-orange-400",
};

export const CustomerLinesTable = ({ rows }: { rows: ArAgingRow[] }) => {
  const { session } = useAuth();
  const { toast } = useToast();

  const aggregates = useMemo<CustomerAgg[]>(() => {
    const m = new Map<string, CustomerAgg>();
    for (const r of rows) {
      const id = String(r.customer_id ?? r.customer_name ?? "unknown");
      const amt = n(r.residual_amount);
      const days = n(r.days_overdue);
      let agg = m.get(id);
      if (!agg) {
        agg = { customerId: id, customerName: r.customer_name ?? "—", amount: 0, invoiceCount: 0, amountsByBucket: {}, maxDaysOverdue: 0, oldestInvoiceNumber: r.invoice_number ?? "—" };
        m.set(id, agg);
      }
      agg.amount += amt;
      agg.invoiceCount += 1;
      agg.amountsByBucket[r.aging_bucket] = (agg.amountsByBucket[r.aging_bucket] ?? 0) + amt;
      if (days >= agg.maxDaysOverdue) { agg.maxDaysOverdue = days; agg.oldestInvoiceNumber = r.invoice_number ?? agg.oldestInvoiceNumber; }
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const totalBook = useMemo(() => aggregates.reduce((s, a) => s + a.amount, 0), [aggregates]);
  const customerIds = useMemo(() => aggregates.map((a) => a.customerId), [aggregates]);

  const contacts = useCustomerContacts(customerIds);
  const dunningConfig = useDunningConfig();
  const log = useTreasuryActionLog("DUNNING_CUSTOMER");
  const record = useRecordTreasuryAction();

  const cfg = useMemo(() => ladderConfigFromDb(dunningConfig.data?.available ? dunningConfig.data.rows[0] : undefined, 3), [dunningConfig.data]);
  const sendEnabled = dunningConfig.data?.available ? (dunningConfig.data.rows[0]?.dunning_send_enabled ?? false) : false;
  const testRecipient = dunningConfig.data?.available ? (dunningConfig.data.rows[0]?.test_send_recipient ?? "analyst@leveredge.pro") : "analyst@leveredge.pro";

  const now = useMemo(() => new Date(), []);
  const ladderStates = useMemo(() => {
    const byEntity = new Map<string, { action: string; occurred_at: string; reason?: string | null }[]>();
    if (log.data?.available) {
      for (const r of log.data.rows) {
        const arr = byEntity.get(r.entity_ref) ?? [];
        arr.push({ action: r.action, occurred_at: r.occurred_at, reason: r.reason });
        byEntity.set(r.entity_ref, arr);
      }
    }
    const out = new Map<string, LadderState>();
    for (const [id, entries] of byEntity) out.set(id, deriveLadderState(entries));
    return out;
  }, [log.data]);

  const [sendTarget, setSendTarget] = useState<{ agg: CustomerAgg; stage: CustomerTemplateStage } | null>(null);
  const [lastResult, setLastResult] = useState<DunningSendResult | null>(null);
  const [noteTarget, setNoteTarget] = useState<{ agg: CustomerAgg; kind: "escalate_ceo" | "resolved" } | null>(null);
  const [note, setNote] = useState("");

  const actorEmail = session?.user?.email ?? null;

  const openSend = (agg: CustomerAgg, stage: CustomerTemplateStage) => {
    setLastResult(null);
    setSendTarget({ agg, stage });
  };

  const confirmSend = async () => {
    if (!sendTarget) return;
    const { agg, stage } = sendTarget;
    const email = contacts.data?.get(agg.customerId)?.email ?? null;
    const filled = fillCustomerTemplate(stage, {
      customerName: agg.customerName, amount: agg.amount, invoiceCount: agg.invoiceCount,
      oldestInvoiceNumber: agg.oldestInvoiceNumber, daysOverdue: agg.maxDaysOverdue,
    });
    const result = await sendDunningEmail({
      kind: "customer", entityRef: agg.customerId, to: email, subject: filled.subject, body: filled.body,
      sendEnabled, testRecipient,
    });
    record.mutate(
      {
        domain: "DUNNING_CUSTOMER", entity_ref: agg.customerId, action: `stage${stage}_sent`, actor: actorEmail,
        payload: {
          customer_name: agg.customerName, amount: agg.amount, invoice_count: agg.invoiceCount,
          template_label: CUSTOMER_TEMPLATE_LABEL[stage], recipient_email: email, send_result: result,
        },
      },
      {
        onSuccess: () => toast({ title: `${CUSTOMER_TEMPLATE_LABEL[stage]} recorded`, description: result.detail }),
        onError: (err) => toast({ title: "Could not record decision", description: String(err), variant: "destructive" }),
      },
    );
  };

  const sendTest = async () => {
    if (!sendTarget) return;
    const { agg, stage } = sendTarget;
    const filled = fillCustomerTemplate(stage, {
      customerName: agg.customerName, amount: agg.amount, invoiceCount: agg.invoiceCount,
      oldestInvoiceNumber: agg.oldestInvoiceNumber, daysOverdue: agg.maxDaysOverdue,
    });
    const result = await sendDunningEmail({
      kind: "customer", entityRef: agg.customerId, to: contacts.data?.get(agg.customerId)?.email ?? null,
      subject: filled.subject, body: filled.body, sendEnabled, testMode: true, testRecipient,
    });
    setLastResult(result);
  };

  const openNote = (agg: CustomerAgg, kind: "escalate_ceo" | "resolved") => {
    setNote("");
    setNoteTarget({ agg, kind });
  };

  const confirmNote = () => {
    if (!noteTarget) return;
    const { agg, kind } = noteTarget;
    record.mutate(
      { domain: "DUNNING_CUSTOMER", entity_ref: agg.customerId, action: kind, actor: actorEmail, reason: note || undefined, payload: { customer_name: agg.customerName, amount: agg.amount } },
      {
        onSuccess: () => toast({ title: kind === "resolved" ? "Marked resolved" : "Escalated to CEO", description: "Logged to the audit trail." }),
        onError: (err) => toast({ title: "Could not record decision", description: String(err), variant: "destructive" }),
      },
    );
    setNoteTarget(null);
  };

  const ceoAttention = aggregates.filter((a) => isEscalationDue(ladderStates.get(a.customerId) ?? { stage: 0, stage1At: null, stage2At: null, stage3At: null, lastActionAt: null, lastReason: null, escalatedManually: false, escalatedAt: null, resolved: false, resolvedAt: null }, cfg, now));

  return (
    <Card className="p-6 shadow-sm animate-fade-in">
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h3 className="text-xl font-heading tracking-wide">CUSTOMER LINES — DEBTORS</h3>
        <DataSourceBadge source="live" />
        <span className="text-xs text-muted-foreground">Supabase · ar_aging_v2 + treasury_action_log · SAR</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        {aggregates.length} customers, {fmt(totalBook)} SAR open. Reminder ladder per Marcello's cadence — 1st
        reminder, 2nd after {cfg.stage2AfterDays} days, 3rd (firm) after {cfg.stage3AfterDays} more days, then
        automatic CEO escalation after {cfg.escalateGraceDays} more days with no resolution.
      </p>

      {ceoAttention.length > 0 && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-destructive mb-2 inline-flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> CEO attention ({ceoAttention.length})
          </p>
          <ul className="space-y-1 text-sm">
            {ceoAttention.map((a) => (
              <li key={a.customerId} className="flex items-center justify-between gap-2">
                <span className="truncate">{a.customerName}</span>
                <span className="tabular-nums text-destructive font-medium">{fmt(a.amount)} SAR</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ScrollHint>
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <th className="text-left py-1 pr-2 font-semibold">Customer</th>
              <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Amount SAR</th>
              <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">% of book</th>
              <th className="text-left py-1 px-2 font-semibold">Aging summary</th>
              <th className="text-left py-1 px-2 font-semibold">Status</th>
              <th className="text-right py-1 pl-2 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {aggregates.map((a) => {
              const state = ladderStates.get(a.customerId) ?? { stage: 0, stage1At: null, stage2At: null, stage3At: null, lastActionAt: null, lastReason: null, escalatedManually: false, escalatedAt: null, resolved: false, resolvedAt: null };
              const status = computeLadderStatus(state, cfg, now);
              const next = nextAction(state, cfg);
              const email = contacts.data?.get(a.customerId)?.email ?? null;
              const pct = totalBook > 0.5 ? (a.amount / totalBook) * 100 : 0;
              const eligible = next.eligibleAt === null || next.eligibleAt <= now;

              return (
                <tr key={a.customerId} className="border-b border-border/10 align-top">
                  <td className="py-2 pr-2 max-w-[200px]">
                    <div className="truncate font-medium" title={a.customerName}>{a.customerName}</div>
                    <div className="text-[11px] text-muted-foreground">{a.invoiceCount} invoice{a.invoiceCount === 1 ? "" : "s"}</div>
                    {!email && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 mt-0.5">
                        <MailX className="h-2.5 w-2.5" /> No email on file
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap font-medium">{fmt(a.amount)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{pct.toFixed(1)}%</td>
                  <td className="py-2 px-2"><AgingMiniBar amountsByBucket={a.amountsByBucket} total={a.amount} /></td>
                  <td className="py-2 px-2">
                    {status.kind === "resolved" && (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold border border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" /> Resolved
                      </span>
                    )}
                    {status.kind === "escalate" && (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold border border-destructive/40 bg-destructive/10 text-destructive">
                        <ShieldAlert className="h-3 w-3" /> Escalate to CEO
                      </span>
                    )}
                    {status.kind === "not_started" && (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold border border-border bg-muted/20 text-muted-foreground">
                        Not yet reminded
                      </span>
                    )}
                    {status.kind === "stage_sent" && (
                      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold border ${STAGE_CHIP[status.stage] ?? ""}`}>
                        {status.stage === 1 ? "1st" : status.stage === 2 ? "2nd" : "3rd"} reminder sent ({fmtDate(status.at)}){status.stage === 3 ? " — firm" : ""}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pl-2">
                    <div className="flex flex-col items-end gap-1">
                      {status.kind !== "resolved" && next.nextStage && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm" variant="outline" disabled={!eligible}
                                className="h-7 px-2 gap-1 text-[11px] border-gold/40 hover:bg-gold/10"
                                onClick={() => openSend(a, next.nextStage as CustomerTemplateStage)}
                              >
                                <Send className="h-3.5 w-3.5 text-gold" />
                                Send {next.nextStage === 1 ? "1st" : next.nextStage === 2 ? "2nd" : "3rd"} reminder
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {!eligible && (
                            <TooltipContent side="left" className="max-w-xs text-xs">
                              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Available from {fmtDate(next.eligibleAt)} — Marcello's cadence gate.</span>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      )}
                      {status.kind !== "resolved" && (
                        <div className="flex gap-1">
                          {status.kind !== "escalate" && (
                            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-destructive hover:bg-destructive/10" onClick={() => openNote(a, "escalate_ceo")}>
                              Escalate now
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px] text-muted-foreground hover:bg-muted/20" onClick={() => openNote(a, "resolved")}>
                            Mark resolved
                          </Button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollHint>

      {sendTarget && (
        <ReminderTemplateModal
          open={!!sendTarget}
          onOpenChange={(o) => !o && setSendTarget(null)}
          heading={`Send reminder — ${sendTarget.agg.customerName}`}
          templateLabel={CUSTOMER_TEMPLATE_LABEL[sendTarget.stage]}
          subject={fillCustomerTemplate(sendTarget.stage, {
            customerName: sendTarget.agg.customerName, amount: sendTarget.agg.amount, invoiceCount: sendTarget.agg.invoiceCount,
            oldestInvoiceNumber: sendTarget.agg.oldestInvoiceNumber, daysOverdue: sendTarget.agg.maxDaysOverdue,
          }).subject}
          body={fillCustomerTemplate(sendTarget.stage, {
            customerName: sendTarget.agg.customerName, amount: sendTarget.agg.amount, invoiceCount: sendTarget.agg.invoiceCount,
            oldestInvoiceNumber: sendTarget.agg.oldestInvoiceNumber, daysOverdue: sendTarget.agg.maxDaysOverdue,
          }).body}
          recipientEmail={contacts.data?.get(sendTarget.agg.customerId)?.email ?? null}
          sendEnabled={sendEnabled}
          isBusy={record.isPending}
          onConfirm={confirmSend}
          onSendTest={sendTest}
          lastResult={lastResult}
        />
      )}

      <Dialog open={!!noteTarget} onOpenChange={(o) => !o && setNoteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {noteTarget?.kind === "escalate_ceo" ? <ShieldAlert className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              {noteTarget?.kind === "escalate_ceo" ? "Escalate to CEO" : "Mark resolved"} — {noteTarget?.agg.customerName}
            </DialogTitle>
            <DialogDescription>
              {noteTarget?.kind === "escalate_ceo" ? "Escalate this debtor now, ahead of the automatic grace period. Note why." : "Stop the reminder ladder — payment received, dispute, or a payment plan agreed."}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Optional note" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteTarget(null)}>Cancel</Button>
            <Button onClick={confirmNote} disabled={record.isPending}>Record decision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="mt-4 text-xs text-muted-foreground inline-flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" /> Send is in rehearsal mode until go-live — every button records the
        decision and advances the status; real email dispatch is armed only when Marcello/Arwa flip the switch.
      </p>
    </Card>
  );
};
