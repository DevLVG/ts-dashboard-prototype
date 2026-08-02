// One editable copy string — EN and AR side by side (stacks on mobile).
// Saves on blur, only when the value actually changed (dirty check), same
// "only write what changed" discipline as the Catalogue's ProductEditDialog.
import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Languages } from "lucide-react";
import { settingLabel } from "./siteCopyLabels";
import { useUpdateSiteCopyField, type SiteCopyRow } from "@/data/siteCopyLive";
import { useToast } from "@/hooks/use-toast";

interface Props {
  row: SiteCopyRow;
  actor: string;
}

export const SiteCopyFieldRow = ({ row, actor }: Props) => {
  const updateField = useUpdateSiteCopyField();
  const { toast } = useToast();
  const [en, setEn] = useState(row.en ?? "");
  const [ar, setAr] = useState(row.ar ?? "");
  const [needsReview, setNeedsReview] = useState(row.needs_review);
  const [savingField, setSavingField] = useState<"en" | "ar" | null>(null);

  useEffect(() => { setEn(row.en ?? ""); }, [row.en]);
  useEffect(() => { setAr(row.ar ?? ""); }, [row.ar]);
  useEffect(() => { setNeedsReview(row.needs_review); }, [row.needs_review]);

  const commit = async (field: "en" | "ar", value: string, original: string | null) => {
    if (value === (original ?? "")) return; // no-op, nothing changed
    setSavingField(field);
    try {
      await updateField.mutateAsync({ key: row.key, field, value, actor });
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: (err as Error).message });
      // revert local state to last known-good server value
      if (field === "en") setEn(original ?? "");
      else setAr(original ?? "");
    } finally {
      setSavingField(null);
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
        <div className="relative">
          <span className="absolute -top-2 left-2 bg-card px-1 text-[10px] text-muted-foreground">EN</span>
          <Textarea
            value={en}
            onChange={(e) => setEn(e.target.value)}
            onBlur={() => commit("en", en, row.en)}
            rows={en.length > 120 ? 4 : 2}
            className="text-sm resize-y"
          />
          {savingField === "en" && (
            <Loader2 className="h-3 w-3 animate-spin absolute right-2 top-2 text-muted-foreground" />
          )}
        </div>
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
          {savingField === "ar" && (
            <Loader2 className="h-3 w-3 animate-spin absolute right-2 top-2 text-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  );
};
