// Edit / create dialog — Calendario slot (Slot Priority) CMS. Plain,
// staff-usable: pick the activity, the instructor (or leave blank —
// group programs like "From Zero to Hero" have none in the source), the
// weekday + time window, and the release window in hours. Save writes via
// slot_priority_update_field / slot_priority_create (migration 067) — the
// audit row is guaranteed by the DB function itself.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2, Trash2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  type SlotPriorityRow, type ScopeType, WEEKDAY_LABELS,
  useUpdateSlotPriorityField, useCreateSlotPriority, useDeleteSlotPriority, useBulkSetReleaseWindow,
  usePriorityPreview,
} from "@/data/slotPriorityLive";
import { useInstructors } from "@/data/instructorsLive";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: SlotPriorityRow | null; // null = "new claim" mode
  actor: string;
  /** When opening "new" from a specific grid cell, pre-fill weekday/time. */
  prefill?: { weekday: number; startTime: string; endTime: string };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const SlotPriorityEditDialog = ({ open, onOpenChange, row, actor, prefill }: Props) => {
  const isNew = row === null;
  const { toast } = useToast();
  const { data: instructors } = useInstructors();
  const updateField = useUpdateSlotPriorityField();
  const createClaim = useCreateSlotPriority();
  const deleteClaim = useDeleteSlotPriority();
  const bulkSetWindow = useBulkSetReleaseWindow();

  const [label, setLabel] = useState("");
  const [scopeType, setScopeType] = useState<ScopeType>("recurring_weekly");
  const [weekday, setWeekday] = useState(1);
  const [specificDate, setSpecificDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [instructorId, setInstructorId] = useState<string>("__none__");
  const [instructorRaw, setInstructorRaw] = useState("");
  const [releaseHours, setReleaseHours] = useState("48");
  const [applyToAllSameLabel, setApplyToAllSameLabel] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [needsReview, setNeedsReview] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [previewDate, setPreviewDate] = useState(todayIso());

  const preview = usePriorityPreview(row?.id ?? null, previewDate || null);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    setPreviewDate(todayIso());
    if (row) {
      setLabel(row.label);
      setScopeType(row.scope_type);
      setWeekday(row.weekday ?? 1);
      setSpecificDate(row.specific_date ?? todayIso());
      setStartTime(row.start_time.slice(0, 5));
      setEndTime(row.end_time.slice(0, 5));
      setInstructorId(row.priority_instructor_id ?? "__none__");
      setInstructorRaw(row.priority_instructor_raw ?? "");
      setReleaseHours(String(row.release_window_hours));
      setIsActive(row.is_active);
      setNeedsReview(row.needs_review);
      setNotes(row.notes ?? "");
      setApplyToAllSameLabel(false);
    } else {
      setLabel("");
      setScopeType("recurring_weekly");
      setWeekday(prefill?.weekday ?? 1);
      setSpecificDate(todayIso());
      setStartTime(prefill?.startTime ?? "09:00");
      setEndTime(prefill?.endTime ?? "10:00");
      setInstructorId("__none__");
      setInstructorRaw("");
      setReleaseHours("48");
      setIsActive(true);
      setNeedsReview(true);
      setNotes("");
      setApplyToAllSameLabel(false);
    }
  }, [open, row, prefill]);

  const save = async () => {
    if (!label.trim()) {
      toast({ variant: "destructive", title: "Activity name is required" });
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await createClaim.mutateAsync({
          label: label.trim(),
          scope_type: scopeType,
          start_time: startTime,
          end_time: endTime,
          weekday: scopeType === "recurring_weekly" ? weekday : undefined,
          specific_date: scopeType === "date_specific" ? specificDate : undefined,
          priority_instructor_id: instructorId !== "__none__" ? instructorId : undefined,
          priority_instructor_raw: instructorRaw.trim() || undefined,
          release_window_hours: Number(releaseHours) || 48,
          actor,
        });
        toast({ title: `Created "${label}"`, description: "New claims start flagged “Needs review” until confirmed." });
      } else {
        const edits: Array<[string, string]> = [
          ["label", label.trim()],
          ["start_time", startTime],
          ["end_time", endTime],
          ["priority_instructor_id", instructorId !== "__none__" ? instructorId : ""],
          ["priority_instructor_raw", instructorRaw.trim()],
          ["is_active", String(isActive)],
          ["needs_review", String(needsReview)],
          ["notes", notes],
        ];
        if (scopeType === "recurring_weekly") edits.push(["weekday", String(weekday)]);
        else edits.push(["specific_date", specificDate]);

        for (const [field, value] of edits) {
          // eslint-disable-next-line no-await-in-loop
          await updateField.mutateAsync({ slotPriorityId: row.id, field: field as never, value, actor });
        }

        if (applyToAllSameLabel) {
          const n = await bulkSetWindow.mutateAsync({ label: label.trim(), hours: Number(releaseHours) || 48, actor });
          await updateField.mutateAsync({ slotPriorityId: row.id, field: "release_window_hours", value: releaseHours, actor });
          toast({ title: "Saved", description: `Release window applied to ${n} slot(s) sharing "${label}".` });
        } else {
          await updateField.mutateAsync({ slotPriorityId: row.id, field: "release_window_hours", value: releaseHours, actor });
          toast({ title: "Saved" });
        }
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
      await deleteClaim.mutateAsync({ slotPriorityId: row.id, actor, reason: "deleted from Slot Calendar panel" });
      toast({ title: `Deleted "${row.label}"` });
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
          <DialogTitle>{isNew ? "New priority claim" : `Edit — ${row.label}`}</DialogTitle>
          <DialogDescription>
            While this claim holds, only "{label || "this activity"}" can book the slot. It releases to Horse
            School group/private lessons if unbooked by the release window below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Activity name</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Groundwork Basics" className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Recurs on</Label>
              <Select value={scopeType} onValueChange={(v) => setScopeType(v as ScopeType)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recurring_weekly">Every week (weekday)</SelectItem>
                  <SelectItem value="date_specific">One specific date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {scopeType === "recurring_weekly" ? (
              <div>
                <Label className="text-xs text-muted-foreground">Weekday</Label>
                <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v))}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEEKDAY_LABELS.map((d, i) => (
                      <SelectItem key={d} value={String(i + 1)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Input type="date" value={specificDate} onChange={(e) => setSpecificDate(e.target.value)} className="mt-1 h-9" />
              </div>
            )}
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
              <Label className="text-xs text-muted-foreground">Instructor (confirmed roster)</Label>
              <Select value={instructorId} onValueChange={setInstructorId}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— none —</SelectItem>
                  {(instructors ?? []).map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Instructor, as written in source</Label>
              <Input value={instructorRaw} onChange={(e) => setInstructorRaw(e.target.value)}
                placeholder="e.g. Mansur+Karen" className="mt-1 h-9" />
              <p className="text-[10px] text-muted-foreground mt-1">Kept verbatim — use this when two instructors share a slot, or the name isn't in the confirmed roster yet.</p>
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> Release window (hours before the slot)</Label>
            <Input type="number" min={0} value={releaseHours} onChange={(e) => setReleaseHours(e.target.value)} className="mt-1 h-9 w-32" />
            <p className="text-[10px] text-muted-foreground mt-1">
              Default 48h. If "{label || "this activity"}" has no booking by this many hours before the slot, it opens to Horse School.
            </p>
            {!isNew && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
                <Checkbox checked={applyToAllSameLabel} onCheckedChange={(c) => setApplyToAllSameLabel(c === true)} />
                Apply this window to every slot sharing the activity name "{row?.label}" ({WEEKDAY_LABELS.length <= 7 ? "all weekdays" : ""})
              </label>
            )}
          </div>

          {!isNew && (
            <div className="rounded-md border border-muted-foreground/20 bg-muted/10 p-3">
              <Label className="text-xs text-muted-foreground">Live preview — is this claim blocking on...</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="date" value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} className="h-8 w-40 text-xs" />
                {preview.isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : preview.data ? (
                  <Badge variant="outline" className={preview.data.released
                    ? "border-emerald-500/40 text-emerald-500 text-[10px]"
                    : "border-amber-500/40 text-amber-500 text-[10px]"}>
                    {preview.data.released ? "Released — Horse School can book" : "Blocked — priority holds"}
                  </Badge>
                ) : null}
              </div>
              {preview.data?.releaseAt && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Releases at {new Date(preview.data.releaseAt).toLocaleString()} (Asia/Riyadh) unless booked first.
                </p>
              )}
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 text-sm" />
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label className="text-xs">Active</Label>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={needsReview} onCheckedChange={(c) => setNeedsReview(c === true)} />
              Needs review (Marta hasn't confirmed this instructor/schedule yet)
            </label>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {!isNew && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Delete this claim?</span>
                <Button size="sm" variant="destructive" onClick={onDelete} disabled={saving}>Confirm</Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="text-destructive gap-1.5" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )
          )}
          <Button onClick={save} disabled={saving} className="gap-1.5 ml-auto">
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isNew ? "Create claim" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
