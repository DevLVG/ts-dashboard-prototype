// Dunning SEND mechanism — the one function every "Send" button in the
// Treasury desk ultimately calls, receivables or payables.
//
// GOVERNANCE (non-negotiable, Marcello): reminder/acknowledgement emails are
// EXTERNAL communications. This function performs every step of the real
// mechanism (recipient resolved by the caller, template already filled,
// dispatch attempted) but the dispatch itself is gated by a SERVER-SIDE
// switch — dunning_config.dunning_send_enabled (migration 070) — which
// defaults false and stays false until Marcello/Arwa arm go-live. With the
// switch off, this function does the full accounting (returns a result the
// caller logs to treasury_action_log) WITHOUT calling the network.
//
// TRANSPORT: a Supabase Edge Function, `send-dunning-email`, following the
// SAME SMTP pattern already live elsewhere in the Trio stack (Gmail
// Workspace SMTP via analyst@leveredge.pro — see
// CLEVER/Marketing/Web-App/booking-widget/lib/alert-email.js and
// member-app/app/api/brochure-email/route.js). That function's CODE is
// written (supabase/functions/send-dunning-email/index.ts, this repo's
// CLEVER/Cockpit/supabase/functions/) but — same as the repo's other
// documented Edge Function, batch-decision — is NOT YET DEPLOYED: this
// environment has no Supabase CLI project link and no SMTP secret
// provisioned for it. Calling it here fails gracefully (caught, reported as
// mode:"error", never thrown into the UI) rather than pretending to send.
// Deploying it (`supabase functions deploy send-dunning-email` + `supabase
// secrets set SMTP_HOST=... SMTP_USER=... SMTP_PASS=...`) is the ONE
// remaining step before dunning_send_enabled can be meaningfully armed —
// flagged explicitly in the fix-8-treasury delivery report, not silently
// assumed done.
import { supabase } from "@/lib/supabaseClient";

export type DunningSendKind = "customer" | "vendor";
export type DunningSendMode = "rehearsal" | "test" | "live" | "no_recipient" | "error";

export interface DunningSendResult {
  dispatched: boolean;
  mode: DunningSendMode;
  detail: string;
}

export interface DunningSendInput {
  kind: DunningSendKind;
  entityRef: string;
  to: string | null;
  subject: string;
  body: string;
  /** dunning_config.dunning_send_enabled — the global switch. */
  sendEnabled: boolean;
  /** When true, ALWAYS targets `testRecipient` regardless of `to` — the
   * "send a test to analyst@leveredge.pro only, never to real
   * counterparties" path (Marcello, 2026-08-03). Independent of
   * sendEnabled, so the pipe can be exercised even while go-live sending
   * stays off. */
  testMode?: boolean;
  testRecipient: string;
}

const invokeSendFunction = async (payload: { to: string; subject: string; body: string; kind: DunningSendKind; entityRef: string }): Promise<DunningSendResult> => {
  if (!supabase) {
    return { dispatched: false, mode: "error", detail: "Supabase client is not configured in this environment." };
  }
  try {
    const { error } = await supabase.functions.invoke("send-dunning-email", { body: payload });
    if (error) throw error;
    return { dispatched: true, mode: payload.subject.startsWith("[TEST]") ? "test" : "live", detail: `Sent to ${payload.to}.` };
  } catch (err) {
    // Expected in THIS environment today: send-dunning-email is written but
    // not deployed (no Supabase CLI project link here) — see file header.
    return {
      dispatched: false,
      mode: "error",
      detail:
        "Could not reach the send function (send-dunning-email is not yet deployed in this project — " +
        "deployment + SMTP secrets are the one remaining go-live step). " +
        `Underlying error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
};

export const sendDunningEmail = async (input: DunningSendInput): Promise<DunningSendResult> => {
  if (input.testMode) {
    return invokeSendFunction({
      to: input.testRecipient,
      subject: `[TEST] ${input.subject}`,
      body: `(Test send — original recipient would have been: ${input.to ?? "no email on file"})\n\n${input.body}`,
      kind: input.kind,
      entityRef: input.entityRef,
    });
  }
  if (!input.sendEnabled) {
    return {
      dispatched: false,
      mode: "rehearsal",
      detail: "Sending activates at go-live — nothing was sent. Decision logged to the audit trail.",
    };
  }
  if (!input.to) {
    return { dispatched: false, mode: "no_recipient", detail: "No email on file — cannot send even though sending is armed." };
  }
  return invokeSendFunction({ to: input.to, subject: input.subject, body: input.body, kind: input.kind, entityRef: input.entityRef });
};
