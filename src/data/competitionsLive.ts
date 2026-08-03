// LIVE data layer — Competitions CMS (editable competition landing pages,
// one-way sync to the Shopify theme + real ticket checkout). CEO instruction
// (Marcello, 2026-07-29): stop being blocked on Arwa's race calendar — build
// the MACHINE that mounts a competition landing page automatically from
// editable fields (video, copy, images, ticket) + ticket checkout, same
// house pattern as the Catalogue/Media/Site Copy CMS modules.
//
//   cal_competitions        -> the registry itself (one row per competition
//                                landing page — migration 058 extends the
//                                calendar's existing table with landing
//                                fields: slug, status, hero video/image,
//                                copy blocks, gallery, ticket wiring)
//   cal_competitions_audit  -> field-level audit trail (who/when/field/old/new)
//
// WRITES go ONLY through the SECURITY DEFINER RPCs added by migration 058
// (competitions_update_field / competitions_create / competitions_delete) —
// direct table UPDATE/INSERT/DELETE is service_role-only (RLS), so every
// edit made from this panel is guaranteed to also write its audit row, in
// the same DB transaction. See migration 058_competitions_cms.sql.
//
// PUBLISH FLOW: edits here save to Supabase immediately. The live theme only
// changes when scripts/sync_competitions_to_theme.py --push runs (regenerates
// templates/page.competitions-calendar.json on the DRAFT theme, 199089815899
// — never the live theme). This mirrors the Catalogue/Media "Sync" step.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";

export type CompetitionStatus = "draft" | "published" | "past";

export interface Competition {
  id: string;
  slug: string;
  name: string;
  year: number;
  status: CompetitionStatus;
  date_start: string | null;
  date_end: string | null;
  dates_label: string | null;
  discipline: string | null;
  venue: string | null;
  gates: string | null;
  badge_label: string | null;
  hero_video_url: string | null;
  hero_image_url: string | null;
  copy_intro: string | null;
  copy_description: string | null;
  schedule_text: string | null;
  gallery_urls: string[];
  spectator_heading: string | null;
  spectator_tickets: string | null;
  spectator_note: string | null;
  entry_heading: string | null;
  competitor_entries: string | null;
  competitor_note: string | null;
  ticket_url: string | null;
  entry_url: string | null;
  ticket_product_handle: string | null;
  ticket_variant_id: string | null;
  entry_product_handle: string | null;
  entry_variant_id: string | null;
  is_placeholder: boolean;
  is_published: boolean;
  needs_review: boolean;
  notes: string | null;
  source_ref: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompetitionAuditRow {
  audit_id: number;
  slug: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by: string | null;
  change_reason: string | null;
}

export const EDITABLE_FIELDS = [
  "name", "status", "date_start", "date_end", "dates_label", "discipline", "venue", "gates",
  "badge_label", "hero_video_url", "hero_image_url", "copy_intro", "copy_description",
  "schedule_text", "gallery_urls", "spectator_heading", "spectator_tickets", "spectator_note",
  "entry_heading", "competitor_entries", "competitor_note", "ticket_url", "entry_url",
  "ticket_product_handle", "ticket_variant_id", "entry_product_handle", "entry_variant_id",
  "is_placeholder", "needs_review", "notes",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const STATUS_LABEL: Record<CompetitionStatus, string> = {
  draft: "Draft (not rendered)",
  published: "Published (live once synced)",
  past: "Past (example area only)",
};

const isMissingObjectError = (err: { code?: string; message?: string }): boolean => {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || msg.includes("does not exist") || msg.includes("schema cache");
};

// -------------------------------------------------------------- queries

export const useCompetitions = () =>
  useQuery({
    queryKey: ["cal_competitions"],
    queryFn: async (): Promise<Competition[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("cal_competitions")
        .select("*")
        .order("date_start", { ascending: true, nullsFirst: false });
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as Competition[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 30 * 1000,
  });

export const useCompetitionsAudit = (limit = 100) =>
  useQuery({
    queryKey: ["cal_competitions_audit", limit],
    queryFn: async (): Promise<CompetitionAuditRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("cal_competitions_audit")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(limit);
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as CompetitionAuditRow[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 15 * 1000,
  });

// -------------------------------------------------------------- mutations

interface UpdateFieldArgs {
  slug: string;
  field: EditableField;
  value: string;
  actor: string;
  reason?: string;
}

export const useUpdateCompetitionField = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, field, value, actor, reason }: UpdateFieldArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("competitions_update_field", {
        p_slug: slug,
        p_field_name: field,
        p_new_value: value,
        p_actor: actor,
        p_reason: reason ?? null,
      });
      if (error) throw toFriendlyError(error);
      return data as Competition;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal_competitions"] });
      qc.invalidateQueries({ queryKey: ["cal_competitions_audit"] });
    },
  });
};

interface CreateCompetitionArgs {
  slug: string;
  name: string;
  year: number;
  is_placeholder?: boolean;
  actor: string;
}

export const useCreateCompetition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateCompetitionArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("competitions_create", {
        p_slug: args.slug,
        p_name: args.name,
        p_year: args.year,
        p_is_placeholder: args.is_placeholder ?? false,
        p_actor: args.actor,
      });
      if (error) throw toFriendlyError(error);
      return data as Competition;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal_competitions"] });
      qc.invalidateQueries({ queryKey: ["cal_competitions_audit"] });
    },
  });
};

export const useDeleteCompetition = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, actor, reason }: { slug: string; actor: string; reason?: string }) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { error } = await supabase.rpc("competitions_delete", {
        p_slug: slug,
        p_actor: actor,
        p_reason: reason ?? null,
      });
      if (error) throw toFriendlyError(error);
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal_competitions"] });
      qc.invalidateQueries({ queryKey: ["cal_competitions_audit"] });
    },
  });
};

// --------------------------------------------------------- ticket helper

/** Same absolute-cart-URL convention as every other "buy" CTA on the site
 * (2026-07-25 buy-CTA fix pattern) — never a bare "#". Used by the edit
 * dialog to auto-compose ticket_url/entry_url from a variant id when the
 * staff member leaves the URL field blank. */
export const cartUrlFromVariant = (variantId: string): string =>
  `https://triosporting.com/cart/${variantId.trim()}:1`;
