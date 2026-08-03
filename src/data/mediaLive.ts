// LIVE data layer — Media/Asset CMS (editable media registry, one-way sync
// to the Shopify theme's image-URL fallback settings). CEO decision
// 2026-07-25: graphic assets (site images, video, brochures) must be
// centrally managed like the rest of the site — same principle as the
// Catalogue CMS (catalogLive.ts) and Site Copy CMS.
//
//   site_media        -> the registry itself (one row per page/slot — the
//                          exact fallback slots m-hero / m-split-media /
//                          m-figures / m-ways / media-frame render)
//   site_media_audit   -> field-level audit trail (who/when/field/old/new)
//
// WRITES go ONLY through the SECURITY DEFINER RPCs added by migration 057
// (media_update_field / media_create_asset / media_delete_asset) — direct
// table UPDATE/INSERT/DELETE is service_role-only (RLS), so every edit made
// from this panel is guaranteed to also write its audit row, in the same DB
// transaction. See migration 057_site_media_cms.sql.
//
// STORAGE BACKEND: verified live 2026-07-25 — the Shopify custom-app token
// has write_files scope; fileCreate/fileDelete were tested end-to-end
// (see migration 057 header comment). Shopify Files/CDN is the CHOSEN
// backend for assets pushed forward from here. "Replace file" in this
// panel uploads to Supabase Storage (bucket site-media) first — same
// browser-safe staging step the Catalogue CMS already uses for
// uploadCatalogImage — because a raw multipart upload straight to Shopify
// would require exposing the Admin API token client-side. A separate
// script (shopify-theme/scripts/push_media_to_shopify_files.py) promotes a
// staged asset to Shopify Files/CDN on demand (storage_backend flips to
// 'shopify_files'). sync_media_to_theme.py then pushes whichever asset_url
// is currently canonical into the theme JSON — it doesn't care which
// backend produced it.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";

// ------------------------------------------------------------- media row

export interface SyncTarget {
  template: string;
  section_id: string;
  block_id: string | null;
  setting_key: string;
}

export interface SiteMediaAsset {
  media_key: string;
  page: string;
  slot: string;
  asset_url: string;
  storage_backend: "vercel_static" | "shopify_files" | "supabase" | string;
  alt_text: string | null;
  media_type: "image" | "video" | "pdf" | string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  source_path: string | null;
  needs_review: boolean;
  notes: string | null;
  sync_targets: SyncTarget[];
  created_at: string;
  updated_at: string;
}

export interface SiteMediaAuditRow {
  audit_id: number;
  media_key: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by: string | null;
  change_reason: string | null;
}

export const EDITABLE_FIELDS = [
  "asset_url", "storage_backend", "alt_text", "notes", "needs_review", "width", "height", "bytes",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const STORAGE_BACKEND_LABEL: Record<string, string> = {
  vercel_static: "Vercel (static, current live)",
  shopify_files: "Shopify Files / CDN",
  supabase: "Supabase Storage",
};

const isMissingObjectError = (err: { code?: string; message?: string }): boolean => {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || msg.includes("does not exist") || msg.includes("schema cache");
};

// -------------------------------------------------------------- queries

export const useSiteMedia = () =>
  useQuery({
    queryKey: ["site_media"],
    queryFn: async (): Promise<SiteMediaAsset[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("site_media")
        .select("*")
        .order("page", { ascending: true })
        .order("slot", { ascending: true });
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as SiteMediaAsset[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 30 * 1000,
  });

export const useMediaAudit = (limit = 100) =>
  useQuery({
    queryKey: ["site_media_audit", limit],
    queryFn: async (): Promise<SiteMediaAuditRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("site_media_audit")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(limit);
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as SiteMediaAuditRow[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 15 * 1000,
  });

// -------------------------------------------------------------- mutations

interface UpdateFieldArgs {
  mediaKey: string;
  field: EditableField;
  value: string;
  actor: string;
  reason?: string;
}

export const useUpdateMediaField = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mediaKey, field, value, actor, reason }: UpdateFieldArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("media_update_field", {
        p_media_key: mediaKey,
        p_field_name: field,
        p_new_value: value,
        p_actor: actor,
        p_reason: reason ?? null,
      });
      if (error) throw toFriendlyError(error);
      return data as SiteMediaAsset;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["site_media"] });
      qc.invalidateQueries({ queryKey: ["site_media_audit"] });
      // CEO live-review 2026-08-03 (Marcello approved): every saved change
      // now auto-triggers the theme sync too — see scheduleMediaAutoSync.
      scheduleMediaAutoSync(qc, data.media_key, data.page);
    },
  });
};

interface CreateAssetArgs {
  page: string;
  slot: string;
  asset_url: string;
  media_type: string;
  storage_backend?: string;
  alt_text?: string;
  notes?: string;
  actor: string;
}

export const useCreateMediaAsset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateAssetArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("media_create_asset", {
        p_page: args.page,
        p_slot: args.slot,
        p_asset_url: args.asset_url,
        p_media_type: args.media_type,
        p_storage_backend: args.storage_backend ?? "supabase",
        p_alt_text: args.alt_text ?? null,
        p_notes: args.notes ?? null,
        p_actor: args.actor,
      });
      if (error) throw toFriendlyError(error);
      return data as SiteMediaAsset;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site_media"] });
      qc.invalidateQueries({ queryKey: ["site_media_audit"] });
    },
  });
};

export const useDeleteMediaAsset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mediaKey, actor, reason }: { mediaKey: string; actor: string; reason?: string }) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { error } = await supabase.rpc("media_delete_asset", {
        p_media_key: mediaKey,
        p_actor: actor,
        p_reason: reason ?? null,
      });
      if (error) throw toFriendlyError(error);
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["site_media"] });
      qc.invalidateQueries({ queryKey: ["site_media_audit"] });
    },
  });
};

// -------------------------------------------------------- image upload

/** Uploads a File to Supabase Storage (bucket site-media) and returns its
 * public URL, plus the file's natural width/height (images only) and byte
 * size — mirrors uploadCatalogImage. Caller still needs to call
 * useUpdateMediaField to write asset_url/storage_backend (and get the
 * audit row) — this only handles the blob. */
export const uploadSiteMediaFile = async (
  mediaKey: string,
  file: File
): Promise<{ url: string; width: number | null; height: number | null; bytes: number }> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const ext = file.name.split(".").pop() || "bin";
  const path = `${mediaKey}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("site-media")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (upErr) throw toFriendlyError(upErr);
  const { data } = supabase.storage.from("site-media").getPublicUrl(path);

  let width: number | null = null;
  let height: number | null = null;
  if (file.type.startsWith("image/")) {
    try {
      const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
      width = dims.w;
      height = dims.h;
    } catch {
      // dimension probe is best-effort only
    }
  }

  return { url: data.publicUrl, width, height, bytes: file.size };
};

// ------------------------------------------------- automatic theme sync
// CEO live-review 2026-08-03 ("Marcello approved"): every saved Media
// Library change now auto-triggers the SAME theme sync the (removed)
// manual button would have called — see media_sync_api.py (new file, built
// to the exact catalog_sync_api.py / copy_sync_api.py pattern; there was no
// existing HTTP wrapper for sync_media_to_theme.py yet). Always targets the
// Shopify DRAFT theme — sync_media_to_theme.py hardcodes PREVIEW_THEME_ID,
// no live-theme code path exists, so there is no price-approval-style gate
// needed here.

export type MediaSyncState = "syncing" | "synced" | "error";

export interface MediaSyncStatus {
  state: MediaSyncState;
  at?: string;
  error?: string;
}

const MEDIA_SYNC_API_URL = (import.meta.env.VITE_MEDIA_SYNC_API_URL as string | undefined) || "http://localhost:9881";
const MEDIA_SYNC_API_TOKEN = (import.meta.env.VITE_MEDIA_SYNC_API_TOKEN as string | undefined) || "";

export const isMediaSyncApiConfigured = Boolean(MEDIA_SYNC_API_TOKEN);

export interface MediaSyncResult {
  returncode: number;
  stdout: string;
  stderr: string;
  summary: { templates_considered: number; changes: number; errors: number; mode: string } | null;
}

async function runMediaSync(args: { mode: "dry_run" | "execute"; only?: string; key?: string }): Promise<MediaSyncResult> {
  const resp = await fetch(`${MEDIA_SYNC_API_URL}/media/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Media-Sync-Token": MEDIA_SYNC_API_TOKEN },
    body: JSON.stringify({ mode: args.mode, only: args.only, key: args.key }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(body.error || `Sync API returned HTTP ${resp.status}`);
  }
  return (await resp.json()) as MediaSyncResult;
}

const MEDIA_SYNC_STATUS_QUERY_KEY = ["media_sync_status"] as const;
const MEDIA_SYNC_STATUS_LS_KEY = "trio_media_sync_status_v1";

function loadMediaSyncStatus(): Record<string, MediaSyncStatus> {
  try {
    const raw = localStorage.getItem(MEDIA_SYNC_STATUS_LS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MediaSyncStatus>) : {};
  } catch {
    return {};
  }
}

function persistMediaSyncStatus(map: Record<string, MediaSyncStatus>) {
  try { localStorage.setItem(MEDIA_SYNC_STATUS_LS_KEY, JSON.stringify(map)); } catch { /* best-effort only */ }
}

/** Reactive map of media_key -> last known sync status. Client-side only,
 * same documented caveat as the Catalogue's sync status (fast-follow: a real
 * DB column would survive across browsers/devices). */
export const useMediaSyncStatusMap = () =>
  useQuery({
    queryKey: MEDIA_SYNC_STATUS_QUERY_KEY,
    queryFn: () => loadMediaSyncStatus(),
    staleTime: Infinity,
    gcTime: Infinity,
  });

export const useMediaSyncStatus = (mediaKey: string): MediaSyncStatus | undefined => {
  const { data } = useMediaSyncStatusMap();
  return data?.[mediaKey];
};

function patchMediaSyncStatus(qc: ReturnType<typeof useQueryClient>, patch: Record<string, MediaSyncStatus>) {
  const next = { ...(qc.getQueryData<Record<string, MediaSyncStatus>>(MEDIA_SYNC_STATUS_QUERY_KEY) ?? loadMediaSyncStatus()), ...patch };
  qc.setQueryData(MEDIA_SYNC_STATUS_QUERY_KEY, next);
  persistMediaSyncStatus(next);
}

const MEDIA_AUTO_SYNC_DEBOUNCE_MS = 4000;
let mediaPending = new Map<string, string>(); // media_key -> page
let mediaDebounceHandle: ReturnType<typeof setTimeout> | null = null;

async function flushMediaAutoSync(qc: ReturnType<typeof useQueryClient>, only?: string[]) {
  const entries = only
    ? Array.from(mediaPending.entries()).filter(([k]) => only.includes(k))
    : Array.from(mediaPending.entries());
  for (const [k] of entries) mediaPending.delete(k);
  if (entries.length === 0) return;

  if (!isMediaSyncApiConfigured) {
    const patch: Record<string, MediaSyncStatus> = {};
    for (const [k] of entries) patch[k] = { state: "error", error: "Sync API not configured in this environment" };
    patchMediaSyncStatus(qc, patch);
    return;
  }

  // sync_media_to_theme.py supports --key for exactly one media_key — the
  // smallest possible blast radius, so each changed item gets its own call
  // (sequential, never parallel, same discipline as the Catalogue).
  for (const [mediaKey] of entries) {
    patchMediaSyncStatus(qc, { [mediaKey]: { state: "syncing" } });
    try {
      const result = await runMediaSync({ mode: "execute", key: mediaKey });
      const at = new Date().toISOString();
      if (result.returncode !== 0 || (result.summary?.errors ?? 0) > 0) {
        patchMediaSyncStatus(qc, { [mediaKey]: { state: "error", error: "Theme sync finished with errors — see History" } });
      } else {
        patchMediaSyncStatus(qc, { [mediaKey]: { state: "synced", at } });
      }
    } catch (err) {
      patchMediaSyncStatus(qc, { [mediaKey]: { state: "error", error: (err as Error).message } });
    }
  }
}

/** Called after every successful save (edit, replace file). Marks the asset
 * "Syncing…" immediately and debounces the actual push a few seconds so
 * rapid edits to the same asset batch into one sync run. */
export function scheduleMediaAutoSync(qc: ReturnType<typeof useQueryClient>, mediaKey: string, page: string) {
  mediaPending.set(mediaKey, page);
  patchMediaSyncStatus(qc, { [mediaKey]: { state: "syncing" } });
  if (mediaDebounceHandle) clearTimeout(mediaDebounceHandle);
  mediaDebounceHandle = setTimeout(() => {
    mediaDebounceHandle = null;
    void flushMediaAutoSync(qc);
  }, MEDIA_AUTO_SYNC_DEBOUNCE_MS);
}

/** "Retry" — the one manual control left. Skips the debounce. */
export function retryMediaSync(qc: ReturnType<typeof useQueryClient>, mediaKey: string, page: string) {
  mediaPending.set(mediaKey, page);
  patchMediaSyncStatus(qc, { [mediaKey]: { state: "syncing" } });
  void flushMediaAutoSync(qc, [mediaKey]);
}
