// Supabase client — read-only access to trio-sporting-pm P&L views.
//
// Access-layer choice (2026-07-19): the P&L views (pnl_management, pnl_by_bu)
// are readable by the `anon` role (default PostgREST grants; the views run with
// owner privileges, so the service_role-only RLS on the underlying qoyod_*
// tables does not block them). A direct client-side read with the anon key is
// therefore the simplest working option for v1 — no serverless proxy needed.
//
// SECURITY POSTURE (documented, to harden before production):
// - The anon key is a publishable key by design, but because the views bypass
//   table RLS, anyone holding it can read the aggregated P&L. Before any
//   production deploy, gate the app behind auth (R1 requires Google SSO) and
//   restrict the views to `authenticated` (revoke anon SELECT), or move reads
//   behind a server-side proxy.
// - Keys live ONLY in env vars (VITE_*). Nothing is hardcoded or committed.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: { persistSession: false }, // read-only usage, no auth session yet
    })
  : null;
