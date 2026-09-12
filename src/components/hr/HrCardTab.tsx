// HR > Scheda della persona (spec §2.2): tre blocchi (hard 50% / soft 20% /
// valori 30%), punteggio finale, fascia bonus, aumento, avviso up-or-out.
// Display-only overview — l'inserimento dei punteggi avviene nella
// schermata Valutazione (HrEvaluationTab).
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, FileDown, Paperclip } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Role } from "@/lib/roles";
import {
  useHrCard, useHrScores, useHrReviewerWeights, useHrCycles, useHrEvaluatedPeople,
  reviewerLabel, type HrComponent,
} from "@/data/hrLive";
import { generateHrOutcomePdf } from "@/components/hr/hrPdf";
import { HrEvidencePanel } from "@/components/hr/HrEvidencePanel";

const fmtScore = (v: number | null) => (v == null ? "—" : v.toFixed(2));
const fmtSAR = (v: number | null) => (v == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(v)) + " SAR");
const COMPONENT_LABEL: Record<HrComponent, string> = { hard: "Obiettivi hard (50%)", soft: "Obiettivi soft (20%)", value: "Attitudine e valori (30%)" };

interface Props { personId: string; cycleId: string; role: Role }

export const HrCardTab = ({ personId, cycleId }: Props) => {
  const { toast } = useToast();
  const { data: card, isLoading, isError } = useHrCard(personId, cycleId);
  const { data: scores } = useHrScores(cycleId);
  const { data: weights } = useHrReviewerWeights(personId);
  const { data: cycles } = useHrCycles();
  const { data: people } = useHrEvaluatedPeople();
  const [evidenceObjectiveId, setEvidenceObjectiveId] = useState<number | null>(null);

  const cycle = useMemo(() => cycles?.find((c) => c.cycle_id === cycleId), [cycles, cycleId]);
  const person = useMemo(() => people?.find((p) => p.employee_id === personId), [people, personId]);
  const score = useMemo(() => scores?.find((s) => s.person_id === personId), [scores, personId]);

  const handlePdf = async () => {
    if (!score || !card) return;
    try {
      await generateHrOutcomePdf(score, cycle?.label ?? cycleId, card.objectives, card.evaluations);
    } catch (e) {
      toast({ title: "Errore nella generazione del PDF", description: (e as Error).message, variant: "destructive" });
    }
  };

  if (isError) return <p className="text-sm text-destructive">Non è stato possibile caricare la scheda.</p>;
  if (isLoading || !card) return <p className="text-sm text-muted-foreground">Caricamento…</p>;

  return (
    <div className="space-y-5">
      <Card className="p-6 shadow-sm">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-xl font-heading tracking-wide">{person?.full_name ?? personId}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {person?.job_position ?? "—"}{person?.department ? ` · ${person.department}` : ""} · Ciclo: {cycle?.label ?? cycleId}
            </p>
          </div>
          {cycle?.status === "closed" && score && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePdf}>
              <FileDown className="h-4 w-4" /> Scarica esito PDF
            </Button>
          )}
        </div>

        {score?.up_or_out_flag && (
          <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            <span className="text-destructive font-medium">
              Revisione obbligatoria (up or out) — un valore ha punteggio 1 o 2, oppure il finale è 1 o 2. Richiede il confronto con MD e CEO.
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          <SummaryTile label="Punteggio finale" value={fmtScore(score?.final_score ?? null)} />
          <SummaryTile label="Fascia bonus" value={score?.bonus_months == null ? "—" : `${score.bonus_months} mensilità`} />
          <SummaryTile label="Bonus" value={fmtSAR(score?.bonus_amount_sar ?? null)} />
          <SummaryTile label="Aumento" value={fmtSAR(score?.salary_increase_sar ?? null)} />
          <SummaryTile
            label="Copertura valutatori"
            value={score ? `${score.reviewers_with_score}/${score.reviewers_expected}` : "—"}
            tone={score?.all_scored_complete ? "text-emerald-400" : "text-amber-500"}
          />
        </div>

        {weights && weights.length > 0 && (
          <p className="text-xs text-muted-foreground mt-3">
            Valutatori: {weights.map((w) => `${reviewerLabel(w.reviewer_email)} ${w.weight_pct}%`).join(" · ")}
            {weights.some((w) => w.source === "manual_override") && " (pesi personalizzati)"}
          </p>
        )}
      </Card>

      {(["hard", "soft", "value"] as const).map((component) => {
        const rows = card.objectives.filter((o) => o.component === component);
        if (rows.length === 0) return null;
        return (
          <Card key={component} className="p-6 shadow-sm">
            <h4 className="font-heading text-base tracking-wide mb-3">{COMPONENT_LABEL[component]}</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Voce</TableHead>
                  <TableHead>Target / indicatori</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                  {component === "hard" && <TableHead className="text-right">Risultato</TableHead>}
                  {component === "hard" && <TableHead>Proposta</TableHead>}
                  <TableHead>Punteggi valutatori</TableHead>
                  {component === "hard" && <TableHead className="text-right">Prove</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((o) => {
                  const proposed = card.proposed.find((p) => p.objective_id === o.objective_id);
                  const evals = card.evaluations.filter((e) => e.objective_id === o.objective_id);
                  const evidenceCount = card.evidence.filter((e) => e.objective_id === o.objective_id).length;
                  return (
                    <TableRow key={o.objective_id}>
                      <TableCell className="font-medium max-w-[220px]">{o.title}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[260px]">{o.description ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{Math.round(o.weight * 100)}%</TableCell>
                      {component === "hard" && (
                        <TableCell className="text-right tabular-nums">
                          {o.result_numeric ?? "—"}{o.target_unit === "percent" ? "%" : ""}
                        </TableCell>
                      )}
                      {component === "hard" && (
                        <TableCell className="text-xs">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className={proposed?.has_evidence === false ? "text-destructive" : "text-muted-foreground"}>
                                {proposed?.proposed_score ?? "—"}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">{proposed?.proposed_basis ?? "—"}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                      )}
                      <TableCell className="text-xs">
                        {evals.length === 0 ? "—" : evals.map((e) => `${reviewerLabel(e.reviewer_email)}: ${e.score}`).join(" · ")}
                      </TableCell>
                      {component === "hard" && (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setEvidenceObjectiveId(o.objective_id)}>
                            <Paperclip className="h-3.5 w-3.5" /> {evidenceCount || ""}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        );
      })}

      {evidenceObjectiveId != null && (
        <HrEvidencePanel objectiveId={evidenceObjectiveId} open onOpenChange={(o) => !o && setEvidenceObjectiveId(null)} />
      )}
    </div>
  );
};

const SummaryTile = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="rounded-md border bg-muted/20 px-3 py-2.5">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className={`text-lg font-heading mt-0.5 ${tone ?? ""}`}>{value}</p>
  </div>
);
