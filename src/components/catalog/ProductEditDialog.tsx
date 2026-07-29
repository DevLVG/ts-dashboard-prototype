// Product edit / create dialog — Catalogue CMS.
// Plain, robust, staff-usable: one form, one Save button, no jargon.
// Every field change on Save is written via catalog_update_field (or
// catalog_create_product for a new SKU) — the audit row is guaranteed by
// the DB function itself (migration 039), never assembled here.
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
import { Loader2, ImagePlus, Trash2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  type CatalogProduct, DERIVED_PRICE_SKUS,
  useUpdateCatalogField, useCreateCatalogProduct, useDeleteCatalogProduct, uploadCatalogImage,
} from "@/data/catalogLive";

const STATUS_OPTIONS = ["Active", "DoNotAdvertise", "Planned", "Reserved"] as const;
const BU_OPTIONS = ["HSE", "LIV", "MEM", "RET", "TEST"] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: CatalogProduct | null; // null = "new product" mode
  actor: string;
}

export const ProductEditDialog = ({ open, onOpenChange, product, actor }: Props) => {
  const isNew = product === null;
  const { toast } = useToast();
  const updateField = useUpdateCatalogField();
  const createProduct = useCreateCatalogProduct();
  const deleteProduct = useDeleteCatalogProduct();

  const [sku, setSku] = useState("");
  const [buCode, setBuCode] = useState<string>("HSE");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [price, setPrice] = useState("");
  const [priceNotes, setPriceNotes] = useState("");
  const [status, setStatus] = useState<string>("Active");
  const [membersOnly, setMembersOnly] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setSku(product.sku);
      setBuCode(product.bu_code);
      setName(product.service_name ?? "");
      setDescription(product.description ?? "");
      setCategory(product.category ?? "");
      setSubcategory(product.subcategory ?? "");
      setPrice(product.price_sar != null ? String(product.price_sar) : "");
      setPriceNotes(product.price_notes ?? "");
      setStatus(product.status);
      setMembersOnly(product.members_only);
      setImageUrl(product.image_url);
      setImagePreview(product.image_url);
    } else {
      setSku(""); setBuCode("HSE"); setName(""); setDescription("");
      setCategory(""); setSubcategory(""); setPrice(""); setPriceNotes("");
      setStatus("Active"); setMembersOnly(false); setImageUrl(null); setImagePreview(null);
    }
    setImageFile(null);
    setConfirmDelete(false);
  }, [open, product]);

  const isDerivedPrice = product ? Object.prototype.hasOwnProperty.call(DERIVED_PRICE_SKUS, product.sku) : false;

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ variant: "destructive", title: "Name is required" });
      return;
    }
    setSaving(true);
    try {
      let finalImageUrl = imageUrl;
      const targetSku = isNew ? sku.trim() : product!.sku;

      if (imageFile) {
        if (!targetSku) {
          toast({ variant: "destructive", title: "Enter a SKU before uploading an image" });
          setSaving(false);
          return;
        }
        finalImageUrl = await uploadCatalogImage(targetSku, imageFile);
      }

      if (isNew) {
        if (!sku.trim()) {
          toast({ variant: "destructive", title: "SKU is required" });
          setSaving(false);
          return;
        }
        await createProduct.mutateAsync({
          sku: sku.trim(),
          bu_code: buCode,
          service_name: name.trim(),
          description: description.trim(),
          price_sar: price.trim() === "" ? null : Number(price),
          category: category.trim() || undefined,
          subcategory: subcategory.trim() || undefined,
          status,
          members_only: membersOnly,
          actor,
        });
        if (finalImageUrl) {
          await updateField.mutateAsync({ sku: sku.trim(), field: "image_url", value: finalImageUrl, actor });
        }
        toast({ title: `Created ${sku.trim()}` });
      } else {
        const p = product!;
        const edits: Array<{ field: Parameters<typeof updateField.mutateAsync>[0]["field"]; value: string }> = [];
        if (name.trim() !== (p.service_name ?? "")) edits.push({ field: "service_name", value: name.trim() });
        if (description.trim() !== (p.description ?? "")) edits.push({ field: "description", value: description.trim() });
        if (category.trim() !== (p.category ?? "")) edits.push({ field: "category", value: category.trim() });
        if (subcategory.trim() !== (p.subcategory ?? "")) edits.push({ field: "subcategory", value: subcategory.trim() });
        if (!isDerivedPrice) {
          const newPriceStr = price.trim() === "" ? "" : String(Number(price));
          const oldPriceStr = p.price_sar != null ? String(p.price_sar) : "";
          if (newPriceStr !== oldPriceStr) edits.push({ field: "price_sar", value: newPriceStr });
        }
        if (priceNotes.trim() !== (p.price_notes ?? "")) edits.push({ field: "price_notes", value: priceNotes.trim() });
        if (status !== p.status) edits.push({ field: "status", value: status });
        if (membersOnly !== p.members_only) edits.push({ field: "members_only", value: String(membersOnly) });
        if (finalImageUrl && finalImageUrl !== (p.image_url ?? null)) edits.push({ field: "image_url", value: finalImageUrl });

        if (edits.length === 0) {
          toast({ title: "Nothing changed" });
          setSaving(false);
          onOpenChange(false);
          return;
        }
        for (const e of edits) {
          await updateField.mutateAsync({ sku: p.sku, field: e.field, value: e.value, actor });
        }
        toast({ title: `Saved ${edits.length} change${edits.length > 1 ? "s" : ""} to ${p.sku}` });
      }
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Save failed", description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!product) return;
    setSaving(true);
    try {
      await deleteProduct.mutateAsync({ sku: product.sku, actor, reason: "removed via Catalogue CMS" });
      toast({ title: `Deleted ${product.sku}` });
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
          <DialogTitle>{isNew ? "New product" : `Edit ${product?.sku}`}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "Create a new catalogue entry. It stays here until you Sync to Shopify."
              : "Changes save here first. Nothing reaches Shopify until you run Sync to Shopify."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isNew && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="sku">SKU</Label>
                <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())}
                  placeholder="e.g. RET-TCK-999" className="mt-1" />
              </div>
              <div>
                <Label htmlFor="bu">Business unit</Label>
                <Select value={buCode} onValueChange={setBuCode}>
                  <SelectTrigger id="bu" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BU_OPTIONS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="category">Category</Label>
              <Input id="category" value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="subcategory">Subcategory</Label>
              <Input id="subcategory" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="price">Price (SAR)</Label>
              <Input id="price" type="number" value={price} onChange={(e) => setPrice(e.target.value)}
                disabled={isDerivedPrice} className="mt-1" />
              {isDerivedPrice && (
                <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
                  Derived: {DERIVED_PRICE_SKUS[product!.sku]}. Edit the base lesson price instead.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="status" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="priceNotes">Price notes (optional)</Label>
            <Input id="priceNotes" value={priceNotes} onChange={(e) => setPriceNotes(e.target.value)} className="mt-1" />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="membersOnly">Members only</Label>
              <p className="text-[11px] text-muted-foreground">Membership-access rule — only members can see/book this.</p>
            </div>
            <Switch id="membersOnly" checked={membersOnly} onCheckedChange={setMembersOnly} />
          </div>

          <div>
            <Label>Image</Label>
            <div className="mt-1 flex items-center gap-3">
              <div className="h-20 w-20 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0">
                {imagePreview ? (
                  <img src={imagePreview} alt="Product preview" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <Input type="file" accept="image/*" onChange={onPickImage} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Uploaded to Supabase Storage. Synced to Shopify on the next Sync to Shopify run.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {!isNew && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-destructive">Delete {product?.sku}?</span>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving}>Confirm delete</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="text-destructive gap-1.5" onClick={() => setConfirmDelete(true)} disabled={saving}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isNew ? "Create" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
