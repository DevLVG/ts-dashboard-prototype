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
