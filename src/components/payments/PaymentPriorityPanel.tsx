// Payment Priority Panel — Treasury review parameters (Mrs Arwa, Tuesday).
//
// SCOPE: a ranked list of bills to pay (v_payment_priority, migration 050), with an
// editable copy of the scoring weights (payment_priority_config) that re-ranks the
// table live as the reviewer adjusts them. Mirrors CeoApprovalPanel.tsx exactly in
// layout/style: KPI band → DRAFT sign-off banner → data-availability guard → main
// card(s). See that file's header for the two-guard pattern this panel repeats.
//
// TWO DELIBERATE GUARDS:
//  1. DATA guard — reads v_payment_priority + payment_priority_config live; until
//     migration 050 is applied it shows a graceful "not yet available" card and
//     re-polls (paymentPriorityLive.ts hooks), same pattern as the aging views.
//  2. SIGN-OFF guard — a persistent DRAFT banner: the weights are advisory until
//     confirmed with Arwa. Nothing is paid or sent from this screen.
//
// WRITE-BACK boundary: editing the weights here NEVER touches payment_priority_config
// in Supabase (that write path needs the signed-off approver auth model). Instead the
// panel keeps an in-session editable copy (useState, seeded from the live config once
// it loads) and recomputes priority_score CLIENT-SIDE with the same formula as the
// view — see recomputePriorityScore in paymentPriorityLive.ts.
import { Fragment, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  ShieldAlert, HardHat, Wallet, ListChecks, Trophy, AlertTriangle,
  SlidersHorizontal, RotateCcw, ChevronDown, ChevronRight, Flame,
} from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { fmtSAR } from "@/lib/format";
import {
  usePaymentPriority, usePaymentPriorityConfig,
  DEFAULT_PAYMENT_PRIORITY_CONFIG, toEditableWeights, recomputePriorityScore, weightsSum,
  PRIORITY_TIER_META,
  type PaymentPriorityRow, type EditablePriorityWeights,
} from "@/data/paymentPriorityLive";

const n = (v: number | null | undefined): number => v ?? 0;
const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);
const rowKey = (r: PaymentPriorityRow) => String(r.qoyod_bill_id ?? r.bill_number ?? r.payee ?? Math.random());

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
    <h3 className="text-lg font-heading tracking-wide">PAYMENT PRIORITY LIST — NOT YET AVAILABLE</h3>
    <p className="text-sm text-muted-foreground max-w-md mx-auto">
      The payment-priority view (<code className="text-xs">v_payment_priority</code>, migration 050) and its
      scoring config (<code className="text-xs">payment_priority_config</code>) are not yet applied to the data
      layer. This panel will populate automatically as soon as they are published — no reload needed.
    </p>
  </Card>
);

// ---------------------------------------------------- weight slider row
const WeightRow = ({
  label, value, onChange, max = 1, step = 0.05, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void;
  max?: number; step?: number; suffix?: string;
}) => (
  <div className="grid grid-cols-[1fr_auto] items-center gap-3">
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
        <span className="text-xs font-semibold tabular-nums">
          {value.toFixed(step < 1 ? 2 : 0)}{suffix}
        </span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
    </div>
  </div>
);

// ------------------------------------------------------------- cap input
const CapInput = ({
  label, value, onChange, suffix,
}: {
  label: string; value: number; onChange: (v: number) => void; suffix?: string;
}) => (
  <div>
    <label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</label>
    <div className="mt-1 flex items-center gap-2">
      <Input
        type="number"
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(Number.isFinite(v) ? v : value);
        }}
        className="h-9"
      />
      {suffix && <span className="text-xs text-muted-foreground whitespace-nowrap">{suffix}</span>}
    </div>
  </div>
);

export const PaymentPriorityPanel = () => {
  const priority = usePaymentPriority();
  const config = usePaymentPriorityConfig();

  const rows = useMemo<PaymentPriorityRow[]>(
    () => (priority.data?.available ? priority.data.rows : []),
    [priority.data],
  );
  const liveConfig = config.data?.available && config.data.rows.length > 0 ? config.data.rows[0] : null;
  const configAvailable = config.data?.available === true;
  const priorityAvailable = priority.data?.available === true;
  const dataAvailable = priorityAvailable && configAvailable;

  // In-session editable weights — seeded from the live config once, never written back.
  const [weights, setWeights] = useState<EditablePriorityWeights>(toEditableWeights(DEFAULT_PAYMENT_PRIORITY_CONFIG));
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (!seeded && liveConfig) {
      setWeights(toEditableWeights(liveConfig));
      setSeeded(true);
    }
  }, [liveConfig, seeded]);

  const resetToDefaults = () => setWeights(toEditableWeights(liveConfig ?? DEFAULT_PAYMENT_PRIORITY_CONFIG));

  const setWeight = <K extends keyof EditablePriorityWeights>(key: K, value: number) =>
    setWeights((prev) => ({ ...prev, [key]: value }));

  // Re-ranked rows — recomputed client-side on every weight change.
  const rankedRows = useMemo(() => {
    return rows
      .map((r) => ({ row: r, score: recomputePriorityScore(r, weights) }))
      .sort((a, b) => b.score - a.score);
  }, [rows, weights]);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  // KPI aggregates
  const total = useMemo(() => rows.reduce((s, r) => s + n(r.amount), 0), [rows]);
  const topPayees = useMemo(() => {
    const byPayee = new Map<string, number>();
    for (const r of rows) {
      const key = r.payee ?? "—";
      byPayee.set(key, (byPayee.get(key) ?? 0) + n(r.amount));
    }
    return [...byPayee.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [rows]);
  const criticalCount = useMemo(() => rows.filter((r) => r.is_critical).length, [rows]);

  const sum = weightsSum(weights);
  const sumTone = Math.abs(sum - 1) < 0.005 ? "text-emerald-400" : "text-warning";

  const errored = priority.isError || config.isError;
  const errorMsg =
    (priority.error as Error | null)?.name === "PermissionDeniedError"
      ? (priority.error as Error).message
      : (config.error as Error | null)?.name === "PermissionDeniedError"
        ? (config.error as Error).message
        : "Could not load the payment-priority list from Supabase.";

  return (
    <div className="space-y-6">
      {/* SIGN-OFF guard banner — persistent */}
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <strong>DRAFT — advisory ranking, not a live payment tool.</strong> The scoring weights below are
          editable for this Treasury review and are pending Marcello / Arwa sign-off. Changing them re-ranks
          the table instantly for discussion, but <strong>nothing is written back, paid, or sent</strong> from
          this screen — edited weights stay in-session only. Execution remains manual (segregation of duties).
        </span>
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Bills in queue" value={dataAvailable ? String(rows.length) : "—"}
          sub={dataAvailable ? `${criticalCount} flagged critical` : "loading…"} icon={ListChecks} accent="neutral" />
        <KpiTile label="Total SAR" value={dataAvailable ? fmt(total) : "—"}
          sub={dataAvailable ? "sum of open bills shown" : "loading…"} icon={Wallet} accent="neutral" />
        <KpiTile label="Top payee" value={dataAvailable && topPayees[0] ? fmt(topPayees[0][1]) : "—"}
          sub={dataAvailable && topPayees[0] ? topPayees[0][0] : "loading…"} icon={Trophy} accent="good" />
        <KpiTile label="Weights sum" value={sum.toFixed(2)}
          sub={Math.abs(sum - 1) < 0.005 ? "balanced (= 1.00)" : "does not sum to 1.00"}
          icon={Flame} accent={Math.abs(sum - 1) < 0.005 ? "good" : "warn"} />
      </div>

      {topPayees.length > 0 && (
        <Card className="p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Top 3 payees by amount</div>
          <div className="flex flex-wrap gap-2">
            {topPayees.map(([payee, amt]) => (
              <span key={payee} className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1 text-xs">
                <span className="truncate max-w-[160px]" title={payee}>{payee}</span>
                <span className="tabular-nums text-muted-foreground">{fmt(amt)}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Editable priority parameters */}
      <Card className="p-6 shadow-sm animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
          <div className="flex items-center gap-3">
            <SlidersHorizontal className="h-4 w-4 text-gold" />
            <h3 className="text-xl font-heading tracking-wide">EDITABLE PRIORITY PARAMETERS</h3>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={resetToDefaults}>
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to defaults
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mb-5">
          Adjust the weights and caps to test how the ranking changes. Weights are meant to sum to 1.00
          (tier 40% · overdue 30% · amount 15% · due-soon 15% by default); the table below re-ranks live.
        </p>

        <div className="grid md:grid-cols-2 gap-x-8 gap-y-4 mb-6">
          <WeightRow label="Weight — tier" value={weights.weight_tier} onChange={(v) => setWeight("weight_tier", v)} />
          <WeightRow label="Weight — overdue" value={weights.weight_overdue} onChange={(v) => setWeight("weight_overdue", v)} />
          <WeightRow label="Weight — amount" value={weights.weight_amount} onChange={(v) => setWeight("weight_amount", v)} />
          <WeightRow label="Weight — due soon" value={weights.weight_due_soon} onChange={(v) => setWeight("weight_due_soon", v)} />
          <WeightRow label="Critical boost" value={weights.critical_boost} onChange={(v) => setWeight("critical_boost", v)} max={1} />
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-border/40">
          <CapInput label="Overdue cap (days)" value={weights.overdue_cap_days}
            onChange={(v) => setWeight("overdue_cap_days", v)} suffix="days" />
          <CapInput label="Amount cap" value={weights.amount_cap_sar}
            onChange={(v) => setWeight("amount_cap_sar", v)} suffix="SAR" />
          <CapInput label="Due-soon window" value={weights.due_soon_window_days}
            onChange={(v) => setWeight("due_soon_window_days", v)} suffix="days" />
          <CapInput label="Cash buffer floor" value={weights.cash_buffer_floor_sar}
            onChange={(v) => setWeight("cash_buffer_floor_sar", v)} suffix="SAR" />
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Caps are shown for transparency and discussion; the four score components below are computed
          server-side against the caps currently applied in the view. Re-ranking here reweights those
          components live — it does not re-derive them from raw days-overdue/amount.
        </p>
      </Card>

      {/* Ranked table */}
      {errored ? (
        <Card className="p-6"><p className="text-sm text-destructive">{errorMsg}</p></Card>
      ) : !dataAvailable ? (
        <NotAvailable />
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">
          No open payables in the queue — nothing to prioritise.
        </p></Card>
      ) : (
        <Card className="p-6 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <h3 className="text-xl font-heading tracking-wide">RANKED PAYMENT PRIORITY</h3>
            <DataSourceBadge source="live" />
            <span className="text-xs text-muted-foreground">Supabase · v_payment_priority · SAR</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Ranked by priority score, recomputed live from the weights above. Higher score = pay sooner.
            Click a row to see the component breakdown.
          </p>

          <ScrollHint>
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                  <th className="text-left py-1 pr-2 font-semibold w-10">#</th>
                  <th className="text-left py-1 px-2 font-semibold">Payee</th>
                  <th className="text-left py-1 px-2 font-semibold">Ref</th>
                  <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Amount SAR</th>
                  <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Due / overdue</th>
                  <th className="text-left py-1 px-2 font-semibold">Tier</th>
                  <th className="text-right py-1 pl-2 font-semibold whitespace-nowrap">Score</th>
                </tr>
              </thead>
              <tbody>
                {rankedRows.map(({ row: r, score }, idx) => {
                  const key = rowKey(r);
                  const isOpen = expanded.has(key);
                  const tier = PRIORITY_TIER_META[r.tier ?? 2] ?? PRIORITY_TIER_META[2];
                  return (
                    <Fragment key={key}>
                      <tr
                        className="border-b border-border/10 cursor-pointer hover:bg-muted/10"
                        onClick={() => toggleExpanded(key)}
                      >
                        <td className="py-2 pr-2 text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-2 px-2 max-w-[220px] truncate" title={r.payee ?? ""}>
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
                          {r.is_critical && <span className="ml-1.5 text-[10px] text-destructive font-semibold">CRITICAL</span>}
                          {r.tier_confirmed === false && (
                            <span className="text-[10px] text-muted-foreground"> (default)</span>
                          )}
                        </td>
                        <td className="py-2 pl-2 text-right tabular-nums font-semibold whitespace-nowrap">
                          {score.toFixed(3)}
                          {r.score_is_draft && <span className="ml-1 text-[10px] text-warning font-normal">draft</span>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="border-b border-border/10 bg-muted/10">
                          <td />
                          <td colSpan={6} className="py-3 px-2">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                              <div>
                                <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Tier component</div>
                                <div className="tabular-nums font-semibold">
                                  {(r.tier_component ?? 0).toFixed(3)}
                                  <span className="text-muted-foreground font-normal"> × {weights.weight_tier.toFixed(2)}</span>
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Overdue component</div>
                                <div className="tabular-nums font-semibold">
                                  {(r.overdue_component ?? 0).toFixed(3)}
                                  <span className="text-muted-foreground font-normal"> × {weights.weight_overdue.toFixed(2)}</span>
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Amount component</div>
                                <div className="tabular-nums font-semibold">
                                  {(r.amount_component ?? 0).toFixed(3)}
                                  <span className="text-muted-foreground font-normal"> × {weights.weight_amount.toFixed(2)}</span>
                                </div>
                              </div>
                              <div>
                                <div className="text-muted-foreground uppercase tracking-wider text-[10px]">Due-soon component</div>
                                <div className="tabular-nums font-semibold">
                                  {(r.due_soon_component ?? 0).toFixed(3)}
                                  <span className="text-muted-foreground font-normal"> × {weights.weight_due_soon.toFixed(2)}</span>
                                </div>
                              </div>
                            </div>
                            {r.is_critical && (
                              <div className="mt-2 text-xs text-destructive">
                                + critical boost {weights.critical_boost.toFixed(2)} applied
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </ScrollHint>
        </Card>
      )}

      <p className="text-xs text-muted-foreground flex items-start gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
        Read-only. Weight edits stay in-session and are for the Treasury review only — persisting them to
        <code className="text-[11px] mx-1">payment_priority_config</code> is the go-live step, once the
        approver auth model is signed off. Payment execution stays manual.
      </p>
    </div>
  );
};
