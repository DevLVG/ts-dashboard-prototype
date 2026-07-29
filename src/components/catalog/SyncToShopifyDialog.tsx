// "Sync to Shopify" — dry-run first, explicit confirm to execute.
// One-way middleware -> Shopify. Reuses/extends sync_catalog_to_shopify.py
// via the local catalog_sync_api.py wrapper (see src/data/catalogLive.ts).
//
// SAFETY RAIL (non-negotiable, per build brief): the Shopify store is LIVE
// and selling. Price changes are a CEO-approval category — every price row
// in the diff is flagged, and Execute is blocked (server-side, via
// --block-price-changes) unless the staff member explicitly ticks the
// "price changes approved" box for THIS run.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, ShieldAlert, ImagePlus, DollarSign, FileText, Truck, PlusCircle, SkipForward, XCircle } from "lucide-react";
import { useSyncShopify, isSyncApiConfigured, type SyncResult } from "@/data/catalogLive";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Stage = "setup" | "dry_run_result" | "executed";

export const SyncToShopifyDialog = ({ open, onOpenChange }: Props) => {
  const sync = useSyncShopify();
  const [stage, setStage] = useState<Stage>("setup");
  const [only, setOnly] = useState("");
  const [dryResult, setDryResult] = useState<SyncResult | null>(null);
  const [execResult, setExecResult] = useState<SyncResult | null>(null);
  const [priceApproved, setPriceApproved] = useState(false);

  const reset = () => {
    setStage("setup"); setDryResult(null); setExecResult(null); setPriceApproved(false);
  };

  const runDryRun = async () => {
    const res = await sync.mutateAsync({ mode: "dry_run", only: only.trim() || undefined, blockPriceChanges: true });
    setDryResult(res);
    setStage("dry_run_result");
  };

  const runExecute = async () => {
    const res = await sync.mutateAsync({
      mode: "execute",
      only: only.trim() || undefined,
      blockPriceChanges: !priceApproved,
    });
    setExecResult(res);
    setStage("executed");
  };

  const diff = dryResult?.diff ?? execResult?.diff;
  const priceRows = diff?.price ?? [];
  const hasPriceChanges = priceRows.length > 0;
  const hasAnyChange = diff
    ? diff.price.length + diff.shipping.length + diff.body.length + diff.image.length + diff.created.length > 0
    : false;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sync to Shopify</DialogTitle>
          <DialogDescription>
            One-way: middleware → Shopify only. Nothing is ever pulled back from Shopify edits.
            Always review the dry-run diff before confirming.
          </DialogDescription>
        </DialogHeader>

        {!isSyncApiConfigured && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Sync API is not configured (VITE_CATALOG_SYNC_API_TOKEN missing) — Sync to Shopify cannot run from this
            environment.
          </div>
        )}

        {stage === "setup" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="only">Restrict to a business unit (optional)</Label>
              <Input id="only" value={only} onChange={(e) => setOnly(e.target.value.toUpperCase())}
                placeholder="e.g. TEST, MEM, HSE, LIV, RET — leave blank for all" className="mt-1" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Leave blank to check the whole catalogue. Scoping is recommended when testing.
              </p>
            </div>
            <Button onClick={runDryRun} disabled={sync.isPending || !isSyncApiConfigured} className="gap-1.5">
              {sync.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Run dry-run (shows diff, writes nothing)
            </Button>
          </div>
        )}

        {stage === "dry_run_result" && diff && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Dry-run complete — nothing was written to Shopify yet. This is what WOULD change:
            </p>
            <DiffSummary diff={diff} />

            {hasPriceChanges && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                <div className="flex items-start gap-2 text-sm text-amber-500">
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>{priceRows.length} price change{priceRows.length > 1 ? "s" : ""} detected.</strong>{" "}
                    Price changes on the live store are a CEO-approval category. They will NOT be pushed
                    unless you confirm CEO approval was obtained for this run.
                  </span>
                </div>
                <label className="flex items-center gap-2 text-sm pl-6">
                  <Checkbox checked={priceApproved} onCheckedChange={(c) => setPriceApproved(c === true)} />
                  I confirm CEO approval was obtained for the price changes above.
                </label>
              </div>
            )}

            {!hasAnyChange && (
              <p className="text-sm text-muted-foreground">Catalogue already matches Shopify — nothing to sync.</p>
            )}
          </div>
        )}

        {stage === "executed" && execResult && (
          <div className="space-y-4">
            <p className="text-sm">
              {execResult.returncode === 0 ? "Sync executed." : "Sync finished with errors — see below."}
            </p>
            {execResult.diff && <DiffSummary diff={execResult.diff} />}
          </div>
        )}

        <DialogFooter>
          {stage === "setup" && <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>}
          {stage === "dry_run_result" && (
            <>
              <Button variant="ghost" onClick={() => setStage("setup")}>Back</Button>
              <Button
                onClick={runExecute}
                disabled={sync.isPending || !hasAnyChange}
                className="gap-1.5"
              >
                {sync.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm &amp; execute{hasPriceChanges && !priceApproved ? " (price changes will be skipped)" : ""}
              </Button>
            </>
          )}
          {stage === "executed" && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Row = ({ icon: Icon, label, count, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; count: number; tone: string }) => (
  <div className="flex items-center justify-between rounded-md border px-3 py-2">
    <div className="flex items-center gap-2 text-sm">
      <Icon className={`h-4 w-4 ${tone}`} />
      {label}
    </div>
    <Badge variant={count > 0 ? "default" : "outline"}>{count}</Badge>
  </div>
);

const DiffSummary = ({ diff }: { diff: NonNullable<SyncResult["diff"]> }) => (
  <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <Row icon={DollarSign} label="Price changes" count={diff.price.length} tone="text-amber-500" />
      <Row icon={Truck} label="Shipping flag" count={diff.shipping.length} tone="text-sky-400" />
      <Row icon={FileText} label="Description" count={diff.body.length} tone="text-foreground" />
      <Row icon={ImagePlus} label="Images" count={diff.image.length} tone="text-emerald-400" />
      <Row icon={PlusCircle} label="New products" count={diff.created.length} tone="text-emerald-400" />
      <Row icon={SkipForward} label="Skipped (no Shopify match)" count={diff.skipped.length} tone="text-muted-foreground" />
    </div>

    {diff.price.length > 0 && (
      <div className="rounded-md border p-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Price changes</p>
        <ul className="space-y-1 text-sm">
          {diff.price.map((r, i) => (
            <li key={i} className="flex items-center justify-between">
              <span>{r.sku}</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{String(r.old)} → {String(r.new)} SAR</span>
                {r.blocked && <Badge variant="outline" className="text-amber-500 border-amber-500/40">blocked</Badge>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )}

    {diff.errors.length > 0 && (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
        <p className="text-xs uppercase tracking-wider text-destructive mb-2 flex items-center gap-1.5">
          <XCircle className="h-3.5 w-3.5" /> Errors ({diff.errors.length})
        </p>
        <pre className="text-[11px] whitespace-pre-wrap text-destructive/90">{JSON.stringify(diff.errors, null, 2)}</pre>
      </div>
    )}
  </div>
);
