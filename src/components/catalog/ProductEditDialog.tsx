// Product edit / create dialog — Catalogue CMS.
// Plain, robust, staff-usable: one form, autosave, no jargon.
//
// CEO live-review 2026-08-03 ("saving must be unambiguous"): every field
// change on an existing product now autosaves (debounced) via
// catalog_update_field — the audit row is guaranteed by the DB function
// itself (migration 039), never assembled here. A new product is still
// created by one explicit "Create product" click (the one confirmation
// step that makes sense before a row exists to autosave against); the form
// itself is autosaved as a local draft from the first keystroke so an
// accidental close never loses it. No silent saves, no silent losses.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Loader2, ImagePlus, Trash2, AlertTriangle, CheckCircle2, XCircle, FileClock, Maximize2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabaseImageThumb } from "@/lib/imageThumb";
import {
  type CatalogProduct, type EditableField, DERIVED_PRICE_SKUS,
  useUpdateCatalogField, useCreateCatalogProduct, useDeleteCatalogProduct, uploadCatalogImage,
} from "@/data/catalogLive";

const STATUS_OPTIONS = ["Active", "DoNotAdvertise", "Planned", "Reserved"] as const;
const BU_OPTIONS = ["HSE", "LIV", "MEM", "RET", "TEST"] as const;
const AUTOSAVE_DEBOUNCE_MS = 700;
const DRAFT_DEBOUNCE_MS = 500;
const NEW_PRODUCT_DRAFT_KEY = "trio_catalog_new_product_draft_v1";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: CatalogProduct | null; // null = "new product" mode
  actor: string;
}

type SaveChipState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string; retry: () => void }
  | { kind: "draft"; at: Date };

interface DraftShape {
  sku: string; buCode: string; name: string; description: string; category: string;
  subcategory: string; price: string; priceNotes: string; status: string; membersOnly: boolean;
}

const loadDraft = (): DraftShape | null => {
  try {
    const raw = localStorage.getItem(NEW_PRODUCT_DRAFT_KEY);
    return raw ? (JSON.parse(raw) as DraftShape) : null;
  } catch {
    return null;
  }
};
const saveDraft = (d: DraftShape) => {
  try { localStorage.setItem(NEW_PRODUCT_DRAFT_KEY, JSON.stringify(d)); } catch { /* best-effort */ }
};
const clearDraft = () => {
  try { localStorage.removeItem(NEW_PRODUCT_DRAFT_KEY); } catch { /* best-effort */ }
};
const isDraftEmpty = (d: DraftShape) =>
  !d.sku.trim() && !d.name.trim() && !d.description.trim() && !d.category.trim() &&
  !d.subcategory.trim() && !d.price.trim() && !d.priceNotes.trim();

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
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [chip, setChip] = useState<SaveChipState>({ kind: "idle" });
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  // last DB-committed value per field, seeded from the loaded product —
  // lets autosave diff against reality instead of re-sending unchanged
  // fields, and gives Retry something to resend.
  const committedRef = useRef<Partial<Record<EditableField, string>>>({});
  const timersRef = useRef<Partial<Record<EditableField, ReturnType<typeof setTimeout>>>>({});
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCountRef = useRef(0);

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
      committedRef.current = {
        service_name: product.service_name ?? "",
        description: product.description ?? "",
        category: product.category ?? "",
        subcategory: product.subcategory ?? "",
        price_sar: product.price_sar != null ? String(product.price_sar) : "",
        price_notes: product.price_notes ?? "",
        status: product.status,
        members_only: String(product.members_only),
        image_url: product.image_url ?? "",
      };
      setChip({ kind: "idle" });
    } else {
      const draft = loadDraft();
      if (draft) {
        setSku(draft.sku); setBuCode(draft.buCode); setName(draft.name); setDescription(draft.description);
        setCategory(draft.category); setSubcategory(draft.subcategory); setPrice(draft.price);
        setPriceNotes(draft.priceNotes); setStatus(draft.status); setMembersOnly(draft.membersOnly);
        setHasRestoredDraft(!isDraftEmpty(draft));
        setChip(!isDraftEmpty(draft) ? { kind: "draft", at: new Date() } : { kind: "idle" });
      } else {
        setSku(""); setBuCode("HSE"); setName(""); setDescription("");
        setCategory(""); setSubcategory(""); setPrice(""); setPriceNotes("");
        setStatus("Active"); setMembersOnly(false);
        setHasRestoredDraft(false);
        setChip({ kind: "idle" });
      }
      setImageUrl(null); setImagePreview(null);
    }
    setImageFile(null);
    setConfirmDelete(false);
    setNameError(null);
    pendingCountRef.current = 0;
  }, [open, product]);

  // ---------------------------------------------------------- new-product draft autosave
  useEffect(() => {
    if (!isNew || !open) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      const d: DraftShape = { sku, buCode, name, description, category, subcategory, price, priceNotes, status, membersOnly };
      if (isDraftEmpty(d)) { clearDraft(); return; }
      saveDraft(d);
      setChip({ kind: "draft", at: new Date() });
    }, DRAFT_DEBOUNCE_MS);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, open, sku, buCode, name, description, category, subcategory, price, priceNotes, status, membersOnly]);

  // ---------------------------------------------------------- edit-mode autosave
  const isDerivedPrice = product ? Object.prototype.hasOwnProperty.call(DERIVED_PRICE_SKUS, product.sku) : false;

  const commitField = async (field: EditableField, value: string): Promise<boolean> => {
    if (!product) return true;
    if (committedRef.current[field] === value) return true;
    pendingCountRef.current += 1;
    setChip({ kind: "saving" });
    try {
      await updateField.mutateAsync({ sku: product.sku, field, value, actor });
      committedRef.current[field] = value;
      pendingCountRef.current -= 1;
      if (pendingCountRef.current <= 0) { pendingCountRef.current = 0; setChip({ kind: "saved", at: new Date() }); }
      return true;
    } catch (err) {
      pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
      setChip({ kind: "error", message: (err as Error).message, retry: () => { void commitField(field, value); } });
      return false;
    }
  };

  const scheduleAutosave = (field: EditableField, value: string, immediate = false) => {
    if (!product) return; // new-product mode: handled by the draft effect above
    if (timersRef.current[field]) clearTimeout(timersRef.current[field]);
    if (immediate) { void commitField(field, value); return; }
    timersRef.current[field] = setTimeout(() => void commitField(field, value), AUTOSAVE_DEBOUNCE_MS);
  };

  const flushAllPending = async () => {
    Object.values(timersRef.current).forEach((t) => t && clearTimeout(t));
    timersRef.current = {};
    if (!product) return true;
    const checks: Array<[EditableField, string]> = [
      ["service_name", name.trim()],
      ["description", description.trim()],
      ["category", category.trim()],
      ["subcategory", subcategory.trim()],
      ["price_notes", priceNotes.trim()],
      ["status", status],
      ["members_only", String(membersOnly)],
    ];
    if (!isDerivedPrice) checks.push(["price_sar", price.trim()]);
    let ok = true;
    for (const [field, value] of checks) {
      if (committedRef.current[field] !== value && !(field === "service_name" && !value)) {
        const success = await commitField(field, value);
        if (!success) ok = false;
      }
    }
    return ok;
  };

  const onNameChange = (v: string) => {
    setName(v);
    if (!product) return;
    if (!v.trim()) { setNameError("Name is required"); return; }
    setNameError(null);
    scheduleAutosave("service_name", v.trim());
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImageFile(f);
    const preview = URL.createObjectURL(f);
    setImagePreview(preview);
    if (product) {
      (async () => {
        setChip({ kind: "saving" });
        try {
          const url = await uploadCatalogImage(product.sku, f);
          setImageUrl(url);
          await commitField("image_url", url);
        } catch (err) {
          setChip({ kind: "error", message: (err as Error).message, retry: () => onPickImage(e) });
        }
      })();
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) { setNameError("Name is required"); toast({ variant: "destructive", title: "Name is required" }); return; }
    if (!sku.trim()) { toast({ variant: "destructive", title: "SKU is required" }); return; }
    setCreating(true);
    try {
      let finalImageUrl: string | null = null;
      if (imageFile) finalImageUrl = await uploadCatalogImage(sku.trim(), imageFile);

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
      clearDraft();
      toast({ title: `Created ${sku.trim()}`, description: "Now syncing to Shopify automatically." });
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Create failed", description: (err as Error).message });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!product) return;
    setCreating(true);
    try {
      await deleteProduct.mutateAsync({ sku: product.sku, actor, reason: "removed via Catalogue CMS" });
      toast({ title: `Deleted ${product.sku}` });
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Delete failed", description: (err as Error).message });
    } finally {
      setCreating(false);
    }
  };

  const attemptClose = async () => {
    if (isNew) { onOpenChange(false); return; } // draft already autosaved locally, nothing to lose
    const ok = await flushAllPending();
    if (!ok) return; // stay open — chip shows the error + Retry, see below
    onOpenChange(false);
  };

  // Browser-level guard: don't let a tab close / reload eat an in-flight or
  // failed autosave silently.
  useEffect(() => {
    if (!open) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (chip.kind === "saving" || chip.kind === "error") {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [open, chip.kind]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { void attemptClose(); } else { onOpenChange(o); } }}>
      <DialogContent
        className="max-w-xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => { if (!isNew && (chip.kind === "saving" || chip.kind === "error")) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!isNew && (chip.kind === "saving" || chip.kind === "error")) e.preventDefault(); }}
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle>{isNew ? "New product" : `Edit ${product?.sku}`}</DialogTitle>
            <SaveChip chip={chip} />
          </div>
          <DialogDescription>
            {isNew
              ? "Fields autosave here as a local draft while you type. Click Create product to add it to the catalogue and start syncing it to Shopify."
              : "Every change autosaves here, then syncs to Shopify automatically within a few seconds — no button to press."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isNew && (
            <>
              {hasRestoredDraft && (
                <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-xs flex items-center gap-2">
                  <FileClock className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                  Resumed your unsaved draft from last time.
                </div>
              )}
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
            </>
          )}

          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => onNameChange(e.target.value)} className="mt-1" />
            {nameError && <p className="text-[11px] text-destructive mt-1">{nameError}</p>}
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={description}
              onChange={(e) => { setDescription(e.target.value); scheduleAutosave("description", e.target.value.trim()); }}
              rows={3} className="mt-1" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="category">Category</Label>
              <Input id="category" value={category}
                onChange={(e) => { setCategory(e.target.value); scheduleAutosave("category", e.target.value.trim()); }}
                className="mt-1" />
            </div>
            <div>
              <Label htmlFor="subcategory">Subcategory</Label>
              <Input id="subcategory" value={subcategory}
                onChange={(e) => { setSubcategory(e.target.value); scheduleAutosave("subcategory", e.target.value.trim()); }}
                className="mt-1" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="price">Price (SAR)</Label>
              <Input id="price" type="number" value={price}
                onChange={(e) => { setPrice(e.target.value); scheduleAutosave("price_sar", e.target.value.trim()); }}
                disabled={isDerivedPrice} className="mt-1" />
              {isDerivedPrice && (
                <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
                  Derived: {DERIVED_PRICE_SKUS[product!.sku]}. Edit the base lesson price instead.
                </p>
              )}
              {!isDerivedPrice && !isNew && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Price changes still need CEO approval before they reach Shopify — see the price-approval banner above the table.
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => { setStatus(v); scheduleAutosave("status", v, true); }}>
                <SelectTrigger id="status" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="priceNotes">Price notes (optional)</Label>
            <Input id="priceNotes" value={priceNotes}
              onChange={(e) => { setPriceNotes(e.target.value); scheduleAutosave("price_notes", e.target.value.trim()); }}
              className="mt-1" />
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="membersOnly">Members only</Label>
              <p className="text-[11px] text-muted-foreground">Membership-access rule — only members can see/book this.</p>
            </div>
            <Switch id="membersOnly" checked={membersOnly}
              onCheckedChange={(c) => { setMembersOnly(c); scheduleAutosave("members_only", String(c), true); }} />
          </div>

          <div>
            <Label>Image</Label>
            <div className="mt-1 flex items-center gap-3">
              <div className="relative h-20 w-20 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0 group">
                {imagePreview ? (
                  <>
                    <img
                      src={supabaseImageThumb(imagePreview, { width: 200 }) ?? imagePreview}
                      alt="Product preview"
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                    {/* Grid/preview always shows a resized copy (see imageThumb.ts —
                        the original AI-bridge PNGs run up to ~3.4MB); this is the one
                        deliberate way to reach the untouched full-resolution original. */}
                    <a
                      href={imagePreview}
                      target="_blank"
                      rel="noreferrer"
                      title="View full-resolution image"
                      className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Maximize2 className="h-4 w-4 text-white" />
                    </a>
                  </>
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1">
                <Input type="file" accept="image/*" onChange={onPickImage} disabled={isNew && !sku.trim()} />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {isNew
                    ? sku.trim()
                      ? "Uploads once you click Create product."
                      : "Enter a SKU first."
                    : "Uploaded to Supabase Storage, then synced to Shopify automatically."}
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
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={creating}>Confirm delete</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="text-destructive gap-1.5" onClick={() => setConfirmDelete(true)} disabled={creating}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )
          )}
          <div className="flex gap-2 ml-auto">
            {isNew ? (
              <>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>Close (draft kept)</Button>
                <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
                  {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create product
                </Button>
              </>
            ) : (
              <Button onClick={() => void attemptClose()} disabled={chip.kind === "saving"} className="gap-1.5">
                {chip.kind === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Done
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SaveChip = ({ chip }: { chip: SaveChipState }) => {
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  switch (chip.kind) {
    case "saving":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
        </span>
      );
    case "saved":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-500 shrink-0">
          <CheckCircle2 className="h-3.5 w-3.5" /> Saved ✓ {fmt(chip.at)}
        </span>
      );
    case "draft":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs text-sky-400 shrink-0">
          <FileClock className="h-3.5 w-3.5" /> Draft saved {fmt(chip.at)}
        </span>
      );
    case "error":
      return (
        <button
          type="button"
          onClick={chip.retry}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs text-destructive shrink-0 underline decoration-dotted",
            "hover:text-destructive/80",
          )}
          title={chip.message}
        >
          <XCircle className="h-3.5 w-3.5" /> Error — retry
        </button>
      );
    default:
      return null;
  }
};
