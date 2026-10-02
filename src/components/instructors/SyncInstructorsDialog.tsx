// "Sync to site" — dry-run first, explicit confirm to execute. One-way
// middleware -> Shopify DRAFT theme only. Reuses/extends
// sync_instructors_to_theme.py via the local instructors_sync_api.py wrapper
// (cloned from copy_sync_api.py — see src/data/instructorsLive.ts).
// PUBLICATION GATE reminder shown up front: only is_active && !needs_review
// rows can ever appear in the diff.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Loader2, Users, XCircle, ShieldAlert } from "lucide-react";
import {
  useSyncInstructorsToTheme, isInstructorsSyncApiConfigured, type InstructorsSyncResult,
} from "@/data/instructorsLive";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Stage = "setup" | "dry_run_result" | "executed";

export const SyncInstructorsDialog = ({ open, onOpenChange }: Props) => {
  const sync = useSyncInstructorsToTheme();
  const [stage, setStage] = useState<Stage>("setup");
  const [dryResult, setDryResult] = useState<InstructorsSyncResult | null>(null);
  const [execResult, setExecResult] = useState<InstructorsSyncResult | null>(null);

  const reset = () => { setStage("setup"); setDryResult(null); setExecResult(null); };

  const runDryRun = async () => {
    const res = await sync.mutateAsync({ mode: "dry_run" });
    setDryResult(res);
    setStage("dry_run_result");
  };

  const runExecute = async () => {
    const res = await sync.mutateAsync({ mode: "execute" });
    setExecResult(res);
    setStage("executed");
  };

  const diff = dryResult?.diff ?? execResult?.diff;
  const changes = diff?.changes ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sync Instructors to site</DialogTitle>
          <DialogDescription>
            One-way: this panel → Shopify DRAFT theme only (never live). Only instructors marked <strong>Active</strong> and
            with <strong>Needs review unchecked</strong> can appear — everyone else stays off the site. Always review the
            dry-run diff before confirming.
          </DialogDescription>
        </DialogHeader>

        {!isInstructorsSyncApiConfigured && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Sync API is not configured (VITE_INSTRUCTORS_SYNC_API_TOKEN missing) — Sync to site cannot run from this
            environment.
          </div>
        )}

        {stage === "setup" && (
          <div className="space-y-4">
            <Button onClick={runDryRun} disabled={sync.isPending || !isInstructorsSyncApiConfigured} className="gap-1.5">
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
                <Users className="h-4 w-4 text-foreground" />
                Published instructors after this sync: {diff.published_count}
              </div>
            </div>

            {diff.skipped.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs uppercase tracking-wider text-amber-500 mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="h-3.5 w-3.5" /> Not published ({diff.skipped.length})
                </p>
                <ul className="space-y-1 text-xs">
                  {diff.skipped.map((s, i) => (
                    <li key={i}>
                      <span className="font-medium">{s.name}</span> — {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {changes.length > 0 ? (
              <div className="rounded-md border p-3 max-h-[280px] overflow-y-auto">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Field changes on the theme file</p>
                <ul className="space-y-2 text-sm">
                  {changes.map((c, i) => (
                    <li key={i} className="border-b last:border-0 pb-2 last:pb-0">
                      <div className="font-mono text-[11px] text-muted-foreground">{c.block_id}.{c.field}</div>
                      <div className="text-xs">
                        <span className="text-muted-foreground line-through">{String(c.old ?? "—")}</span>
                        {" → "}
                        <span>{String(c.new ?? "—")}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                The theme's Instructors section already matches the CMS — nothing to sync.
              </p>
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
            {execResult.diff && (
              <p className="text-xs text-muted-foreground">Published instructors: {execResult.diff.published_count}</p>
            )}
          </div>
        )}

        <DialogFooter>
          {stage === "setup" && <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>}
          {stage === "dry_run_result" && (
            <>
              <Button variant="ghost" onClick={() => setStage("setup")}>Back</Button>
              <Button onClick={runExecute} disabled={sync.isPending || !diff.file_changed} className="gap-1.5">
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
