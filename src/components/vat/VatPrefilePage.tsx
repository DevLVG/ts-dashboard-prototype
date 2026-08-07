// VAT PRE-FILING CHECKS — standalone page (route /vat-prefile).
//
// Handbook package job (2026-08-07): v_vat_prefile_checks (migration 041)
// existed live with ~114 rows of real data (6 checks x 19 ZATCA quarters)
// but had zero UI — grepped src/ end to end, no route, no component. This
// page is the first consumer, read-only. Reviewing/fixing what a failed
// check means (e.g. filing a missing return) happens outside this app.
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { HardHat, ShieldCheck, ChevronDown, ChevronUp, CheckCircle2, TriangleAlert, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { resolveRole, landingPageFor } from "@/lib/roles";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { useVatPrefileChecks, type VatCheckStatus, type VatPrefileCheckRow } from "@/data/vatPrefileLive";

const STATUS_META: Record<VatCheckStatus, { label: string; icon: React.ComponentType<{ className?: string }>; tone: string; chip: string }> = {
  pass: { label: "Pass", icon: CheckCircle2, tone: "text-success", chip: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  warn: { label: "Warn", icon: TriangleAlert, tone: "text-warning", chip: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  fail: { label: "Fail", icon: XCircle, tone: "text-destructive", chip: "bg-red-500/15 text-red-400 border-red-500/30" },
};

const StatusChip = ({ status }: { status: VatCheckStatus }) => {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border ${m.chip}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
};

const quarterOverallStatus = (rows: VatPrefileCheckRow[]): VatCheckStatus =>
  rows.some((r) => r.status === "fail") ? "fail" : rows.some((r) => r.status === "warn") ? "warn" : "pass";

export const VatPrefilePage = () => {
  const { session, loading: authLoading } = useAuth();
  const role = resolveRole(session?.user?.email);
  // Leveredge + CEO only — matches ReportPage's "leveredge+ceo roles only"
  // precedent for filing/compliance-adjacent screens. First-pass call,
  // proposed — confirm with Marcello/Luca if Administration should see this.
  const allowed = role === "leveredge" || role === "ceo";

  const checks = useVatPrefileChecks();
  const [openQuarters, setOpenQuarters] = useState<Set<string>>(new Set());

  const rows = checks.data?.available ? checks.data.rows : [];
  const byQuarter = useMemo(() => {
    const m = new Map<string, VatPrefileCheckRow[]>();
    for (const r of rows) {
      const list = m.get(r.quarter_label) ?? [];
      list.push(r);
      m.set(r.quarter_label, list);
    }
    return m; // insertion order follows the query's ORDER BY quarter_start DESC — most recent first
  }, [rows]);
  const quarterLabels = useMemo(() => Array.from(byQuarter.keys()), [byQuarter]);

  useMemo(() => {
    if (quarterLabels.length > 0 && openQuarters.size === 0) setOpenQuarters(new Set([quarterLabels[0]]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quarterLabels.length]);

  if (authLoading) return null;
  if (!allowed) return <Navigate to={`/${landingPageFor(role)}`} replace />;

  const toggleQuarter = (q: string) =>
    setOpenQuarters((prev) => { const next = new Set(prev); next.has(q) ? next.delete(q) : next.add(q); return next; });

  const ready = checks.data?.available === true;
  const isLoading = checks.isLoading && !checks.data;
  const isError = checks.isError;

  const totalPass = rows.filter((r) => r.status === "pass").length;
  const totalWarn = rows.filter((r) => r.status === "warn").length;
  const totalFail = rows.filter((r) => r.status === "fail").length;
  const latestQuarter = quarterLabels[0];
  const latestRows = latestQuarter ? byQuarter.get(latestQuarter) ?? [] : [];

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav currentPage="vat-prefile" />
      <main className="container mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="font-heading text-2xl tracking-wide text-foreground flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-gold" /> VAT Pre-Filing Checks
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Six checks per ZATCA quarter, meant to be reviewed BEFORE a VAT return is signed off: filing filed &amp;
            reconciled, B2B customers carry a tax ID, output-vs-input sanity, credit notes finalized, invoice mirror
            reaches quarter-end, and variance vs the prior quarter. A "Fail" blocks correct filing; a "Warn" is worth
            a human look, not necessarily wrong.
          </p>
        </div>

        {isError ? (
          <Card className="p-6">
            <p className="text-sm text-destructive">
              {(checks.error as Error | null)?.name === "PermissionDeniedError"
                ? (checks.error as Error).message
                : "Could not load the VAT pre-filing checks from Supabase."}
            </p>
          </Card>
        ) : isLoading ? (
          <div className="h-40 rounded-lg bg-muted animate-pulse" />
        ) : !ready ? (
          <Card className="p-8 text-center space-y-3 animate-fade-in">
            <HardHat className="h-7 w-7 mx-auto text-gold/70" />
            <h3 className="text-lg font-heading tracking-wide">VAT PRE-FILING CHECKS — NOT YET AVAILABLE</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              The check view is not yet mirrored. This section will populate automatically once it lands.
            </p>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">No checks returned.</p></Card>
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <Card className="p-4 border-border">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Latest quarter</div>
                <div className="mt-1 text-xl font-heading">{latestQuarter}</div>
                <div className="mt-1"><StatusChip status={quarterOverallStatus(latestRows)} /></div>
              </Card>
              <Card className="p-4 border-border">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Quarters covered</div>
                <div className="mt-1 text-xl font-heading tabular-nums">{quarterLabels.length}</div>
              </Card>
              <Card className="p-4 border-emerald-500/30">
                <div className="text-xs uppercase tracking-wider text-success">Pass</div>
                <div className="mt-1 text-xl font-heading tabular-nums">{totalPass}</div>
              </Card>
              <Card className="p-4 border-amber-500/40">
                <div className="text-xs uppercase tracking-wider text-warning">Warn</div>
                <div className="mt-1 text-xl font-heading tabular-nums">{totalWarn}</div>
              </Card>
              <Card className="p-4 border-destructive/30">
                <div className="text-xs uppercase tracking-wider text-destructive">Fail</div>
                <div className="mt-1 text-xl font-heading tabular-nums">{totalFail}</div>
              </Card>
            </div>

            <div className="flex justify-end"><DataSourceBadge source="live" sourceLabel="Live data from Supabase (v_vat_prefile_checks)" /></div>

            {quarterLabels.map((q) => {
              const items = byQuarter.get(q) ?? [];
              const isOpen = openQuarters.has(q);
              const overall = quarterOverallStatus(items);
              return (
                <Card key={q} className="shadow-sm animate-fade-in overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleQuarter(q)}
                    className="flex w-full items-center justify-between px-6 py-4 text-left hover:bg-muted/20 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-lg font-heading tracking-wide">{q}</h3>
                      <StatusChip status={overall} />
                      <span className="text-xs text-muted-foreground">
                        {items.filter((r) => r.status === "pass").length} pass ·{" "}
                        {items.filter((r) => r.status === "warn").length} warn ·{" "}
                        {items.filter((r) => r.status === "fail").length} fail
                      </span>
                    </div>
                    {isOpen ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-6">
                      <ScrollHint>
                        <table className="w-full min-w-[760px] text-sm">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                              <th className="text-left py-1 pr-2 font-semibold">Check</th>
                              <th className="text-center py-1 px-2 font-semibold">Status</th>
                              <th className="text-left py-1 pl-2 font-semibold">Detail</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((r) => (
                              <tr key={r.check_key} className="border-b border-border/10 align-top">
                                <td className="py-2 pr-2 whitespace-nowrap font-medium">{r.check_name}</td>
                                <td className="py-2 px-2 text-center"><StatusChip status={r.status} /></td>
                                <td className="py-2 pl-2 text-muted-foreground text-xs">{r.detail}</td>
                              </tr>
                            ))}
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
      </main>
    </div>
  );
};

export default VatPrefilePage;
