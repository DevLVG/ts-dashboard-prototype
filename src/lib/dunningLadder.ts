// Dunning ladder — pure state-machine logic, shared by the receivables
// (customer) and payables (vendor) desks.
//
// DESIGN: no separate mutable "ladder state" table. State is DERIVED by
// reducing the append-only treasury_action_log (migration 059, domain
// DUNNING_CUSTOMER | PAYABLE_ESCALATION, migration 070) — same audit-first
// pattern the Reminders/Confirmations tabs already used ("decided" map
// reduced client-side from the log, see RemindersWorklist.tsx history).
// Kept dependency-free (no date-fns) so it can be unit-reasoned about and
// reused by both the customer and vendor tables without any React/query
// coupling.
//
// LADDER (Marcello, 2026-08-03 — supersedes Treasury-Decision-Rules-DRAFT
// §A.3/§A.4 cadence where they differ):
//   Stage 1 — first reminder/acknowledgement sent.
//   Stage 2 — re-reminder/further justification, allowed once >= N days
//     have passed since stage 1 with no payment/response (customers: N =
//     dunning_config.stage2_after_days, default 7).
//   Stage 3 — CUSTOMERS ONLY, firmer tone, allowed once >= M days have
//     passed since stage 2 (default 30 = "after 1 month"). Vendors never
//     reach stage 3 — there is no harsher vendor-facing template; Marcello
//     2026-08-03: "no Stage-3 harshness toward vendors, any real tension
//     escalates INTERNALLY."
//   Escalate — automatic once the top stage for that ladder (3 for
//     customers, 2 for vendors) has sat for >= escalate_grace_days with no
//     resolution, OR a manual "Escalate to CEO" click at any time.
//   Resolved — manual: treasurer marks the item closed (paid, disputed,
//     payment plan agreed, ...), stopping the ladder.
import type { DunningConfigRow } from "@/data/treasuryLive";

export type LadderAction = "stage1_sent" | "stage2_sent" | "stage3_sent" | "escalate_ceo" | "resolved";

export interface LadderLogEntry {
  action: string;
  occurred_at: string;
  reason?: string | null;
}

export interface LadderState {
  stage: 0 | 1 | 2 | 3;
  stage1At: Date | null;
  stage2At: Date | null;
  stage3At: Date | null;
  lastActionAt: Date | null;
  lastReason: string | null;
  escalatedManually: boolean;
  escalatedAt: Date | null;
  resolved: boolean;
  resolvedAt: Date | null;
}

export const EMPTY_LADDER_STATE: LadderState = {
  stage: 0, stage1At: null, stage2At: null, stage3At: null, lastActionAt: null, lastReason: null,
  escalatedManually: false, escalatedAt: null, resolved: false, resolvedAt: null,
};

/** Reduce a chronologically-unordered slice of the action log for ONE
 * entity_ref into its current ladder state. A later `resolved` re-opens
 * (via a fresh stage1_sent) simply by that action's own case resetting the
 * resolved flag — matches "customer pays, then owes again next month". */
export const deriveLadderState = (entries: LadderLogEntry[]): LadderState => {
  const sorted = [...entries].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  const s: LadderState = { ...EMPTY_LADDER_STATE };
  for (const e of sorted) {
    const t = new Date(e.occurred_at);
    s.lastActionAt = t;
    s.lastReason = e.reason ?? s.lastReason;
    switch (e.action as LadderAction) {
      case "stage1_sent":
        s.stage = Math.max(s.stage, 1) as LadderState["stage"];
        s.stage1At = t;
        s.resolved = false; s.resolvedAt = null;
        break;
      case "stage2_sent":
        s.stage = Math.max(s.stage, 2) as LadderState["stage"];
        s.stage2At = t;
        break;
      case "stage3_sent":
        s.stage = Math.max(s.stage, 3) as LadderState["stage"];
        s.stage3At = t;
        break;
      case "escalate_ceo":
        s.escalatedManually = true;
        s.escalatedAt = t;
        break;
      case "resolved":
        s.resolved = true;
        s.resolvedAt = t;
        break;
      default:
        break; // unknown/legacy action value — ignore rather than throw
    }
  }
  return s;
};

export interface LadderConfig {
  stage2AfterDays: number;
  stage3AfterDays: number;
  escalateGraceDays: number;
  /** 3 for the customer ladder (stage 1/2/3), 2 for the vendor ladder
   * (stage 1/2 only — no stage 3 vendor-facing template exists). */
  maxStage: 2 | 3;
}

export const ladderConfigFromDb = (cfg: DunningConfigRow | undefined, maxStage: 2 | 3): LadderConfig => ({
  stage2AfterDays: cfg?.stage2_after_days ?? 7,
  stage3AfterDays: cfg?.stage3_after_days ?? 30,
  escalateGraceDays: cfg?.escalate_grace_days ?? 14,
  maxStage,
});

const DAY_MS = 24 * 60 * 60 * 1000;

const topStageAt = (s: LadderState, maxStage: 2 | 3): Date | null =>
  maxStage === 3 ? s.stage3At : s.stage2At;

/** True once the ladder has run its course with no resolution — either the
 * top stage sat for >= escalateGraceDays, or a human escalated manually. */
export const isEscalationDue = (s: LadderState, cfg: LadderConfig, now: Date): boolean => {
  if (s.resolved) return false;
  if (s.escalatedManually) return true;
  const at = topStageAt(s, cfg.maxStage);
  if (s.stage < cfg.maxStage || !at) return false;
  return now.getTime() - at.getTime() > cfg.escalateGraceDays * DAY_MS;
};

export interface NextAction {
  nextStage: 1 | 2 | 3 | null;
  /** null = eligible right now (or no cadence gate applies — e.g. stage 1). */
  eligibleAt: Date | null;
}

/** What action becomes available next, and from when (Marcello's cadence
 * gate — stage 2 "allowed after 7 days", stage 3 "after 1 month" from
 * stage 2). Returns nextStage:null once the ladder is at its max stage or
 * resolved/escalated (the only remaining actions are Escalate/Resolve,
 * handled separately by the caller). */
export const nextAction = (s: LadderState, cfg: LadderConfig): NextAction => {
  if (s.resolved) return { nextStage: null, eligibleAt: null };
  if (s.stage === 0) return { nextStage: 1, eligibleAt: null };
  if (s.stage === 1) {
    const at = s.stage1At ? new Date(s.stage1At.getTime() + cfg.stage2AfterDays * DAY_MS) : null;
    return { nextStage: 2, eligibleAt: at };
  }
  if (s.stage === 2 && cfg.maxStage >= 3) {
    const at = s.stage2At ? new Date(s.stage2At.getTime() + cfg.stage3AfterDays * DAY_MS) : null;
    return { nextStage: 3, eligibleAt: at };
  }
  return { nextStage: null, eligibleAt: null };
};

export type LadderStatusKind = "not_started" | "stage_sent" | "escalate" | "resolved";

export interface LadderStatus {
  kind: LadderStatusKind;
  stage: 0 | 1 | 2 | 3;
  at: Date | null;
}

export const computeLadderStatus = (s: LadderState, cfg: LadderConfig, now: Date): LadderStatus => {
  if (s.resolved) return { kind: "resolved", stage: s.stage, at: s.resolvedAt };
  if (isEscalationDue(s, cfg, now)) return { kind: "escalate", stage: s.stage, at: s.escalatedAt ?? topStageAt(s, cfg.maxStage) };
  if (s.stage === 0) return { kind: "not_started", stage: 0, at: null };
  const at = s.stage === 3 ? s.stage3At : s.stage === 2 ? s.stage2At : s.stage1At;
  return { kind: "stage_sent", stage: s.stage, at };
};
