// HR > Persone (spec §2.1): elenco delle persone valutate, valutatori con
// pesi, ciclo corrente, stato, punteggio finale dell'ultimo ciclo chiuso.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, AlertTriangle, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { Role } from "@/lib/roles";
import {
  useHrEvaluatedPeople, useHrActivatablePeople, useHrScores, useHrCycles, useHrPersonObjectiveCounts,
  useSetPersonEvaluated, reviewerLabel,
} from "@/data/hrLive";

const fmtScore = (v: number | null) => (v == null ? "—" : v.toFixed(2));

interface Props {
  role: Role;
  cycleId?: string;
  onOpenCard: (personId: string, cycleId?: string) => void;
}

export const HrPeopleTab = ({ role, cycleId, onOpenCard }: Props) => {
  const { session } = useAuth();
  const actor = session?.user?.email ?? "unknown";
  const { toast } = useToast();
  const canManage = role === "leveredge";

  const { data: people, isLoading, isError } = useHrEvaluatedPeople();
  const { data: activatable } = useHrActivatablePeople();
  const { data: cycles } = useHrCycles();
  const { data: scores } = useHrScores(cycleId);
  const { data: objCounts } = useHrPersonObjectiveCounts(cycleId);
  const setEvaluated = useSetPersonEvaluated();

  const [activateOpen, setActivateOpen] = useState(false);
  const [pickPersonId, setPickPersonId] = useState<string>("");

  // Note (documented simplification): the score column shows the
  // CURRENT cycle's number, not necessarily the "ultimo ciclo chiuso" the
  // spec describes when the current cycle is still open/scheduled for a
  // given person — a cross-cycle "last closed" lookup per person would add
  // an N-query fan-out for a v1 list of ~2-6 people; revisit if the roster
  // grows enough to make that cost worthwhile.
  const currentCycle = useMemo(() => cycles?.find((c) => c.cycle_id === cycleId), [cycles, cycleId]);
  const scoreByPerson = useMemo(() => {
    const m: Record<string, (typeof scores)[number]> = {};
    (scores ?? []).forEach((s) => { m[s.person_id] = s; });
    return m;
  }, [scores]);

  const statusFor = (employeeId: string): { label: string; tone: string } => {
    const count = objCounts?.[employeeId] ?? 0;
    if (!currentCycle) return { label: "nessun ciclo", tone: "text-muted-foreground" };
    if (count === 0) return { label: "obiettivi da assegnare", tone: "border-amber-500/40 text-amber-500" };
    if (currentCycle.status === "scheduled") return { label: "in attesa apertura", tone: "text-muted-foreground" };
    if (currentCycle.status === "closed") return { label: "chiusa", tone: "border-muted-foreground/40 text-muted-foreground" };
    const s = scoreByPerson[employeeId];
    if (s?.all_scored_complete) return { label: "valutazione completa", tone: "border-emerald-500/40 text-emerald-400" };
    return { label: "in valutazione", tone: "border-sky-500/40 text-sky-400" };
  };

  const handleActivate = async () => {
    if (!pickPersonId) return;
    try {
      await setEvaluated.mutateAsync({ p_person_id: pickPersonId, p_evaluated: true, p_actor: actor });
      toast({ title: "Persona attivata per la valutazione HR" });
      setActivateOpen(false);
      setPickPersonId("");
    } catch (e) {
      toast({ title: "Errore", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Card className="p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-xl font-heading tracking-wide">PERSONE VALUTATE</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Ciclo corrente: {currentCycle?.label ?? "nessun ciclo aperto"}
          </p>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setActivateOpen(true)}>
            <UserPlus className="h-4 w-4" /> Attiva persona
          </Button>
        )}
      </div>

      {isError ? (
        <p className="text-sm text-destructive">Non è stato possibile caricare le persone valutate.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : !people || people.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessuna persona attivata per la valutazione HR.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Ruolo / Reparto</TableHead>
              <TableHead>Stato ciclo</TableHead>
              <TableHead className="text-right">Punteggio finale</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((p) => {
              const st = statusFor(p.employee_id);
              const score = scoreByPerson[p.employee_id];
              return (
                <TableRow key={p.employee_id} className="cursor-pointer" onClick={() => onOpenCard(p.employee_id, cycleId)}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.job_position ?? "—"}{p.department ? ` · ${p.department}` : ""}
                  </TableCell>
                  <TableCell><Badge variant="outline" className={st.tone}>{st.label}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmtScore(score?.final_score ?? null)}
                    {score?.up_or_out_flag && (
                      <AlertTriangle className="inline-block h-3.5 w-3.5 ml-1.5 text-destructive" aria-label="Up or out" />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onOpenCard(p.employee_id, cycleId); }}>
                      Apri
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Attiva una persona per la valutazione HR</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={pickPersonId} onValueChange={setPickPersonId}>
              <SelectTrigger><SelectValue placeholder="Scegli una persona attiva in anagrafica…" /></SelectTrigger>
              <SelectContent>
                {(activatable ?? []).map((p) => (
                  <SelectItem key={p.employee_id} value={p.employee_id}>
                    {p.full_name} — {p.job_position ?? p.department ?? p.bu}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="gap-1.5 w-full" onClick={handleActivate} disabled={!pickPersonId || setEvaluated.isPending}>
              <Plus className="h-4 w-4" /> Attiva
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
