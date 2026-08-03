// Competition edit / create dialog — Competitions CMS.
//
// [2026-08-03 rebuild — CEO live complaint: "Ticket tiers is one free-text
// field... this is really antique, build a proper modern form."] The
// structured fields below (ticket tiers, entry tiers, schedule, gallery)
// replace four "one per line: name | price | note" textareas with proper
// repeaters (TierRepeater / ScheduleRepeater / GalleryRepeater). The DB wire
// format and the live Shopify Liquid renderer are UNCHANGED — see
// ticketTierFormat.ts for the exact parse/serialize contract, verified
// byte-for-byte against the real "drift-2025-demo" row. Editing here still
// autosaves the same TEXT/JSONB columns via competitions_update_field
// (migration 058); this rebuild only replaces the editor, not the contract.
//
// Autosave + save-status chip mirrors the pattern squad fix-13 introduced
// on the Catalogue CMS (ProductEditDialog.tsx, in flight/uncommitted at the
// time this was written — see the SaveChip component below, and the
// shared-extraction TODO on it) for a consistent feel across every CMS
// module a non-technical staff member touches. New-competition mode stays a
// single explicit "Create" click (same rationale as Catalogue: one
// confirmation step makes sense before a row exists to autosave against).
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { CheckCircle2, Loader2, Trash2, Wand2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  type Competition, type CompetitionStatus, type EditableField, STATUS_LABEL,
  useUpdateCompetitionField, useCreateCompetition, useDeleteCompetition, cartUrlFromVariant,
} from "@/data/competitionsLive";
import { TierRepeater } from "./TierRepeater";
import { ScheduleRepeater } from "./ScheduleRepeater";
import { GalleryRepeater } from "./GalleryRepeater";
import { MediaLibraryPickerButton } from "./MediaLibraryPickerButton";
import {
  type TierRow, type ScheduleRow, type GalleryRow,
  parseTicketTiers, serializeTicketTiers, parseEntryTiers, serializeEntryTiers,
  parseSchedule, serializeSchedule, parseGallery, serializeGallery,
} from "./ticketTierFormat";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  competition: Competition | null; // null = "new competition" mode
  actor: string;
}

const AUTOSAVE_DEBOUNCE_MS = 700;

const emptyStrings = {
  name: "",
  dates_label: "", date_start: "", date_end: "", discipline: "", venue: "", gates: "", badge_label: "",
  hero_video_url: "", hero_image_url: "",
  copy_intro: "", copy_description: "",
  spectator_heading: "Spectator Tickets", spectator_note: "",
  ticket_url: "", ticket_product_handle: "", ticket_variant_id: "",
  entry_heading: "Competitor Entries", competitor_note: "",
  entry_url: "", entry_product_handle: "", entry_variant_id: "",
  notes: "",
};

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const SectionHeading = ({ children }: { children: React.ReactNode }) => (
  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pt-2 border-t first:border-t-0 first:pt-0">
    {children}
  </h4>
);

type SaveChipState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: Date }
  | { kind: "error"; message: string; retry: () => void };

export const CompetitionEditDialog = ({ open, onOpenChange, competition, actor }: Props) => {
  const isNew = competition === null;
  const { toast } = useToast();
  const updateField = useUpdateCompetitionField();
  const createCompetition = useCreateCompetition();
  const deleteCompetition = useDeleteCompetition();

  const [slug, setSlug] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [f, setF] = useState(emptyStrings);
  const [status, setStatus] = useState<CompetitionStatus>("draft");
  const [isDemo, setIsDemo] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [tierRows, setTierRows] = useState<TierRow[]>([]);
  const [entryRows, setEntryRows] = useState<TierRow[]>([]);
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>([]);
  const [galleryRows, setGalleryRows] = useState<GalleryRow[]>([]);

  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [chip, setChip] = useState<SaveChipState>({ kind: "idle" });

  // last DB-committed value per field, seeded from the loaded competition —
  // lets autosave diff against reality instead of re-sending unchanged
  // fields, and gives Retry something to resend.
  const committedRef = useRef<Partial<Record<EditableField, string>>>({});
  const timersRef = useRef<Partial<Record<EditableField, ReturnType<typeof setTimeout>>>>({});
  const pendingCountRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    if (competition) {
      setSlug(competition.slug);
      setYear(String(competition.year ?? new Date().getFullYear()));
      setStatus(competition.status);
      setIsDemo(competition.is_placeholder);
      setNeedsReview(competition.needs_review);
      const next = {
        name: competition.name ?? "",
        dates_label: competition.dates_label ?? "",
        date_start: competition.date_start ?? "",
        date_end: competition.date_end ?? "",
        discipline: competition.discipline ?? "",
        venue: competition.venue ?? "",
        gates: competition.gates ?? "",
        badge_label: competition.badge_label ?? "",
        hero_video_url: competition.hero_video_url ?? "",
        hero_image_url: competition.hero_image_url ?? "",
        copy_intro: competition.copy_intro ?? "",
        copy_description: competition.copy_description ?? "",
        spectator_heading: competition.spectator_heading ?? "Spectator Tickets",
        spectator_note: competition.spectator_note ?? "",
        ticket_url: competition.ticket_url ?? "",
        ticket_product_handle: competition.ticket_product_handle ?? "",
        ticket_variant_id: competition.ticket_variant_id ?? "",
        entry_heading: competition.entry_heading ?? "Competitor Entries",
        competitor_note: competition.competitor_note ?? "",
        entry_url: competition.entry_url ?? "",
        entry_product_handle: competition.entry_product_handle ?? "",
        entry_variant_id: competition.entry_variant_id ?? "",
        notes: competition.notes ?? "",
      };
      setF(next);
      const tiers = parseTicketTiers(competition.spectator_tickets ?? null);
      const entries = parseEntryTiers(competition.competitor_entries ?? null);
      const schedule = parseSchedule(competition.schedule_text ?? null);
      const gallery = parseGallery(competition.gallery_urls ?? []);
      setTierRows(tiers);
      setEntryRows(entries);
      setScheduleRows(schedule);
      setGalleryRows(gallery);

      // Seed committedRef with the RE-serialized form (not necessarily
      // byte-identical to the raw DB text — legacy rows can have loose
      // whitespace around "|" that the repeater normalizes away). Comparing
      // against the reserialized value, not the raw fetch, means opening a
      // competition never fires a spurious autosave just from that
      // normalization; only an actual edit does.
      committedRef.current = {
        name: next.name.trim(),
        dates_label: next.dates_label.trim(),
        date_start: next.date_start,
        date_end: next.date_end,
        discipline: next.discipline.trim(),
        venue: next.venue.trim(),
        gates: next.gates.trim(),
        badge_label: next.badge_label.trim(),
        hero_video_url: next.hero_video_url.trim(),
        hero_image_url: next.hero_image_url.trim(),
        copy_intro: next.copy_intro.trim(),
        copy_description: next.copy_description.trim(),
        schedule_text: serializeSchedule(schedule),
        gallery_urls: JSON.stringify(serializeGallery(gallery)),
        spectator_heading: next.spectator_heading.trim(),
        spectator_tickets: serializeTicketTiers(tiers),
        spectator_note: next.spectator_note.trim(),
        ticket_url: next.ticket_url.trim(),
        ticket_product_handle: next.ticket_product_handle.trim(),
        ticket_variant_id: next.ticket_variant_id.trim(),
        entry_heading: next.entry_heading.trim(),
        competitor_entries: serializeEntryTiers(entries),
        competitor_note: next.competitor_note.trim(),
        entry_url: next.entry_url.trim(),
        entry_product_handle: next.entry_product_handle.trim(),
        entry_variant_id: next.entry_variant_id.trim(),
        notes: next.notes.trim(),
        is_placeholder: String(competition.is_placeholder),
        needs_review: String(competition.needs_review),
        status: competition.status,
      };
    } else {
      setSlug("");
      setYear(String(new Date().getFullYear()));
      setF(emptyStrings);
      setStatus("draft");
      setIsDemo(false);
      setNeedsReview(true);
      setTierRows([]);
      setEntryRows([]);
      setScheduleRows([]);
      setGalleryRows([]);
      committedRef.current = {};
    }
    timersRef.current = {};
    pendingCountRef.current = 0;
    setChip({ kind: "idle" });
    setConfirmDelete(false);
  }, [open, competition]);

  // ---------------------------------------------------------- autosave core

  const commitField = async (field: EditableField, value: string): Promise<boolean> => {
    if (!competition) return true;
    if (committedRef.current[field] === value) return true;
    pendingCountRef.current += 1;
    setChip({ kind: "saving" });
    try {
      await updateField.mutateAsync({ slug: competition.slug, field, value, actor });
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
    if (!competition) return; // new-competition mode: nothing to autosave against yet
    if (timersRef.current[field]) clearTimeout(timersRef.current[field]);
    if (immediate) { void commitField(field, value); return; }
    timersRef.current[field] = setTimeout(() => void commitField(field, value), AUTOSAVE_DEBOUNCE_MS);
  };

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const onFieldChange = (k: keyof typeof f, v: string) => { set(k, v); scheduleAutosave(k as EditableField, v.trim()); };
  const onImmediateFieldChange = (k: keyof typeof f, v: string) => { set(k, v); scheduleAutosave(k as EditableField, v.trim(), true); };

  const [nameError, setNameError] = useState<string | null>(null);
  const onNameChange = (v: string) => {
    set("name", v);
    if (!competition) return; // new mode validates at Create click
    if (!v.trim()) { setNameError("Name is required"); return; }
    setNameError(null);
    scheduleAutosave("name", v.trim());
  };

  const flushAllPending = async (): Promise<boolean> => {
    Object.values(timersRef.current).forEach((t) => t && clearTimeout(t));
    timersRef.current = {};
    if (!competition) return true;
    const checks: Array<[EditableField, string]> = [
      ["name", f.name.trim()],
      ["dates_label", f.dates_label.trim()],
      ["date_start", f.date_start],
      ["date_end", f.date_end],
      ["discipline", f.discipline.trim()],
      ["venue", f.venue.trim()],
      ["gates", f.gates.trim()],
      ["badge_label", f.badge_label.trim()],
      ["hero_video_url", f.hero_video_url.trim()],
      ["hero_image_url", f.hero_image_url.trim()],
      ["copy_intro", f.copy_intro.trim()],
      ["copy_description", f.copy_description.trim()],
      ["schedule_text", serializeSchedule(scheduleRows)],
      ["gallery_urls", JSON.stringify(serializeGallery(galleryRows))],
      ["spectator_heading", f.spectator_heading.trim()],
      ["spectator_tickets", serializeTicketTiers(tierRows)],
      ["spectator_note", f.spectator_note.trim()],
      ["ticket_url", f.ticket_url.trim()],
      ["ticket_product_handle", f.ticket_product_handle.trim()],
      ["ticket_variant_id", f.ticket_variant_id.trim()],
      ["entry_heading", f.entry_heading.trim()],
      ["competitor_entries", serializeEntryTiers(entryRows)],
      ["competitor_note", f.competitor_note.trim()],
      ["entry_url", f.entry_url.trim()],
      ["entry_product_handle", f.entry_product_handle.trim()],
      ["entry_variant_id", f.entry_variant_id.trim()],
      ["notes", f.notes.trim()],
      ["is_placeholder", String(isDemo)],
      ["needs_review", String(needsReview)],
      ["status", status], // LAST — publishing only takes effect once every other field has saved
    ];
    let ok = true;
    for (const [field, value] of checks) {
      if (!(await commitField(field, value))) ok = false;
    }
    return ok;
  };

  // structured repeaters autosave as one serialized field, debounced same as
  // any scalar field — see the committedRef seeding above for why this never
  // double-fires on open.
  useEffect(() => {
    if (!open || !competition) return;
    scheduleAutosave("schedule_text", serializeSchedule(scheduleRows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleRows]);
  useEffect(() => {
    if (!open || !competition) return;
    scheduleAutosave("gallery_urls", JSON.stringify(serializeGallery(galleryRows)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryRows]);
  useEffect(() => {
    if (!open || !competition) return;
    scheduleAutosave("spectator_tickets", serializeTicketTiers(tierRows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierRows]);
  useEffect(() => {
    if (!open || !competition) return;
    scheduleAutosave("competitor_entries", serializeEntryTiers(entryRows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryRows]);

  const onStatusChange = async (v: CompetitionStatus) => {
    setStatus(v);
    if (!competition) return;
    await flushAllPending(); // content fields land before the publish flip
    scheduleAutosave("status", v, true);
  };

  const composeTicketUrl = () => {
    if (!f.ticket_variant_id.trim()) {
      toast({ variant: "destructive", title: "Enter a ticket variant id first" });
      return;
    }
    onImmediateFieldChange("ticket_url", cartUrlFromVariant(f.ticket_variant_id));
  };
  const composeEntryUrl = () => {
    if (!f.entry_variant_id.trim()) {
      toast({ variant: "destructive", title: "Enter an entry variant id first" });
      return;
    }
    onImmediateFieldChange("entry_url", cartUrlFromVariant(f.entry_variant_id));
  };

  const attemptClose = async () => {
    if (isNew) { onOpenChange(false); return; }
    const ok = await flushAllPending();
    if (!ok) return; // stay open — chip shows the error + Retry
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

  const handleCreate = async () => {
    if (!f.name.trim()) {
      toast({ variant: "destructive", title: "Name is required" });
      return;
    }
    const targetSlug = slugify(slug || f.name);
    if (!targetSlug) {
      toast({ variant: "destructive", title: "Slug is required" });
      return;
    }
    setCreating(true);
    try {
      await createCompetition.mutateAsync({
        slug: targetSlug, name: f.name.trim(), year: Number(year) || new Date().getFullYear(),
        is_placeholder: isDemo, actor,
      });
      const allContentFields: Array<[EditableField, string]> = [
        ["dates_label", f.dates_label.trim()],
        ["date_start", f.date_start],
        ["date_end", f.date_end],
        ["discipline", f.discipline.trim()],
        ["venue", f.venue.trim()],
        ["gates", f.gates.trim()],
        ["badge_label", f.badge_label.trim()],
        ["hero_video_url", f.hero_video_url.trim()],
        ["hero_image_url", f.hero_image_url.trim()],
        ["copy_intro", f.copy_intro.trim()],
        ["copy_description", f.copy_description.trim()],
        ["schedule_text", serializeSchedule(scheduleRows)],
        ["gallery_urls", JSON.stringify(serializeGallery(galleryRows))],
        ["spectator_heading", f.spectator_heading.trim()],
        ["spectator_tickets", serializeTicketTiers(tierRows)],
        ["spectator_note", f.spectator_note.trim()],
        ["ticket_url", f.ticket_url.trim()],
        ["ticket_product_handle", f.ticket_product_handle.trim()],
        ["ticket_variant_id", f.ticket_variant_id.trim()],
        ["entry_heading", f.entry_heading.trim()],
        ["competitor_entries", serializeEntryTiers(entryRows)],
        ["competitor_note", f.competitor_note.trim()],
        ["entry_url", f.entry_url.trim()],
        ["entry_product_handle", f.entry_product_handle.trim()],
        ["entry_variant_id", f.entry_variant_id.trim()],
        ["notes", f.notes.trim()],
      ];
      const contentFields = allContentFields.filter(([, value]) => value !== "");
      contentFields.push(["needs_review", String(needsReview)]);
      contentFields.push(["status", status]); // LAST — same publish-ordering rationale as edit mode
      for (const [field, value] of contentFields) {
        await updateField.mutateAsync({ slug: targetSlug, field, value, actor });
      }
      toast({ title: `Created ${targetSlug}` });
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Create failed", description: (err as Error).message });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!competition) return;
    setDeleting(true);
    try {
      await deleteCompetition.mutateAsync({ slug: competition.slug, actor, reason: "removed via Competitions CMS" });
      toast({ title: `Deleted ${competition.slug}` });
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Delete failed", description: (err as Error).message });
    } finally {
      setDeleting(false);
    }
  };

  const isBusy = chip.kind === "saving" || chip.kind === "error";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { void attemptClose(); } else { onOpenChange(o); } }}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => { if (!isNew && isBusy) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!isNew && isBusy) e.preventDefault(); }}
      >
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle>{isNew ? "New competition" : `Edit ${competition?.slug}`}</DialogTitle>
            <SaveChip chip={chip} />
          </div>
          <DialogDescription>
            {isNew
              ? "Fill the fields, then click Create. The landing page mounts automatically the next time the theme sync runs (sync_competitions_to_theme.py --push) — no code changes needed."
              : "Every change autosaves here — no button to press. The landing page picks it up the next time the theme sync runs."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <SectionHeading>Basics</SectionHeading>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="name">Competition name<span className="text-destructive"> *</span></Label>
              <Input id="name" value={f.name} onChange={(e) => onNameChange(e.target.value)}
                className={cn("mt-1", nameError && "border-destructive")} />
              {nameError && <p className="text-[11px] text-destructive mt-1">{nameError}</p>}
            </div>
            {isNew ? (
              <div>
                <Label htmlFor="slug">Slug (URL key)</Label>
                <Input id="slug" value={slug} onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder="auto from name if left blank" className="mt-1" />
              </div>
            ) : (
              <div>
                <Label>Slug</Label>
                <p className="mt-1 h-9 flex items-center text-sm font-mono text-muted-foreground">{competition?.slug}</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="year">Year</Label>
              <Input id="year" type="number" value={year} onChange={(e) => setYear(e.target.value)}
                disabled={!isNew} className="mt-1" />
              {!isNew && <p className="text-[11px] text-muted-foreground mt-1">Set once at creation.</p>}
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => void onStatusChange(v as CompetitionStatus)}>
                <SelectTrigger id="status" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as CompetitionStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end pb-1.5">
              <div className="flex items-center gap-2">
                <Switch id="isDemo" checked={isDemo}
                  onCheckedChange={(c) => { setIsDemo(c); scheduleAutosave("is_placeholder", String(c), true); }} />
                <Label htmlFor="isDemo" className="text-xs leading-tight">Demo / example only<br /><span className="text-muted-foreground font-normal">(not a live upcoming show)</span></Label>
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="badge">Badge label</Label>
            <Input id="badge" value={f.badge_label} onChange={(e) => onFieldChange("badge_label", e.target.value)}
              placeholder="e.g. Headline Show" className="mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="dateStart">Date start</Label>
              <Input id="dateStart" type="date" value={f.date_start}
                onChange={(e) => onImmediateFieldChange("date_start", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="dateEnd">Date end</Label>
              <Input id="dateEnd" type="date" value={f.date_end}
                onChange={(e) => onImmediateFieldChange("date_end", e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label htmlFor="datesLabel">Dates label (shown to visitors)</Label>
            <Input id="datesLabel" value={f.dates_label} onChange={(e) => onFieldChange("dates_label", e.target.value)}
              placeholder="e.g. 16 January – 1 February 2025" className="mt-1" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="venue">Venue</Label>
              <Input id="venue" value={f.venue} onChange={(e) => onFieldChange("venue", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="discipline">Discipline</Label>
              <Input id="discipline" value={f.discipline} onChange={(e) => onFieldChange("discipline", e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="gates">Gates</Label>
              <Input id="gates" value={f.gates} onChange={(e) => onFieldChange("gates", e.target.value)} className="mt-1" />
            </div>
          </div>

          <SectionHeading>Hero</SectionHeading>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="heroVideo">Hero video URL</Label>
              <MediaLibraryPickerButton mediaType="video" onSelect={(url) => onImmediateFieldChange("hero_video_url", url)} />
            </div>
            <Input id="heroVideo" value={f.hero_video_url} onChange={(e) => onFieldChange("hero_video_url", e.target.value)}
              placeholder="https://cdn.shopify.com/videos/…" className="mt-1" />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="heroImage">Hero image URL (poster / fallback)</Label>
              <MediaLibraryPickerButton mediaType="image" onSelect={(url) => onImmediateFieldChange("hero_image_url", url)} />
            </div>
            <Input id="heroImage" value={f.hero_image_url} onChange={(e) => onFieldChange("hero_image_url", e.target.value)} className="mt-1" />
            {f.hero_image_url && (
              <div className="mt-2 h-24 w-40 rounded-md border bg-muted/30 overflow-hidden">
                <img src={f.hero_image_url} alt="Hero preview" className="h-full w-full object-cover" />
              </div>
            )}
          </div>

          <SectionHeading>Copy</SectionHeading>
          <div>
            <Label htmlFor="copyIntro">Intro (short lead line)</Label>
            <Input id="copyIntro" value={f.copy_intro} onChange={(e) => onFieldChange("copy_intro", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="copyDesc">Description (long copy)</Label>
            <Textarea id="copyDesc" value={f.copy_description} onChange={(e) => onFieldChange("copy_description", e.target.value)} rows={4} className="mt-1" />
          </div>
          <div>
            <Label>Schedule</Label>
            <div className="mt-1"><ScheduleRepeater rows={scheduleRows} onChange={setScheduleRows} /></div>
          </div>
          <div>
            <Label>Gallery images</Label>
            <div className="mt-1"><GalleryRepeater rows={galleryRows} onChange={setGalleryRows} /></div>
          </div>

          <SectionHeading>Spectator tickets</SectionHeading>
          <div>
            <Label htmlFor="specHeading">Heading</Label>
            <Input id="specHeading" value={f.spectator_heading} onChange={(e) => onFieldChange("spectator_heading", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Ticket tiers</Label>
            <div className="mt-1">
              <TierRepeater rows={tierRows} onChange={setTierRows} showFeatured addLabel="Add ticket tier"
                emptyHint="No ticket tiers yet — visitors will only see the default Buy-tickets link below." />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label htmlFor="ticketVariant">Ticket variant id (real Shopify variant)</Label>
              <Input id="ticketVariant" value={f.ticket_variant_id} onChange={(e) => onFieldChange("ticket_variant_id", e.target.value)} className="mt-1" />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={composeTicketUrl} className="gap-1.5">
              <Wand2 className="h-3.5 w-3.5" /> Compose link
            </Button>
          </div>
          <div>
            <Label htmlFor="ticketUrl">Buy-tickets link (default, used when a tier has no URL of its own)</Label>
            <Input id="ticketUrl" value={f.ticket_url} onChange={(e) => onFieldChange("ticket_url", e.target.value)}
              placeholder="https://triosporting.com/cart/{variant_id}:1" className="mt-1 font-mono text-xs" />
          </div>
          <div>
            <Label htmlFor="ticketHandle">Ticket product handle (traceability, optional)</Label>
            <Input id="ticketHandle" value={f.ticket_product_handle} onChange={(e) => onFieldChange("ticket_product_handle", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="specNote">Spectator note</Label>
            <Textarea id="specNote" value={f.spectator_note} onChange={(e) => onFieldChange("spectator_note", e.target.value)} rows={2} className="mt-1" />
          </div>

          <SectionHeading>Competitor entries (optional — rider + horse events only)</SectionHeading>
          <div>
            <Label htmlFor="entryHeading">Heading</Label>
            <Input id="entryHeading" value={f.entry_heading} onChange={(e) => onFieldChange("entry_heading", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>Entry tiers</Label>
            <div className="mt-1">
              <TierRepeater rows={entryRows} onChange={setEntryRows} showFeatured={false} addLabel="Add entry tier"
                emptyHint="No entry tiers yet — competitor entries are hidden on the landing page until you add one." />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <Label htmlFor="entryVariant">Entry variant id (real Shopify variant)</Label>
              <Input id="entryVariant" value={f.entry_variant_id} onChange={(e) => onFieldChange("entry_variant_id", e.target.value)} className="mt-1" />
            </div>
            <Button type="button" variant="outline" size="sm" onClick={composeEntryUrl} className="gap-1.5">
              <Wand2 className="h-3.5 w-3.5" /> Compose link
            </Button>
          </div>
          <div>
            <Label htmlFor="entryUrl">Enter-class link (default)</Label>
            <Input id="entryUrl" value={f.entry_url} onChange={(e) => onFieldChange("entry_url", e.target.value)}
              placeholder="https://triosporting.com/cart/{variant_id}:1" className="mt-1 font-mono text-xs" />
          </div>
          <div>
            <Label htmlFor="entryHandle">Entry product handle (traceability, optional)</Label>
            <Input id="entryHandle" value={f.entry_product_handle} onChange={(e) => onFieldChange("entry_product_handle", e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="entryNote">Competitor note</Label>
            <Textarea id="entryNote" value={f.competitor_note} onChange={(e) => onFieldChange("competitor_note", e.target.value)} rows={2} className="mt-1" />
          </div>

          <SectionHeading>Internal</SectionHeading>
          <div>
            <Label htmlFor="notes">Notes (staff-only, never shown publicly)</Label>
            <Textarea id="notes" value={f.notes} onChange={(e) => onFieldChange("notes", e.target.value)} rows={2} className="mt-1" />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="needsReview">Needs review</Label>
              <p className="text-[11px] text-muted-foreground">Flag this competition for a manual check before it's considered final.</p>
            </div>
            <Switch id="needsReview" checked={needsReview}
              onCheckedChange={(c) => { setNeedsReview(c); scheduleAutosave("needs_review", String(c), true); }} />
          </div>
          {!isNew && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{competition?.status}</Badge>
              {competition?.is_placeholder && <Badge variant="outline" className="border-amber-500/40 text-amber-400">Demo / example</Badge>}
              {competition?.needs_review && <Badge variant="outline" className="border-amber-500/40 text-amber-400">Needs review</Badge>}
            </div>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          {!isNew && (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-destructive">Delete {competition?.slug}?</span>
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>Confirm delete</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="ghost" size="sm" className="text-destructive gap-1.5" onClick={() => setConfirmDelete(true)} disabled={deleting}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            )
          )}
          <div className="flex gap-2 ml-auto">
            {isNew ? (
              <>
                <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={creating}>Cancel</Button>
                <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
                  {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Create
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

// Mirrors fix-13's autosave-chip pattern (Catalogue/Media/Site Copy CMS) so
// every CMS module in the Cockpit gives staff the same "is this saved?"
// visual language. fix-13 has a shared src/components/chrome/SaveStatusChip.tsx
// with this exact look (state: idle/saving/saved/error) but it was still
// uncommitted, in-flight work at the time this was written — kept as a local
// copy rather than importing a moving target from a concurrent session.
// TODO once that component is committed: drop this local SaveChip and
// SaveChipState, and consume SaveStatusChip from chrome/ instead (same
// props shape — state/savedAt/errorMessage/onRetry — trivial swap).
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
