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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog_products"] });
      qc.invalidateQueries({ queryKey: ["catalog_audit"] });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog_products"] });
      qc.invalidateQueries({ queryKey: ["catalog_audit"] });
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

export const useSyncShopify = () =>
  useMutation({
    mutationFn: async (args: { mode: "dry_run" | "execute"; only?: string; blockPriceChanges: boolean }): Promise<SyncResult> => {
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
    },
  });
