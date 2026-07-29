// "Sync to site" — dry-run first, explicit confirm to execute.
// One-way middleware -> Shopify DRAFT theme only. Reuses/extends
// sync_copy_to_theme.py via the local copy_sync_api.py wrapper (cloned from
// the Catalogue's catalog_sync_api.py pattern — see src/data/siteCopyLive.ts).
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, FileText, XCircle } from "lucide-react";
import { useSyncCopyToTheme, isCopySyncApiConfigured, type CopySyncResult } from "@/data/siteCopyLive";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Stage = "setup" | "dry_run_result" | "executed";

export const SyncCopyDialog = ({ open, onOpenChange }: Props) => {
  const sync = useSyncCopyToTheme();
  const [stage, setStage] = useState<Stage>("setup");
  const [only, setOnly] = useState("");
  const [dryResult, setDryResult] = useState<CopySyncResult | null>(null);
  const [execResult, setExecResult] = useState<CopySyncResult | null>(null);

  const reset = () => { setStage("setup"); setDryResult(null); setExecResult(null); };

  const runDryRun = async () => {
    const res = await sync.mutateAsync({ mode: "dry_run", only: only.trim() || undefined });
    setDryResult(res);
    setStage("dry_run_result");
  };

  const runExecute = async () => {
    const res = await sync.mutateAsync({ mode: "execute", only: only.trim() || undefined });
    setExecResult(res);
    setStage("executed");
  };

  const diff = dryResult?.diff ?? execResult?.diff;
  const changes = diff?.changes ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sync to site</DialogTitle>
          <DialogDescription>
            One-way: middleware → Shopify DRAFT theme only (never live). Nothing is ever pulled back from the theme.
            Always review the dry-run diff before confirming.
          </DialogDescription>
        </DialogHeader>

        {!isCopySyncApiConfigured && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Sync API is not configured (VITE_COPY_SYNC_API_TOKEN missing) — Sync to site cannot run from this
            environment.
          </div>
        )}

        {stage === "setup" && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="only">Restrict to a page (optional)</Label>
              <Input id="only" value={only} onChange={(e) => setOnly(e.target.value)}
                placeholder="e.g. page.about — leave blank for the whole site" className="mt-1" />
              <p className="text-[11px] text-muted-foreground mt-1">
                Leave blank to check every page. Scoping is recommended when testing one change.
              </p>
            </div>
            <Button onClick={runDryRun} disabled={sync.isPending || !isCopySyncApiConfigured} className="gap-1.5">
              {sync.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Run dry-run (shows diff, writes nothing)
            </Button>
          </div>
        )}

        {stage === "dry_run_result" && diff && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Dry-run complete — nothing was written to the theme yet. This is what WOULD change:
            </p>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-foreground" />
                Copy changes ({diff.files_changed.length} file{diff.files_changed.length === 1 ? "" : "s"})
              </div>
              <Badge variant={changes.length > 0 ? "default" : "outline"}>{changes.length}</Badge>
            </div>

            {changes.length > 0 && (
              <div className="rounded-md border p-3 max-h-[300px] overflow-y-auto">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Changed strings</p>
                <ul className="space-y-2 text-sm">
                  {changes.map((c, i) => (
                    <li key={i} className="border-b last:border-0 pb-2 last:pb-0">
                      <div className="font-mono text-[11px] text-muted-foreground truncate" title={c.key}>{c.key}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.file}</div>
                      <div className="text-xs">
                        <span className="text-muted-foreground line-through">{String(c.old ?? "—")}</span>
                        {" → "}
                        <span>{String(c.new ?? "—")}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {changes.length === 0 && (
              <p className="text-sm text-muted-foreground">Site copy already matches the theme — nothing to sync.</p>
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
        )}

        {stage === "executed" && execResult && (
          <div className="space-y-4">
            <p className="text-sm">
              {execResult.returncode === 0 ? "Sync executed — pushed to the draft theme." : "Sync finished with errors — see below."}
            </p>
            {execResult.diff && execResult.diff.changes.length > 0 && (
              <div className="rounded-md border p-3 max-h-[240px] overflow-y-auto">
                <ul className="space-y-1 text-xs">
                  {execResult.diff.changes.map((c, i) => (
                    <li key={i} className="font-mono truncate">{c.key}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {stage === "setup" && <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>}
          {stage === "dry_run_result" && (
            <>
              <Button variant="ghost" onClick={() => setStage("setup")}>Back</Button>
              <Button onClick={runExecute} disabled={sync.isPending || changes.length === 0} className="gap-1.5">
                {sync.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm &amp; push to draft theme
              </Button>
            </>
          )}
          {stage === "executed" && <Button onClick={() => onOpenChange(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
