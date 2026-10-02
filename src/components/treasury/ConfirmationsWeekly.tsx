// Confirmations — weekly invoices-to-confirm review (Treasury workspace,
// sub-tab 4/4).
//
// SCOPE: vendor bills captured by the invoice-inbox agent that did not
// cleanly post and need a human look (migration 052, v_invoices_to_confirm),
// grouped by ISO week. This is a REVIEW surface, not a posting gate — the
// invoice-inbox agent already posts to Qoyod with zero approval gate
// (ADR-007); Confirm / Needs fix / Escalate here only records that a human
// looked at it (treasury_action_log, migration 059). No write to Qoyod, no
// re-posting, happens from these buttons.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { CheckCircle2, Wrench, TriangleAlert, HardHat, FileText, ChevronDown, ChevronUp, History } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  useInvoicesToConfirm, useInvoicesToConfirmWeekly, useTreasuryActionLog, useRecordTreasuryAction,
  type InvoiceToConfirmRow,
} from "@/data/treasuryLive";
import { fmtSAR } from "@/lib/format";

const n = (v: number | null | undefined): number => v ?? 0;
const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);

type ConfirmAction = "confirm" | "needs_fix" | "escalate";

const ACTION_META: Record<ConfirmAction, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string; ring: string }> = {
  confirm:   { label: "Confirm",    icon: CheckCircle2, tone: "text-emerald-400", ring: "border-emerald-500/40 hover:bg-emerald-500/10" },
  needs_fix: { label: "Needs fix",  icon: Wrench,        tone: "text-warning",     ring: "border-warning/40 hover:bg-warning/10" },
  escalate:  { label: "Escalate",   icon: TriangleAlert, tone: "text-destructive", ring: "border-destructive/40 hover:bg-destructive/10" },
};

export const ConfirmationsWeekly = () => {
  const { session } = useAuth();
  const { toast } = useToast();
  const detail = useInvoicesToConfirm();
  const weekly = useInvoicesToConfirmWeekly();
  const log = useTreasuryActionLog("CONFIRMATION");
  const record = useRecordTreasuryAction();

  const rows = useMemo<InvoiceToConfirmRow[]>(() => (detail.data?.available ? detail.data.rows : []), [detail.data]);
  const weeks = useMemo(() => (weekly.data?.available ? weekly.data.rows : []), [weekly.data]);

  const decided = useMemo(() => {
    const m = new Map<string, string>();
    if (log.data?.available) for (const r of log.data.rows) if (!m.has(r.entity_ref)) m.set(r.entity_ref, r.action);
    return m;
  }, [log.data]);

  const byWeek = useMemo(() => {
    const m = new Map<string, InvoiceToConfirmRow[]>();
    for (const r of rows) {
      const list = m.get(r.iso_week) ?? [];
      list.push(r);
      m.set(r.iso_week, list);
    }
    return m;
  }, [rows]);

  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set());
  const toggleWeek = (w: string) =>
    setOpenWeeks((prev) => { const next = new Set(prev); next.has(w) ? next.delete(w) : next.add(w); return next; });

  const [adjust, setAdjust] = useState<{ row: InvoiceToConfirmRow; kind: ConfirmAction } | null>(null);
  const [note, setNote] = useState("");
  const actorEmail = session?.user?.email ?? null;

  const doRecord = (row: InvoiceToConfirmRow, kind: ConfirmAction, reason?: string) => {
    record.mutate(
      {
        domain: "CONFIRMATION",
        entity_ref: row.bill_id,
        action: kind,
        actor: actorEmail,
        reason,
        payload: { vendor: row.vendor, invoice_number: row.invoice_number, amount_sar: row.amount_sar, status: row.status },
      },
      {
        onSuccess: () => toast({ title: ACTION_META[kind].label + " recorded", description: "Decision logged to the audit trail." }),
        onError: (err) => toast({ title: "Could not record decision", description: String(err), variant: "destructive" }),
      },
    );
  };

  const onQuick = (row: InvoiceToConfirmRow, kind: ConfirmAction) => {
    if (kind === "confirm") { doRecord(row, kind); return; }
    setAdjust({ row, kind });
    setNote("");
  };

  const confirmAdjust = () => {
    if (!adjust) return;
    doRecord(adjust.row, adjust.kind, note || undefined);
    setAdjust(null);
  };

  const ready = detail.data?.available === true;

  // Auto-open the most recent week.
  useMemo(() => {
    if (weeks.length > 0 && openWeeks.size === 0) setOpenWeeks(new Set([weeks[0].iso_week]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks.length]);

  return (
    <div className="space-y-6">
      {detail.isError ? (
        <Card className="p-6"><p className="text-sm text-destructive">
          {(detail.error as Error | null)?.name === "PermissionDeniedError"
            ? (detail.error as Error).message
            : "Could not load invoices-to-confirm from Supabase."}
        </p></Card>
      ) : !ready ? (
        <Card className="p-8 text-center space-y-3 animate-fade-in">
          <HardHat className="h-7 w-7 mx-auto text-gold/70" />
          <h3 className="text-lg font-heading tracking-wide">CONFIRMATIONS — NOT YET AVAILABLE</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The invoices-to-confirm view (<code className="text-xs">v_invoices_to_confirm</code>) is not yet
            mirrored, or no vendor bills have been captured yet — the payables mirror is known to lag. This
            section will populate automatically once bills land.
          </p>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">
          Nothing awaiting confirmation right now.
        </p></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="p-4 border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Total to confirm</div>
              <div className="mt-1 text-xl font-heading tabular-nums">{rows.length}</div>
            </Card>
            <Card className="p-4 border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Amount SAR</div>
              <div className="mt-1 text-xl font-heading tabular-nums">{fmt(rows.reduce((s, r) => s + n(r.amount_sar), 0))}</div>
            </Card>
            <Card className="p-4 border-amber-500/40">
              <div className="text-xs uppercase tracking-wider text-warning">Anomaly-flagged</div>
              <div className="mt-1 text-xl font-heading tabular-nums">{weeks.reduce((s, w) => s + w.anomaly_count, 0)}</div>
            </Card>
            <Card className="p-4 border-destructive/30">
              <div className="text-xs uppercase tracking-wider text-destructive">Parse/post failures</div>
              <div className="mt-1 text-xl font-heading tabular-nums">{weeks.reduce((s, w) => s + w.failure_count, 0)}</div>
            </Card>
          </div>

          {weeks.map((w) => {
            const items = byWeek.get(w.iso_week) ?? [];
            const isOpen = openWeeks.has(w.iso_week);
            return (
              <Card key={w.iso_week} className="shadow-sm animate-fade-in overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleWeek(w.iso_week)}
                  className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-heading tracking-wide">WEEK {w.iso_week}</h3>
                    <DataSourceBadge source="live" />
                    <span className="text-xs text-muted-foreground">
                      {w.bills_to_confirm} bills · {fmt(n(w.total_amount_sar))} SAR
                      {w.anomaly_count > 0 && <> · <span className="text-warning">{w.anomaly_count} anomaly</span></>}
                      {w.failure_count > 0 && <> · <span className="text-destructive">{w.failure_count} failed</span></>}
                    </span>
                  </div>
                  {isOpen ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                </button>
                {isOpen && (
                  <div className="px-6 pb-6">
                    <ScrollHint>
                      <table className="w-full min-w-[880px] text-sm">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                            <th className="text-left py-1 pr-2 font-semibold">Vendor</th>
                            <th className="text-left py-1 px-2 font-semibold">Invoice</th>
                            <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Amount SAR</th>
                            <th className="text-left py-1 px-2 font-semibold">Reason</th>
                            <th className="text-center py-1 px-2 font-semibold">Doc</th>
                            <th className="text-right py-1 pl-2 font-semibold">Decision</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((r) => {
                            const already = decided.get(r.bill_id);
                            return (
                              <tr key={r.bill_id} className="border-b border-border/10">
                                <td className="py-2 pr-2 max-w-[180px] truncate" title={r.vendor ?? ""}>{r.vendor ?? "—"}</td>
                                <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{r.invoice_number ?? "—"}</td>
                                <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">{fmt(n(r.amount_sar))}</td>
                                <td className="py-2 px-2 max-w-[240px] truncate text-xs text-muted-foreground" title={r.confirm_reason ?? ""}>
                                  {r.confirm_reason ?? "—"}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  {r.invoice_pdf_link ? (
                                    <a href={r.invoice_pdf_link} target="_blank" rel="noreferrer" title="Open invoice PDF" className="inline-flex text-gold hover:text-gold/80">
                                      <FileText className="h-4 w-4" />
                                    </a>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="py-2 pl-2">
                                  {already ? (
                                    <div className="flex items-center justify-end">
                                      <span className={`text-xs font-semibold ${ACTION_META[already as ConfirmAction]?.tone ?? ""}`}>
                                        {ACTION_META[already as ConfirmAction]?.label ?? already}
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center justify-end gap-1 flex-wrap">
                                      {(Object.keys(ACTION_META) as ConfirmAction[]).map((k) => {
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
                  </div>
                )}
              </Card>
            );
          })}
        </>
      )}

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
                  <th className="text-left py-1 px-2 font-semibold">Bill</th>
                  <th className="text-left py-1 pl-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {log.data.rows.slice(0, 20).map((d) => (
                  <tr key={d.id} className="border-b border-border/10">
                    <td className="py-1.5 pr-2 text-muted-foreground whitespace-nowrap">{new Date(d.occurred_at).toLocaleString()}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap">{d.actor ?? "—"}</td>
                    <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{d.entity_ref}</td>
                    <td className="py-1.5 pl-2 font-semibold">{ACTION_META[d.action as ConfirmAction]?.label ?? d.action}</td>
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
              {adjust ? ACTION_META[adjust.kind].label : ""} — {adjust?.row.vendor}
            </DialogTitle>
            <DialogDescription>
              {adjust?.kind === "needs_fix" && "Note what needs correcting. This does not re-post to Qoyod."}
              {adjust?.kind === "escalate" && "Escalate for a second look — note why."}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Optional note" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjust(null)}>Cancel</Button>
            <Button onClick={confirmAdjust} disabled={record.isPending}>Record decision</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
