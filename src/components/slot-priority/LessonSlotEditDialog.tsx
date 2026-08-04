// Create / edit dialog — a real time slot inside a seasonal calendar
// (cal_lesson_slots). This is THE opening-hours x slot-duration grid layer
// (fix-16-slots rebuild, 2026-08-03) — replaces the old artifact grid that
// derived its rows from whatever cal_slot_priority claims happened to
// exist. Save writes via lesson_slot_create / lesson_slot_update_field
// (migration 072) — the audit row is guaranteed by the DB function itself.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  WEEKDAY_LABELS, type LessonSlotRow,
  useCreateLessonSlot, useUpdateLessonSlotField, useDeleteLessonSlot,
} from "@/data/lessonSlotsLive";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: LessonSlotRow | null; // null = "new slot" mode
  actor: string;
  /** New-slot mode only: which calendar (season/variant) this slot belongs to. */
  defaultSeason?: string;
  defaultVariant?: number;
}

const PART_OF_DAY_OPTIONS = ["morning", "afternoon", "evening", "night"] as const;

export const LessonSlotEditDialog = ({ open, onOpenChange, row, actor, defaultSeason, defaultVariant }: Props) => {
  const isNew = row === null;
  const { toast } = useToast();
  const createSlot = useCreateLessonSlot();
  const updateField = useUpdateLessonSlotField();
  const deleteSlot = useDeleteLessonSlot();

  const [weekdaySet, setWeekdaySet] = useState<Set<number>>(new Set([1, 2, 3, 4, 5, 6]));
  const [partOfDay, setPartOfDay] = useState<string>("morning");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [slotType, setSlotType] = useState<"group" | "private">("group");
  const [notes, setNotes] = useState("");
  const [needsReview, setNeedsReview] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (row) {
      setWeekdaySet(new Set(
        row.weekdays.split(",").map((d) => d.trim())
          .map((d) => WEEKDAY_LABELS.indexOf(d) + 1)
          .filter((n) => n > 0),
      ));
      setPartOfDay(row.part_of_day);
      setStartTime(row.start_time.slice(0, 5));
      setEndTime(row.end_time.slice(0, 5));
      setSlotType(row.slot_type);
      setNotes(row.notes ?? "");
      setNeedsReview(row.needs_review);
    } else {
      setWeekdaySet(new Set([1, 2, 3, 4, 5, 6]));
      setPartOfDay("morning");
      setStartTime("09:00");
      setEndTime("10:00");
      setSlotType("group");
      setNotes("");
      setNeedsReview(true);
    }
  }, [open, row]);

  const toggleDay = (iso: number) => {
    setWeekdaySet((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso); else next.add(iso);
      return next;
    });
  };

  const weekdaysCsv = () =>
    WEEKDAY_LABELS.filter((_, i) => weekdaySet.has(i + 1)).join(",");

  const save = async () => {
    if (weekdaySet.size === 0) {
      toast({ variant: "destructive", title: "Pick at least one weekday" });
      return;
    }
    if (endTime <= startTime) {
      toast({ variant: "destructive", title: "End time must be after start time" });
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        if (!defaultSeason) throw new Error("No calendar selected");
        await createSlot.mutateAsync({
          season: defaultSeason,
          variant: defaultVariant ?? 1,
          weekdays: weekdaysCsv(),
          part_of_day: partOfDay,
          start_time: startTime,
          end_time: endTime,
          slot_type: slotType,
          notes: notes.trim() || undefined,
          actor,
        });
        toast({ title: "Time slot added", description: "New slots start flagged “Needs review” until confirmed." });
      } else {
        const edits: Array<[string, string]> = [
          ["weekdays", weekdaysCsv()],
          ["part_of_day", partOfDay],
          ["start_time", startTime],
          ["end_time", endTime],
          ["slot_type", slotType],
          ["notes", notes],
          ["needs_review", String(needsReview)],
        ];
        for (const [field, value] of edits) {
          // eslint-disable-next-line no-await-in-loop
          await updateField.mutateAsync({ lessonSlotId: row.id, field, value, actor });
        }
        toast({ title: "Saved" });
      }
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!row) return;
    setSaving(true);
    try {
      await deleteSlot.mutateAsync({ lessonSlotId: row.id, actor, reason: "deleted from Slot Calendar panel" });
      toast({ title: "Time slot removed" });
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Delete failed", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New time slot" : `Edit time slot — ${row.start_time.slice(0, 5)}–${row.end_time.slice(0, 5)}`}</DialogTitle>
          <DialogDescription>
            A real opening-hours window in the weekly grid — not a booking, not a priority claim. This is the
            container other layers (priority claims, instructor availability) sit inside.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Applies on</Label>
            <div className="flex flex-wrap gap-2 mt-1.5">
              {WEEKDAY_LABELS.map((d, i) => {
                const iso = i + 1;
                const checked = weekdaySet.has(iso);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(iso)}
                    className={`min-w-[44px] min-h-[36px] px-2.5 rounded-md border text-xs font-semibold transition-colors ${
                      checked ? "bg-gold text-gold-foreground border-gold" : "border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Start time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">End time</Label>
              <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1 h-9" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Part of day</Label>
              <Select value={partOfDay} onValueChange={setPartOfDay}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PART_OF_DAY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Slot type</Label>
              <Select value={slotType} onValueChange={(v) => setSlotType(v as "group" | "private")}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="group">Group lesson</SelectItem>
                  <SelectItem value="private">Private lesson</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 text-sm" />
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={needsReview} onCheckedChange={(c) => setNeedsReview(c === true)} />
            Needs review (opening hours/duration not yet confirmed)
          </label>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {!isNew && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Remove this slot?</span>
                <Button size="sm" variant="destructive" onClick={onDelete} disabled={saving}>Confirm</Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="text-destructive gap-1.5" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            )
          )}
          <Button onClick={save} disabled={saving} className="gap-1.5 ml-auto">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isNew ? "Add time slot" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
