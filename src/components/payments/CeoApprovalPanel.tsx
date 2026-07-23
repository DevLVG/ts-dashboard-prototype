// CEO Approval Panel — approve / adjust / hold + decision & audit log.
//
// SCOPE (Master-Checklist task #16, 🔵 autonomous). Reuses the Product-Registry
// approval-queue pattern (Product-Registry-Spec §5.3): a queue of proposed rows,
// per-row decision actions, and an append-only decision log with actor + diff +
// decision_ref. Fields on each row follow Treasury-Decision-Rules §B.2; the CEO
// buttons follow §B.3 (Approve / Schedule / Partial / Hold / Reject).
//
// TWO DELIBERATE GUARDS, so this cannot be mistaken for a live payment tool:
//  1. DATA guard — reads v_ready_to_pay live; until migration 034 lands it shows a
//     graceful "not yet available" card and re-polls (same pattern as the aging views).
//  2. SIGN-OFF guard — a persistent DRAFT banner: the ready-to-pay logic depends on the
//     Treasury Decision-Rules (thresholds, vendor tiers, cash buffer, approvers) which are
//     NOT yet confirmed, AND the AP mirror lags (§C). Nothing is paid or sent from here.
//
// WRITE-BACK boundary: CEO decisions are held in an in-session ledger (rendered as the
// audit log) and show the exact payload that will be persisted to payment_decision_log on
// go-live. The panel never mutates production — write-back needs the signed-off auth model.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2, CalendarClock, Scissors, PauseCircle, XCircle,
  ShieldAlert, HardHat, Wallet, ListChecks, History, AlertTriangle, Info,
} from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { fmtSAR } from "@/lib/format";
import {
  useReadyToPay, usePaymentDecisionLog, TIER_META,
  type ReadyToPayRow, type PaymentDecisionLogRow,
} from "@/data/paymentsLive";

const n = (v: number | null | undefined): number => v ?? 0;
const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);

type DecisionKind = "approve" | "schedule" | "partial" | "hold" | "reject";

// In-session decision ledger entry — mirrors the payment_decision_log row shape (migration 034).
interface SessionDecision {
  ref: string;
  billKey: string;
  payee: string;
  action: DecisionKind;
  fromAmount: number;
  toAmount: number;        // = fromAmount except for 'partial'
  scheduledFor?: string;
  reason?: string;
  actor: string;
  at: string;              // ISO
}

const DECISION_META: Record<DecisionKind, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string; ring: string }> = {
  approve:  { label: "Approve",  icon: CheckCircle2,  tone: "text-emerald-400", ring: "border-emerald-500/40 hover:bg-emerald-500/10" },
  schedule: { label: "Schedule", icon: CalendarClock, tone: "text-sky-400",     ring: "border-sky-500/40 hover:bg-sky-500/10" },
  partial:  { label: "Partial",  icon: Scissors,      tone: "text-gold",        ring: "border-gold/40 hover:bg-gold/10" },
  hold:     { label: "Hold",     icon: PauseCircle,   tone: "text-warning",     ring: "border-warning/40 hover:bg-warning/10" },
  reject:   { label: "Reject",   icon: XCircle,       tone: "text-destructive", ring: "border-destructive/40 hover:bg-destructive/10" },
};

const rowKey = (r: ReadyToPayRow) => String(r.qoyod_bill_id ?? r.bill_number ?? r.payee ?? Math.random());

// -------------------------------------------------------------- KPI tile
const KpiTile = ({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<{ className?: string }>; accent?: "neutral" | "warn" | "bad" | "good";
}) => {
  const ring = accent === "bad" ? "border-destructive/30" : accent === "warn" ? "border-warning/40"
    : accent === "good" ? "border-emerald-500/30" : "border-border";
  const iconTone = accent === "bad" ? "text-destructive" : accent === "warn" ? "text-warning"
    : accent === "good" ? "text-emerald-400" : "text-gold";
  return (
    <Card className={`p-4 ${ring} border`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className={`h-4 w-4 ${iconTone}`} />
        {label}
      </div>
      <div className="mt-2 text-2xl font-heading tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
};

// -------------------------------------------------------- not-available card
const NotAvailable = () => (
  <Card className="p-8 text-center space-y-3 animate-fade-in">
    <HardHat className="h-7 w-7 mx-auto text-gold/70" />
    <h3 className="text-lg font-heading tracking-wide">READY-TO-PAY LIST — NOT YET AVAILABLE</h3>
    <p className="text-sm text-muted-foreground max-w-md mx-auto">
      The ready-to-pay view (<code className="text-xs">v_ready_to_pay</code>, migration 034) is not yet
      applied to the data layer. This panel will populate automatically as soon as the view is published —
      no reload needed.
    </p>
  </Card>
);

export const CeoApprovalPanel = () => {
  const ready = useReadyToPay();
  const log = usePaymentDecisionLog();

  const rows = useMemo<ReadyToPayRow[]>(() => (ready.data?.available ? ready.data.rows : []), [ready.data]);
  const persistedLog = useMemo<PaymentDecisionLogRow[]>(() => (log.data?.available ? log.data.rows : []), [log.data]);

  // In-session decision ledger (write-back happens on go-live; see file header).
  const [session, setSession] = useState<SessionDecision[]>([]);
  const decidedKeys = useMemo(() => new Set(session.map((d) => d.billKey)), [session]);

  // adjust dialogs (partial / schedule / hold-reason)
  const [adjust, setAdjust] = useState<{ row: ReadyToPayRow; kind: DecisionKind } | null>(null);
  const [adjAmount, setAdjAmount] = useState("");
  const [adjDate, setAdjDate] = useState("");
  const [adjReason, setAdjReason] = useState("");

  const nextRef = () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return `PAY-APR-${stamp}-${String(session.length + 1).padStart(3, "0")}`;
  };

  const record = (row: ReadyToPayRow, kind: DecisionKind, opts?: { toAmount?: number; scheduledFor?: string; reason?: string }) => {
    const from = n(row.amount);
    setSession((prev) => [
      {
        ref: nextRef(),
        billKey: rowKey(row),
        payee: row.payee ?? "—",
        action: kind,
        fromAmount: from,
        toAmount: opts?.toAmount ?? from,
        scheduledFor: opts?.scheduledFor,
        reason: opts?.reason,
        actor: "CEO (in-session)",
        at: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const onQuick = (row: ReadyToPayRow, kind: DecisionKind) => {
    if (kind === "partial" || kind === "schedule" || kind === "hold" || kind === "reject") {
      setAdjust({ row, kind });
      setAdjAmount(kind === "partial" ? String(Math.round(n(row.amount))) : "");
      setAdjDate("");
      setAdjReason("");
      return;
    }
    record(row, kind); // approve — one click
  };

  const confirmAdjust = () => {
    if (!adjust) return;
    const { row, kind } = adjust;
    if (kind === "partial") {
      const amt = Number(adjAmount);
      record(row, "partial", { toAmount: isFinite(amt) ? amt : n(row.amount), reason: adjReason || undefined });
    } else if (kind === "schedule") {
      record(row, "schedule", { scheduledFor: adjDate || undefined, reason: adjReason || undefined });
    } else {
      record(row, kind, { reason: adjReason || undefined });
    }
    setAdjust(null);
  };

  const undo = (ref: string) => setSession((prev) => prev.filter((d) => d.ref !== ref));

  // KPI aggregates
  const total = useMemo(() => rows.reduce((s, r) => s + n(r.amount), 0), [rows]);
  const approvedAmt = useMemo(
    () => session.filter((d) => d.action === "approve" || d.action === "partial")
      .reduce((s, d) => s + d.toAmount, 0),
    [session],
  );
  const pendingCount = rows.length - decidedKeys.size;
  const arReady = ready.data?.available === true;

  return (
    <div className="space-y-6">
      {/* SIGN-OFF guard banner — persistent */}
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <strong>DRAFT — not a live payment tool.</strong> The ready-to-pay logic depends on the Treasury
          Decision-Rules (thresholds, vendor tiers, cash buffer, approvers) that are pending Marcello / Arwa
          sign-off, and the AP mirror is still catching up (bills feed behind, bank feed empty). Decisions
          recorded here stay in-session — <strong>nothing is paid or sent</strong>. Execution remains manual
          (segregation of duties).
        </span>
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Run total (candidate)" value={arReady ? fmt(total) : "—"}
          sub={arReady ? `${rows.length} bills in queue` : "loading…"} icon={Wallet} accent="neutral" />
        <KpiTile label="Pending decision" value={arReady ? String(pendingCount) : "—"}
          sub={arReady ? `${decidedKeys.size} decided this session` : "loading…"} icon={ListChecks}
          accent={pendingCount > 0 ? "warn" : "good"} />
        <KpiTile label="Approved (session)" value={fmt(approvedAmt)}
          sub={`${session.filter((d) => d.action === "approve" || d.action === "partial").length} items`} icon={CheckCircle2} accent="good" />
        <KpiTile label="Held / rejected" value={String(session.filter((d) => d.action === "hold" || d.action === "reject").length)}
          sub="queried or declined" icon={PauseCircle} accent="neutral" />
      </div>

      {/* Ready-to-pay queue */}
      {ready.isError ? (
        <Card className="p-6"><p className="text-sm text-destructive">
          {(ready.error as Error | null)?.name === "PermissionDeniedError"
            ? (ready.error as Error).message
            : "Could not load the ready-to-pay list from Supabase."}
        </p></Card>
      ) : !arReady ? (
        <NotAvailable />
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">
          No open payables in the queue — nothing to approve.
        </p></Card>
      ) : (
        <Card className="p-6 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h3 className="text-xl font-heading tracking-wide">READY-TO-PAY QUEUE</h3>
            <DataSourceBadge source="live" />
            <span className="text-xs text-muted-foreground">Supabase · v_ready_to_pay · SAR</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4 inline-flex items-center gap-1.5">
            Ranked by tier, then by how overdue each bill is.
            <span title="Within-tier score is off until the §B.1 weights are confirmed; ordering uses the deadline signal only.">
              <Info className="h-3.5 w-3.5 text-gold/80 cursor-help" />
            </span>
          </p>

          <ScrollHint>
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="text-left py-1 pr-2 font-semibold">Payee</th>
                  <th className="text-left py-1 px-2 font-semibold">Ref</th>
                  <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Amount SAR</th>
                  <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Due / overdue</th>
                  <th className="text-left py-1 px-2 font-semibold">Tier</th>
                  <th className="text-left py-1 px-2 font-semibold">Rec.</th>
                  <th className="text-right py-1 pl-2 font-semibold">CEO decision</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = rowKey(r);
                  const decided = session.find((d) => d.billKey === key);
                  const tier = TIER_META[r.tier ?? 2] ?? TIER_META[2];
                  return (
                    <tr key={key} className={`border-b border-border/10 ${decided ? "opacity-60" : ""}`}>
                      <td className="py-2 pr-2 max-w-[200px] truncate" title={r.payee ?? ""}>
                        {r.payee ?? "—"}
                        {r.risk_if_delayed && (
                          <div className="text-[11px] text-muted-foreground truncate" title={r.risk_if_delayed}>
                            {r.risk_if_delayed}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{r.bill_number ?? "—"}</td>
                      <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">{fmt(n(r.amount))}</td>
                      <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                        {r.due_date ?? "—"}
                        {n(r.days_overdue) > 0 && (
                          <span className="text-warning"> · +{r.days_overdue}d</span>
                        )}
                      </td>
                      <td className={`py-2 px-2 whitespace-nowrap ${tier.tone}`}>
                        {tier.short}
                        {r.tier_confirmed === false && (
                          <span className="text-[10px] text-muted-foreground"> (default)</span>
                        )}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap text-xs text-muted-foreground">
                        {r.recommended_action === "PAY_NOW" ? "Pay now" : r.recommended_action === "HOLD" ? "Hold" : "Schedule"}
                      </td>
                      <td className="py-2 pl-2">
                        {decided ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className={`text-xs font-semibold ${DECISION_META[decided.action].tone}`}>
                              {DECISION_META[decided.action].label}
                              {decided.action === "partial" && ` ${fmt(decided.toAmount)}`}
                              {decided.action === "schedule" && decided.scheduledFor && ` ${decided.scheduledFor}`}
                            </span>
                            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => undo(decided.ref)}>
                              undo
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            {(Object.keys(DECISION_META) as DecisionKind[]).map((k) => {
                              const m = DECISION_META[k];
                              return (
                                <Button key={k} variant="outline" size="sm"
                                  className={`h-7 px-2 gap-1 text-[11px] ${m.ring}`}
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

      {/* Decision & audit log */}
      <Card className="p-6 shadow-sm animate-fade-in">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h3 className="text-xl font-heading tracking-wide">DECISION &amp; AUDIT LOG</h3>
          <History className="h-4 w-4 text-gold" />
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Every CEO decision is captured with actor, timestamp, amount change and a reference id — the same
          append-only contract as the platform audit trail. Session entries below are written to
          <code className="text-xs mx-1">payment_decision_log</code> on go-live.
        </p>

        {session.length === 0 && persistedLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
        ) : (
          <ScrollHint>
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="text-left py-1 pr-2 font-semibold">Ref</th>
                  <th className="text-left py-1 px-2 font-semibold">When</th>
                  <th className="text-left py-1 px-2 font-semibold">Actor</th>
                  <th className="text-left py-1 px-2 font-semibold">Payee</th>
                  <th className="text-left py-1 px-2 font-semibold">Action</th>
                  <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Amount</th>
                  <th className="text-left py-1 pl-2 font-semibold">Reason / note</th>
                </tr>
              </thead>
              <tbody>
                {session.map((d) => {
                  const m = DECISION_META[d.action];
                  return (
                    <tr key={d.ref} className="border-b border-border/10">
                      <td className="py-1.5 pr-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{d.ref}</td>
                      <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{new Date(d.at).toLocaleString()}</td>
                      <td className="py-1.5 px-2 whitespace-nowrap">{d.actor}</td>
                      <td className="py-1.5 px-2 max-w-[160px] truncate" title={d.payee}>{d.payee}</td>
                      <td className={`py-1.5 px-2 font-semibold whitespace-nowrap ${m.tone}`}>{m.label}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                        {d.action === "partial"
                          ? <>{fmt(d.toAmount)} <span className="text-[10px] text-muted-foreground">of {fmt(d.fromAmount)}</span></>
                          : fmt(d.toAmount)}
                        {d.action === "schedule" && d.scheduledFor && (
                          <div className="text-[10px] text-muted-foreground">for {d.scheduledFor}</div>
                        )}
                      </td>
                      <td className="py-1.5 pl-2 text-muted-foreground max-w-[220px] truncate" title={d.reason ?? ""}>{d.reason ?? "—"}</td>
                    </tr>
                  );
                })}
                {/* persisted rows (when payment_decision_log has data post go-live) */}
                {persistedLog.map((d) => (
                  <tr key={d.id} className="border-b border-border/10 bg-muted/20">
                    <td className="py-1.5 pr-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{d.decision_ref ?? "—"}</td>
                    <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{new Date(d.occurred_at).toLocaleString()}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap">{d.actor ?? "—"}</td>
                    <td className="py-1.5 px-2 text-muted-foreground">persisted</td>
                    <td className="py-1.5 px-2 font-semibold whitespace-nowrap capitalize">{d.action}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">—</td>
                    <td className="py-1.5 pl-2 text-muted-foreground max-w-[220px] truncate" title={d.reason ?? ""}>{d.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollHint>
        )}
      </Card>

      {/* Adjust dialog (partial / schedule / hold / reject) */}
      <Dialog open={!!adjust} onOpenChange={(o) => !o && setAdjust(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {adjust && (() => { const M = DECISION_META[adjust.kind].icon; return <M className={`h-4 w-4 ${DECISION_META[adjust.kind].tone}`} />; })()}
              {adjust ? DECISION_META[adjust.kind].label : ""} — {adjust?.row.payee}
            </DialogTitle>
            <DialogDescription>
              {adjust?.kind === "partial" && "Part-pay this bill. Enter the amount to release now; the residual stays open."}
              {adjust?.kind === "schedule" && "Schedule this payment for a future date. The bill stays in the queue until then."}
              {adjust?.kind === "hold" && "Hold this bill and send a query to the treasurer. Nothing is paid."}
              {adjust?.kind === "reject" && "Decline this bill from the run. It returns to the queue for review."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {adjust?.kind === "partial" && (
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Amount to pay now (SAR)</label>
                <Input type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)}
                  max={adjust ? n(adjust.row.amount) : undefined} className="mt-1" />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Full amount {adjust ? fmt(n(adjust.row.amount)) : ""}.
                </p>
              </div>
            )}
            {adjust?.kind === "schedule" && (
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground">Pay on</label>
                <Input type="date" value={adjDate} onChange={(e) => setAdjDate(e.target.value)} className="mt-1" />
              </div>
            )}
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground">
                {adjust?.kind === "hold" || adjust?.kind === "reject" ? "Reason (query / note)" : "Note (optional)"}
              </label>
              <Textarea value={adjReason} onChange={(e) => setAdjReason(e.target.value)} rows={3} className="mt-1"
                placeholder={adjust?.kind === "hold" ? "e.g. confirm IBAN with vendor before release" : "optional"} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjust(null)}>Cancel</Button>
            <Button onClick={confirmAdjust}>Record decision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
        Read + record only. CEO decisions are held in-session and persist to the audit log on go-live, once
        the approver auth model and Treasury Decision-Rules are signed off. Payment execution stays manual.
      </p>
    </div>
  );
};
