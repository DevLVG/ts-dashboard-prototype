// CEO Approval Panel — approve / adjust / hold + decision & audit log.
//
// SCOPE (Master-Checklist task #16, 🔵 autonomous). Reuses the Product-Registry
// approval-queue pattern (Product-Registry-Spec §5.3): a queue of proposed rows,
// per-row decision actions, and an append-only decision log with actor + diff +
// decision_ref. Fields on each row follow Treasury-Decision-Rules §B.2; the CEO
// buttons follow §B.3 (Approve / Schedule / Partial / Hold / Reject).
//
// TWO DELIBERATE GUARDS remain, so this cannot be mistaken for a live PAYMENT tool:
//  1. DATA guard — reads v_ready_to_pay live; if the view is ever unavailable it shows a
//     graceful "not yet available" card and re-polls (same pattern as the aging views).
//  2. EXECUTION guard — a persistent banner: nothing here posts to Qoyod, sends money, or
//     talks to a bank. Execution stays manual (segregation of duties), by design.
//
// WRITE-BACK (live since 2026-09-11, migrations 083+084): every CEO decision is INSERTed
// durably into payment_decision_log — actor = the signed-in user's real email (from the
// Supabase session, never a placeholder), timestamp, and a full jsonb snapshot of the bill
// + decision. This is genuinely persisted (survives reload, visible to anyone with cockpit
// access) — it is a decision RECORD, not a payment. The Treasury Decision-Rules sign-off
// (thresholds/tiers/buffer/approvers) is still pending, which is why run_id/item_id stay
// NULL and this does not route through the heavier payment_run workflow — see
// src/data/paymentsLive.ts header for the full explanation.
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
  ShieldAlert, HardHat, Wallet, ListChecks, History, AlertTriangle, Info, Download, Loader2,
} from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ProposedBadge } from "@/components/dashboard/ProposedBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { fmtSAR } from "@/lib/format";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useReadyToPay, usePaymentDecisionLog, usePaymentPriority, useRecordPaymentDecision, TIER_META,
  type ReadyToPayRow, type PaymentDecisionLogRow, type PaymentPriorityRow,
} from "@/data/paymentsLive";

const n = (v: number | null | undefined): number => v ?? 0;
const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);

type DecisionKind = "approve" | "schedule" | "partial" | "hold" | "reject";

// In-flight decision — optimistic overlay while the insert into payment_decision_log
// (migrations 083/084) is saving. Removed once the persisted row lands (or on error).
interface PendingDecision {
  ref: string;
  billKey: string;
  billNumber: string | null;
  payee: string;
  action: DecisionKind;
  fromAmount: number;
  toAmount: number;        // = fromAmount except for 'partial'
  scheduledFor?: string;
  reason?: string;
  actor: string;
  at: string;              // ISO
  saving: boolean;
}

/** Pull the bill_key / amounts this panel wrote back out of a persisted payment_decision_log row's
 * jsonb diff (see useRecordPaymentDecision in paymentsLive.ts for the shape written). */
const parseDiff = (diff: PaymentDecisionLogRow["diff"]) => {
  const d = (diff ?? {}) as {
    payee?: string; bill_key?: string; bill_number?: string | null;
    from?: { amount?: number }; to?: { amount?: number; scheduled_for?: string | null };
  };
  return {
    payee: d.payee ?? null,
    billKey: d.bill_key ?? null,
    billNumber: d.bill_number ?? null,
    fromAmount: d.from?.amount ?? null,
    toAmount: d.to?.amount ?? null,
    scheduledFor: d.to?.scheduled_for ?? null,
  };
};

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
  const { session: authSession } = useAuth();
  const { toast } = useToast();
  const actorEmail = authSession?.user?.email ?? "unknown (no session)";

  const ready = useReadyToPay();
  const log = usePaymentDecisionLog();
  const priority = usePaymentPriority();
  const recordDecision = useRecordPaymentDecision();

  const rows = useMemo<ReadyToPayRow[]>(() => (ready.data?.available ? ready.data.rows : []), [ready.data]);
  const persistedLog = useMemo<PaymentDecisionLogRow[]>(() => (log.data?.available ? log.data.rows : []), [log.data]);

  // Score join (migration 050, v_payment_priority) — keyed by qoyod_bill_id.
  // v_ready_to_pay.score itself is a hard NULL (034); this is the live,
  // editable-weight ranking that supersedes it, still draft until confirmed.
  const scoreByBill = useMemo(() => {
    const m = new Map<number, PaymentPriorityRow>();
    if (priority.data?.available) for (const p of priority.data.rows) if (p.qoyod_bill_id != null) m.set(p.qoyod_bill_id, p);
    return m;
  }, [priority.data]);

  // Pending (in-flight, not yet confirmed persisted) decisions — optimistic overlay only.
  const [pending, setPending] = useState<PendingDecision[]>([]);

  // Persisted decisions keyed by bill — read back out of payment_decision_log.diff (see parseDiff).
  // This is what makes a decision survive a reload: it is NOT just local React state any more.
  const persistedByKey = useMemo(() => {
    const m = new Map<string, PendingDecision>();
    for (const d of persistedLog) {
      const parsed = parseDiff(d.diff);
      if (!parsed.billKey) continue;
      m.set(parsed.billKey, {
        ref: d.decision_ref ?? d.id,
        billKey: parsed.billKey,
        billNumber: parsed.billNumber,
        payee: parsed.payee ?? "—",
        action: d.action as DecisionKind,
        fromAmount: parsed.fromAmount ?? 0,
        toAmount: parsed.toAmount ?? parsed.fromAmount ?? 0,
        scheduledFor: parsed.scheduledFor ?? undefined,
        reason: d.reason ?? undefined,
        actor: d.actor ?? "—",
        at: d.occurred_at,
        saving: false,
      });
    }
    return m;
  }, [persistedLog]);

  // Merged view: persisted wins once it lands; pending covers the gap while saving.
  const decisionByKey = useMemo(() => {
    const m = new Map(persistedByKey);
    for (const p of pending) m.set(p.billKey, p);
    return m;
  }, [persistedByKey, pending]);
  const decidedKeys = useMemo(() => new Set(decisionByKey.keys()), [decisionByKey]);

  // adjust dialogs (partial / schedule / hold-reason)
  const [adjust, setAdjust] = useState<{ row: ReadyToPayRow; kind: DecisionKind } | null>(null);
  const [adjAmount, setAdjAmount] = useState("");
  const [adjDate, setAdjDate] = useState("");
  const [adjReason, setAdjReason] = useState("");

  const nextRef = () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;
    return `PAY-APR-${stamp}`;
  };

  const record = (row: ReadyToPayRow, kind: DecisionKind, opts?: { toAmount?: number; scheduledFor?: string; reason?: string }) => {
    const from = n(row.amount);
    const ref = nextRef();
    const billKey = rowKey(row);
    const entry: PendingDecision = {
      ref,
      billKey,
      billNumber: row.bill_number ?? null,
      payee: row.payee ?? "—",
      action: kind,
      fromAmount: from,
      toAmount: opts?.toAmount ?? from,
      scheduledFor: opts?.scheduledFor,
      reason: opts?.reason,
      actor: actorEmail,
      at: new Date().toISOString(),
      saving: true,
    };
    setPending((prev) => [entry, ...prev]);

    recordDecision.mutate(
      {
        action: kind,
        actor: actorEmail,
        decisionRef: ref,
        payee: entry.payee,
        billKey,
        billNumber: entry.billNumber,
        fromAmount: entry.fromAmount,
        toAmount: entry.toAmount,
        scheduledFor: entry.scheduledFor,
        reason: entry.reason,
      },
      {
        onSuccess: () => {
          setPending((prev) => prev.filter((d) => d.ref !== ref));
        },
        onError: (err) => {
          setPending((prev) => prev.filter((d) => d.ref !== ref));
          toast({
            variant: "destructive",
            title: "Decision could not be saved",
            description: (err as Error).message,
          });
        },
      },
    );
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

  // Decisions are append-only in the database by design (audit trail — no UPDATE/DELETE grant for
  // authenticated, migrations 083/084). "Undo" here only removes a still-saving optimistic row before
  // it lands; once persisted, the only way to change course is a fresh decision (e.g. Hold) which adds
  // a new row to the trail rather than erasing the old one — that IS the audit trail working as designed.
  const undo = (ref: string) => setPending((prev) => prev.filter((d) => d.ref !== ref));

  // KPI aggregates
  const total = useMemo(() => rows.reduce((s, r) => s + n(r.amount), 0), [rows]);
  const decisions = useMemo(() => Array.from(decisionByKey.values()), [decisionByKey]);
  const approvedAmt = useMemo(
    () => decisions.filter((d) => d.action === "approve" || d.action === "partial")
      .reduce((s, d) => s + d.toAmount, 0),
    [decisions],
  );
  const pendingCount = rows.length - decidedKeys.size;
  const arReady = ready.data?.available === true;

  // Full audit-log history (every persisted decision, not deduped by bill — a bill can be decided
  // more than once over time, e.g. Hold then later Approve, and each is its own permanent row) plus
  // any still-saving pending rows, newest first.
  const auditLog = useMemo<PendingDecision[]>(() => {
    const fromPersisted: PendingDecision[] = persistedLog.map((d) => {
      const parsed = parseDiff(d.diff);
      return {
        ref: d.decision_ref ?? d.id,
        billKey: parsed.billKey ?? d.id,
        billNumber: parsed.billNumber,
        payee: parsed.payee ?? "—",
        action: d.action as DecisionKind,
        fromAmount: parsed.fromAmount ?? 0,
        toAmount: parsed.toAmount ?? parsed.fromAmount ?? 0,
        scheduledFor: parsed.scheduledFor ?? undefined,
        reason: d.reason ?? undefined,
        actor: d.actor ?? "—",
        at: d.occurred_at,
        saving: false,
      };
    });
    const persistedRefs = new Set(fromPersisted.map((d) => d.ref));
    const stillPending = pending.filter((d) => !persistedRefs.has(d.ref));
    return [...stillPending, ...fromPersisted].sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [persistedLog, pending]);

  // Payment-run export (the "distinta") — every approved/partial/scheduled decision, ready for a
  // human to take into the bank. This is a FILE, not a send: no bank/Qoyod API is called from here.
  const exportPaymentRun = () => {
    const toExport = decisions.filter((d) => d.action === "approve" || d.action === "partial" || d.action === "schedule");
    if (toExport.length === 0) {
      toast({ title: "Nothing to export", description: "No approved, partial or scheduled decisions yet." });
      return;
    }
    const header = ["Decision ref", "Payee", "Bill number", "Amount SAR", "Decision", "Pay on / scheduled for", "Decided by", "Decided at", "Note"];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [header.map(escape).join(",")];
    for (const d of toExport) {
      const found = rows.find((r) => rowKey(r) === d.billKey);
      lines.push([
        d.ref,
        d.payee,
        found?.bill_number ?? "—",
        fmt(d.toAmount),
        DECISION_META[d.action].label,
        d.scheduledFor ?? "—",
        d.actor,
        new Date(d.at).toLocaleString(),
        d.reason ?? "",
      ].map((v) => escape(String(v))).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `trio-payment-run-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Owner-audit #2 (2026-08-04): page previously jumped straight from
          the top nav into the DRAFT banner with no title identifying the
          page — every other page in the product (Economics, Cash Flow,
          Balance Sheet, Confirmations, …) carries one. Same h1/subtitle
          pattern as those pages. */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl tracking-wide text-foreground">Approvals</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            CEO review queue for the ready-to-pay run — approve, adjust, or hold each bill. Decisions are
            recorded durably, with who and when. Payment execution stays manual.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={exportPaymentRun}>
          <Download className="h-3.5 w-3.5" /> Export payment run (CSV)
        </Button>
      </div>

      {/* EXECUTION guard banner — persistent. Updated 2026-09-11: decisions ARE now durably recorded
          (migrations 083/084) — the guard is about what this panel still deliberately does NOT do. */}
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <strong>Decisions here are recorded, not executed.</strong> Every Approve / Schedule / Partial /
          Hold / Reject is saved permanently to the audit log with who decided and when — it survives a
          reload and cannot be edited after the fact (a new decision adds a new row; it never overwrites
          the old one). Use <strong>Export payment run</strong> to hand approved items to whoever executes
          payment in the bank. <strong>Nothing here pays or sends anything</strong> — no bank or Qoyod API
          is ever called from this panel — and the ranking (tier / score / cash buffer) still depends on
          Treasury Decision-Rules pending Marcello / Arwa sign-off, so treat the queue order as indicative.
          Execution remains manual, by design (segregation of duties).
        </span>
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Run total (candidate)" value={arReady ? fmt(total) : "—"}
          sub={arReady ? `${rows.length} bills in queue` : "loading…"} icon={Wallet} accent="neutral" />
        <KpiTile label="Pending decision" value={arReady ? String(pendingCount) : "—"}
          sub={arReady ? `${decidedKeys.size} decided` : "loading…"} icon={ListChecks}
          accent={pendingCount > 0 ? "warn" : "good"} />
        <KpiTile label="Approved" value={fmt(approvedAmt)}
          sub={`${decisions.filter((d) => d.action === "approve" || d.action === "partial").length} items`} icon={CheckCircle2} accent="good" />
        <KpiTile label="Held / rejected" value={String(decisions.filter((d) => d.action === "hold" || d.action === "reject").length)}
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
            <DataSourceBadge source="live" sourceLabel="Live data from Supabase (v_ready_to_pay)" />
            <span className="text-xs text-muted-foreground">Live payables-ready-to-pay data · SAR</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4 inline-flex items-center gap-1.5 flex-wrap">
            Ranked by tier, then by how overdue each bill is.
            <span title="Within-tier ordering uses the deadline signal; the Score column is a live-editable draft ranking, not yet confirmed.">
              <Info className="h-3.5 w-3.5 text-gold/80 cursor-help" />
            </span>
            <span className="inline-flex items-center gap-1.5">
              Tier &amp; score <ProposedBadge detail="Within-tier scoring weights, not yet confirmed." />
            </span>
          </p>

          <div className="mb-4 flex items-start gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-gold/70" />
            <span>
              Cash guardrail — projected balance after the run flags if it would drop below the
              minimum cash buffer. <strong className="text-foreground">Buffer value: to be set by Trio</strong> —
              no default is invented here. <ProposedBadge className="ml-1" detail="Awaiting Trio's cash-buffer decision." />
            </span>
          </div>

          <ScrollHint>
            <table className="w-full min-w-[940px] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="text-left py-1 pr-2 font-semibold">Payee</th>
                  <th className="text-left py-1 px-2 font-semibold">Ref</th>
                  <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Amount SAR</th>
                  <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Due / overdue</th>
                  <th className="text-left py-1 px-2 font-semibold">Tier</th>
                  <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Score</th>
                  <th className="text-left py-1 px-2 font-semibold">Rec.</th>
                  <th className="text-right py-1 pl-2 font-semibold">CEO decision</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = rowKey(r);
                  const decided = decisionByKey.get(key);
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
                      <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
                        {(() => {
                          const p = r.qoyod_bill_id != null ? scoreByBill.get(r.qoyod_bill_id) : undefined;
                          return p?.priority_score != null ? p.priority_score.toFixed(2) : "—";
                        })()}
                      </td>
                      <td className="py-2 px-2 whitespace-nowrap text-xs text-muted-foreground">
                        {r.recommended_action === "PAY_NOW" ? "Pay now" : r.recommended_action === "HOLD" ? "Hold" : "Schedule"}
                      </td>
                      <td className="py-2 pl-2">
                        {decided ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className={`text-xs font-semibold ${DECISION_META[decided.action].tone} inline-flex items-center gap-1`}>
                              {decided.saving && <Loader2 className="h-3 w-3 animate-spin" />}
                              {DECISION_META[decided.action].label}
                              {decided.action === "partial" && ` ${fmt(decided.toAmount)}`}
                              {decided.action === "schedule" && decided.scheduledFor && ` ${decided.scheduledFor}`}
                            </span>
                            {decided.saving ? (
                              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => undo(decided.ref)}>
                                cancel
                              </Button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground" title="Saved to the audit log — recorded, not editable">saved</span>
                            )}
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
          Every CEO decision is captured with actor, timestamp, amount and a reference id, and saved durably
          to <code className="text-xs mx-1">payment_decision_log</code> — append-only, cannot be edited after
          the fact. Rows marked <span className="text-muted-foreground">saving…</span> are still being
          written; everything else here has survived a reload.
        </p>

        {auditLog.length === 0 ? (
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
                {auditLog.map((d) => {
                  const m = DECISION_META[d.action];
                  return (
                    <tr key={d.ref} className="border-b border-border/10">
                      <td className="py-1.5 pr-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">{d.ref}</td>
                      <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">
                        {d.saving
                          ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> saving…</span>
                          : new Date(d.at).toLocaleString()}
                      </td>
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
        Decisions are recorded durably to the audit log, with who and when. Ranking (tier / score / cash
        buffer) still depends on Treasury Decision-Rules pending sign-off. Payment execution stays manual,
        by design — this panel never pays or sends anything.
      </p>
    </div>
  );
};
