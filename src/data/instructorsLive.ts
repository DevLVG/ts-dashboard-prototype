// LIVE data layer — Instructors CMS (editable coaching-team profiles, one-way
// sync to the Shopify draft theme's Horse School "Your instructors" section).
// CEO mandate (Marcello, via Luca, 2026-08-02): the site showed 4 unconfirmed,
// club-sourced instructor names (Ioana/Mansour/Karen/Mrs. Arwa) — pulled from
// the live section entirely pending official data from Marta. This panel is
// the "no developer needed" path for those real profiles to flow back onto
// the site once confirmed — same principle as the Site Copy / Media CMS.
//
//   cal_instructors        -> the coaching team + public profile fields
//                              (name, title, bio, photo_url, languages,
//                              specialties, email, phone, is_active,
//                              sort_order, needs_review) — migration 065
//   cal_instructors_audit  -> field-level audit trail (who/when/field/old/new)
//
// WRITES go ONLY through the instructor_update_field / instructor_create
// SECURITY DEFINER RPCs added by migration 065 — direct table UPDATE/INSERT
// is service_role-only (RLS), so every edit made from this panel is
// guaranteed to also write its audit row, in the same DB transaction.
//
// PUBLICATION GATE: a row only reaches the live site once BOTH is_active=true
// AND needs_review=false — see sync_instructors_to_theme.py. All 4 seeded
// rows start needs_review=true (unconfirmed), so today's sync computes an
// empty "profiles coming soon" section, matching what's actually live —
// nothing here can accidentally publish an unconfirmed name.
//
// SYNC ("Sync to site") talks to a small local HTTP wrapper
// (instructors_sync_api.py, cloned from copy_sync_api.py) around
// sync_instructors_to_theme.py — never to Shopify or the Supabase
// service-role key directly from the browser.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";

// -------------------------------------------------------------- instructor row

export interface InstructorRow {
  id: string;
  name: string;
  title: string | null;
  disciplines: string | null; // CSV, e.g. 'Group,Private,Educational'
  specialties: string | null; // CSV, e.g. 'Showjumping,Beginners'
  languages: string | null; // CSV, e.g. 'Arabic,English'
  bio: string | null; // NULL = "Profile coming soon" on the site, never invented
  photo_url: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  sort_order: number | null;
  needs_review: boolean;
  notes: string | null;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstructorAuditRow {
  audit_id: number;
  instructor_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by: string | null;
  change_reason: string | null;
}

export const EDITABLE_FIELDS = [
  "name", "title", "disciplines", "specialties", "languages", "bio",
  "photo_url", "email", "phone", "is_active", "sort_order", "notes", "needs_review",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

const isMissingObjectError = (err: { code?: string; message?: string }): boolean => {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || msg.includes("does not exist") || msg.includes("schema cache");
};

// -------------------------------------------------------------- queries

export const useInstructors = () =>
  useQuery({
    queryKey: ["cal_instructors"],
    queryFn: async (): Promise<InstructorRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("cal_instructors")
        .select("*")
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name", { ascending: true });
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as InstructorRow[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 30 * 1000,
  });

export const useInstructorsAudit = (limit = 100) =>
  useQuery({
    queryKey: ["cal_instructors_audit", limit],
    queryFn: async (): Promise<InstructorAuditRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("cal_instructors_audit")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(limit);
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as InstructorAuditRow[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 15 * 1000,
  });

// -------------------------------------------------------------- mutations

interface UpdateFieldArgs {
  instructorId: string;
  field: EditableField;
  value: string; // caller stringifies (booleans -> "true"/"false")
  actor: string;
  reason?: string;
}

export const useUpdateInstructorField = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ instructorId, field, value, actor, reason }: UpdateFieldArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("instructor_update_field", {
        p_instructor_id: instructorId,
        p_field_name: field,
        p_new_value: value,
        p_actor: actor,
        p_reason: reason ?? null,
      });
      if (error) throw toFriendlyError(error);
      return data as InstructorRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal_instructors"] });
      qc.invalidateQueries({ queryKey: ["cal_instructors_audit"] });
    },
  });
};

interface CreateInstructorArgs {
  name: string;
  disciplines?: string;
  title?: string;
  sort_order?: number;
  actor: string;
}

export const useCreateInstructor = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateInstructorArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("instructor_create", {
        p_name: args.name,
        p_disciplines: args.disciplines ?? null,
        p_title: args.title ?? null,
        p_sort_order: args.sort_order ?? null,
        p_actor: args.actor,
      });
      if (error) throw toFriendlyError(error);
      return data as InstructorRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal_instructors"] });
      qc.invalidateQueries({ queryKey: ["cal_instructors_audit"] });
    },
  });
};

// -------------------------------------------------------- photo upload

/** Uploads a File to Supabase Storage (bucket instructor-photos, public read
 * — provisioned by migration 065) and returns its public URL. Mirrors
 * uploadSiteMediaFile / uploadCatalogImage. Caller still needs to call
 * useUpdateInstructorField(photo_url) to write it (and get the audit row) —
 * this only handles the blob. */
export const uploadInstructorPhoto = async (instructorId: string, file: File): Promise<string> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${instructorId}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("instructor-photos")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (upErr) throw toFriendlyError(upErr);
  const { data } = supabase.storage.from("instructor-photos").getPublicUrl(path);
  return data.publicUrl;
};

// -------------------------------------------------------- theme sync

export interface InstructorsSyncDiffEntry {
  block_id: string;
  field: string;
  old?: unknown;
  new?: unknown;
}

export interface InstructorsSyncResult {
  returncode: number;
  stdout: string;
  stderr: string;
  diff_path: string | null;
  diff: {
    stamp: string;
    dry_run: boolean;
    changes: InstructorsSyncDiffEntry[];
    file_changed: boolean;
    published_count: number;
    skipped: { instructor_id: string; name: string; reason: string }[];
    errors: Record<string, unknown>[];
  } | null;
}

const SYNC_API_URL = (import.meta.env.VITE_INSTRUCTORS_SYNC_API_URL as string | undefined) || "http://localhost:9880";
const SYNC_API_TOKEN = (import.meta.env.VITE_INSTRUCTORS_SYNC_API_TOKEN as string | undefined) || "";

export const isInstructorsSyncApiConfigured = Boolean(SYNC_API_TOKEN);

export const useSyncInstructorsToTheme = () =>
  useMutation({
    mutationFn: async (args: { mode: "dry_run" | "execute" }): Promise<InstructorsSyncResult> => {
      const resp = await fetch(`${SYNC_API_URL}/instructors/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Instructors-Sync-Token": SYNC_API_TOKEN },
        body: JSON.stringify({ mode: args.mode }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(body.error || `Sync API returned HTTP ${resp.status}`);
      }
      return (await resp.json()) as InstructorsSyncResult;
    },
  });
