// HR > Cicli (spec §2.4): i quattro periodi dell'anno; apri/chiudi ciclo;
// alla chiusura i punteggi si congelano. "Apri copiando gli obiettivi
// ancora validi" è disponibile per-persona dalla Scheda in v1 (copyObjectivesToCard,
// azionata qui con un'azione dedicata per ciclo -> tutte le persone valutate).
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Loader2, Lock, Unlock, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { Role } from "@/lib/roles";
import {
  useHrCycles, useOpenCycle, useCloseCycle, useHrEvaluatedPeople,
  copyObjectivesToCard,
} from "@/data/hrLive";
import { supabase } from "@/lib/supabaseClient";

const STATUS_TONE: Record<string, string> = {
  scheduled: "text-muted-foreground",
  open: "border-emerald-500/40 text-emerald-400",
  closing: "border-amber-500/40 text-amber-500",
  closed: "border-muted-foreground/40 text-muted-foreground",
};

interface Props { role: Role }

export const HrCyclesTab = ({ role }: Props) => {
  const { session } = useAuth();
  const actor = session?.user?.email ?? "unknown";
  const { toast } = useToast();
  const canManage = role === "leveredge";

  const { data: cycles, isLoading } = useHrCycles();
  const { data: people } = useHrEvaluatedPeople();
  const openCycleMut = useOpenCycle();
  const closeCycleMut = useCloseCycle();
  const [copying, setCopying] = useState<string | null>(null);

  const sortedCycles = useMemo(() => [...(cycles ?? [])].sort((a, b) => a.period_start.localeCompare(b.period_start)), [cycles]);

  const handleOpen = async (cycleId: string) => {
    try {
      await openCycleMut.mutateAsync({ p_cycle_id: cycleId, p_actor: actor });
      toast({ title: "Cycle opened" });
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleClose = async (cycleId: string) => {
    try {
      await closeCycleMut.mutateAsync({ p_cycle_id: cycleId, p_actor: actor });
      toast({ title: "Cycle closed — scores are frozen" });
    } catch (e) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    }
  };

  /** Copy the previous cycle's objectives forward for every evaluated
   * person who has none yet in the target cycle. */
  const handleCopyForward = async (fromCycleId: string, toCycleId: string) => {
    if (!people || !supabase) return;
    setCopying(toCycleId);
    try {
      for (const p of people) {
        const { data: src, error } = await supabase
          .from("hr_objectives").select("*").eq("person_id", p.employee_id).eq("cycle_id", fromCycleId);
        if (error) throw error;
        if (!src || src.length === 0) continue;
        const { data: existing } = await supabase
          .from("hr_objectives").select("objective_id").eq("person_id", p.employee_id).eq("cycle_id", toCycleId).limit(1);
        if (existing && existing.length > 0) continue; // already has a card in the target cycle
        // eslint-disable-next-line no-await-in-loop
        await copyObjectivesToCard(src as Parameters<typeof copyObjectivesToCard>[0], p.employee_id, toCycleId, actor);
      }
      toast({ title: "Objectives copied into the new cycle" });
    } catch (e) {
      toast({ title: "Copy failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCopying(null);
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <Card className="p-6 shadow-sm">
      <h3 className="text-xl font-heading tracking-wide mb-3">EVALUATION CYCLES</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cycle</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Opened/closed by</TableHead>
            {canManage && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedCycles.map((c, idx) => {
            const prev = sortedCycles[idx - 1];
            return (
              <TableRow key={c.cycle_id}>
                <TableCell className="font-medium">{c.label}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.period_start} → {c.period_end}</TableCell>
                <TableCell><Badge variant="outline">{c.kind === "final" ? "Final" : "Quarterly"}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={STATUS_TONE[c.status]}>{c.status}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.status === "closed" ? c.closed_by : c.status === "open" || c.status === "closing" ? c.opened_by : "—"}
                </TableCell>
                {canManage && (
                  <TableCell className="text-right space-x-1.5 whitespace-nowrap">
                    {c.status === "scheduled" && (
                      <>
                        {prev && (
                          <Button variant="ghost" size="sm" className="gap-1" disabled={copying === c.cycle_id} onClick={() => handleCopyForward(prev.cycle_id, c.cycle_id)}>
                            {copying === c.cycle_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />} Copy objectives
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => handleOpen(c.cycle_id)} disabled={openCycleMut.isPending}>
                          <Unlock className="h-3.5 w-3.5" /> Open
                        </Button>
                      </>
                    )}
                    {(c.status === "open" || c.status === "closing") && (
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => handleClose(c.cycle_id)} disabled={closeCycleMut.isPending}>
                        <Lock className="h-3.5 w-3.5" /> Close
                      </Button>
                    )}
                    {c.status === "closed" && <span className="text-xs text-muted-foreground">frozen</span>}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground mt-3">
        "Copy objectives" carries objectives forward from the previous cycle for every person without a card in the selected cycle — it never overwrites an existing card.
      </p>
    </Card>
  );
};
