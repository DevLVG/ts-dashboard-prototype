// Create / edit dialog — a NAMED SEASONAL CALENDAR's validity metadata
// (cal_calendar_periods, migration 072). This is Layer 1 of Marcello's
// three-layer redesign (fix-16-slots, 2026-08-03): "the weekly grid must
// belong to a named calendar with a valid-from -> to period." Purely
// additive display/planning metadata — never touches season_for_date() or
// any live booking logic (see migration 072 header).
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  type SeasonalCalendar,
  useCreateCalendarPeriod, useUpdateCalendarPeriodField, useDeleteCalendarPeriod,
} from "@/data/lessonSlotsLive";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendar: SeasonalCalendar | null; // null = "new calendar" mode
  actor: string;
}

export const CalendarEditDialog = ({ open, onOpenChange, calendar, actor }: Props) => {
  const isNew = calendar === null;
  const { toast } = useToast();
  const createPeriod = useCreateCalendarPeriod();
  const updateField = useUpdateCalendarPeriodField();
  const deletePeriod = useDeleteCalendarPeriod();

  const [season, setSeason] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [isRamadan, setIsRamadan] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [needsReview, setNeedsReview] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (calendar) {
      setSeason(calendar.season);
      setDisplayName(calendar.displayName);
      setValidFrom(calendar.validFrom ?? "");
      setValidTo(calendar.validTo ?? "");
      setPeriodLabel(calendar.periodLabel ?? "");
      setIsRamadan(calendar.isRamadan);
      setIsActive(calendar.isActive);
      setNeedsReview(calendar.needsReview);
      setNotes(calendar.periodNotes ?? "");
    } else {
      setSeason("");
      setDisplayName("");
      setValidFrom("");
      setValidTo("");
      setPeriodLabel("");
      setIsRamadan(false);
      setIsActive(true);
      setNeedsReview(true);
      setNotes("");
    }
  }, [open, calendar]);

  const save = async () => {
    if (isNew && !season.trim()) {
      toast({ variant: "destructive", title: "Calendar key is required", description: "e.g. Ramadan, Summer-Camp — a short internal key, not shown to guests." });
      return;
    }
    if (!displayName.trim()) {
      toast({ variant: "destructive", title: "Display name is required" });
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await createPeriod.mutateAsync({
          season: season.trim(),
          display_name: displayName.trim(),
          valid_from: validFrom || undefined,
          valid_to: validTo || undefined,
          period_label: periodLabel.trim() || undefined,
          is_ramadan: isRamadan,
          notes: notes.trim() || undefined,
          actor,
        });
        toast({ title: `Created "${displayName}"`, description: "Add time slots to build out its weekly grid." });
      } else if (calendar?.periodId) {
        const edits: Array<[string, string]> = [
          ["display_name", displayName.trim()],
          ["valid_from", validFrom],
          ["valid_to", validTo],
          ["period_label", periodLabel.trim()],
          ["is_active", String(isActive)],
          ["needs_review", String(needsReview)],
          ["notes", notes],
        ];
        for (const [field, value] of edits) {
          // eslint-disable-next-line no-await-in-loop
          await updateField.mutateAsync({ calendarPeriodId: calendar.periodId, field, value, actor });
        }
        toast({ title: "Saved" });
      } else if (calendar) {
        // Synthesized calendar (slots exist but no cal_calendar_periods row yet) — create one now.
        await createPeriod.mutateAsync({
          season: calendar.season,
          variant: calendar.variant,
          display_name: displayName.trim(),
          valid_from: validFrom || undefined,
          valid_to: validTo || undefined,
          period_label: periodLabel.trim() || undefined,
          is_ramadan: isRamadan,
          notes: notes.trim() || undefined,
          actor,
        });
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
    if (!calendar?.periodId) return;
    setSaving(true);
    try {
      await deletePeriod.mutateAsync({ calendarPeriodId: calendar.periodId, actor, reason: "deleted from Slot Calendar panel" });
      toast({ title: `Removed "${calendar.displayName}"` });
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
          <DialogTitle>{isNew ? "New seasonal calendar" : `Edit — ${calendar.displayName}`}</DialogTitle>
          <DialogDescription>
            A named calendar with its own validity period. For any date, the applicable calendar is the one whose
            period covers it (unless a date-specific exception applies — see Exceptions below).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isNew && (
            <div>
              <Label className="text-xs text-muted-foreground">Calendar key</Label>
              <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="e.g. Ramadan, Summer-Camp" className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">Internal identifier — must be unique. Not shown to guests.</p>
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Display name</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Ramadan Schedule" className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Valid from</Label>
              <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className="mt-1 h-9" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Valid to</Label>
              <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} className="mt-1 h-9" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Period label (shown instead of / alongside the dates)</Label>
            <Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)}
              placeholder="e.g. Apr – May · Oct – Dec (for a non-contiguous window)" className="mt-1" />
            <p className="text-[10px] text-muted-foreground mt-1">
              Use this when the real window isn't a single continuous range — the label is authoritative for display.
            </p>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={isRamadan} onCheckedChange={(c) => setIsRamadan(c === true)} />
            This is a Ramadan-style calendar (activity shifts to evening/night)
          </label>

          {!isNew && (
            <div className="flex items-center justify-between border-t pt-3">
              <div className="flex items-center gap-2">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <Label className="text-xs">Active calendar</Label>
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Checkbox checked={needsReview} onCheckedChange={(c) => setNeedsReview(c === true)} />
                Needs review
              </label>
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 text-sm" />
          </div>

          {isRamadan && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300 flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                A new calendar is plannable/editable here immediately, but it will not receive real bookings until a
                developer wires its season key into the booking engine's date-to-season selector. Flag this to
                Davide/Luca before relying on it operationally.
              </span>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {!isNew && calendar?.periodId && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Remove this calendar's metadata?</span>
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
            {isNew ? "Create calendar" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
