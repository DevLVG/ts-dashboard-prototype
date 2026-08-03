// Structured repeater for the competition schedule — replaces the old
// "one per line: Label|Detail" free-text textarea.
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { move, uid, type ScheduleRow } from "./ticketTierFormat";

interface Props {
  rows: ScheduleRow[];
  onChange: (rows: ScheduleRow[]) => void;
}

export const ScheduleRepeater = ({ rows, onChange }: Props) => {
  const update = (id: string, patch: Partial<ScheduleRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const reorder = (index: number, dir: -1 | 1) => onChange(move(rows, index, index + dir));
  const add = () => onChange([...rows, { id: uid(), label: "", detail: "" }]);

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3">
          No schedule items yet — the Schedule section is hidden on the landing page until you add one.
        </p>
      )}
      {rows.map((row, i) => {
        const labelMissing = !row.label.trim();
        return (
          <div key={row.id} className="flex items-start gap-2">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-[11px]">Label<span className="text-destructive"> *</span></Label>
                <Input value={row.label} onChange={(e) => update(row.id, { label: e.target.value })}
                  placeholder="e.g. Week 1 · Arabian Splendor"
                  className={labelMissing ? "mt-1 h-8 text-sm border-destructive" : "mt-1 h-8 text-sm"} />
                {labelMissing && <p className="text-[11px] text-destructive mt-0.5">Label is required</p>}
              </div>
              <div>
                <Label className="text-[11px]">Detail</Label>
                <Input value={row.detail} onChange={(e) => update(row.id, { detail: e.target.value })}
                  placeholder="e.g. 16–18 January 2025" className="mt-1 h-8 text-sm" />
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
                onClick={() => remove(row.id)} aria-label="Remove item">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={add}>
        <Plus className="h-3.5 w-3.5" /> Add schedule item
      </Button>
    </div>
  );
};
