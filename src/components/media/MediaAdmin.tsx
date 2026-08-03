// Media/Asset CMS — editable registry for every site image, video and
// brochure, automatic sync to the theme. CEO decision 2026-07-25: graphic
// assets must be centrally managed like the rest (Catalogue + Site Copy
// already have CMS modules). Built for non-technical club staff: a grid
// of thumbnails, one edit dialog, filters, an audit trail.
//
// CEO live-review 2026-08-03 (Marcello approved): every saved edit/replace
// now auto-triggers sync_media_to_theme.py (via the new media_sync_api.py
// wrapper) — same debounce + per-item status pattern as the Catalogue.
// Always the DRAFT theme, never live — see mediaLive.ts header comment.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ImageIcon, Video, FileText, Search, Pencil, ShieldAlert, AlertTriangle, Loader2, CheckCircle2, XCircle, ShieldQuestion } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { useAuth } from "@/contexts/AuthContext";
import {
  useSiteMedia, type SiteMediaAsset, STORAGE_BACKEND_LABEL,
  useMediaSyncStatusMap, retryMediaSync, isMediaSyncApiConfigured, type MediaSyncStatus,
} from "@/data/mediaLive";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { MediaEditDialog } from "@/components/media/MediaEditDialog";
import { MediaAuditLog } from "@/components/media/MediaAuditLog";

const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

const MediaSyncBadge = ({ mediaKey, page, status }: { mediaKey: string; page: string; status: MediaSyncStatus | undefined }) => {
  const qc = useQueryClient();
  const stop = (e: React.MouseEvent) => e.stopPropagation(); // tile itself is a button (opens Edit)

  if (!isMediaSyncApiConfigured) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span onClick={stop} className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground cursor-help">
            <ShieldQuestion className="h-2.5 w-2.5" /> sync N/A
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          This environment can't reach the media sync API — edits save but won't reach the draft theme from here.
        </TooltipContent>
      </Tooltip>
    );
  }
  if (!status) return null;
  if (status.state === "syncing") {
    return <span className="inline-flex items-center gap-0.5 text-[9px] text-muted-foreground"><Loader2 className="h-2.5 w-2.5 animate-spin" /> syncing</span>;
  }
  if (status.state === "error") {
    return (
      <button
        type="button"
        onClick={(e) => { stop(e); retryMediaSync(qc, mediaKey, page); }}
        className="inline-flex items-center gap-0.5 text-[9px] text-destructive underline decoration-dotted"
        title={status.error}
      >
        <XCircle className="h-2.5 w-2.5" /> error — retry
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-500">
      <CheckCircle2 className="h-2.5 w-2.5" /> synced {fmtTime(status.at)}
    </span>
  );
};

const TypeIcon = ({ type, className }: { type: string; className?: string }) => {
  if (type === "video") return <Video className={className} />;
  if (type === "pdf") return <FileText className={className} />;
  return <ImageIcon className={className} />;
};

const BACKEND_TONE: Record<string, string> = {
  vercel_static: "border-muted-foreground/40 text-muted-foreground",
  shopify_files: "border-emerald-500/40 text-emerald-400",
  supabase: "border-sky-500/40 text-sky-400",
};

const fmtBytes = (n: number | null) => {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

export const MediaAdmin = () => {
  const { session } = useAuth();
  const actor = session?.user?.email ?? "unknown";
  const { data: assets, isLoading, isError, error } = useSiteMedia();
  const { data: syncStatusMap } = useMediaSyncStatusMap();

  const [search, setSearch] = useState("");
  const [pageFilter, setPageFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [editing, setEditing] = useState<SiteMediaAsset | null>(null);

  const pageOptions = useMemo(() => {
    const set = new Set((assets ?? []).map((a) => a.page));
    return ["ALL", ...Array.from(set).sort()];
  }, [assets]);

  const typeOptions = useMemo(() => {
    const set = new Set((assets ?? []).map((a) => a.media_type));
    return ["ALL", ...Array.from(set).sort()];
  }, [assets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (assets ?? []).filter((a) => {
      if (pageFilter !== "ALL" && a.page !== pageFilter) return false;
      if (typeFilter !== "ALL" && a.media_type !== typeFilter) return false;
      if (reviewOnly && !a.needs_review) return false;
      if (q && !`${a.media_key} ${a.alt_text ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [assets, search, pageFilter, typeFilter, reviewOnly]);

  const reviewCount = (assets ?? []).filter((a) => a.needs_review).length;

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-sky-400" />
        <span>
          This panel is the <strong>single source of truth</strong> for site media. Every saved edit or file replace
          now syncs to the Shopify <strong>draft theme</strong> automatically within a few seconds — never live.
          Nothing here is ever pulled back from the theme.
        </span>
      </div>

      <Card className="p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-1 flex-wrap justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-heading tracking-wide">MEDIA LIBRARY</h3>
            <DataSourceBadge source="live" />
            <span className="text-xs text-muted-foreground">Supabase · site_media</span>
          </div>
          {reviewCount > 0 && (
            <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-400">
              <AlertTriangle className="h-3 w-3" /> {reviewCount} need review
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-4 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search page/slot, alt text…" className="pl-8 h-9" />
          </div>
          <Select value={pageFilter} onValueChange={setPageFilter}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {pageOptions.map((p) => <SelectItem key={p} value={p}>{p === "ALL" ? "All pages" : p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {typeOptions.map((t) => <SelectItem key={t} value={t}>{t === "ALL" ? "All types" : t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant={reviewOnly ? "default" : "outline"} size="sm" onClick={() => setReviewOnly((v) => !v)}>
            Needs review only
          </Button>
        </div>

        {!isSupabaseConfigured ? (
          <p className="text-sm text-destructive">Supabase is not configured — the media library cannot load.</p>
        ) : isError ? (
          <p className="text-sm text-destructive">{(error as Error)?.message ?? "Could not load the media library."}</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assets match this filter.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3" data-testid="media-grid">
            {filtered.map((a) => (
              <button key={a.media_key} onClick={() => setEditing(a)}
                className="group relative rounded-md border overflow-hidden bg-muted/20 text-left hover:border-gold/60 transition-colors">
                <div className="aspect-square w-full flex items-center justify-center bg-muted/30 overflow-hidden">
                  {a.media_type === "image" ? (
                    <img src={a.asset_url} alt={a.alt_text ?? a.media_key} loading="lazy"
                      className="h-full w-full object-cover" />
                  ) : (
                    <TypeIcon type={a.media_type} className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="p-2 space-y-1">
                  <p className="text-[11px] font-mono truncate" title={a.media_key}>{a.media_key}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] px-1 py-0 ${BACKEND_TONE[a.storage_backend] ?? ""}`}>
                      {(STORAGE_BACKEND_LABEL[a.storage_backend] ?? a.storage_backend).split(" ")[0]}
                    </Badge>
                    {a.needs_review && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-500/40 text-amber-400">
                        review
                      </Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {a.width && a.height ? `${a.width}×${a.height} · ` : ""}{fmtBytes(a.bytes)}
                  </p>
                  <MediaSyncBadge mediaKey={a.media_key} page={a.page} status={syncStatusMap?.[a.media_key]} />
                </div>
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-background/90 border">
                    <Pencil className="h-3 w-3" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">{filtered.length} of {assets?.length ?? 0} assets shown</p>
      </Card>

      <MediaAuditLog />

      <MediaEditDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        asset={editing}
        actor={actor}
      />
    </div>
  );
};
