// VENDOR LINES TABLE — payables mirror of CustomerLinesTable (Marcello's
// spec, item 5). Per vendor: amount, % of the (payables) book, aging
// summary, status chip, action button.
//
// INTERPRETATION, corrected by Marcello 2026-08-03 (supersedes the initial
// "internal-only, no vendor emails" reading): the payables ladder DOES send
// vendor-facing emails, but the copy is the OPPOSITE of a collection
// letter — Marcello's own treasurer principle: "chi paga tardi e incassa
// presto genera autofinanziamento — più siamo bravi a tenere buoni rapporti
// coi fornitori pagando in ritardo, più siamo buoni tesorieri." So:
//   Stage 1 — courteous acknowledgement ("received and verified, payment
//     scheduled, thank you for your patience").
//   Stage 2 — if the vendor chases again (~stage2_after_days later), a
//     further warm, reasoned justification (cash-cycle timing, scheduled
//     run date) — NEVER escalating in tone.
//   No Stage 3 toward the vendor. Real tension (a vendor genuinely at risk
//   of souring the relationship, or a critical/statutory payable running
//   long) escalates INTERNALLY — the CEO-attention list below — never in
//   what the vendor reads.
//
// Mechanism (stages/statuses/buttons/logs) is intentionally SYMMETRIC with
// the customer ladder — same dunningLadder.ts engine, maxStage=2 — only the
// copy and the sending target differ.
//
// PSEUDO-VENDOR GUARD (added 2026-08-04, fix-28-treasury-align, mirrors the
// same fix on CustomerLinesTable.tsx): vendor_master has one rollup
// placeholder, "Various Restaurant Vendors" (qoyod_vendor_id 1862) — no open
// bills against it today (verified live), but the SAME "not a single
// emailable counterparty" reasoning applies the moment one lands, so the
// guard is added defensively now rather than after the fact. Detected by
// known id + an /Aggregated|Various/i name-pattern fallback for any future
// rollup Qoyod names the same way.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Send, ShieldAlert, CheckCircle2, Clock, Handshake, MailX, Layers } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { AgingMiniBar } from "@/components/treasury/AgingMiniBar";
import { ReminderTemplateModal } from "@/components/treasury/ReminderTemplateModal";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { type AgingBucket, type ApAgingRow } from "@/data/statementsLive";
import {
  useVendorContacts, useDunningConfig, useTreasuryActionLog, useRecordTreasuryAction,
} from "@/data/treasuryLive";
import {
  deriveLadderState, ladderConfigFromDb, nextAction, computeLadderStatus, isEscalationDue,
  type LadderState,
} from "@/lib/dunningLadder";
import { fillVendorTemplate, VENDOR_TEMPLATE_LABEL, type VendorTemplateStage } from "@/data/dunningTemplates";
import { sendDunningEmail, type DunningSendResult } from "@/lib/dunningSend";
import { fmtSAR } from "@/lib/format";

const n = (v: number | null | undefined): number => v ?? 0;
const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);
const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

const KNOWN_PSEUDO_VENDOR_IDS = new Set(["1862"]);
const isPseudoVendor = (vendorId: string, vendorName: string): boolean =>
  KNOWN_PSEUDO_VENDOR_IDS.has(vendorId) || /aggregated|various .*vendors?/i.test(vendorName);

interface VendorAgg {
  vendorId: string;
  vendorName: string;
  amount: number;
  billCount: number;
  amountsByBucket: Partial<Record<AgingBucket, number>>;
  maxDaysOverdue: number;
  latestBillNumber: string;
  /** True for rollup placeholders (e.g. "Various Restaurant Vendors") — not
   * a real, individually emailable counterparty. */
  isPseudo: boolean;
}

const STAGE_CHIP: Record<number, string> = {
  1: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  2: "border-amber-500/40 bg-amber-500/10 text-amber-400",
};

const scheduledRunDateDefault = () => {
  const d = new Date();
  d.setDate(d.getDate() + 10);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

export const VendorLinesTable = ({ rows }: { rows: ApAgingRow[] }) => {
  const { session } = useAuth();
  const { toast } = useToast();

  const aggregates = useMemo<VendorAgg[]>(() => {
    const m = new Map<string, VendorAgg>();
    for (const r of rows) {
      const id = String(r.vendor_qoyod_id ?? r.vendor_name ?? "unknown");
      const amt = n(r.residual_amount);
      const days = n(r.days_overdue);
      let agg = m.get(id);
      if (!agg) {
        const vendorName = r.vendor_name ?? "—";
        agg = {
          vendorId: id, vendorName, amount: 0, billCount: 0, amountsByBucket: {}, maxDaysOverdue: 0,
          latestBillNumber: r.bill_number ?? "—", isPseudo: isPseudoVendor(id, vendorName),
        };
        m.set(id, agg);
      }
      agg.amount += amt;
      agg.billCount += 1;
      agg.amountsByBucket[r.aging_bucket] = (agg.amountsByBucket[r.aging_bucket] ?? 0) + amt;
      if (days >= agg.maxDaysOverdue) { agg.maxDaysOverdue = days; agg.latestBillNumber = r.bill_number ?? agg.latestBillNumber; }
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const totalBook = useMemo(() => aggregates.reduce((s, a) => s + a.amount, 0), [aggregates]);
  const vendorIds = useMemo(() => aggregates.map((a) => a.vendorId), [aggregates]);

  const contacts = useVendorContacts(vendorIds);
  const dunningConfig = useDunningConfig();
  const log = useTreasuryActionLog("PAYABLE_ESCALATION");
  const record = useRecordTreasuryAction();

  const cfg = useMemo(() => ladderConfigFromDb(dunningConfig.data?.available ? dunningConfig.data.rows[0] : undefined, 2), [dunningConfig.data]);
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

  const [sendTarget, setSendTarget] = useState<{ agg: VendorAgg; stage: VendorTemplateStage } | null>(null);
  const [lastResult, setLastResult] = useState<DunningSendResult | null>(null);
  const [noteTarget, setNoteTarget] = useState<{ agg: VendorAgg; kind: "escalate_ceo" | "resolved" } | null>(null);
  const [note, setNote] = useState("");

  const actorEmail = session?.user?.email ?? null;

  const templateVars = (agg: VendorAgg) => ({
    vendorName: agg.vendorName, amount: agg.amount, billCount: agg.billCount, billNumber: agg.latestBillNumber,
    reason: "final verification of the invoice details", targetWindow: "within the next 5–7 business days",
    scheduledRunDate: scheduledRunDateDefault(),
  });

  const openSend = (agg: VendorAgg, stage: VendorTemplateStage) => { setLastResult(null); setSendTarget({ agg, stage }); };

  const confirmSend = async () => {
    if (!sendTarget) return;
    const { agg, stage } = sendTarget;
    const email = contacts.data?.get(Number(agg.vendorId))?.contact_email ?? null;
    const filled = fillVendorTemplate(stage, templateVars(agg));
    const result = await sendDunningEmail({
      kind: "vendor", entityRef: agg.vendorId, to: email, subject: filled.subject, body: filled.body,
      sendEnabled, testRecipient,
    });
    // Owner-audit #13 (2026-08-04), same fix as CustomerLinesTable's
    // confirmSend: await the write and close the dialog only on success,
    // instead of a fire-and-forget mutate that left the dialog open and
    // re-clickable after the write had already succeeded (duplicate
    // audit-log rows on a second, entirely reasonable click).
    try {
      await record.mutateAsync({
        domain: "PAYABLE_ESCALATION", entity_ref: agg.vendorId, action: `stage${stage}_sent`, actor: actorEmail,
        payload: { vendor_name: agg.vendorName, amount: agg.amount, bill_count: agg.billCount, template_label: VENDOR_TEMPLATE_LABEL[stage], recipient_email: email, send_result: result },
      });
      toast({ title: `${VENDOR_TEMPLATE_LABEL[stage]} recorded`, description: result.detail });
      setSendTarget(null);
    } catch (err) {
      toast({ title: "Could not record decision", description: String(err), variant: "destructive" });
    }
  };

  const sendTest = async () => {
    if (!sendTarget) return;
    const { agg, stage } = sendTarget;
    const filled = fillVendorTemplate(stage, templateVars(agg));
    const result = await sendDunningEmail({
      kind: "vendor", entityRef: agg.vendorId, to: contacts.data?.get(Number(agg.vendorId))?.contact_email ?? null,
      subject: filled.subject, body: filled.body, sendEnabled, testMode: true, testRecipient,
    });
    setLastResult(result);
  };

  const openNote = (agg: VendorAgg, kind: "escalate_ceo" | "resolved") => { setNote(""); setNoteTarget({ agg, kind }); };

  const confirmNote = async () => {
    if (!noteTarget) return;
    const { agg, kind } = noteTarget;
    try {
      await record.mutateAsync({
        domain: "PAYABLE_ESCALATION", entity_ref: agg.vendorId, action: kind, actor: actorEmail, reason: note || undefined, payload: { vendor_name: agg.vendorName, amount: agg.amount },
      });
      toast({ title: kind === "resolved" ? "Marked resolved" : "Escalated to CEO", description: kind === "escalate_ceo" ? "Internal escalation only — no vendor-facing email sent." : "Logged to the audit trail." });
      setNoteTarget(null);
    } catch (err) {
      toast({ title: "Could not record decision", description: String(err), variant: "destructive" });
    }
  };

  const emptyState: LadderState = { stage: 0, stage1At: null, stage2At: null, stage3At: null, lastActionAt: null, lastReason: null, escalatedManually: false, escalatedAt: null, resolved: false, resolvedAt: null };
  const ceoAttention = aggregates.filter((a) => !a.isPseudo && isEscalationDue(ladderStates.get(a.vendorId) ?? emptyState, cfg, now));

  return (
    <Card className="p-6 shadow-sm animate-fade-in">
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h3 className="text-xl font-heading tracking-wide">VENDOR LINES — PAYABLES</h3>
        <DataSourceBadge source="live" sourceLabel="Live data from Supabase (ap_aging_v2 + treasury_action_log)" />
        <span className="text-xs text-muted-foreground">Live payables data · SAR</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4 inline-flex items-start gap-1.5">
        <Handshake className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gold/80" />
        {aggregates.length} vendors, {fmt(totalBook)} SAR open. Relationship-preserving acknowledgement ladder —
        courteous, never escalating in tone toward the vendor. Real tension escalates internally (CEO attention
        below), never in what a vendor reads.
      </p>

      {ceoAttention.length > 0 && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-destructive mb-2 inline-flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> CEO attention ({ceoAttention.length})
          </p>
          <ul className="space-y-1 text-sm">
            {ceoAttention.map((a) => (
              <li key={a.vendorId} className="flex items-center justify-between gap-2">
                <span className="truncate">{a.vendorName}</span>
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
              <th className="text-left py-1 pr-2 font-semibold">Vendor</th>
              <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Amount SAR</th>
              <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">% of book</th>
              <th className="text-left py-1 px-2 font-semibold">Aging summary</th>
              <th className="text-left py-1 px-2 font-semibold">Status</th>
              <th className="text-right py-1 pl-2 font-semibold">Action</th>
            </tr>
          </thead>
          <tbody>
            {aggregates.map((a) => {
              const state = ladderStates.get(a.vendorId) ?? emptyState;
              const status = computeLadderStatus(state, cfg, now);
              const next = nextAction(state, cfg);
              const email = contacts.data?.get(Number(a.vendorId))?.contact_email ?? null;
              const pct = totalBook > 0.5 ? (a.amount / totalBook) * 100 : 0;
              const eligible = next.eligibleAt === null || next.eligibleAt <= now;

              return (
                <tr key={a.vendorId} className="border-b border-border/10 align-top">
                  <td className="py-2 pr-2 max-w-[200px]">
                    <div className="truncate font-medium inline-flex items-center gap-1.5" title={a.vendorName}>
                      {a.vendorName}
                      {a.isPseudo && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Layers className="h-3 w-3 text-muted-foreground/70 shrink-0 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            A rollup of many individual vendors, not one counterparty — see the note in Action.
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{a.billCount} bill{a.billCount === 1 ? "" : "s"}</div>
                    {!a.isPseudo && !email && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 mt-0.5">
                        <MailX className="h-2.5 w-2.5" /> No email on file
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap font-medium">{fmt(a.amount)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{pct.toFixed(1)}%</td>
                  <td className="py-2 px-2"><AgingMiniBar amountsByBucket={a.amountsByBucket} total={a.amount} /></td>
                  <td className="py-2 px-2">
                    {a.isPseudo ? (
                      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold border border-border bg-muted/20 text-muted-foreground">
                        <Layers className="h-3 w-3" /> Aggregated
                      </span>
                    ) : (
                      <>
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
                            Not yet acknowledged
                          </span>
                        )}
                        {status.kind === "stage_sent" && (
                          <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold border ${STAGE_CHIP[status.stage] ?? ""}`}>
                            {status.stage === 1 ? "Acknowledgement sent" : "Justification sent"} ({fmtDate(status.at)})
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="py-2 pl-2">
                    {a.isPseudo ? (
                      <p className="text-[11px] text-muted-foreground text-right max-w-[220px] ml-auto leading-snug">
                        Aggregated vendor rollup — individual suppliers, no acknowledgement target.
                      </p>
                    ) : (
                    <div className="flex flex-col items-end gap-1">
                      {status.kind !== "resolved" && next.nextStage && next.nextStage <= 2 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm" variant="outline" disabled={!eligible}
                                className="h-7 px-2 gap-1 text-[11px] border-gold/40 hover:bg-gold/10"
                                onClick={() => openSend(a, next.nextStage as VendorTemplateStage)}
                              >
                                <Send className="h-3.5 w-3.5 text-gold" />
                                {next.nextStage === 1 ? "Send acknowledgement" : "Send justification"}
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {!eligible && (
                            <TooltipContent side="left" className="max-w-xs text-xs">
                              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Available from {fmtDate(next.eligibleAt)} — only if the vendor chases again.</span>
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
                    )}
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
          heading={`Send ${sendTarget.stage === 1 ? "acknowledgement" : "justification"} — ${sendTarget.agg.vendorName}`}
          templateLabel={VENDOR_TEMPLATE_LABEL[sendTarget.stage]}
          subject={fillVendorTemplate(sendTarget.stage, templateVars(sendTarget.agg)).subject}
          body={fillVendorTemplate(sendTarget.stage, templateVars(sendTarget.agg)).body}
          recipientEmail={contacts.data?.get(Number(sendTarget.agg.vendorId))?.contact_email ?? null}
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
              {noteTarget?.kind === "escalate_ceo" ? "Escalate to CEO" : "Mark resolved"} — {noteTarget?.agg.vendorName}
            </DialogTitle>
            <DialogDescription>
              {noteTarget?.kind === "escalate_ceo"
                ? "Internal escalation only — this never generates a vendor-facing email. Note why (e.g. critical/statutory payable, relationship risk)."
                : "Stop the ladder — bill paid, disputed, or a payment plan agreed."}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Optional note" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteTarget(null)}>Cancel</Button>
            <Button onClick={confirmNote} disabled={record.isPending}>Record decision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="mt-4 text-xs text-muted-foreground">
        Send is in rehearsal mode until go-live — every button records the decision and advances the status;
        real email dispatch is armed only when Marcello/Arwa flip the switch.
      </p>
    </Card>
  );
};
