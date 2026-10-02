// LIVE data layer — Catalogue CMS (editable product catalogue, one-way sync
// to Shopify). Middleware is the single source of truth (CEO decision,
// V1_Integrated_Plan_2026-07-24.md "Catalogo = CMS"); Shopify only displays
// and sells — no editing on Shopify.
//
//   pricing_master_snap        -> the catalogue itself (also what
//                                  sync_catalog_to_shopify.py reads from)
//   pricing_master_snap_audit  -> field-level audit trail (who/when/field/old/new)
//
// WRITES go ONLY through the three SECURITY DEFINER RPCs added by migration
// 039 (catalog_update_field / catalog_create_product / catalog_delete_product)
// — direct table UPDATE/INSERT/DELETE is service_role-only (RLS), so every
// edit made from this panel is guaranteed to also write its audit row, in
// the same DB transaction. See migration 039_catalog_cms.sql.
//
// SYNC ("Sync to Shopify") talks to a small local HTTP wrapper
// (CMS/scripts/catalog_sync_api.py) around the existing
// sync_catalog_to_shopify.py — never to Shopify or to the Supabase
// service-role key directly from the browser.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";

// ------------------------------------------------------------- product row

export interface CatalogProduct {
  sku: string;
  bu_code: string;
  category: string | null;
  subcategory: string | null;
  service_name: string | null;
  product_type: string | null;
  parent_sku: string | null;
  price_definition: string | null;
  price_sar: number | null;
  price_sar_min: number | null;
  price_sar_max: number | null;
  price_notes: string | null;
  currency: string | null;
  vat_status: string | null;
  frequency: string | null;
  status: "Active" | "DoNotAdvertise" | "Planned" | "Reserved" | string;
  qoyod_revenue_account: string | null;
  shopify_product_id: string | null;
  description: string | null;
  audience: string | null;
  segment: string | null;
  unit: string | null;
  members_only: boolean;
  image_url: string | null;
  image_synced_source: string | null;
  snapshot_date: string;
}

export interface CatalogAuditRow {
  audit_id: number;
  sku: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by: string | null;
  change_reason: string | null;
}

// SKUs whose price is DERIVED (not directly editable) — mirrors
// DERIVED_RULES in sync_catalog_to_shopify.py. Kept in sync manually; low
// churn (seasonal-pass pricing rule, changed rarely).
export const DERIVED_PRICE_SKUS: Record<string, string> = {
  "HSE-007": "HSE-001 (Group Foundation) × 10 × 0.85",
  "HSE-008": "HSE-004 (Private Foundation) × 10 × 0.85",
};

export const EDITABLE_FIELDS = [
  "service_name", "description", "category", "subcategory",
  "price_sar", "price_notes", "status", "members_only", "image_url",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

const isMissingObjectError = (err: { code?: string; message?: string }): boolean => {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || msg.includes("does not exist") || msg.includes("schema cache");
};

// -------------------------------------------------------------- queries

export const useCatalogProducts = () =>
  useQuery({
    queryKey: ["catalog_products"],
    queryFn: async (): Promise<CatalogProduct[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("pricing_master_snap")
        .select("*")
        .order("bu_code", { ascending: true })
        .order("sku", { ascending: true });
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as CatalogProduct[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 30 * 1000,
  });

export const useCatalogAudit = (limit = 100) =>
  useQuery({
    queryKey: ["catalog_audit", limit],
    queryFn: async (): Promise<CatalogAuditRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("pricing_master_snap_audit")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(limit);
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as CatalogAuditRow[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 15 * 1000,
  });

// -------------------------------------------------------------- mutations

interface UpdateFieldArgs {
  sku: string;
  field: EditableField;
  value: string; // caller stringifies (booleans -> "true"/"false", numbers -> "12.5")
  actor: string;
  reason?: string;
}

export const useUpdateCatalogField = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sku, field, value, actor, reason }: UpdateFieldArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("catalog_update_field", {
        p_sku: sku,
        p_field_name: field,
        p_new_value: value,
        p_actor: actor,
        p_reason: reason ?? null,
      });
      if (error) throw toFriendlyError(error);
      return data as CatalogProduct;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["catalog_products"] });
      qc.invalidateQueries({ queryKey: ["catalog_audit"] });
      // CEO live-review 2026-08-03: every saved change auto-triggers the
      // same Shopify push the old "Sync to Shopify" button called — see
      // scheduleCatalogAutoSync below.
      scheduleCatalogAutoSync(qc, data.sku, data.bu_code);
    },
  });
};

interface CreateProductArgs {
  sku: string;
  bu_code: string;
  service_name: string;
  description: string;
  price_sar: number | null;
  category?: string;
  subcategory?: string;
  status?: string;
  members_only?: boolean;
  product_type?: string;
  actor: string;
}

export const useCreateCatalogProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateProductArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("catalog_create_product", {
        p_sku: args.sku,
        p_bu_code: args.bu_code,
        p_service_name: args.service_name,
        p_description: args.description,
        p_price_sar: args.price_sar,
        p_category: args.category ?? null,
        p_subcategory: args.subcategory ?? null,
        p_status: args.status ?? "Active",
        p_members_only: args.members_only ?? false,
        p_product_type: args.product_type ?? "service",
        p_actor: args.actor,
      });
      if (error) throw toFriendlyError(error);
      return data as CatalogProduct;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["catalog_products"] });
      qc.invalidateQueries({ queryKey: ["catalog_audit"] });
      scheduleCatalogAutoSync(qc, data.sku, data.bu_code);
    },
  });
};

export const useDeleteCatalogProduct = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sku, actor, reason }: { sku: string; actor: string; reason?: string }) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { error } = await supabase.rpc("catalog_delete_product", {
        p_sku: sku,
        p_actor: actor,
        p_reason: reason ?? null,
      });
      if (error) throw toFriendlyError(error);
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog_products"] });
      qc.invalidateQueries({ queryKey: ["catalog_audit"] });
    },
  });
};

// -------------------------------------------------------- image upload

/** Uploads a File to Supabase Storage (bucket catalog-images) and returns
 * its public URL. Caller still needs to call useUpdateCatalogField to
 * write image_url (and get the audit row) — this only handles the blob. */
export const uploadCatalogImage = async (sku: string, file: File): Promise<string> => {
  if (!supabase) throw new Error("Supabase is not configured");
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${sku}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("catalog-images")
    .upload(path, file, { upsert: true, cacheControl: "3600" });
  if (upErr) throw toFriendlyError(upErr);
  const { data } = supabase.storage.from("catalog-images").getPublicUrl(path);
  return data.publicUrl;
};

// -------------------------------------------------------- Shopify sync

export interface SyncDiffEntry {
  sku: string;
  old?: unknown;
  new?: unknown;
  note?: string;
  blocked?: boolean;
  reason?: string;
  error?: { http: number; resp: unknown };
}

export interface SyncResult {
  returncode: number;
  stdout: string;
  stderr: string;
  diff_path: string | null;
  diff: {
    stamp: string;
    dry_run: boolean;
    price: SyncDiffEntry[];
    shipping: SyncDiffEntry[];
    body: SyncDiffEntry[];
    image: SyncDiffEntry[];
    created: Record<string, unknown>[];
    activated: Record<string, unknown>[];
    write_back: Record<string, unknown>[];
    skipped: { sku: string; reason: string }[];
    errors: Record<string, unknown>[];
  } | null;
}

const SYNC_API_URL = (import.meta.env.VITE_CATALOG_SYNC_API_URL as string | undefined) || "http://localhost:9878";
const SYNC_API_TOKEN = (import.meta.env.VITE_CATALOG_SYNC_API_TOKEN as string | undefined) || "";

export const isSyncApiConfigured = Boolean(SYNC_API_TOKEN);

/** Shared call to the same catalog_sync_api.py endpoint the old "Sync to
 * Shopify" button used — reused by the manual price-approval dialog AND by
 * the automatic change-triggered sync below. No new pipeline. */
async function runCatalogSync(args: { mode: "dry_run" | "execute"; only?: string; blockPriceChanges: boolean }): Promise<SyncResult> {
  const resp = await fetch(`${SYNC_API_URL}/catalog/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Catalog-Sync-Token": SYNC_API_TOKEN },
    body: JSON.stringify({
      mode: args.mode,
      only: args.only,
      block_price_changes: args.blockPriceChanges,
    }),
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
    throw new Error(body.error || `Sync API returned HTTP ${resp.status}`);
  }
  return (await resp.json()) as SyncResult;
}

/** Manual path — used ONLY by the price-approval dialog (CEO-approval
 * exception, non-negotiable per build brief + Leveredge Category-B policy).
 * Every other change now syncs automatically, see below. */
export const useSyncShopify = () => useMutation({ mutationFn: runCatalogSync });

// ------------------------------------------------- automatic Shopify sync
// CEO live-review 2026-08-03: "qualunque cosa si modifichi, c'è l'immediata
// sincronizzazione — non serve quel bottone." Every saved change (edit, new
// product, image) now schedules a debounced call to the SAME sync endpoint
// the manual button used to call — no new pipeline. Price changes are the
// one carved-out exception: the sync script's own --block-price-changes
// safety rail (non-negotiable, live store) stays in force, so a price edit
// is pushed as far as the diff computation but held back, surfaced here as
// "price change — needs approval" until a human ticks the CEO-approval box
// in SyncToShopifyDialog.

export type CatalogSyncState = "syncing" | "synced" | "error";

export interface ProductSyncStatus {
  state: CatalogSyncState;
  at?: string; // ISO timestamp of last successful sync attempt
  error?: string;
  priceBlocked?: boolean; // true = a price diff for this SKU was computed but held (needs CEO approval)
  notLinked?: boolean; // true = no matching Shopify variant exists yet (diff.skipped) — never a false "Synced"
}

const SYNC_STATUS_QUERY_KEY = ["catalog_sync_status"] as const;
const SYNC_STATUS_LS_KEY = "trio_catalog_sync_status_v1";

function loadSyncStatusFromStorage(): Record<string, ProductSyncStatus> {
  try {
    const raw = localStorage.getItem(SYNC_STATUS_LS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ProductSyncStatus>) : {};
  } catch {
    return {};
  }
}

function persistSyncStatus(map: Record<string, ProductSyncStatus>) {
  try {
    localStorage.setItem(SYNC_STATUS_LS_KEY, JSON.stringify(map));
  } catch {
    // best-effort only — a full localStorage or private-mode browser just
    // means the chip resets to "unknown" on reload, never a data-loss risk
    // (the catalogue row itself is always safely in Supabase already).
  }
}

/** Reactive map of sku -> last known sync status. Client-side only (no DB
 * column exists for this yet — flagged as a fast-follow in the ship report,
 * same class as the already-documented "permanent tunnel" P1 item). Survives
 * reloads in the same browser via localStorage; does not reflect syncs
 * triggered from a different browser/device. */
export const useCatalogSyncStatusMap = () =>
  useQuery({
    queryKey: SYNC_STATUS_QUERY_KEY,
    queryFn: () => loadSyncStatusFromStorage(),
    staleTime: Infinity,
    gcTime: Infinity,
  });

export const useCatalogSyncStatus = (sku: string): ProductSyncStatus | undefined => {
  const { data } = useCatalogSyncStatusMap();
  return data?.[sku];
};

function patchSyncStatus(qc: ReturnType<typeof useQueryClient>, patch: Record<string, ProductSyncStatus>) {
  const next = { ...(qc.getQueryData<Record<string, ProductSyncStatus>>(SYNC_STATUS_QUERY_KEY) ?? loadSyncStatusFromStorage()), ...patch };
  qc.setQueryData(SYNC_STATUS_QUERY_KEY, next);
  persistSyncStatus(next);
}

// Debounce state — module-level (one clock for the whole app instance,
// matching "batch rapid edits" from the live-review brief).
const AUTO_SYNC_DEBOUNCE_MS = 4000;
let pendingBySku = new Map<string, string>(); // sku -> bu_code
let debounceHandle: ReturnType<typeof setTimeout> | null = null;

async function flushCatalogAutoSync(qc: ReturnType<typeof useQueryClient>, only?: string[]) {
  const entries = only
    ? Array.from(pendingBySku.entries()).filter(([sku]) => only.includes(sku))
    : Array.from(pendingBySku.entries());
  for (const [sku] of entries) pendingBySku.delete(sku);
  if (entries.length === 0) return;

  if (!isSyncApiConfigured) {
    // Honest failure, never a silent one: this environment (e.g. a Vercel
    // preview with no VITE_CATALOG_SYNC_API_TOKEN) cannot reach the sync
    // API at all — same pre-existing constraint the old button already had.
    const patch: Record<string, ProductSyncStatus> = {};
    for (const [sku] of entries) patch[sku] = { state: "error", error: "Sync API not configured in this environment" };
    patchSyncStatus(qc, patch);
    return;
  }

  const bySkuToBu = new Map(entries);
  const buGroups = new Map<string, string[]>();
  for (const [sku, bu] of bySkuToBu) buGroups.set(bu, [...(buGroups.get(bu) ?? []), sku]);

  for (const [bu, skus] of buGroups) {
    const runningPatch: Record<string, ProductSyncStatus> = {};
    for (const sku of skus) runningPatch[sku] = { state: "syncing" };
    patchSyncStatus(qc, runningPatch);

    try {
      // Sequential per-BU calls, always block_price_changes: true — the
      // automatic path NEVER auto-approves a live price push (Category B).
      const result = await runCatalogSync({ mode: "execute", only: bu, blockPriceChanges: true });
      const diff = result.diff;
      const at = diff?.stamp ?? new Date().toISOString();
      const errorSkus = new Set((diff?.errors ?? []).map((e) => String((e as { sku?: string }).sku ?? "")));
      const blockedPriceSkus = new Set((diff?.price ?? []).filter((r) => r.blocked).map((r) => r.sku));
      // diff.skipped = no matching non-archived Shopify variant for this SKU
      // — nothing was pushed at all. Must NEVER be shown as "Synced ✓"
      // (that would be exactly the silent-false-positive the CEO ruled out).
      const notLinkedSkus = new Set((diff?.skipped ?? []).map((s) => s.sku));

      const patch: Record<string, ProductSyncStatus> = {};
      for (const sku of skus) {
        if (result.returncode !== 0 && !errorSkus.has(sku)) {
          patch[sku] = { state: "error", error: "Sync run finished with errors — see History" };
        } else if (errorSkus.has(sku)) {
          patch[sku] = { state: "error", error: "Shopify rejected this change — see History" };
        } else if (notLinkedSkus.has(sku)) {
          patch[sku] = { state: "synced", at, notLinked: true };
        } else if (blockedPriceSkus.has(sku)) {
          patch[sku] = { state: "synced", at, priceBlocked: true };
        } else {
          patch[sku] = { state: "synced", at };
        }
      }
      patchSyncStatus(qc, patch);
    } catch (err) {
      const patch: Record<string, ProductSyncStatus> = {};
      for (const sku of skus) patch[sku] = { state: "error", error: (err as Error).message };
      patchSyncStatus(qc, patch);
    }
  }
}

/** Called after every successful save (edit, new product, image). Marks the
 * product "Syncing…" immediately and debounces the actual push a few
 * seconds so rapid edits to the same product/BU batch into one sync run. */
export function scheduleCatalogAutoSync(qc: ReturnType<typeof useQueryClient>, sku: string, buCode: string) {
  pendingBySku.set(sku, buCode);
  patchSyncStatus(qc, { [sku]: { state: "syncing" } });
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => {
    debounceHandle = null;
    void flushCatalogAutoSync(qc);
  }, AUTO_SYNC_DEBOUNCE_MS);
}

/** "Retry" — the one manual control left per the live-review brief. Skips
 * the debounce and pushes this one SKU immediately. */
export function retryCatalogSync(qc: ReturnType<typeof useQueryClient>, sku: string, buCode: string) {
  pendingBySku.set(sku, buCode);
  patchSyncStatus(qc, { [sku]: { state: "syncing" } });
  void flushCatalogAutoSync(qc, [sku]);
}
