// Catalogue CMS — editable product catalogue, automatic sync to Shopify.
// CEO decision (V1_Integrated_Plan_2026-07-24.md "Catalogo = CMS"): this
// panel + pricing_master_snap are the single source of truth. Shopify only
// displays and sells — no editing on Shopify. Built for non-technical club
// staff: plain fields, one list, one edit dialog.
//
// CEO live-review 2026-08-03: the manual "Sync to Shopify" button is gone —
// every saved change now triggers the same sync automatically (see
// scheduleCatalogAutoSync in catalogLive.ts). The one manual control left is
// per-row Retry on a sync error, plus the CEO-approval step that the
// non-negotiable price safety rail still requires (SyncToShopifyDialog).
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Search, Pencil, ImageOff, Users, ShieldAlert, Loader2, CheckCircle2, XCircle, ShieldQuestion } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { useAuth } from "@/contexts/AuthContext";
import {
  useCatalogProducts, useCatalogSyncStatusMap, retryCatalogSync, isSyncApiConfigured,
  type CatalogProduct, type ProductSyncStatus,
} from "@/data/catalogLive";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { supabaseImageThumb } from "@/lib/imageThumb";
import { ProductEditDialog } from "@/components/catalog/ProductEditDialog";
import { SyncToShopifyDialog } from "@/components/catalog/SyncToShopifyDialog";
import { CatalogHistoryPanel } from "@/components/catalog/CatalogHistoryPanel";

const STATUS_TONE: Record<string, string> = {
  Active: "border-emerald-500/40 text-emerald-400",
  DoNotAdvertise: "border-muted-foreground/40 text-muted-foreground",
  Planned: "border-sky-500/40 text-sky-400",
  Reserved: "border-amber-500/40 text-amber-400",
};

const fmtPrice = (v: number | null) => (v == null ? "—" : new Intl.NumberFormat("en-US").format(v));
const fmtTime = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");

const SyncStatusChip = ({ sku, buCode, status }: { sku: string; buCode: string; status: ProductSyncStatus | undefined }) => {
  const qc = useQueryClient();

  if (!isSyncApiConfigured) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-help">
            <ShieldQuestion className="h-3.5 w-3.5" /> Sync unavailable
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          This environment can't reach the sync API — edits save to the catalogue but won't reach Shopify from here.
        </TooltipContent>
      </Tooltip>
    );
  }

  if (!status) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (status.state === "syncing") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Syncing…
      </span>
    );
  }
  if (status.state === "error") {
    return (
      <button
        type="button"
        onClick={() => retryCatalogSync(qc, sku, buCode)}
        className="inline-flex items-center gap-1 text-xs text-destructive underline decoration-dotted hover:text-destructive/80"
        title={status.error}
      >
        <XCircle className="h-3.5 w-3.5" /> Sync error — retry
      </button>
    );
  }
  if (status.priceBlocked) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-500">
        <ShieldAlert className="h-3.5 w-3.5" /> Price change pending approval
      </span>
    );
  }
  if (status.notLinked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-help">
            <ShieldQuestion className="h-3.5 w-3.5" /> Not linked to Shopify
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          No matching Shopify product for this SKU yet — the catalogue save is safe, but there's nothing on the
          Shopify side to push this change to.
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-500">
      <CheckCircle2 className="h-3.5 w-3.5" /> Synced ✓ {fmtTime(status.at)}
    </span>
  );
};

export const CatalogAdmin = () => {
  const { session } = useAuth();
  const actor = session?.user?.email ?? "unknown";
  const { data: products, isLoading, isError, error } = useCatalogProducts();
  const { data: syncStatusMap } = useCatalogSyncStatusMap();

  const [search, setSearch] = useState("");
  const [buFilter, setBuFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [editing, setEditing] = useState<CatalogProduct | null | "new">(null);
  const [priceApprovalOpen, setPriceApprovalOpen] = useState(false);

  const buOptions = useMemo(() => {
    const set = new Set((products ?? []).map((p) => p.bu_code));
    return ["ALL", ...Array.from(set).sort()];
  }, [products]);

  const statusOptions = useMemo(() => {
    const set = new Set((products ?? []).map((p) => p.status));
    return ["ALL", ...Array.from(set).sort()];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter((p) => {
      if (buFilter !== "ALL" && p.bu_code !== buFilter) return false;
      if (statusFilter !== "ALL" && p.status !== statusFilter) return false;
      if (q && !`${p.sku} ${p.service_name ?? ""} ${p.category ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, search, buFilter, statusFilter]);

  const pendingApprovalCount = useMemo(
    () => Object.values(syncStatusMap ?? {}).filter((s) => s.priceBlocked).length,
    [syncStatusMap],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-sky-400" />
        <span>
          This panel is the <strong>single source of truth</strong> for the catalogue. Every change autosaves here and
          syncs to Shopify automatically within a few seconds. <strong>Price changes are the one exception</strong> —
          they still need CEO approval before they reach the live store. Nothing here is ever pulled back from Shopify.
        </span>
      </div>

      <Card className="p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-1 flex-wrap justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-heading tracking-wide">PRODUCT CATALOGUE</h3>
            <DataSourceBadge source="live" sourceLabel="Live data from Supabase (pricing_master_snap)" />
            <span className="text-xs text-muted-foreground">Live product & pricing data</span>
          </div>
          <div className="flex items-center gap-2">
            {pendingApprovalCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-amber-500/40 text-amber-500 hover:text-amber-500"
                onClick={() => setPriceApprovalOpen(true)}
              >
                <ShieldAlert className="h-4 w-4" />
                {pendingApprovalCount} price change{pendingApprovalCount > 1 ? "s" : ""} awaiting approval
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> New product
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-4 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, name, category…" className="pl-8 h-9" />
          </div>
          <Select value={buFilter} onValueChange={setBuFilter}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {buOptions.map((b) => <SelectItem key={b} value={b}>{b === "ALL" ? "All BUs" : b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => <SelectItem key={s} value={s}>{s === "ALL" ? "All statuses" : s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {!isSupabaseConfigured ? (
          <p className="text-sm text-destructive">Supabase is not configured — the catalogue cannot load.</p>
        ) : isError ? (
          <p className="text-sm text-destructive">{(error as Error)?.message ?? "Could not load the catalogue."}</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products match this filter.</p>
        ) : (
          <ScrollHint>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[56px]"></TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>BU / Category</TableHead>
                  <TableHead className="text-right">Price SAR</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Shopify</TableHead>
                  <TableHead className="text-right">Edit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.sku}>
                    <TableCell>
                      <div className="h-10 w-10 rounded-md border bg-muted/30 flex items-center justify-center overflow-hidden">
                        {p.image_url ? (
                          <img
                            src={supabaseImageThumb(p.image_url, { width: 96 }) ?? p.image_url}
                            alt={p.service_name ?? p.sku}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <ImageOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{p.sku}</TableCell>
                    <TableCell className="max-w-[240px] truncate" title={p.service_name ?? ""}>
                      {p.service_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {p.bu_code}{p.category ? ` · ${p.category}` : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{fmtPrice(p.price_sar)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_TONE[p.status] ?? ""}>{p.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {p.members_only && (
                        <Badge variant="outline" className="gap-1 border-gold/40 text-gold">
                          <Users className="h-3 w-3" /> Members
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <SyncStatusChip sku={p.sku} buCode={p.bu_code} status={syncStatusMap?.[p.sku]} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setEditing(p)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollHint>
        )}
        <p className="text-xs text-muted-foreground mt-3">{filtered.length} of {products?.length ?? 0} products shown</p>
      </Card>

      <CatalogHistoryPanel />

      <ProductEditDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        product={editing === "new" ? null : editing}
        actor={actor}
      />
      <SyncToShopifyDialog open={priceApprovalOpen} onOpenChange={setPriceApprovalOpen} />
    </div>
  );
};
