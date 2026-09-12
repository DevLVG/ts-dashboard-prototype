// HR > Valutazione (spec §2.3): il valutatore in sessione dà i propri
// punteggi, voce per voce, con commento obbligatorio su 1/2/5. Ognuno vede
// solo i propri punteggi finché il ciclo non è chiuso — enforced lato DB
// (RLS "own_or_closed_cycle_read", migration 091), non solo qui: card.evaluations
// arriva già filtrato da Supabase per l'utente in sessione.
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  useHrCard, useHrReviewerWeights, useHrCycles, useUpsertEvaluation, type HrComponent,
} from "@/data/hrLive";

const COMPONENT_LABEL: Record<HrComponent, string> = { hard: "Obiettivi hard (50%)", soft: "Obiettivi soft (20%)", value: "Attitudine e valori (30%)" };
const requiresComment = (score: number) => [1, 2, 5].includes(score);

interface Props { personId: string; cycleId: string }

export const HrEvaluationTab = ({ personId, cycleId }: Props) => {
  const { session } = useAuth();
  const reviewerEmail = (session?.user?.email ?? "").toLowerCase();
  const { toast } = useToast();

  const { data: card, isLoading, refetch } = useHrCard(personId, cycleId);
  const { data: weights } = useHrReviewerWeights(personId);
  const { data: cycles } = useHrCycles();
  const upsert = useUpsertEvaluation();

  const cycle = useMemo(() => cycles?.find((c) => c.cycle_id === cycleId), [cycles, cycleId]);
  const isReviewer = useMemo(
    () => (weights ?? []).some((w) => w.reviewer_email.toLowerCase() === reviewerEmail),
    [weights, reviewerEmail],
  );
  const cycleOpen = cycle?.status === "open" || cycle?.status === "closing";

  const [draft, setDraft] = useState<Record<number, { score: string; comment: string }>>({});

  // Prefill from the server, but MERGE rather than replace: hr_upsert_evaluation's
  // onSuccess invalidates ["hr","card"], so every single save mid-form triggers a
  // refetch here — a naive full-replace effect (keyed only on `card`/reviewerEmail)
  // would wipe out whatever the reviewer had already typed into OTHER, not-yet-saved
  // rows the instant one row's save round-trip lands, dropping input. Found live
  // during Playwright verification (2026-09-12): a 4-objective test card lost its
  // 4th score every time because saving objective 3 raced the still-in-flight edit
  // on objective 4. Fix: only seed a row's draft ONCE per (personId, cycleId, objective)
  // — resetKey below changes only when the card itself changes identity (switching
  // person/cycle), never on a same-card refetch.
  const resetKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!card) return;
    const resetKey = `${personId}:${cycleId}`;
    const isFreshCard = resetKeyRef.current !== resetKey;
    resetKeyRef.current = resetKey;
    setDraft((prev) => {
      const next = isFreshCard ? {} : { ...prev };
      for (const o of card.objectives) {
        if (!isFreshCard && next[o.objective_id]) continue; // keep the reviewer's in-progress edit
        const mine = card.evaluations.find((e) => e.objective_id === o.objective_id && e.reviewer_email.toLowerCase() === reviewerEmail);
        const proposed = card.proposed.find((p) => p.objective_id === o.objective_id);
        next[o.objective_id] = {
          score: mine ? String(mine.score) : (o.component === "hard" && proposed?.proposed_score != null ? String(proposed.proposed_score) : ""),
          comment: mine?.comment ?? "",
        };
      }
      return next;
    });
  }, [card, reviewerEmail, personId, cycleId]);

  if (isLoading || !card) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (!cycle) return <p className="text-sm text-muted-foreground">Ciclo non trovato.</p>;
  if (!isReviewer) {
    return (
      <Card className="p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Il tuo account ({reviewerEmail || "sessione senza email"}) non è tra i valutatori assegnati a questa persona.
        </p>
      </Card>
    );
  }
  if (!cycleOpen) {
    return (
      <Card className="p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">
          Il ciclo "{cycle.label}" non è aperto alla valutazione (stato: {cycle.status}).
        </p>
      </Card>
    );
  }

  const save = async (objectiveId: number) => {
    const d = draft[objectiveId];
    const scoreNum = parseFloat(d?.score ?? "");
    if (Number.isNaN(scoreNum) || scoreNum < 1 || scoreNum > 5) {
      toast({ title: "Punteggio non valido", description: "Inserisci un valore tra 1 e 5.", variant: "destructive" });
      return;
    }
    if (requiresComment(scoreNum) && !(d.comment ?? "").trim()) {
      toast({ title: "Commento obbligatorio", description: "Un punteggio di 1, 2 o 5 richiede un breve commento.", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({ p_objective_id: objectiveId, p_score: scoreNum, p_comment: d.comment || null });
      toast({ title: "Punteggio salvato" });
      refetch();
    } catch (e) {
      toast({ title: "Errore nel salvataggio", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="text-xs text-muted-foreground">
        Ciclo "{cycle.label}" — stai valutando come <Badge variant="outline">{reviewerEmail}</Badge>. I tuoi punteggi restano visibili solo a te finché il ciclo non viene chiuso.
      </div>
      {(["hard", "soft", "value"] as const).map((component) => {
        const rows = card.objectives.filter((o) => o.component === component);
        if (rows.length === 0) return null;
        return (
          <Card key={component} className="p-6 shadow-sm space-y-4">
            <h4 className="font-heading text-base tracking-wide">{COMPONENT_LABEL[component]}</h4>
            {rows.map((o) => {
              const mine = card.evaluations.find((e) => e.objective_id === o.objective_id && e.reviewer_email.toLowerCase() === reviewerEmail);
              const proposed = card.proposed.find((p) => p.objective_id === o.objective_id);
              const d = draft[o.objective_id] ?? { score: "", comment: "" };
              const scoreNum = parseFloat(d.score);
              const deviation = mine && proposed?.proposed_score != null ? mine.score - proposed.proposed_score : null;
              return (
                <div key={o.objective_id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-sm">{o.title}</p>
                      <p className="text-xs text-muted-foreground">{o.description}</p>
                      {component === "hard" && proposed && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Proposta sistema: <span className="font-medium">{proposed.proposed_score ?? "manuale"}</span> — {proposed.proposed_basis}
                        </p>
                      )}
                    </div>
                    {mine && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      type="number" min={1} max={5} step={0.5} className="w-20 h-9"
                      value={d.score}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [o.objective_id]: { ...prev[o.objective_id], score: e.target.value } }))}
                    />
                    <Textarea
                      className="flex-1 min-w-[200px] h-9 min-h-9 py-2"
                      placeholder={requiresComment(scoreNum) ? "Commento obbligatorio per 1, 2 o 5…" : "Commento (opzionale)…"}
                      value={d.comment}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [o.objective_id]: { ...prev[o.objective_id], comment: e.target.value } }))}
                    />
                    <Button size="sm" onClick={() => save(o.objective_id)} disabled={upsert.isPending}>
                      {upsert.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salva"}
                    </Button>
                  </div>
                  {deviation != null && Math.abs(deviation) > 0.01 && (
                    <p className="text-xs text-amber-500">
                      Scostamento dalla proposta: {deviation > 0 ? "+" : ""}{deviation.toFixed(1)}
                    </p>
                  )}
                </div>
              );
            })}
          </Card>
        );
      })}
    </div>
  );
};
