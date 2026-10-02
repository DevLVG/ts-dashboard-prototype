// Treasury / Cash screen — LIVE from Supabase.
//   - AR aging  (ar_aging_v2)            → receivables open book by bucket
//   - AP aging  (ap_aging_v2)            → payables open book by bucket
//   - Working capital (v_working_capital_monthly) → AR / AP / net WC trend
//
// SCOPE (Master-Checklist task #22 — "Bring the treasury/cash section
// (aging + working capital) into daily use"). This is the read-only
// MONITORING surface: it makes the open books and their ageing visible for
// daily treasury use. The ACTION panels (reminder queue #24, ready-to-pay
// list) are separate tasks pending the Treasury Decision-Rules sign-off
// (Marcello / Arwa) — deliberately NOT built here.
//
// Buckets follow the agreed 5-bucket ladder (Treasury-Decision-Rules §A.1):
// Current · 1–30 · 31–60 · 61–90 · 90+. residual_amount is Qoyod-native
// (net of payments AND applied credit notes) per migration 025.
//
// DATA-FRESHNESS CAVEAT (Treasury-Decision-Rules §C, middleware snapshot
// 2026-07-22): the AR side is fresh; the AP side lags (bills feed behind,
// bank feed empty). The AP card carries an explicit amber caveat so the
// number is never read as fully confirmed.
import { Fragment, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip as RTooltip, Legend, ReferenceLine,
} from "recharts";
import { Info, HardHat, Wallet, ArrowDownCircle, ArrowUpCircle, Scale, AlertTriangle } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { DataFreshnessNote } from "@/components/dashboard/DataFreshnessNote";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import {
  useArAging, useApAging, useWorkingCapitalMonthly,
  AGING_BUCKET_ORDER, type AgingBucket, type ArAgingRow, type ApAgingRow,
} from "@/data/statementsLive";
import { monthKey, monthKeyLabel } from "@/data/liveData";
import { fmtSAR, fmtCompact } from "@/lib/format";

const n = (v: number | null | undefined): number => v ?? 0;
const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);
const pctOf = (part: number, whole: number) => (Math.abs(whole) < 0.5 ? 0 : (part / whole) * 100);

// Bucket presentation — severity rises with age. Current is neutral; overdue
// buckets escalate neutral → warning → destructive (same semantic palette the
// rest of the cockpit uses).
const BUCKET_META: Record<AgingBucket, { label: string; short: string; bar: string; text: string }> = {
  current: { label: "Current (not due)", short: "Current", bar: "bg-muted-foreground/40", text: "text-muted-foreground" },
  "1-30": { label: "1–30 days overdue", short: "1–30", bar: "bg-sky-400/70", text: "text-foreground" },
  "31-60": { label: "31–60 days overdue", short: "31–60", bar: "bg-warning/70", text: "text-warning" },
  "61-90": { label: "61–90 days overdue", short: "61–90", bar: "bg-amber-500/80", text: "text-warning" },
  ">90": { label: "90+ days overdue", short: "90+", bar: "bg-destructive/70", text: "text-destructive" },
};

interface BucketAgg {
  bucket: AgingBucket;
  count: number;
  amount: number;
}

interface AgingSummary {
  buckets: BucketAgg[];
  total: number;
  overdue: number; // everything except "current"
  count: number;
  overdueCount: number;
}

const summarise = (rows: { aging_bucket: AgingBucket; residual_amount: number | null }[]): AgingSummary => {
  const byBucket = new Map<AgingBucket, BucketAgg>();
  for (const b of AGING_BUCKET_ORDER) byBucket.set(b, { bucket: b, count: 0, amount: 0 });
  let total = 0, overdue = 0, overdueCount = 0;
  for (const r of rows) {
    const agg = byBucket.get(r.aging_bucket);
    const amt = n(r.residual_amount);
    if (agg) { agg.count += 1; agg.amount += amt; }
    total += amt;
    if (r.aging_bucket !== "current") { overdue += amt; overdueCount += 1; }
  }
  return {
    buckets: AGING_BUCKET_ORDER.map((b) => byBucket.get(b)!),
    total, overdue, count: rows.length, overdueCount,
  };
};

// -------------------------------------------------------------- KPI tile
const KpiTile = ({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<{ className?: string }>; accent?: "neutral" | "warn" | "bad";
}) => {
  const ring =
    accent === "bad" ? "border-destructive/30" : accent === "warn" ? "border-warning/40" : "border-border";
  const iconTone =
    accent === "bad" ? "text-destructive" : accent === "warn" ? "text-warning" : "text-gold";
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

// -------------------------------------------------------------- aging card
const AgingCard = ({
  title, subtitle, sourceLabel, summary, caveat, kind,
}: {
  title: string;
  /** Owner-audit #16 (2026-08-04): plain-language now — the raw table name
   * moved to `sourceLabel` (the LIVE badge's tooltip only). */
  subtitle: string;
  sourceLabel: string;
  summary: AgingSummary;
  caveat?: string;
  kind: "ar" | "ap";
}) => (
  <Card className="p-6 shadow-sm animate-fade-in">
    <div className="flex items-center gap-3 mb-1 flex-wrap">
      <h3 className="text-xl font-heading tracking-wide">{title}</h3>
      <DataSourceBadge source="live" sourceLabel={sourceLabel} />
      <span className="text-xs text-muted-foreground">{subtitle}</span>
    </div>
    <p className="text-sm text-muted-foreground mb-4">
      Open book <span className="text-foreground font-medium tabular-nums">{fmt(summary.total)}</span> SAR
      across <span className="text-foreground font-medium">{summary.count}</span> {kind === "ar" ? "invoices" : "bills"}
      {summary.overdue > 0.5 && (
        <> · overdue <span className={`font-medium tabular-nums ${summary.overdue > 0 ? "text-warning" : ""}`}>{fmt(summary.overdue)}</span> ({summary.overdueCount})</>
      )}
    </p>

    {caveat && (
      <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>{caveat}</span>
      </div>
    )}

    <ScrollHint>
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
            <th className="text-left py-1 pr-2 font-semibold">Bucket</th>
            <th className="text-right py-1 pl-2 font-semibold">Count</th>
            <th className="text-right py-1 pl-2 font-semibold whitespace-nowrap">SAR</th>
            <th className="text-right py-1 pl-2 font-semibold">% of book</th>
            <th className="py-1 pl-3 font-semibold w-[28%]">Share</th>
          </tr>
        </thead>
        <tbody>
          {summary.buckets.map((b) => {
            const meta = BUCKET_META[b.bucket];
            const share = pctOf(b.amount, summary.total);
            return (
              <tr key={b.bucket} className="border-b border-border/10">
                <td className={`py-1.5 pr-2 ${meta.text}`}>{meta.label}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground">{b.count || "—"}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{b.amount > 0.5 ? fmt(b.amount) : "—"}</td>
                <td className="py-1.5 pl-2 text-right tabular-nums text-muted-foreground">{b.amount > 0.5 ? `${share.toFixed(0)}%` : "—"}</td>
                <td className="py-1.5 pl-3">
                  <div className="h-2 w-full rounded-full bg-muted/40 overflow-hidden">
                    <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${Math.max(share, b.amount > 0.5 ? 3 : 0)}%` }} />
                  </div>
                </td>
              </tr>
            );
          })}
          <tr className="border-t-2 border-t-border font-semibold text-base">
            <td className="py-2.5 pr-2">Total</td>
            <td className="py-2.5 pl-2 text-right tabular-nums">{summary.count}</td>
            <td className="py-2.5 pl-2 text-right tabular-nums whitespace-nowrap">{fmt(summary.total)}</td>
            <td className="py-2.5 pl-2 text-right tabular-nums text-muted-foreground">100%</td>
            <td />
          </tr>
        </tbody>
      </table>
    </ScrollHint>
  </Card>
);

// ------------------------------------------------------- top-overdue list
interface OverdueItem {
  key: string;
  name: string;
  ref: string;
  amount: number;
  days: number;
  bucket: AgingBucket;
}

const TopOverdueCard = ({
  title, items, party,
}: {
  title: string; items: OverdueItem[]; party: string;
}) => (
  <Card className="p-6 shadow-sm animate-fade-in">
    <div className="flex items-center gap-3 mb-1 flex-wrap">
      <h3 className="text-lg font-heading tracking-wide">{title}</h3>
      <DataSourceBadge source="live" />
    </div>
    <p className="text-xs text-muted-foreground mb-4">
      Largest overdue balances first — the daily worklist for {party}.
    </p>
    {items.length === 0 ? (
      <p className="text-sm text-muted-foreground">Nothing overdue — the open book is all current.</p>
    ) : (
      <ScrollHint>
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
              <th className="text-left py-1 pr-2 font-semibold">{party}</th>
              <th className="text-left py-1 px-2 font-semibold">Ref</th>
              <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Residual SAR</th>
              <th className="text-right py-1 pl-2 font-semibold">Overdue</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const meta = BUCKET_META[it.bucket];
              return (
                <tr key={it.key} className="border-b border-border/10">
                  <td className="py-1.5 pr-2 max-w-[190px] truncate" title={it.name}>{it.name}</td>
                  <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{it.ref}</td>
                  <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{fmt(it.amount)}</td>
                  <td className={`py-1.5 pl-2 text-right tabular-nums whitespace-nowrap ${meta.text}`}>
                    {it.days}d <span className="text-[10px] uppercase">({meta.short})</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollHint>
    )}
  </Card>
);

// -------------------------------------------------------- not-available card
const NotAvailable = ({ what, view }: { what: string; view: string }) => (
  <Card className="p-8 text-center space-y-3 animate-fade-in">
    <HardHat className="h-7 w-7 mx-auto text-gold/70" />
    <h3 className="text-lg font-heading tracking-wide">{what.toUpperCase()} — NOT YET AVAILABLE</h3>
    <p className="text-sm text-muted-foreground max-w-md mx-auto">
      The {what} view (<code className="text-xs">{view}</code>) is being finalised in the data layer.
      This card will populate automatically as soon as the view is published — no reload needed.
    </p>
  </Card>
);

export const TreasuryCash = () => {
  const ar = useArAging();
  const ap = useApAging();
  const { data: wcRows } = useWorkingCapitalMonthly();

  const arRows = useMemo<ArAgingRow[]>(() => (ar.data?.available ? ar.data.rows : []), [ar.data]);
  const apRows = useMemo<ApAgingRow[]>(() => (ap.data?.available ? ap.data.rows : []), [ap.data]);

  const arSummary = useMemo(() => summarise(arRows), [arRows]);
  const apSummary = useMemo(() => summarise(apRows), [apRows]);

  const arTopOverdue: OverdueItem[] = useMemo(
    () =>
      arRows
        .filter((r) => r.aging_bucket !== "current" && n(r.residual_amount) > 0.5)
        .sort((a, b) => n(b.residual_amount) - n(a.residual_amount))
        .slice(0, 8)
        .map((r) => ({
          key: String(r.qoyod_invoice_id ?? r.invoice_number ?? Math.random()),
          name: r.customer_name ?? "—",
          ref: r.invoice_number ?? "—",
          amount: n(r.residual_amount),
          days: Math.max(0, n(r.days_overdue)),
          bucket: r.aging_bucket,
        })),
    [arRows],
  );

  const apTopOverdue: OverdueItem[] = useMemo(
    () =>
      apRows
        .filter((r) => r.aging_bucket !== "current" && n(r.residual_amount) > 0.5)
        .sort((a, b) => n(b.residual_amount) - n(a.residual_amount))
        .slice(0, 8)
        .map((r) => ({
          key: String(r.qoyod_bill_id ?? r.bill_number ?? Math.random()),
          name: r.vendor_name ?? "—",
          ref: r.bill_number ?? "—",
          amount: n(r.residual_amount),
          days: Math.max(0, n(r.days_overdue)),
          bucket: r.aging_bucket,
        })),
    [apRows],
  );

  // Working-capital trend (last 12 months, chronological).
  const wc = useMemo(() => {
    const rows = [...(wcRows ?? [])]
      .sort((a, b) => a.period_month.localeCompare(b.period_month))
      .map((r) => ({
        key: monthKey(r.period_month),
        label: monthKeyLabel(monthKey(r.period_month)),
        receivables: n(r.receivables),
        payables: n(r.payables),
        net: n(r.net_working_capital),
      }));
    return rows.slice(-12);
  }, [wcRows]);
  const wcLatest = wc.length > 0 ? wc[wc.length - 1] : null;

  const arReady = ar.data?.available === true;
  const apReady = ap.data?.available === true;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DataFreshnessNote />
        <span className="text-xs text-muted-foreground">
          Aging as of <strong className="text-foreground">today</strong> · residual net of payments &amp; credit notes
        </span>
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          label="Receivables open" value={arReady ? fmt(arSummary.total) : "—"}
          sub={arReady ? `${arSummary.count} invoices` : "loading…"}
          icon={ArrowDownCircle} accent="neutral"
        />
        <KpiTile
          label="AR overdue" value={arReady ? fmt(arSummary.overdue) : "—"}
          sub={arReady ? `${arSummary.overdueCount} past due` : "loading…"}
          icon={AlertTriangle} accent={arSummary.overdue > 0.5 ? "warn" : "neutral"}
        />
        <KpiTile
          label="Payables open" value={apReady ? fmt(apSummary.total) : "—"}
          sub={apReady ? `${apSummary.count} bills` : "loading…"}
          icon={ArrowUpCircle} accent="neutral"
        />
        <KpiTile
          label="Net working capital"
          value={wcLatest ? fmt(wcLatest.net) : "—"}
          sub={wcLatest ? `as at ${wcLatest.label}` : "—"}
          icon={Scale} accent="neutral"
        />
      </div>

      {/* Aging cards */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {ar.isError ? (
          <Card className="p-6"><p className="text-sm text-destructive">
            {(ar.error as Error | null)?.name === "PermissionDeniedError"
              ? (ar.error as Error).message
              : "Could not load AR aging from Supabase."}
          </p></Card>
        ) : arReady ? (
          <AgingCard
            title="RECEIVABLES AGING"
            subtitle="Live receivables data · SAR"
            sourceLabel="Live data from Supabase (ar_aging_v2)"
            summary={arSummary}
            kind="ar"
          />
        ) : (
          <NotAvailable what="Receivables aging" view="ar_aging_v2" />
        )}

        {ap.isError ? (
          <Card className="p-6"><p className="text-sm text-destructive">
            {(ap.error as Error | null)?.name === "PermissionDeniedError"
              ? (ap.error as Error).message
              : "Could not load AP aging from Supabase."}
          </p></Card>
        ) : apReady ? (
          <AgingCard
            title="PAYABLES AGING"
            subtitle="Live payables data · SAR"
            sourceLabel="Live data from Supabase (ap_aging_v2)"
            summary={apSummary}
            kind="ap"
            caveat="AP mirror lags: vendor bills feed is behind and the bank feed is not yet live — treat payables as indicative until the AP/bank sync is brought current."
          />
        ) : (
          <NotAvailable what="Payables aging" view="ap_aging_v2" />
        )}
      </div>

      {/* Top-overdue worklists */}
      {(arReady || apReady) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {arReady && <TopOverdueCard title="Top overdue receivables" items={arTopOverdue} party="Customer" />}
          {apReady && <TopOverdueCard title="Top overdue payables" items={apTopOverdue} party="Vendor" />}
        </div>
      )}

      {/* Working-capital trend */}
      <Card className="p-6 shadow-sm animate-fade-in">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h3 className="text-xl font-heading tracking-wide">WORKING CAPITAL</h3>
          <DataSourceBadge source="live" sourceLabel="Live data from Supabase (v_working_capital_monthly)" />
          <span className="text-xs text-muted-foreground">Live working-capital data · SAR</span>
        </div>
        <p className="text-sm text-muted-foreground mb-4 inline-flex items-center gap-1.5">
          Receivables &amp; payables bars, net working capital line — last {wc.length} months
          <Tooltip>
            <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-gold/80 cursor-help" /></TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              Net working capital = receivables + inventory − payables (period-end book values from the
              synced Qoyod ledger). Positive = cash tied up in the operating cycle.
            </TooltipContent>
          </Tooltip>
        </p>

        {wc.length === 0 ? (
          <p className="text-sm text-muted-foreground">No working-capital history yet.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={wc} margin={{ top: 10, right: 8, bottom: 0, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} />
                <YAxis tickFormatter={fmtCompact} stroke="hsl(var(--muted-foreground))" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} tickLine={false} axisLine={false} width={54} />
                <RTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0) return null;
                    return (
                      <div className="chart-tooltip">
                        <p className="chart-tooltip-title">{label}</p>
                        {payload.map((p) => (
                          <p key={String(p.dataKey)} className="chart-tooltip-content">
                            {p.name}: {fmtSAR(Number(p.value))}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar name="Receivables" dataKey="receivables" fill="hsl(195 75% 55% / 0.75)" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                <Bar name="Payables" dataKey="payables" fill="hsl(0 70% 60% / 0.7)" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                <Line name="Net WC" type="monotone" dataKey="net" stroke="hsl(var(--gold))" strokeWidth={2.4} dot={{ r: 2.5 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>

            <ScrollHint className="mt-4">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                    <th className="text-left py-1 pr-2 font-semibold">Month</th>
                    <th className="text-right py-1 pl-2 font-semibold whitespace-nowrap">Receivables</th>
                    <th className="text-right py-1 pl-2 font-semibold whitespace-nowrap">Payables</th>
                    <th className="text-right py-1 pl-2 font-semibold whitespace-nowrap">Net WC</th>
                  </tr>
                </thead>
                <tbody>
                  {[...wc].reverse().map((r) => (
                    <Fragment key={r.key}>
                      <tr className="border-b border-border/10">
                        <td className="py-1.5 pr-2 text-muted-foreground">{r.label}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{fmt(r.receivables)}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">{fmt(r.payables)}</td>
                        <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap font-medium">{fmt(r.net)}</td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </ScrollHint>
          </>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        Read-only treasury monitoring. Reminder queue and ready-to-pay list are separate builds pending
        the Treasury Decision-Rules sign-off (buckets, thresholds, approvers) — nothing is sent or paid
        from this screen.
      </p>
    </div>
  );
};
