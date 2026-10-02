// Receivables — unified module (Treasury desk).
//
// REBUILT 2026-08-03 (fix-8-treasury, Marcello's live-review mandate: "qui
// serve per lavorare — molto operativo"). The CURRENT book now renders as
// Marcello's spec items 3+4 — an EXPLODABLE aging table (AgingExplodable)
// plus the customer-lines debtors table with the reminder ladder
// (CustomerLinesTable), which is also where the old Reminders tab's job now
// lives (Marcello: "one operational surface, not two" — the invoice-level
// approve/edit/hold/snooze worklist, RemindersWorklist.tsx, is retired).
//
// The LEGACY 2020-2021 pool (~SAR 170,000-204,000 per the Treasury-
// Decision-Rules-DRAFT-2026-07-23 §A.6 working estimate) stays STRICTLY
// SEGREGATED into its own inner tab, UNCHANGED from the 2026-07-29 build:
// frozen (no reminder actions run against it), flagged only, with a
// per-debtor worksheet for the future Marcello+Arwa recover-vs-write-off
// call. See src/data/treasuryLive.ts useLegacyReceivables() header for why
// the worksheet shows historical billed total alongside — not instead of —
// what Qoyod's own status claims is unpaid.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, Archive, HardHat, Snowflake, Info, ChevronsUpDown } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ProposedBadge } from "@/components/dashboard/ProposedBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { AgingExplodable, type ExplodableRow } from "@/components/treasury/AgingExplodable";
import { CustomerLinesTable } from "@/components/treasury/CustomerLinesTable";
import { useArAging, type ArAgingRow } from "@/data/statementsLive";
import { useLegacyReceivables, type LegacyReceivableRow } from "@/data/treasuryLive";
import { fmtSAR } from "@/lib/format";

const n = (v: number | null | undefined): number => v ?? 0;
const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);

// -------------------------------------------------------------- current book

const CurrentBook = () => {
  const ar = useArAging();
  const rows = useMemo<ArAgingRow[]>(() => (ar.data?.available ? ar.data.rows : []), [ar.data]);

  const explodableRows = useMemo<ExplodableRow[]>(
    () =>
      rows.map((r) => ({
        key: String(r.qoyod_invoice_id ?? r.invoice_number ?? Math.random()),
        partyName: r.customer_name ?? "—",
        ref: r.invoice_number ?? "—",
        amount: n(r.residual_amount),
        daysOverdue: Math.max(0, n(r.days_overdue)),
        bucket: r.aging_bucket,
      })),
    [rows],
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
      <AgingExplodable
        title="RECEIVABLES AGING"
        subtitle="Live receivables data · SAR"
        sourceLabel="Live data from Supabase (ar_aging_v2)"
        rows={explodableRows}
        partyLabel="Customer"
        refLabel="Invoice"
      />
      <CustomerLinesTable rows={rows} />
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

  // Compact-by-default (2026-08-04, fix-28-treasury-align, Marcello live on
  // /treasury, mandate extension #3): ~1,015 debtor rows exploding open by
  // default made the tab unusable. Default view = the 3 stat cards + a
  // top-10-by-amount snapshot; the full search+paginate worksheet is an
  // explicit "open" the treasurer reaches for only when actually working
  // the reconciliation, with an equally explicit "collapse" back.
  const [worksheetOpen, setWorksheetOpen] = useState(false);
  const top10 = useMemo(() => [...rows].sort((a, b) => n(b.legacy_billed_total) - n(a.legacy_billed_total)).slice(0, 10), [rows]);

  return (
    <div className="space-y-6">
      {/* Frozen / flagged-only banner — mandatory per Treasury-Decision-Rules §A.6 */}
      <div className="flex items-start gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm text-sky-300">
        <Snowflake className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <strong>Legacy — frozen, flagged only.</strong> These are the old 2020-2021 invoices. No reminder
          actions run against this pool — it is deliberately excluded from the dunning ladder. The
          internal Treasury Decision-Rules working estimate is <strong>SAR 170,000-204,000</strong> still outstanding
          <ProposedBadge className="ml-1.5" detail="Legacy pool estimate, not yet reconciled." />, which
          does not match what Qoyod's own status shows below — reconciling that gap, then deciding
          pursue-vs-write-off per debtor, is a <strong>Marcello + Arwa</strong> management decision, not
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
                    what needs reconciling before treating either number as final.
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="mt-1 text-xl font-heading tabular-nums">{fmt(totals.unpaidPerQoyod)}</div>
              <div className="text-xs text-muted-foreground">contested — see tooltip</div>
            </Card>
            <Card className="p-4 border-border">
              <div className="text-xs uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
                Business working estimate <ProposedBadge detail="Not yet reconciled to Qoyod." />
              </div>
              <div className="mt-1 text-xl font-heading tabular-nums">170,000–204,000</div>
              <div className="text-xs text-muted-foreground">Internal Treasury Decision-Rules estimate</div>
            </Card>
          </div>

          {!worksheetOpen ? (
            <Card className="p-6 shadow-sm animate-fade-in">
              <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-xl font-heading tracking-wide">LEGACY POOL — SUMMARY</h3>
                  <DataSourceBadge source="live" sourceLabel="Live data from Supabase (v_legacy_receivables)" />
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 border-gold/40 hover:bg-gold/10" onClick={() => setWorksheetOpen(true)}>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-gold" /> Open full worksheet ({totals.debtors} debtors)
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mb-4 inline-flex items-start gap-1.5">
                <Snowflake className="h-3.5 w-3.5 mt-0.5 shrink-0 text-sky-400" />
                Frozen — every debtor here is flagged only, no dunning ladder. Top 10 by historical billed amount
                below; the full per-debtor worksheet (search + all {totals.debtors}) is one click away.
              </p>
              <ScrollHint>
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                      <th className="text-left py-1 pr-2 font-semibold">Debtor</th>
                      <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Historical billed</th>
                      <th className="text-right py-1 px-2 font-semibold">Invoices</th>
                      <th className="text-left py-1 pl-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top10.map((r) => (
                      <tr key={String(r.customer_id ?? r.customer_name)} className="border-b border-border/10">
                        <td className="py-1.5 pr-2 max-w-[220px] truncate" title={r.customer_name ?? ""}>{r.customer_name ?? "—"}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{fmt(n(r.legacy_billed_total))}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">{r.legacy_invoice_count}</td>
                        <td className="py-1.5 pl-2">
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold border border-sky-500/40 bg-sky-500/10 text-sky-300">
                            <Snowflake className="h-3 w-3" /> Frozen
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollHint>
            </Card>
          ) : (
            <Card className="p-6 shadow-sm animate-fade-in">
              <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="text-xl font-heading tracking-wide">LEGACY — PER-DEBTOR WORKSHEET</h3>
                  <DataSourceBadge source="live" sourceLabel="Live data from Supabase (v_legacy_receivables)" />
                  <span className="text-xs text-muted-foreground">Live legacy receivables data · SAR</span>
                </div>
                <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" onClick={() => setWorksheetOpen(false)}>
                  <ChevronsUpDown className="h-3.5 w-3.5" /> Collapse
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mb-4 inline-flex items-start gap-1.5">
                <Archive className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                For the future recover-vs-write-off decision. Collectibility is left blank — no automated rating
                exists; Marcello + Arwa rate per debtor when the reconciliation work happens. Every row is
                frozen — no reminder/escalate action is ever offered against this pool.
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
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                      <th className="text-left py-1 pr-2 font-semibold">Debtor</th>
                      <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Historical billed</th>
                      <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Per Qoyod unpaid</th>
                      <th className="text-right py-1 px-2 font-semibold">Invoices</th>
                      <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Age (days)</th>
                      <th className="text-left py-1 px-2 font-semibold whitespace-nowrap">Last activity</th>
                      <th className="text-left py-1 pl-2 font-semibold">Status</th>
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
                        <td className="py-1.5 pl-2">
                          <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold border border-sky-500/40 bg-sky-500/10 text-sky-300">
                            <Snowflake className="h-3 w-3" /> Frozen
                          </span>
                          <div className="text-[10px] text-muted-foreground mt-0.5">Collectibility: not yet rated</div>
                        </td>
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
          )}
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
          Ageing buckets follow the internal Treasury Decision-Rules draft (standard/low-risk profile); the
          reminder ladder above is Marcello's own cadence (2026-08-03), which supersedes the draft's timings.
        </p>
      )}
    </div>
  );
};
