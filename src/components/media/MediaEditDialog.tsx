// Media asset edit dialog — Media/Asset CMS.
// Plain, staff-usable: preview, replace file, alt text, notes, flag for
// review. Every field change on Save is written via media_update_field —
// the audit row is guaranteed by the DB function itself (migration 057),
// never assembled here. "Replace file" uploads to Supabase Storage
// (bucket site-media) first — see mediaLive.ts header comment for why.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, ImagePlus, Video, FileText, ExternalLink, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  type SiteMediaAsset, STORAGE_BACKEND_LABEL,
  useUpdateMediaField, useDeleteMediaAsset, uploadSiteMediaFile,
} from "@/data/mediaLive";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset: SiteMediaAsset | null;
  actor: string;
}

const TypeIcon = ({ type }: { type: string }) => {
  if (type === "video") return <Video className="h-6 w-6 text-muted-foreground" />;
  if (type === "pdf") return <FileText className="h-6 w-6 text-muted-foreground" />;
  return <ImagePlus className="h-6 w-6 text-muted-foreground" />;
};

export const MediaEditDialog = ({ open, onOpenChange, asset, actor }: Props) => {
  const { toast } = useToast();
  const updateField = useUpdateMediaField();
  const deleteAsset = useDeleteMediaAsset();

  const [altText, setAltText] = useState("");
  const [notes, setNotes] = useState("");
  const [needsReview, setNeedsReview] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open || !asset) return;
    setAltText(asset.alt_text ?? "");
    setNotes(asset.notes ?? "");
    setNeedsReview(asset.needs_review);
    setPreview(asset.asset_url);
    setFile(null);
    setConfirmDelete(false);
  }, [open, asset]);

  if (!asset) return null;

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith("image/")) setPreview(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const edits: Array<{ field: Parameters<typeof updateField.mutateAsync>[0]["field"]; value: string }> = [];

      if (file) {
        const up = await uploadSiteMediaFile(asset.media_key, file);
        edits.push({ field: "asset_url", value: up.url });
        edits.push({ field: "storage_backend", value: "supabase" });
        if (up.width != null) edits.push({ field: "width", value: String(up.width) });
        if (up.height != null) edits.push({ field: "height", value: String(up.height) });
        edits.push({ field: "bytes", value: String(up.bytes) });
      }
      if (altText.trim() !== (asset.alt_text ?? "")) edits.push({ field: "alt_text", value: altText.trim() });
      if (notes.trim() !== (asset.notes ?? "")) edits.push({ field: "notes", value: notes.trim() });
      if (needsReview !== asset.needs_review) edits.push({ field: "needs_review", value: String(needsReview) });

      if (edits.length === 0) {
        toast({ title: "Nothing changed" });
        setSaving(false);
        onOpenChange(false);
        return;
      }
      for (const e of edits) {
        await updateField.mutateAsync({ mediaKey: asset.media_key, field: e.field, value: e.value, actor });
      }
      toast({
        title: `Saved ${edits.length} change${edits.length > 1 ? "s" : ""} to ${asset.media_key}`,
        description: file ? "Uploaded to Supabase Storage. Run the theme sync to publish it live." : undefined,
      });
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteAsset.mutateAsync({ mediaKey: asset.media_key, actor, reason: "removed via Media CMS" });
      toast({ title: `Deleted ${asset.media_key}` });
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Delete failed", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {asset.media_key}</DialogTitle>
          <DialogDescription>
            Changes save here first. The live site picks them up at the next theme sync run.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline">{asset.page}</Badge>
            <Badge variant="outline">{asset.slot}</Badge>
            <Badge variant="outline">{asset.media_type}</Badge>
            <Badge variant="outline">{STORAGE_BACKEND_LABEL[asset.storage_backend] ?? asset.storage_backend}</Badge>
            {asset.needs_review && <Badge variant="outline" className="border-amber-500/40 text-amber-400">Needs review</Badge>}
          </div>

          <div>
            <Label>Asset</Label>
            <div className="mt-1 flex items-center gap-3">
              <div className="h-20 w-20 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                {asset.media_type === "image" && preview ? (
                  <img src={preview} alt={altText || asset.media_key} className="h-full w-full object-cover" />
                ) : (
                  <TypeIcon type={asset.media_type} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <Input type="file"
                  accept={asset.media_type === "image" ? "image/*" : asset.media_type === "video" ? "video/*" : "application/pdf"}
                  onChange={onPickFile} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Replace file — uploads to Supabase Storage, then Sync to Theme publishes it.
                </p>
                <a href={asset.asset_url} target="_blank" rel="noreferrer"
                  className="text-[11px] text-sky-400 hover:underline inline-flex items-center gap-1 mt-1">
                  Current file <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="altText">Alt text</Label>
            <Input id="altText" value={altText} onChange={(e) => setAltText(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label htmlFor="notes">Notes (provenance / status)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" />
          </div>

          {asset.source_path && (
            <div>
              <Label>Original archive source</Label>
              <p className="text-[11px] text-muted-foreground mt-1 break-all">{asset.source_path}</p>
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="needsReview">Needs review</Label>
              <p className="text-[11px] text-muted-foreground">Flag this asset for a manual check before it's considered final.</p>
            </div>
            <Switch id="needsReview" checked={needsReview} onCheckedChange={setNeedsReview} />
          </div>

          {asset.sync_targets?.length > 0 && (
            <div>
              <Label>Wired into the theme at</Label>
              <ul className="mt-1 space-y-0.5">
                {asset.sync_targets.map((t, i) => (
                  <li key={i} className="text-[11px] text-muted-foreground font-mono">
                    {t.template} → {t.section_id}{t.block_id ? `.${t.block_id}` : ""}.{t.setting_key}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {confirmDelete ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-destructive">Delete {asset.media_key}?</span>
              <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving}>Confirm delete</Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="text-destructive gap-1.5" onClick={() => setConfirmDelete(true)} disabled={saving}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
