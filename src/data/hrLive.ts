// LIVE data layer — CLEVER HR "Obiettivi e valutazione" section.
//
// Tables/views (migrations 087-092, CLEVER/Cockpit/supabase/migrations):
//   hr_cycles, hr_value_catalog, hr_objectives, hr_evidence,
//   hr_evaluations (+ _audit), hr_reviewer_weights (+ _audit),
//   v_hr_scores / v_hr_reviewer_final / v_hr_component_scores / v_hr_objective_proposed.
//
// WRITES: every write goes through a SECURITY DEFINER RPC (same pattern as
// catalogLive.ts / migration 039) — direct table INSERT/UPDATE/DELETE is
// service_role-only. Evaluation writes in particular resolve the reviewer
// from the caller's OWN JWT server-side (hr_upsert_evaluation) — a client
// can never write another reviewer's score, by construction, not by
// convention. hr_evidence is the one table with direct authenticated
// INSERT/DELETE (no audit trail needed for additive proof attachments).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";

// ------------------------------------------------------------------ types

export type HrComponent = "hard" | "soft" | "value";
export type HrCycleStatus = "scheduled" | "open" | "closing" | "closed";

export interface HrCycle {
  cycle_id: string;
  label: string;
  period_start: string;
  period_end: string;
  kind: "quarterly" | "final";
  status: HrCycleStatus;
  opened_at: string | null;
  opened_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
}

export interface HrObjective {
  objective_id: number;
  person_id: string | null;
  cycle_id: string | null;
  template_role: string | null;
  component: HrComponent;
  seq: number;
  title: string;
  description: string | null;
  weight: number;
  scoring_grid: Record<string, string> | null;
  target_numeric: number | null;
  target_unit: "SAR" | "percent" | "count" | null;
  result_numeric: number | null;
  result_note: string | null;
  measured_at: string | null;
}

export interface HrEvidence {
  evidence_id: number;
  objective_id: number;
  kind: "file" | "link" | "dashboard_ref";
  file_path: string | null;
  url: string | null;
  dashboard_ref: string | null;
  note: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface HrEvaluation {
  evaluation_id: number;
  objective_id: number;
  cycle_id: string;
  reviewer_email: string;
  score: number;
  comment: string | null;
  scored_at: string;
  updated_at: string;
}

export interface HrProposedScore {
  objective_id: number;
  proposed_score: number | null;
  proposed_basis: string | null;
  has_evidence: boolean;
}

export interface HrReviewerWeight {
  person_id: string;
  reviewer_email: string;
  weight_pct: number;
  source: "department_default" | "manual_override";
  set_by: string | null;
  set_at: string;
}

export interface HrScoreRow {
  person_id: string;
  cycle_id: string;
  full_name: string;
  department: string | null;
  job_position: string | null;
  final_score: number | null;
  all_scored_complete: boolean;
  reviewers_with_score: number;
  reviewers_expected: number;
  reviewer_breakdown: Record<string, { weight_pct: number; hard: number | null; soft: number | null; value: number | null; final: number | null; complete: boolean }>;
  bonus_months: number | null;
  bonus_amount_sar: number | null;
  salary_increase_sar: number | null;
  up_or_out_flag: boolean;
}

export interface HrEvaluatedPerson {
  employee_id: string;
  full_name: string;
  department: string | null;
  job_position: string | null;
  bu: string;
  status: string;
  hr_evaluated: boolean;
}

const REVIEWER_LABELS: Record<string, string> = {
  "marcello.piccardo@leveredge.pro": "Marcello",
  "arwa@triosporting.com": "Arwa",
  "ceo@triosporting.com": "Arwa",
  "admin@triosporting.com": "Marta",
  "direction@triosporting.com": "Marta",
};
export const reviewerLabel = (email: string): string => REVIEWER_LABELS[email.toLowerCase()] ?? email;

const need = () => { if (!supabase) throw new Error("Supabase is not configured"); return supabase; };

// --------------------------------------------------------------- queries

export const useHrCycles = () =>
  useQuery({
    queryKey: ["hr", "cycles"],
    enabled: isSupabaseConfigured,
    queryFn: async (): Promise<HrCycle[]> => {
      const { data, error } = await need().from("hr_cycles").select("*").order("period_start");
      if (error) throw toFriendlyError(error);
      return data as HrCycle[];
    },
  });

export const useHrEvaluatedPeople = () =>
  useQuery({
    queryKey: ["hr", "people"],
    enabled: isSupabaseConfigured,
    queryFn: async (): Promise<HrEvaluatedPerson[]> => {
      // v_hr_people_directory (migration 093), not personnel_master directly —
      // personnel_master has no authenticated RLS policy (service_role_all
      // only); this narrow, salary-free view is what makes it readable from
      // the browser. See that migration's header for the full story (found
      // live during Playwright verification, 2026-09-12).
      const { data, error } = await need()
        .from("v_hr_people_directory")
        .select("employee_id, full_name, department, job_position, bu, status, hr_evaluated")
        .eq("hr_evaluated", true)
        .order("full_name");
      if (error) throw toFriendlyError(error);
      return data as HrEvaluatedPerson[];
    },
  });

/** All active (non-hr_evaluated) personnel — for the "activate someone new" picker. */
export const useHrActivatablePeople = () =>
  useQuery({
    queryKey: ["hr", "activatable-people"],
    enabled: isSupabaseConfigured,
    queryFn: async (): Promise<HrEvaluatedPerson[]> => {
      const { data, error } = await need()
        .from("v_hr_people_directory")
        .select("employee_id, full_name, department, job_position, bu, status, hr_evaluated")
        .eq("status", "active")
        .eq("hr_evaluated", false)
        .order("full_name");
      if (error) throw toFriendlyError(error);
      return data as HrEvaluatedPerson[];
    },
  });

export const useHrScores = (cycleId?: string) =>
  useQuery({
    queryKey: ["hr", "scores", cycleId ?? "all"],
    enabled: isSupabaseConfigured,
    queryFn: async (): Promise<HrScoreRow[]> => {
      let q = need().from("v_hr_scores").select("*");
      if (cycleId) q = q.eq("cycle_id", cycleId);
      const { data, error } = await q;
      if (error) throw toFriendlyError(error);
      return data as HrScoreRow[];
    },
  });

export const useHrCard = (personId?: string, cycleId?: string) =>
  useQuery({
    queryKey: ["hr", "card", personId, cycleId],
    enabled: isSupabaseConfigured && !!personId && !!cycleId,
    queryFn: async (): Promise<{ objectives: HrObjective[]; proposed: HrProposedScore[]; evaluations: HrEvaluation[]; evidence: HrEvidence[] }> => {
      const client = need();
      const [obj, prop, evid] = await Promise.all([
        client.from("hr_objectives").select("*").eq("person_id", personId!).eq("cycle_id", cycleId!).order("component").order("seq"),
        client.from("v_hr_objective_proposed").select("*"),
        client.from("hr_evidence").select("*"),
      ]);
      if (obj.error) throw toFriendlyError(obj.error);
      if (prop.error) throw toFriendlyError(prop.error);
      if (evid.error) throw toFriendlyError(evid.error);
      const objectiveIds = new Set((obj.data as HrObjective[]).map((o) => o.objective_id));
      const evalRes = await client.from("hr_evaluations").select("*").eq("cycle_id", cycleId!);
      if (evalRes.error) throw toFriendlyError(evalRes.error);
      return {
        objectives: obj.data as HrObjective[],
        proposed: (prop.data as HrProposedScore[]).filter((p) => objectiveIds.has(p.objective_id)),
        evaluations: (evalRes.data as HrEvaluation[]).filter((e) => objectiveIds.has(e.objective_id)),
        evidence: (evid.data as HrEvidence[]).filter((e) => objectiveIds.has(e.objective_id)),
      };
    },
  });

/** Which evaluated people already have at least one objective in a given
 * cycle — used by the Persone screen to show "obiettivi da assegnare" vs.
 * a real in-progress status, without a heavier per-person query. */
export const useHrPersonObjectiveCounts = (cycleId?: string) =>
  useQuery({
    queryKey: ["hr", "objective-counts", cycleId],
    enabled: isSupabaseConfigured && !!cycleId,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await need().from("hr_objectives").select("person_id").eq("cycle_id", cycleId!).not("person_id", "is", null);
      if (error) throw toFriendlyError(error);
      const counts: Record<string, number> = {};
      for (const row of data as { person_id: string }[]) counts[row.person_id] = (counts[row.person_id] ?? 0) + 1;
      return counts;
    },
  });

export const useHrTemplates = () =>
  useQuery({
    queryKey: ["hr", "templates"],
    enabled: isSupabaseConfigured,
    queryFn: async (): Promise<HrObjective[]> => {
      const { data, error } = await need().from("hr_objectives").select("*").not("template_role", "is", null).order("template_role").order("component").order("seq");
      if (error) throw toFriendlyError(error);
      return data as HrObjective[];
    },
  });

export const useHrReviewerWeights = (personId?: string) =>
  useQuery({
    queryKey: ["hr", "reviewer-weights", personId],
    enabled: isSupabaseConfigured && !!personId,
    queryFn: async (): Promise<HrReviewerWeight[]> => {
      const { data, error } = await need().from("hr_reviewer_weights").select("*").eq("person_id", personId!);
      if (error) throw toFriendlyError(error);
      return data as HrReviewerWeight[];
    },
  });

export interface HrAuditRow {
  audit_id: number;
  changed_at: string;
  changed_by: string | null;
  [k: string]: unknown;
}

export const useHrEvaluationsAudit = (limit = 100) =>
  useQuery({
    queryKey: ["hr", "audit", "evaluations", limit],
    enabled: isSupabaseConfigured,
    queryFn: async (): Promise<HrAuditRow[]> => {
      const { data, error } = await need().from("hr_evaluations_audit").select("*").order("changed_at", { ascending: false }).limit(limit);
      if (error) throw toFriendlyError(error);
      return data as HrAuditRow[];
    },
  });

// -------------------------------------------------------------- mutations

const useHrRpc = <TArgs extends Record<string, unknown>, TResult>(fn: string, invalidateKeys: string[][]) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: TArgs): Promise<TResult> => {
      const { data, error } = await need().rpc(fn, args);
      if (error) throw toFriendlyError(error);
      return data as TResult;
    },
    onSuccess: () => invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k })),
  });
};

export const useUpsertEvaluation = () =>
  useHrRpc<{ p_objective_id: number; p_score: number; p_comment?: string | null }, HrEvaluation>(
    "hr_upsert_evaluation", [["hr", "card"], ["hr", "scores"]],
  );

export const useSetReviewerWeight = () =>
  useHrRpc<{ p_person_id: string; p_reviewer_email: string; p_weight_pct: number; p_actor: string; p_reason?: string | null }, HrReviewerWeight>(
    "hr_set_reviewer_weight", [["hr", "reviewer-weights"], ["hr", "scores"]],
  );

export const useOpenCycle = () =>
  useHrRpc<{ p_cycle_id: string; p_actor: string }, HrCycle>("hr_open_cycle", [["hr", "cycles"]]);

export const useCloseCycle = () =>
  useHrRpc<{ p_cycle_id: string; p_actor: string }, HrCycle>("hr_close_cycle", [["hr", "cycles"], ["hr", "scores"]]);

export const useUpsertObjective = () =>
  useHrRpc<Record<string, unknown>, HrObjective>("hr_upsert_objective", [["hr", "card"], ["hr", "templates"]]);

export const useSetObjectiveResult = () =>
  useHrRpc<{ p_objective_id: number; p_result_numeric: number | null; p_result_note?: string | null }, HrObjective>(
    "hr_set_objective_result", [["hr", "card"]],
  );

export const useSeedValueObjectives = () =>
  useHrRpc<{ p_person_id?: string | null; p_cycle_id?: string | null; p_template_role?: string | null }, HrObjective[]>(
    "hr_seed_value_objectives", [["hr", "card"]],
  );

export const useSetPersonEvaluated = () =>
  useHrRpc<{ p_person_id: string; p_evaluated: boolean; p_actor: string }, HrEvaluatedPerson>(
    "hr_set_person_evaluated", [["hr", "people"], ["hr", "activatable-people"]],
  );

/** Copy every objective from a template (or a prior cycle) into a new
 * (person, cycle) card — spec §2.4 "apre il successivo copiando gli
 * obiettivi ancora validi". Done client-side as N calls to
 * hr_upsert_objective (small N, at most ~20 rows per card) rather than a
 * dedicated RPC — keeps the write surface to the two already-audited
 * paths (objective definition + value-catalog seeding). */
export const copyObjectivesToCard = async (
  source: HrObjective[],
  personId: string,
  cycleId: string,
  actor: string,
): Promise<void> => {
  const client = need();
  const hardSoft = source.filter((o) => o.component !== "value");
  for (const o of hardSoft) {
    const { error } = await client.rpc("hr_upsert_objective", {
      p_person_id: personId, p_cycle_id: cycleId, p_component: o.component, p_seq: o.seq,
      p_title: o.title, p_description: o.description, p_weight: o.weight,
      p_scoring_grid: o.scoring_grid, p_target_numeric: o.target_numeric, p_target_unit: o.target_unit,
      p_actor: actor,
    });
    if (error) throw toFriendlyError(error);
  }
  const { error: valErr } = await client.rpc("hr_seed_value_objectives", { p_person_id: personId, p_cycle_id: cycleId });
  if (valErr) throw toFriendlyError(valErr);
};

// -------------------------------------------------------------- evidence

export const uploadHrEvidenceFile = async (objectiveId: number, file: File, actor: string, note?: string): Promise<void> => {
  const client = need();
  const path = `objective-${objectiveId}/${Date.now()}-${file.name}`;
  const up = await client.storage.from("hr-evidence").upload(path, file, { upsert: false });
  if (up.error) throw toFriendlyError(up.error);
  const { error } = await client.from("hr_evidence").insert({
    objective_id: objectiveId, kind: "file", file_path: path, note, uploaded_by: actor,
  });
  if (error) throw toFriendlyError(error);
};

export const addHrEvidenceLink = async (objectiveId: number, url: string, actor: string, note?: string): Promise<void> => {
  const { error } = await need().from("hr_evidence").insert({
    objective_id: objectiveId, kind: "link", url, note, uploaded_by: actor,
  });
  if (error) throw toFriendlyError(error);
};

export const hrEvidenceSignedUrl = async (filePath: string): Promise<string | null> => {
  const { data, error } = await need().storage.from("hr-evidence").createSignedUrl(filePath, 3600);
  if (error) throw toFriendlyError(error);
  return data.signedUrl;
};
