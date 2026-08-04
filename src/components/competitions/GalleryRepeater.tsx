// Structured repeater for gallery images — replaces the old "one image URL
// per line" free-text textarea. gallery_urls is already a JSONB array
// column (migration 058), so this is a pure UI upgrade: thumbnail preview
// per row + optional pick-from-Media-Library instead of hand-pasting URLs.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowDown, ArrowUp, ImageOff, Plus, X } from "lucide-react";
import { shopifyImageThumb } from "@/lib/imageThumb";
import { MediaLibraryPickerButton } from "./MediaLibraryPickerButton";
import { move, uid, type GalleryRow } from "./ticketTierFormat";

interface Props {
  rows: GalleryRow[];
  onChange: (rows: GalleryRow[]) => void;
}

export const GalleryRepeater = ({ rows, onChange }: Props) => {
  const update = (id: string, url: string) => onChange(rows.map((r) => (r.id === id ? { ...r, url } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const reorder = (index: number, dir: -1 | 1) => onChange(move(rows, index, index + dir));
  const add = (url = "") => onChange([...rows, { id: uid(), url }]);

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
          No gallery images yet — the gallery strip is hidden on the landing page until you add one.
        </p>
      )}
      {rows.map((row, i) => (
        <div key={row.id} className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
            {row.url ? (
              <img
                src={shopifyImageThumb(row.url, { width: 80 }) ?? row.url}
                alt="Gallery preview"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageOff className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <Input value={row.url} onChange={(e) => update(row.id, e.target.value)}
            placeholder="https://cdn.shopify.com/…" className="h-8 text-xs font-mono flex-1" />
          <MediaLibraryPickerButton mediaType="image" label="Library" onSelect={(url) => update(row.id, url)} />
          <div className="flex items-center gap-0.5 shrink-0">
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0}
              onClick={() => reorder(i, -1)} aria-label="Move up">
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === rows.length - 1}
              onClick={() => reorder(i, 1)} aria-label="Move down">
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive"
              onClick={() => remove(row.id)} aria-label="Remove image">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => add()}>
          <Plus className="h-3.5 w-3.5" /> Add image URL
        </Button>
        <MediaLibraryPickerButton mediaType="image" label="Add from library" onSelect={(url) => add(url)} />
      </div>
      <Label className="text-[11px] text-muted-foreground block">Drag/drop upload isn't wired here yet — paste a URL or pick from the Media Library.</Label>
    </div>
  );
};
