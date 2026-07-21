// Supabase client — trio-sporting-pm (PostgREST reads + Auth).
//
// SECURITY POSTURE (hardened 2026-07-21 for the production go-live):
// - The app is gated behind Supabase Auth (email + password). Every route
//   sits behind the auth guard (src/contexts/AuthContext + RequireAuth).
// - The financial views are no longer readable by the `anon` role: SELECT
//   was REVOKEd from `anon` and GRANTed to `authenticated` (grants backup in
//   CLEVER/Cockpit/supabase/backups/grants-backup-2026-07-21.sql). The anon
//   key alone can therefore no longer read any P&L / cash-flow / balance-sheet
//   data — a signed-in session (JWT role `authenticated`) is required.
// - Keys live ONLY in env vars (VITE_*). The anon key is publishable by
//   design; the service key must never appear in this repo or any bundle.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true, // keep the session across reloads (localStorage)
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

// ---------------------------------------------------- graceful error mapping

/** PostgREST "permission denied" (SQLSTATE 42501) — happens when the request
 * reaches the views without an `authenticated` JWT (expired/broken session):
 * the views are readable by `authenticated` only since 2026-07-21. */
export const isPermissionDeniedError = (err: unknown): boolean => {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return e.code === "42501" || (e.message ?? "").toLowerCase().includes("permission denied");
};

export const SESSION_REQUIRED_MESSAGE =
  "Your session no longer has access to the live financial data — please sign out and sign in again.";

/** Normalise a PostgREST error into a user-presentable Error. Permission
 * denials become a clean "session required" message instead of raw SQL text. */
export const toFriendlyError = (err: unknown): Error => {
  if (isPermissionDeniedError(err)) {
    const e = new Error(SESSION_REQUIRED_MESSAGE);
    e.name = "PermissionDeniedError";
    return e;
  }
  return err instanceof Error ? err : new Error(String((err as { message?: string })?.message ?? err));
};
