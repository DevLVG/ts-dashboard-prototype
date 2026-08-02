// Instructors CMS — editable coaching-team profiles, one-way sync to the
// Shopify draft theme. CEO mandate (Marcello, via Luca, 2026-08-02): the
// Horse School "Your instructors" section showed 4 unconfirmed names
// (Ioana/Mansour/Karen/Mrs. Arwa) — pulled from the live site entirely.
// This panel is the single source of truth for real profiles going forward:
// edit here, uncheck "Needs review" once confirmed, Sync to site — no
// developer needed. Same UX discipline as SiteCopyAdmin (righe editabili +
// audit trail), scoped to instructor records instead of copy strings.
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, UserPlus, ShieldAlert, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { useInstructors, useCreateInstructor } from "@/data/instructorsLive";
import { InstructorCard } from "./InstructorCard";
import { InstructorsAuditLog } from "./InstructorsAuditLog";
import { SyncInstructorsDialog } from "./SyncInstructorsDialog";
import { useToast } from "@/hooks/use-toast";

export const InstructorsAdmin = () => {
  const { session } = useAuth();
  const actor = session?.user?.email ?? "unknown";
  const { toast } = useToast();
  const { data: rows, isLoading, isError, error } = useInstructors();
  const createInstructor = useCreateInstructor();

  const [syncOpen, setSyncOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  const liveReadyCount = (rows ?? []).filter((r) => r.is_active && !r.needs_review).length;
  const needsReviewCount = (rows ?? []).filter((r) => r.needs_review).length;

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await createInstructor.mutateAsync({ name, actor, sort_order: (rows?.length ?? 0) + 1 });
      setNewName("");
      toast({ title: `Added ${name}`, description: "New profiles start flagged “Needs review” — fill in the fields below, then uncheck it when ready." });
    } catch (err) {
      toast({ variant: "destructive", title: "Could not add instructor", description: (err as Error).message });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-sky-400" />
        <span>
          This panel is the <strong>single source of truth</strong> for the Horse School "Your instructors" section.
          A profile only reaches the live site once <strong>Active</strong> is on AND <strong>Needs review</strong> is
          off — everything else stays private here. Edits save as you type — the live site only updates when you run
          <strong> Sync to site</strong>, which always pushes to the draft theme, never live.
        </span>
      </div>

      <Card className="p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-1 flex-wrap justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-heading tracking-wide">INSTRUCTORS</h3>
            <DataSourceBadge source="live" />
            <span className="text-xs text-muted-foreground">Supabase · cal_instructors</span>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => setSyncOpen(true)}>
            <RefreshCw className="h-4 w-4" /> Sync to site
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-4 mb-4">
          <Badge variant="outline" className="text-xs">{rows?.length ?? 0} instructors total</Badge>
          <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-500">{liveReadyCount} live-ready</Badge>
          {needsReviewCount > 0 && (
            <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-500">{needsReviewCount} need review</Badge>
          )}
        </div>

        <div className="flex items-center gap-2 mb-4">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="New instructor's full name…" className="max-w-xs h-9" />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={handleAdd} disabled={adding || !newName.trim()}>
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Add instructor
          </Button>
        </div>

        {!isSupabaseConfigured ? (
          <p className="text-sm text-destructive">Supabase is not configured — instructors cannot load.</p>
        ) : isError ? (
          <p className="text-sm text-destructive">{(error as Error)?.message ?? "Could not load instructors."}</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !rows || rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No instructors yet — add the first one above.</p>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <InstructorCard key={row.id} row={row} actor={actor} />
            ))}
          </div>
        )}
      </Card>

      <InstructorsAuditLog instructors={rows ?? []} />

      <SyncInstructorsDialog open={syncOpen} onOpenChange={setSyncOpen} />
    </div>
  );
};
