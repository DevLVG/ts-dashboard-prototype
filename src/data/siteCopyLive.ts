// LIVE data layer — Site Copy CMS (editable EN/AR website copy, one-way sync
// to the Shopify draft theme). Middleware is the single source of truth
// (CEO decision 2026-07-25: all Trio Sporting Website V1 copy lives in the
// CMS so future edits need no developer, and it must be ready for the
// Arabic version). Shopify only renders — no editing on Shopify.
//
//   site_copy         -> the copy master itself (1,040 strings extracted
//                          mechanically from the theme templates)
//   site_copy_audit   -> field-level audit trail (who/when/field/old/new)
//
// WRITES go ONLY through the site_copy_update_field SECURITY DEFINER RPC
// added by migration 056 — direct table UPDATE is service_role-only (RLS),
// so every edit made from this panel is guaranteed to also write its audit
// row, in the same DB transaction. See migration 056_site_copy_cms.sql.
//
// SYNC ("Sync to site") talks to a small local HTTP wrapper (copy_sync_api.py,
// cloned from the Catalogue's catalog_sync_api.py pattern) around
// sync_copy_to_theme.py — never to Shopify or to the Supabase service-role
// key directly from the browser.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";

// ------------------------------------------------------------- copy row

export interface SiteCopyRow {
  key: string;
  page_handle: string;
  section_id: string;
  section_type: string | null;
  setting_key: string;
  en: string | null;
  ar: string | null;
  status: "live" | "draft" | string;
  needs_review: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SiteCopyAuditRow {
  audit_id: number;
  key: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by: string | null;
  change_reason: string | null;
}

export const EDITABLE_FIELDS = ["en", "ar", "status", "needs_review", "notes"] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

const isMissingObjectError = (err: { code?: string; message?: string }): boolean => {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || msg.includes("does not exist") || msg.includes("schema cache");
};

// -------------------------------------------------------------- queries

// site_copy has 1,000+ rows — PostgREST caps a single response at 1000, so
// this paginates with .range() until a page comes back short.
export const useSiteCopy = () =>
  useQuery({
    queryKey: ["site_copy"],
    queryFn: async (): Promise<SiteCopyRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const pageSize = 1000;
      let from = 0;
      const all: SiteCopyRow[] = [];
      for (;;) {
        const { data, error } = await supabase
          .from("site_copy")
          .select("*")
          .order("page_handle", { ascending: true })
          .order("section_id", { ascending: true })
          .order("setting_key", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) {
          if (isMissingObjectError(error)) return [];
          throw toFriendlyError(error);
        }
        const rows = (data ?? []) as SiteCopyRow[];
        all.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      return all;
    },
    enabled: isSupabaseConfigured,
    staleTime: 30 * 1000,
  });

export const useSiteCopyAudit = (limit = 100) =>
  useQuery({
    queryKey: ["site_copy_audit", limit],
    queryFn: async (): Promise<SiteCopyAuditRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("site_copy_audit")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(limit);
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as SiteCopyAuditRow[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 15 * 1000,
  });

// -------------------------------------------------------------- mutations

interface UpdateFieldArgs {
  key: string;
  field: EditableField;
  value: string; // caller stringifies (booleans -> "true"/"false")
  actor: string;
  reason?: string;
}

export const useUpdateSiteCopyField = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, field, value, actor, reason }: UpdateFieldArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("site_copy_update_field", {
        p_key: key,
        p_field_name: field,
        p_new_value: value,
        p_actor: actor,
        p_reason: reason ?? null,
      });
      if (error) throw toFriendlyError(error);
      return data as SiteCopyRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site_copy"] });
      qc.invalidateQueries({ queryKey: ["site_copy_audit"] });
    },
  });
};

// -------------------------------------------------------- theme sync

export interface CopySyncDiffEntry {
  key: string;
  file: string;
  old?: unknown;
  new?: unknown;
}

export interface CopySyncResult {
  returncode: number;
  stdout: string;
  stderr: string;
  diff_path: string | null;
  diff: {
    stamp: string;
    dry_run: boolean;
    changes: CopySyncDiffEntry[];
    files_changed: string[];
    skipped: { key: string; reason: string }[];
    errors: Record<string, unknown>[];
  } | null;
}

const SYNC_API_URL = (import.meta.env.VITE_COPY_SYNC_API_URL as string | undefined) || "http://localhost:9879";
const SYNC_API_TOKEN = (import.meta.env.VITE_COPY_SYNC_API_TOKEN as string | undefined) || "";

export const isCopySyncApiConfigured = Boolean(SYNC_API_TOKEN);

export const useSyncCopyToTheme = () =>
  useMutation({
    mutationFn: async (args: { mode: "dry_run" | "execute"; only?: string }): Promise<CopySyncResult> => {
      const resp = await fetch(`${SYNC_API_URL}/copy/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Copy-Sync-Token": SYNC_API_TOKEN },
        body: JSON.stringify({ mode: args.mode, only: args.only }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error(body.error || `Sync API returned HTTP ${resp.status}`);
      }
      return (await resp.json()) as CopySyncResult;
    },
  });
