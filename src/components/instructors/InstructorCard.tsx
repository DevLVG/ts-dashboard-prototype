// One editable instructor profile — name/title/bio/photo/languages/
// specialties/contact/order/active/needs-review, all inline, save-on-blur
// (or on-change for toggles), same "row is the unit of edit, only write what
// changed" discipline as SiteCopyFieldRow. "Needs review" is the PUBLICATION
// GATE — while checked, sync_instructors_to_theme.py will never push this
// profile to the live site (see instructorsLive.ts header).
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ImagePlus, ShieldAlert, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  type InstructorRow, type EditableField,
  useUpdateInstructorField, uploadInstructorPhoto,
} from "@/data/instructorsLive";

interface Props {
  row: InstructorRow;
  actor: string;
}

export const InstructorCard = ({ row, actor }: Props) => {
  const updateField = useUpdateInstructorField();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(row.name ?? "");
  const [title, setTitle] = useState(row.title ?? "");
  const [bio, setBio] = useState(row.bio ?? "");
  const [languages, setLanguages] = useState(row.languages ?? "");
  const [specialties, setSpecialties] = useState(row.specialties ?? "");
  const [disciplines, setDisciplines] = useState(row.disciplines ?? "");
  const [email, setEmail] = useState(row.email ?? "");
  const [phone, setPhone] = useState(row.phone ?? "");
  const [sortOrder, setSortOrder] = useState(row.sort_order != null ? String(row.sort_order) : "");
  const [isActive, setIsActive] = useState(row.is_active);
  const [needsReview, setNeedsReview] = useState(row.needs_review);
  const [photoPreview, setPhotoPreview] = useState(row.photo_url ?? "");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { setName(row.name ?? ""); }, [row.name]);
  useEffect(() => { setTitle(row.title ?? ""); }, [row.title]);
  useEffect(() => { setBio(row.bio ?? ""); }, [row.bio]);
  useEffect(() => { setLanguages(row.languages ?? ""); }, [row.languages]);
  useEffect(() => { setSpecialties(row.specialties ?? ""); }, [row.specialties]);
  useEffect(() => { setDisciplines(row.disciplines ?? ""); }, [row.disciplines]);
  useEffect(() => { setEmail(row.email ?? ""); }, [row.email]);
  useEffect(() => { setPhone(row.phone ?? ""); }, [row.phone]);
  useEffect(() => { setSortOrder(row.sort_order != null ? String(row.sort_order) : ""); }, [row.sort_order]);
  useEffect(() => { setIsActive(row.is_active); }, [row.is_active]);
  useEffect(() => { setNeedsReview(row.needs_review); }, [row.needs_review]);
  useEffect(() => { setPhotoPreview(row.photo_url ?? ""); }, [row.photo_url]);

  const commit = async (field: EditableField, value: string, original: string, revert: (v: string) => void) => {
    if (value === original) return;
    setSavingField(field);
    try {
      await updateField.mutateAsync({ instructorId: row.id, field, value, actor });
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: (err as Error).message });
      revert(original);
    } finally {
      setSavingField(null);
    }
  };

  const commitToggle = async (field: "is_active" | "needs_review", checked: boolean, setter: (v: boolean) => void) => {
    setter(checked);
    setSavingField(field);
    try {
      await updateField.mutateAsync({ instructorId: row.id, field, value: String(checked), actor });
    } catch (err) {
      setter(!checked);
      toast({ variant: "destructive", title: "Save failed", description: (err as Error).message });
    } finally {
      setSavingField(null);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    const localPreview = URL.createObjectURL(f);
    setPhotoPreview(localPreview);
    try {
      const url = await uploadInstructorPhoto(row.id, f);
      await updateField.mutateAsync({ instructorId: row.id, field: "photo_url", value: url, actor });
      setPhotoPreview(url);
      toast({ title: `Photo uploaded for ${row.name}`, description: "Run Sync to site to publish it live once this profile is ready." });
    } catch (err) {
      setPhotoPreview(row.photo_url ?? "");
      toast({ variant: "destructive", title: "Photo upload failed", description: (err as Error).message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const readyForSite = isActive && !needsReview;

  return (
    <div className="rounded-md border p-4 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-16 w-16 rounded-full border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
            {photoPreview ? (
              <img src={photoPreview} alt={name || "Instructor photo"} className="h-full w-full object-cover" />
            ) : (
              <ImagePlus className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div>
            <Input value={name} onChange={(e) => setName(e.target.value)}
              onBlur={() => commit("name", name, row.name ?? "", setName)}
              className="text-base font-heading h-8 min-w-[200px]" placeholder="Full name" />
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              onBlur={() => commit("title", title, row.title ?? "", setTitle)}
              placeholder="Title / role (e.g. Head Coach)" className="mt-1 h-7 text-xs text-muted-foreground min-w-[200px]" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {readyForSite ? (
            <Badge variant="outline" className="gap-1 text-[10px] border-emerald-500/40 text-emerald-500">
              <ShieldCheck className="h-3 w-3" /> Live-ready
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-[10px] border-amber-500/40 text-amber-500">
              <ShieldAlert className="h-3 w-3" /> {needsReview ? "Needs review — not published" : "Inactive — not published"}
            </Badge>
          )}
          {(savingField || uploading) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>

      <div>
        <Label className="text-[11px] text-muted-foreground">Photo</Label>
        <div className="mt-1 flex items-center gap-2">
          <Input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} disabled={uploading} className="h-8 text-xs" />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">Uploads to Supabase Storage (instructor-photos, public read).</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-[11px] text-muted-foreground">Bio (2-3 lines)</Label>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)}
            onBlur={() => commit("bio", bio, row.bio ?? "", setBio)}
            placeholder="Profile coming soon." rows={3} className="mt-1 text-sm" />
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-[11px] text-muted-foreground">Languages (comma-separated)</Label>
            <Input value={languages} onChange={(e) => setLanguages(e.target.value)}
              onBlur={() => commit("languages", languages, row.languages ?? "", setLanguages)}
              placeholder="Arabic, English" className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Specialties (comma-separated)</Label>
            <Input value={specialties} onChange={(e) => setSpecialties(e.target.value)}
              onBlur={() => commit("specialties", specialties, row.specialties ?? "", setSpecialties)}
              placeholder="Showjumping, Beginners" className="mt-1 h-8 text-sm" />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Disciplines taught (comma-separated)</Label>
            <Input value={disciplines} onChange={(e) => setDisciplines(e.target.value)}
              onBlur={() => commit("disciplines", disciplines, row.disciplines ?? "", setDisciplines)}
              placeholder="Group, Private, Educational" className="mt-1 h-8 text-sm" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-[11px] text-muted-foreground">Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)}
            onBlur={() => commit("email", email, row.email ?? "", setEmail)}
            className="mt-1 h-8 text-sm" placeholder="name@triosporting.com" />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)}
            onBlur={() => commit("phone", phone, row.phone ?? "", setPhone)}
            className="mt-1 h-8 text-sm" />
        </div>
        <div>
          <Label className="text-[11px] text-muted-foreground">Display order</Label>
          <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}
            onBlur={() => commit("sort_order", sortOrder, row.sort_order != null ? String(row.sort_order) : "", setSortOrder)}
            className="mt-1 h-8 text-sm" />
        </div>
        <div className="flex flex-col justify-end gap-1">
          <Label className="text-[11px] text-muted-foreground">Active</Label>
          <Switch checked={isActive} onCheckedChange={(c) => commitToggle("is_active", c, setIsActive)} />
        </div>
      </div>

      {row.needs_review && row.notes && (
        <p className="text-[11px] text-amber-600 bg-amber-500/10 rounded px-2 py-1.5">{row.notes}</p>
      )}

      <label className="flex items-center gap-2 text-xs text-muted-foreground border-t pt-3">
        <Checkbox checked={needsReview} onCheckedChange={(c) => commitToggle("needs_review", c === true, setNeedsReview)} />
        Needs review — uncheck only once name, title, bio, photo and languages are confirmed. While checked, this
        profile never reaches the live site, even if Sync to site is run.
      </label>
    </div>
  );
};
