// Structured repeater for ticket tiers — replaces the old single free-text
// "one per line: name | price | note" textarea (the CEO's "this is really
// antique" complaint, 2026-08-03). Shared by Spectator tickets and
// Competitor entries; `showFeatured` toggles the one field that only exists
// for spectator tickets (see ticketTierFormat.ts for the wire-format
// asymmetry). Reorder is up/down buttons rather than drag-and-drop — no
// drag library is installed anywhere in this app yet, and visible buttons
// are also the more accessible, keyboard-usable choice.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowDown, ArrowUp, Plus, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { move, uid, type TierRow } from "./ticketTierFormat";

interface Props {
  rows: TierRow[];
  onChange: (rows: TierRow[]) => void;
  showFeatured?: boolean;
  addLabel?: string;
  emptyHint: string;
}

const errorsFor = (r: TierRow) => ({
  name: !r.name.trim() ? "Name is required" : null,
  price: !r.price.trim() || Number.isNaN(Number(r.price)) || Number(r.price) < 0
    ? "Enter a valid price (0 or more)"
    : null,
});

export const TierRepeater = ({ rows, onChange, showFeatured = false, addLabel = "Add tier", emptyHint }: Props) => {
  const update = (id: string, patch: Partial<TierRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const reorder = (index: number, dir: -1 | 1) => onChange(move(rows, index, index + dir));
  const add = () => onChange([...rows, { id: uid(), name: "", price: "", note: "", featured: false, href: "" }]);

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">{emptyHint}</p>
      )}
      {rows.map((row, i) => {
        const errs = errorsFor(row);
        return (
          <div key={row.id} className="rounded-md border p-3 space-y-2 bg-muted/10">
            <div className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_130px] gap-2">
                <div>
                  <Label className="text-[11px]">Name<span className="text-destructive"> *</span></Label>
                  <Input value={row.name} onChange={(e) => update(row.id, { name: e.target.value })}
                    placeholder="e.g. General Admission" className={cn("mt-1 h-8 text-sm", errs.name && "border-destructive")} />
                  {errs.name && <p className="text-[11px] text-destructive mt-0.5">{errs.name}</p>}
                </div>
                <div>
                  <Label className="text-[11px]">Price (SAR)<span className="text-destructive"> *</span></Label>
                  <Input type="number" min="0" step="0.01" inputMode="decimal" value={row.price}
                    onChange={(e) => update(row.id, { price: e.target.value })}
                    className={cn("mt-1 h-8 text-sm", errs.price && "border-destructive")} />
                  {errs.price && <p className="text-[11px] text-destructive mt-0.5">{errs.price}</p>}
                </div>
              </div>
              <div className="flex items-center gap-0.5 pt-5 shrink-0">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0}
                  onClick={() => reorder(i, -1)} aria-label="Move up">
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === rows.length - 1}
                  onClick={() => reorder(i, 1)} aria-label="Move down">
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                  onClick={() => remove(row.id)} aria-label="Remove tier">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <div>
              <Label className="text-[11px]">Note (optional)</Label>
              <Input value={row.note} onChange={(e) => update(row.id, { note: e.target.value })}
                placeholder="e.g. per person, per day" className="mt-1 h-8 text-sm" />
            </div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              {showFeatured && (
                <div className="flex items-center gap-2">
                  <Switch checked={row.featured} onCheckedChange={(c) => update(row.id, { featured: c })} />
                  <Label className="text-[11px] font-normal flex items-center gap-1">
                    <Star className="h-3 w-3 text-amber-500" /> Featured ("Most Chosen" ribbon)
                  </Label>
                </div>
              )}
              <div className="flex-1 min-w-[220px]">
                <Label className="text-[11px]">Custom checkout link (optional)</Label>
                <Input value={row.href} onChange={(e) => update(row.id, { href: e.target.value })}
                  placeholder="Overrides the default Buy-tickets link for this tier only"
                  className="mt-1 h-8 text-xs font-mono" />
              </div>
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={add}>
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </Button>
    </div>
  );
};
