// One editable copy string — EN and AR side by side (stacks on mobile).
// Saves on blur, only when the value actually changed (dirty check), same
// "only write what changed" discipline as the Catalogue's ProductEditDialog.
//
// CEO live-review 2026-08-03 (mandate extension): this already autosaved —
// nothing showed it. Added the same "Saving… / Saved ✓ / Error — retry"
// chip used across the Cockpit. Visibility only — save-on-blur behavior is
// unchanged.
import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Languages } from "lucide-react";
import { settingLabel } from "./siteCopyLabels";
import { useUpdateSiteCopyField, type SiteCopyRow } from "@/data/siteCopyLive";
import { useToast } from "@/hooks/use-toast";
import { SaveStatusChip, type SaveStatusKind } from "@/components/chrome/SaveStatusChip";

interface Props {
  row: SiteCopyRow;
  actor: string;
}

interface FieldStatus {
  kind: SaveStatusKind;
  at?: Date;
  error?: string;
}

export const SiteCopyFieldRow = ({ row, actor }: Props) => {
  const updateField = useUpdateSiteCopyField();
  const { toast } = useToast();
  const [en, setEn] = useState(row.en ?? "");
  const [ar, setAr] = useState(row.ar ?? "");
  const [needsReview, setNeedsReview] = useState(row.needs_review);
  const [enStatus, setEnStatus] = useState<FieldStatus>({ kind: "idle" });
  const [arStatus, setArStatus] = useState<FieldStatus>({ kind: "idle" });

  useEffect(() => { setEn(row.en ?? ""); }, [row.en]);
  useEffect(() => { setAr(row.ar ?? ""); }, [row.ar]);
  useEffect(() => { setNeedsReview(row.needs_review); }, [row.needs_review]);

  const setStatus = (field: "en" | "ar", status: FieldStatus) =>
    (field === "en" ? setEnStatus : setArStatus)(status);

  const commit = async (field: "en" | "ar", value: string, original: string | null) => {
    if (value === (original ?? "")) return; // no-op, nothing changed
    setStatus(field, { kind: "saving" });
    try {
      await updateField.mutateAsync({ key: row.key, field, value, actor });
      setStatus(field, { kind: "saved", at: new Date() });
    } catch (err) {
      const message = (err as Error).message;
      toast({ variant: "destructive", title: "Save failed", description: message });
      // Small correction alongside the new chip (still "visibility", not a
      // sync-semantics change): keep what the staff member typed instead of
      // silently reverting it — otherwise "Error — retry" would have
      // nothing left to resend. Same "no silent losses" principle as the
      // Catalogue autosave.
      setStatus(field, { kind: "error", error: message });
    }
  };

  const toggleReview = async (checked: boolean) => {
    setNeedsReview(checked);
    try {
      await updateField.mutateAsync({ key: row.key, field: "needs_review", value: String(checked), actor });
    } catch (err) {
      setNeedsReview(!checked);
      toast({ variant: "destructive", title: "Save failed", description: (err as Error).message });
    }
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground capitalize">{settingLabel(row.setting_key)}</span>
        <div className="flex items-center gap-2">
          {!row.ar && (
            <Badge variant="outline" className="gap-1 text-[10px] border-amber-500/40 text-amber-500">
              <Languages className="h-3 w-3" /> Needs Arabic
            </Badge>
          )}
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Checkbox checked={needsReview} onCheckedChange={(c) => toggleReview(c === true)} className="h-3.5 w-3.5" />
            Flag for review
          </label>
        </div>
      </div>
      {needsReview && row.notes && (
        <p className="text-[11px] text-amber-600 bg-amber-500/10 rounded px-2 py-1">{row.notes}</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <div className="relative">
            <span className="absolute -top-2 left-2 bg-card px-1 text-[10px] text-muted-foreground">EN</span>
            <Textarea
              value={en}
              onChange={(e) => setEn(e.target.value)}
              onBlur={() => commit("en", en, row.en)}
              rows={en.length > 120 ? 4 : 2}
              className="text-sm resize-y"
            />
          </div>
          {enStatus.kind !== "idle" && (
            <div className="mt-1">
              <SaveStatusChip
                state={enStatus.kind}
                savedAt={enStatus.at}
                errorMessage={enStatus.error}
                onRetry={() => commit("en", en, row.en)}
              />
            </div>
          )}
        </div>
        <div>
          <div className="relative">
            <span className="absolute -top-2 left-2 bg-card px-1 text-[10px] text-muted-foreground">AR</span>
            <Textarea
              value={ar}
              onChange={(e) => setAr(e.target.value)}
              onBlur={() => commit("ar", ar, row.ar)}
              placeholder="No Arabic yet — type or paste the certified translation"
              dir="rtl"
              rows={ar.length > 120 ? 4 : 2}
              className="text-sm resize-y"
            />
          </div>
          {arStatus.kind !== "idle" && (
            <div className="mt-1">
              <SaveStatusChip
                state={arStatus.kind}
                savedAt={arStatus.at}
                errorMessage={arStatus.error}
                onRetry={() => commit("ar", ar, row.ar)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
