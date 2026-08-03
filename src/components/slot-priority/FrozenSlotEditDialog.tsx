// Create / edit dialog — a date-specific EXCEPTION (cal_frozen_slots,
// migration 065; first browser UI onto it built 2026-08-03, fix-16-slots).
// The exception layer: single dates that deviate from the weekly pattern —
// competition day, Eid/holiday closure, extreme-heat day. Resolution order
// for any date: override (this) > seasonal calendar > nothing.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  type FrozenSlotRow, type FrozenScopeType,
  useCreateFrozenSlot, useUpdateFrozenSlotField, useDeleteFrozenSlot,
} from "@/data/frozenSlotsLive";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: FrozenSlotRow | null; // null = "new exception" mode
  actor: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export const FrozenSlotEditDialog = ({ open, onOpenChange, row, actor }: Props) => {
  const isNew = row === null;
  const { toast } = useToast();
  const createFrozen = useCreateFrozenSlot();
  const updateField = useUpdateFrozenSlotField();
  const deleteFrozen = useDeleteFrozenSlot();

  const [label, setLabel] = useState("");
  const [scopeType, setScopeType] = useState<FrozenScopeType>("date_specific");
  const [weekday, setWeekday] = useState(1);
  const [specificDate, setSpecificDate] = useState(todayIso());
  const [startTime, setStartTime] = useState("00:00");
  const [endTime, setEndTime] = useState("23:59");
  const [fullDay, setFullDay] = useState(true);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [isFrozen, setIsFrozen] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (row) {
      setLabel(row.label);
      setScopeType(row.scope_type);
      setWeekday(row.weekday ?? 1);
      setSpecificDate(row.specific_date ?? todayIso());
      setStartTime(row.start_time.slice(0, 5));
      setEndTime(row.end_time.slice(0, 5));
      setFullDay(row.start_time.slice(0, 5) === "00:00" && row.end_time.slice(0, 5) === "23:59");
      setReason(row.reason ?? "");
      setNotes(row.notes ?? "");
      setIsFrozen(row.is_frozen);
    } else {
      setLabel("");
      setScopeType("date_specific");
      setWeekday(1);
      setSpecificDate(todayIso());
      setStartTime("00:00");
      setEndTime("23:59");
      setFullDay(true);
      setReason("");
      setNotes("");
      setIsFrozen(true);
    }
  }, [open, row]);

  const save = async () => {
    if (!label.trim()) {
      toast({ variant: "destructive", title: "A short name is required", description: "e.g. 'Regional Championship — closed', 'Eid al-Fitr'" });
      return;
    }
    const effStart = fullDay ? "00:00" : startTime;
    const effEnd = fullDay ? "23:59" : endTime;
    setSaving(true);
    try {
      if (isNew) {
        await createFrozen.mutateAsync({
          label: label.trim(),
          scope_type: scopeType,
          start_time: effStart,
          end_time: effEnd,
          weekday: scopeType === "recurring_weekly" ? weekday : undefined,
          specific_date: scopeType === "date_specific" ? specificDate : undefined,
          reason: reason.trim() || undefined,
          actor,
        });
        toast({ title: `Exception created — "${label}"` });
      } else {
        const edits: Array<[string, string]> = [
          ["label", label.trim()],
          ["start_time", effStart],
          ["end_time", effEnd],
          ["reason", reason.trim()],
          ["notes", notes],
          ["is_frozen", String(isFrozen)],
        ];
        if (scopeType === "recurring_weekly") edits.push(["weekday", String(weekday)]);
        else edits.push(["specific_date", specificDate]);
        for (const [field, value] of edits) {
          // eslint-disable-next-line no-await-in-loop
          await updateField.mutateAsync({ frozenSlotId: row.id, field, value, actor });
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
      await deleteFrozen.mutateAsync({ frozenSlotId: row.id, actor, reason: "deleted from Calendario slot panel" });
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
          <DialogTitle>{isNew ? "New exception" : `Edit — ${row.label}`}</DialogTitle>
          <DialogDescription>
            A single date (or recurring weekday window) that deviates from the normal weekly calendar — a
            competition day, holiday closure, or extreme-heat day. This ALWAYS takes priority over the seasonal
            calendar for the date(s) it covers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">Name / reason</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Regional Championship, Eid al-Fitr, Extreme heat" className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Applies</Label>
              <Select value={scopeType} onValueChange={(v) => setScopeType(v as FrozenScopeType)}>
                <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_specific">One specific date</SelectItem>
                  <SelectItem value="recurring_weekly">Every week (weekday)</SelectItem>
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

          <div className="flex items-center gap-2">
            <Switch checked={fullDay} onCheckedChange={setFullDay} />
            <Label className="text-xs">Full day (closed all hours)</Label>
          </div>
          {!fullDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">From</Label>
                <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">To</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1 h-9" />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Reason shown to staff</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Club hosts regional championship — no lessons" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 text-sm" />
          </div>

          {!isNew && (
            <div className="flex items-center gap-2 border-t pt-3">
              <Switch checked={isFrozen} onCheckedChange={setIsFrozen} />
              <Label className="text-xs">Active (unfreezing keeps the row for history without deleting it)</Label>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {!isNew && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Delete this exception?</span>
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
            {isNew ? "Create exception" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
