// Media library picker — lets Competitions CMS staff reuse an asset already
// registered in the Media/Asset CMS (src/data/mediaLive.ts, migration 057)
// instead of hand-typing/pasting a CDN URL. Read-only consumer of that
// module's `useSiteMedia` query — this file does not modify anything owned
// by the Media CMS workstream (fix-13), it only lists what's already there.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FolderSearch, ImageIcon, Search, Video as VideoIcon } from "lucide-react";
import { useSiteMedia } from "@/data/mediaLive";

interface Props {
  onSelect: (url: string) => void;
  mediaType?: "image" | "video";
  label?: string;
}

export const MediaLibraryPickerButton = ({ onSelect, mediaType, label = "Browse library" }: Props) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { data: assets, isLoading } = useSiteMedia();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (assets ?? []).filter((a) => {
      if (mediaType && a.media_type !== mediaType) return false;
      if (!q) return true;
      return `${a.media_key} ${a.page} ${a.slot} ${a.alt_text ?? ""}`.toLowerCase().includes(q);
    });
  }, [assets, search, mediaType]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0">
          <FolderSearch className="h-3.5 w-3.5" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <div className="relative mb-2">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search media library…" className="pl-8 h-8 text-xs" autoFocus />
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {isLoading ? (
            <p className="text-xs text-muted-foreground px-1 py-2">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1 py-2">
              No {mediaType ?? "media"} assets match. Paste a URL directly instead, or add one via the Media module.
            </p>
          ) : (
            filtered.map((a) => (
              <button
                key={a.media_key}
                type="button"
                onClick={() => { onSelect(a.asset_url); setOpen(false); }}
                className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60 transition-colors"
              >
                <div className="h-9 w-9 rounded border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                  {a.media_type === "video" ? (
                    <VideoIcon className="h-4 w-4 text-muted-foreground" />
                  ) : a.media_type === "image" ? (
                    <img
                      src={a.asset_url}
                      alt={a.alt_text ?? a.media_key}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{a.media_key}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{a.page} · {a.slot}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
