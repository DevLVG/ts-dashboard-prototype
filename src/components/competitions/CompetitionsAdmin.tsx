// Competitions CMS — editable competition landing pages, one-way sync to the
// Shopify theme + real ticket checkout. CEO instruction (Marcello,
// 2026-07-29): stop being blocked on Arwa's race calendar — this is the
// MACHINE that mounts a competition landing page automatically from
// editable fields (video, copy, images, ticket). Built for non-technical
// club staff: plain fields, one list, one edit dialog.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Plus, Search, Pencil, ImageOff, ShieldAlert, AlertTriangle, Terminal } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { useAuth } from "@/contexts/AuthContext";
import { useCompetitions, type Competition, type CompetitionStatus, STATUS_LABEL } from "@/data/competitionsLive";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { CompetitionEditDialog } from "@/components/competitions/CompetitionEditDialog";
import { CompetitionsAuditLog } from "@/components/competitions/CompetitionsAuditLog";

const STATUS_TONE: Record<CompetitionStatus, string> = {
  draft: "border-muted-foreground/40 text-muted-foreground",
  published: "border-emerald-500/40 text-emerald-400",
  past: "border-sky-500/40 text-sky-400",
};

export const CompetitionsAdmin = () => {
  const { session } = useAuth();
  const actor = session?.user?.email ?? "unknown";
  const { data: competitions, isLoading, isError, error } = useCompetitions();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [editing, setEditing] = useState<Competition | null | "new">(null);

  const statusOptions = useMemo(() => {
    const set = new Set((competitions ?? []).map((c) => c.status));
    return ["ALL", ...Array.from(set).sort()];
  }, [competitions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (competitions ?? []).filter((c) => {
      if (statusFilter !== "ALL" && c.status !== statusFilter) return false;
      if (q && !`${c.slug} ${c.name} ${c.venue ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [competitions, search, statusFilter]);

  const reviewCount = (competitions ?? []).filter((c) => c.needs_review).length;

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-sky-400" />
        <span>
          This panel is the <strong>single source of truth</strong> for competition landing pages. Fill the fields
          (video, copy, images, ticket) and set Status to Published — the landing mounts automatically on the site's
          next theme sync. Nothing here is ever pulled back from Shopify or the theme.
        </span>
      </div>

      <div className="rounded-md border border-muted-foreground/20 bg-muted/10 px-4 py-3 text-xs flex items-start gap-2 text-muted-foreground">
        <Terminal className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Publish step (run after saving changes here): <code className="font-mono">python3 shopify-theme/scripts/sync_competitions_to_theme.py --push</code>{" "}
          — regenerates the competitions-calendar page on the draft theme (199089815899). Never touches the live theme.
        </span>
      </div>

      <Card className="p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-1 flex-wrap justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-heading tracking-wide">COMPETITIONS</h3>
            <DataSourceBadge source="live" />
            <span className="text-xs text-muted-foreground">Supabase · cal_competitions</span>
          </div>
          <div className="flex items-center gap-2">
            {reviewCount > 0 && (
              <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-400">
                <AlertTriangle className="h-3 w-3" /> {reviewCount} need review
              </Badge>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> New competition
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-4 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search slug, name, venue…" className="pl-8 h-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>{s === "ALL" ? "All statuses" : STATUS_LABEL[s as CompetitionStatus] ?? s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!isSupabaseConfigured ? (
          <p className="text-sm text-destructive">Supabase is not configured — the competitions registry cannot load.</p>
        ) : isError ? (
          <p className="text-sm text-destructive">{(error as Error)?.message ?? "Could not load the competitions registry."}</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No competitions match this filter.</p>
        ) : (
          <ScrollHint>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[56px]"></TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead className="text-right">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.slug}>
                    <TableCell>
                      <div className="h-10 w-10 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden">
                        {c.hero_image_url ? (
                          <img src={c.hero_image_url} alt={c.name} className="h-full w-full object-cover" />
                        ) : (
                          <ImageOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate" title={c.name}>{c.name}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">{c.slug}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{c.dates_label ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_TONE[c.status] ?? ""}>{c.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {c.is_placeholder ? (
                        <Badge variant="outline" className="border-amber-500/40 text-amber-400">Demo / example</Badge>
                      ) : (
                        <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">Real show</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.ticket_url || c.ticket_variant_id ? "Wired" : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setEditing(c)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollHint>
        )}
        <p className="text-xs text-muted-foreground mt-3">{filtered.length} of {competitions?.length ?? 0} competitions shown</p>
      </Card>

      <CompetitionsAuditLog />

      <CompetitionEditDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        competition={editing === "new" ? null : editing}
        actor={actor}
      />
    </div>
  );
};
