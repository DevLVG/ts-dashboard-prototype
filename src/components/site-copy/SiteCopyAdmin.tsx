// Site Copy CMS — editable EN/AR website copy, one-way sync to the Shopify
// draft theme. CEO decision 2026-07-25: all Trio Sporting Website V1 copy
// lives here so future edits need no developer, and it's ready for the
// Arabic version (EN/AR side by side). Built for non-technical club staff:
// pick a page, open a section, edit the text, save happens automatically.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { RefreshCw, Search, Languages, ShieldAlert } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteCopy, type SiteCopyRow } from "@/data/siteCopyLive";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { pageLabel } from "./siteCopyLabels";
import { SiteCopyFieldRow } from "./SiteCopyFieldRow";
import { SiteCopyAuditLog } from "./SiteCopyAuditLog";
import { SyncCopyDialog } from "./SyncCopyDialog";

const PAGE_ORDER_HINT = ["index", "header-group", "footer-group", "footer.liquid"]; // pinned to the top of the picker

export const SiteCopyAdmin = () => {
  const { session } = useAuth();
  const actor = session?.user?.email ?? "unknown";
  const { data: rows, isLoading, isError, error } = useSiteCopy();

  const [search, setSearch] = useState("");
  const [needsArOnly, setNeedsArOnly] = useState(false);
  const [selectedPage, setSelectedPage] = useState<string>("index");
  const [syncOpen, setSyncOpen] = useState(false);

  const pages = useMemo(() => {
    const set = new Set((rows ?? []).map((r) => r.page_handle));
    const list = Array.from(set);
    list.sort((a, b) => {
      const ia = PAGE_ORDER_HINT.indexOf(a);
      const ib = PAGE_ORDER_HINT.indexOf(b);
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      return pageLabel(a).localeCompare(pageLabel(b));
    });
    return list;
  }, [rows]);

  const pageCounts = useMemo(() => {
    const counts: Record<string, { total: number; needsAr: number }> = {};
    for (const r of rows ?? []) {
      const c = (counts[r.page_handle] ??= { total: 0, needsAr: 0 });
      c.total += 1;
      if (!r.ar) c.needsAr += 1;
    }
    return counts;
  }, [rows]);

  const totalNeedsAr = useMemo(() => (rows ?? []).filter((r) => !r.ar).length, [rows]);

  const isSearching = search.trim().length > 0;

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = rows ?? [];
    if (isSearching) {
      base = base.filter((r) =>
        r.key.toLowerCase().includes(q) ||
        (r.en ?? "").toLowerCase().includes(q) ||
        (r.ar ?? "").toLowerCase().includes(q)
      );
    } else {
      base = base.filter((r) => r.page_handle === selectedPage);
    }
    if (needsArOnly) base = base.filter((r) => !r.ar);
    return base;
  }, [rows, search, isSearching, selectedPage, needsArOnly]);

  // group -> page -> section -> rows[]
  const grouped = useMemo(() => {
    const byPage = new Map<string, Map<string, SiteCopyRow[]>>();
    for (const r of visibleRows) {
      const pageMap = byPage.get(r.page_handle) ?? new Map<string, SiteCopyRow[]>();
      const sectionRows = pageMap.get(r.section_id) ?? [];
      sectionRows.push(r);
      pageMap.set(r.section_id, sectionRows);
      byPage.set(r.page_handle, pageMap);
    }
    return byPage;
  }, [visibleRows]);

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-sky-400" />
        <span>
          This panel is the <strong>single source of truth</strong> for the website's text. Edits save here as you
          type — the live site only updates when you run <strong>Sync to site</strong>, and it always pushes to the
          draft theme, never live.
        </span>
      </div>

      <Card className="p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-1 flex-wrap justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-heading tracking-wide">SITE COPY</h3>
            <DataSourceBadge source="live" />
            <span className="text-xs text-muted-foreground">Supabase · site_copy</span>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setSyncOpen(true)}>
            <RefreshCw className="h-4 w-4" /> Sync to site
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-4 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all copy — text or key…" className="pl-8 h-9" />
          </div>
          {!isSearching && (
            <Select value={selectedPage} onValueChange={setSelectedPage}>
              <SelectTrigger className="w-[240px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-[400px]">
                {pages.map((p) => (
                  <SelectItem key={p} value={p}>
                    {pageLabel(p)} ({pageCounts[p]?.total ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <label className="flex items-center gap-1.5 text-sm px-2 h-9">
            <Checkbox checked={needsArOnly} onCheckedChange={(c) => setNeedsArOnly(c === true)} />
            <Languages className="h-3.5 w-3.5 text-muted-foreground" />
            Needs Arabic only
          </label>
          <Badge variant="outline" className="text-xs">
            {rows?.length ?? 0} strings total · {totalNeedsAr} need Arabic
          </Badge>
        </div>

        {!isSupabaseConfigured ? (
          <p className="text-sm text-destructive">Supabase is not configured — site copy cannot load.</p>
        ) : isError ? (
          <p className="text-sm text-destructive">{(error as Error)?.message ?? "Could not load site copy."}</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : visibleRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No copy matches this filter.</p>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([page, sections]) => (
              <div key={page} className="space-y-2">
                {isSearching && (
                  <h4 className="text-sm font-semibold text-muted-foreground">{pageLabel(page)}</h4>
                )}
                <Accordion type="multiple" defaultValue={Array.from(sections.keys())} className="space-y-2">
                  {Array.from(sections.entries()).map(([sectionId, sectionRows]) => (
                    <AccordionItem key={sectionId} value={sectionId} className="border rounded-md px-3">
                      <AccordionTrigger className="text-sm hover:no-underline">
                        <span className="flex items-center gap-2">
                          <span className="capitalize">{sectionId.replace(/_/g, " ")}</span>
                          {sectionRows[0]?.section_type && (
                            <span className="text-[11px] text-muted-foreground font-mono">
                              ({sectionRows[0].section_type})
                            </span>
                          )}
                          <Badge variant="outline" className="text-[10px]">{sectionRows.length}</Badge>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="space-y-2 pb-3">
                        {sectionRows.map((row) => (
                          <SiteCopyFieldRow key={row.key} row={row} actor={actor} />
                        ))}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">{visibleRows.length} of {rows?.length ?? 0} strings shown</p>
      </Card>

      <SiteCopyAuditLog />

      <SyncCopyDialog open={syncOpen} onOpenChange={setSyncOpen} />
    </div>
  );
};
