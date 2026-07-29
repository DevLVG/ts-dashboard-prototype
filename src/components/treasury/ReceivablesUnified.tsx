// Receivables — unified module (Treasury workspace, sub-tab 2/4).
//
// SCOPE: one list of the CURRENT receivables book, bucketed per the agreed
// 5-bucket ladder (Treasury-Decision-Rules-DRAFT-2026-07-23 §A.1: Current /
// 1-30 / 31-60 / 61-90 / 90+), with the §A.2 amount overlays (de-minimis
// floor SAR 200, high-value fast-track invoice≥10k / customer≥15k) surfaced
// as badges — every one of those thresholds is a DRAFT proposal, so every
// overlay carries the "Proposed — to confirm" badge, never presented as
// decided policy.
//
// The LEGACY 2020-2021 pool (~SAR 170,000-204,000 per the rules doc's
// working estimate) is STRICTLY SEGREGATED into its own inner tab: frozen
// (no reminder actions run against it), flagged only, with a per-debtor
// worksheet for the future Marcello+Arwa recover-vs-write-off call (§A.6).
// See src/data/treasuryLive.ts useLegacyReceivables() header for why the
// worksheet shows historical billed total alongside — not instead of — what
// Qoyod's own status claims is unpaid: the two numbers disagree and that
// disagreement is exactly what needs reconciling before any decision.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Archive, HardHat, Snowflake, Info } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ProposedBadge } from "@/components/dashboard/ProposedBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import {
  useArAging, AGING_BUCKET_ORDER, type AgingBucket, type ArAgingRow,
} from "@/data/statementsLive";
import { useLegacyReceivables, type LegacyReceivableRow } from "@/data/treasuryLive";
import { fmtSAR } from "@/lib/format";

const n = (v: number | null | undefined): number => v ?? 0;
const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);

// §A.2 amount-overlay thresholds — ALL proposed/unconfirmed defaults.
const DE_MINIMIS_FLOOR = 200;
const HIGH_VALUE_INVOICE = 10_000;
const HIGH_VALUE_CUSTOMER_TOTAL = 15_000;

const BUCKET_META: Record<AgingBucket, { label: string; short: string; bar: string; text: string }> = {
  current: { label: "Current (not due)", short: "Current", bar: "bg-muted-foreground/40", text: "text-muted-foreground" },
  "1-30": { label: "1–30 days overdue", short: "1–30", bar: "bg-sky-400/70", text: "text-foreground" },
  "31-60": { label: "31–60 days overdue", short: "31–60", bar: "bg-warning/70", text: "text-warning" },
  "61-90": { label: "61–90 days overdue", short: "61–90", bar: "bg-amber-500/80", text: "text-warning" },
  ">90": { label: "90+ days overdue", short: "90+", bar: "bg-destructive/70", text: "text-destructive" },
};

// -------------------------------------------------------------- current book

const CurrentBook = () => {
  const ar = useArAging();
  const rows = useMemo<ArAgingRow[]>(() => (ar.data?.available ? ar.data.rows : []), [ar.data]);

  // Customer-total roll-up, needed for the "customer total ≥ 15,000" overlay.
  const customerTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const key = String(r.customer_id ?? r.customer_name ?? "—");
      m.set(key, (m.get(key) ?? 0) + n(r.residual_amount));
    }
    return m;
  }, [rows]);

  const byBucket = useMemo(() => {
    const m = new Map<AgingBucket, { count: number; amount: number }>();
    for (const b of AGING_BUCKET_ORDER) m.set(b, { count: 0, amount: 0 });
    let total = 0;
    for (const r of rows) {
      const agg = m.get(r.aging_bucket)!;
      agg.count += 1;
      agg.amount += n(r.residual_amount);
      total += n(r.residual_amount);
    }
    return { buckets: AGING_BUCKET_ORDER.map((b) => ({ bucket: b, ...m.get(b)! })), total };
  }, [rows]);

  const deMinimisCount = useMemo(
    () => rows.filter((r) => n(r.residual_amount) > 0.5 && n(r.residual_amount) < DE_MINIMIS_FLOOR).length,
    [rows],
  );
  const highValueCount = useMemo(
    () =>
      rows.filter((r) => {
        const custKey = String(r.customer_id ?? r.customer_name ?? "—");
        return n(r.residual_amount) >= HIGH_VALUE_INVOICE || (customerTotals.get(custKey) ?? 0) >= HIGH_VALUE_CUSTOMER_TOTAL;
      }).length,
    [rows, customerTotals],
  );

  const ready = ar.data?.available === true;

  if (ar.isError) {
    return (
      <Card className="p-6"><p className="text-sm text-destructive">
        {(ar.error as Error | null)?.name === "PermissionDeniedError"
          ? (ar.error as Error).message
          : "Could not load receivables from Supabase."}
      </p></Card>
    );
  }
  if (!ready) {
    return (
      <Card className="p-8 text-center space-y-3 animate-fade-in">
        <HardHat className="h-7 w-7 mx-auto text-gold/70" />
        <h3 className="text-lg font-heading tracking-wide">RECEIVABLES — NOT YET AVAILABLE</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          The receivables view (<code className="text-xs">ar_aging_v2</code>) is not yet mirrored. This
          list will populate automatically once the data lands — no reload needed.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bucket summary strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {byBucket.buckets.map((b) => {
          const meta = BUCKET_META[b.bucket];
          return (
            <Card key={b.bucket} className="p-4 border-border">
              <div className={`text-xs uppercase tracking-wider ${meta.text}`}>{meta.short}</div>
              <div className="mt-1 text-xl font-heading tabular-nums">{b.amount > 0.5 ? fmt(b.amount) : "—"}</div>
              <div className="text-xs text-muted-foreground">{b.count} {b.count === 1 ? "invoice" : "invoices"}</div>
            </Card>
          );
        })}
      </div>

      {/* Amount-overlay summary — §A.2, all proposed */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {deMinimisCount} below de-minimis floor (SAR {DE_MINIMIS_FLOOR}) <ProposedBadge detail="§A.2 de-minimis floor." />
        </span>
        <span className="text-border">·</span>
        <span className="inline-flex items-center gap-1.5">
          {highValueCount} high-value fast-track (invoice ≥ SAR {HIGH_VALUE_INVOICE.toLocaleString()} or customer ≥ SAR {HIGH_VALUE_CUSTOMER_TOTAL.toLocaleString()})
          <ProposedBadge detail="§A.2 high-value fast-track threshold." />
        </span>
      </div>

      <Card className="p-6 shadow-sm animate-fade-in">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h3 className="text-xl font-heading tracking-wide">RECEIVABLES — CURRENT BOOK</h3>
          <DataSourceBadge source="live" />
          <span className="text-xs text-muted-foreground">Supabase · ar_aging_v2 · SAR</span>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Open book <span className="text-foreground font-medium tabular-nums">{fmt(byBucket.total)}</span> SAR
          across <span className="text-foreground font-medium">{rows.length}</span> invoices. Legacy 2020-2021
          items are excluded here — see the Legacy pool tab.
        </p>
        <ScrollHint>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                <th className="text-left py-1 pr-2 font-semibold">Customer</th>
                <th className="text-left py-1 px-2 font-semibold">Invoice</th>
                <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Residual SAR</th>
                <th className="text-left py-1 px-2 font-semibold">Bucket</th>
                <th className="text-right py-1 pl-2 font-semibold">Overlay flags</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => n(b.residual_amount) - n(a.residual_amount))
                .map((r) => {
                  const meta = BUCKET_META[r.aging_bucket];
                  const custKey = String(r.customer_id ?? r.customer_name ?? "—");
                  const isDeMinimis = n(r.residual_amount) > 0.5 && n(r.residual_amount) < DE_MINIMIS_FLOOR;
                  const isHighValue =
                    n(r.residual_amount) >= HIGH_VALUE_INVOICE || (customerTotals.get(custKey) ?? 0) >= HIGH_VALUE_CUSTOMER_TOTAL;
                  return (
                    <tr key={String(r.qoyod_invoice_id ?? r.invoice_number)} className="border-b border-border/10">
                      <td className="py-1.5 pr-2 max-w-[200px] truncate" title={r.customer_name ?? ""}>{r.customer_name ?? "—"}</td>
                      <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{r.invoice_number ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{fmt(n(r.residual_amount))}</td>
                      <td className={`py-1.5 px-2 whitespace-nowrap ${meta.text}`}>
                        {meta.short}{n(r.days_overdue) > 0 && <span className="text-[10px]"> · {r.days_overdue}d</span>}
                      </td>
                      <td className="py-1.5 pl-2 text-right whitespace-nowrap">
                        {isDeMinimis && <span className="text-[10px] text-muted-foreground mr-1">de-minimis</span>}
                        {isHighValue && <span className="text-[10px] text-amber-400">fast-track</span>}
                        {!isDeMinimis && !isHighValue && <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </ScrollHint>
      </Card>
    </div>
  );
};

// -------------------------------------------------------------- legacy pool

const LEGACY_PAGE_SIZE = 50;

const LegacyPool = () => {
  const legacy = useLegacyReceivables();
  const rows = useMemo<LegacyReceivableRow[]>(() => (legacy.data?.available ? legacy.data.rows : []), [legacy.data]);
  const ready = legacy.data?.available === true;

  const totals = useMemo(() => {
    let billed = 0, unpaidPerQoyod = 0;
    for (const r of rows) { billed += n(r.legacy_billed_total); unpaidPerQoyod += n(r.legacy_unpaid_per_qoyod); }
    return { billed, unpaidPerQoyod, debtors: rows.length };
  }, [rows]);

  // 1,000+ debtors is a real worksheet, not a dashboard tile — search + a
  // sane default page size keep it usable instead of rendering every row
  // (measured: unpaginated this was a 34,000px page).
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.customer_name ?? "").toLowerCase().includes(q));
  }, [rows, search]);
  const visibleRows = showAll ? filteredRows : filteredRows.slice(0, LEGACY_PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Frozen / flagged-only banner — mandatory per Treasury-Decision-Rules §A.6 */}
      <div className="flex items-start gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-300">
        <Snowflake className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <strong>Legacy — frozen, flagged only.</strong> These are the old 2020-2021 invoices. No reminder
          actions run against this pool — it is deliberately excluded from the dunning ladder. The
          Treasury-Decision-Rules working estimate is <strong>SAR 170,000-204,000</strong> still outstanding
          <ProposedBadge className="ml-1.5" detail="§A.6 legacy pool estimate, not yet reconciled." />, which
          does not match what Qoyod's own status shows below — reconciling that gap, then deciding
          pursue-vs-write-off per debtor, is a <strong>Marcello + Arwa</strong> management decision (§A.6), not
          something this panel automates.
        </span>
      </div>

      {legacy.isError ? (
        <Card className="p-6"><p className="text-sm text-destructive">
          {(legacy.error as Error | null)?.name === "PermissionDeniedError"
            ? (legacy.error as Error).message
            : "Could not load the legacy receivables worksheet from Supabase."}
        </p></Card>
      ) : !ready ? (
        <Card className="p-8 text-center space-y-3 animate-fade-in">
          <HardHat className="h-7 w-7 mx-auto text-gold/70" />
          <h3 className="text-lg font-heading tracking-wide">LEGACY WORKSHEET — NOT YET AVAILABLE</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The legacy-pool view (<code className="text-xs">v_legacy_receivables</code>) is not yet mirrored.
            This worksheet will populate automatically once the data lands.
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card className="p-4 border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Historical billed total (2020-21)</div>
              <div className="mt-1 text-xl font-heading tabular-nums">{fmt(totals.billed)}</div>
              <div className="text-xs text-muted-foreground">{totals.debtors} debtors · fact, from Qoyod invoice history</div>
            </Card>
            <Card className="p-4 border-amber-500/40">
              <div className="text-xs uppercase tracking-wider text-warning inline-flex items-center gap-1">
                Per Qoyod status, still unpaid
                <Tooltip>
                  <TooltipTrigger asChild><Info className="h-3 w-3 cursor-help" /></TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    Qoyod marks almost all of this cohort "Paid" — this figure is near-zero even though the
                    business estimates SAR 170,000-204,000 is still outstanding. That contradiction is exactly
                    what needs reconciling (§A.6) before treating either number as final.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="mt-1 text-xl font-heading tabular-nums">{fmt(totals.unpaidPerQoyod)}</div>
              <div className="text-xs text-muted-foreground">contested — see tooltip</div>
            </Card>
            <Card className="p-4 border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                Business working estimate <ProposedBadge detail="§A.6, not yet reconciled to Qoyod." />
              </div>
              <div className="mt-1 text-xl font-heading tabular-nums">170,000–204,000</div>
              <div className="text-xs text-muted-foreground">Treasury-Decision-Rules §A.6</div>
            </Card>
          </div>

          <Card className="p-6 shadow-sm animate-fade-in">
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h3 className="text-xl font-heading tracking-wide">LEGACY — PER-DEBTOR WORKSHEET</h3>
              <DataSourceBadge source="live" />
              <span className="text-xs text-muted-foreground">Supabase · v_legacy_receivables · SAR</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4 inline-flex items-start gap-1.5">
              <Archive className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
              For the future recover-vs-write-off decision. Collectibility is left blank — no automated rating
              exists; Marcello + Arwa rate per debtor when the reconciliation work happens.
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setShowAll(false); }}
                placeholder="Search debtor name…"
                className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">
                Showing {visibleRows.length} of {filteredRows.length}
                {filteredRows.length !== rows.length ? ` (filtered from ${rows.length})` : ""} debtors, sorted by
                historical billed total.
              </span>
            </div>
            <ScrollHint>
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                    <th className="text-left py-1 pr-2 font-semibold">Debtor</th>
                    <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Historical billed</th>
                    <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Per Qoyod unpaid</th>
                    <th className="text-right py-1 px-2 font-semibold">Invoices</th>
                    <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Age (days)</th>
                    <th className="text-left py-1 px-2 font-semibold whitespace-nowrap">Last activity</th>
                    <th className="text-left py-1 pl-2 font-semibold">Collectibility</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={String(r.customer_id ?? r.customer_name)} className="border-b border-border/10">
                      <td className="py-1.5 pr-2 max-w-[220px] truncate" title={r.customer_name ?? ""}>{r.customer_name ?? "—"}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{fmt(n(r.legacy_billed_total))}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                        {n(r.legacy_unpaid_per_qoyod) > 0.5 ? fmt(n(r.legacy_unpaid_per_qoyod)) : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{r.legacy_invoice_count}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{r.days_since_last_invoice ?? "—"}</td>
                      <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap" title="Most recent legacy invoice date — no contact/payment log exists for this cohort">
                        {r.latest_invoice_date ?? "—"}
                      </td>
                      <td className="py-1.5 pl-2 text-muted-foreground">Not yet rated</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollHint>
            {!showAll && filteredRows.length > LEGACY_PAGE_SIZE && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="text-sm text-gold hover:text-gold/80 underline underline-offset-4"
                >
                  Show all {filteredRows.length} debtors
                </button>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------- shell

export const ReceivablesUnified = () => {
  const [tab, setTab] = useState<"current" | "legacy">("current");
  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "current" | "legacy")}>
        <TabsList>
          <TabsTrigger value="current">Current book</TabsTrigger>
          <TabsTrigger value="legacy" className="gap-1.5">
            <Snowflake className="h-3.5 w-3.5" /> Legacy pool (2020-21)
          </TabsTrigger>
        </TabsList>
        <TabsContent value="current" className="mt-4"><CurrentBook /></TabsContent>
        <TabsContent value="legacy" className="mt-4"><LegacyPool /></TabsContent>
      </Tabs>
      {tab === "current" && (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-400" />
          Ageing buckets and amount overlays follow the Treasury Decision-Rules draft — badged items are
          pending Marcello / Arwa sign-off. No reminders are sent from this list; see the Reminders tab.
        </p>
      )}
    </div>
  );
};
