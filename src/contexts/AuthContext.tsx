// Auth context — Supabase email+password sessions for the CLEVER cockpit.
//
// The provider tracks the Supabase session (restored from localStorage on
// load, refreshed automatically) and exposes signIn / signOut. RequireAuth
// gates every data route: nothing renders — and therefore no PostgREST query
// fires — until a valid session exists. Combined with the DB-side grants
// (financial views readable by `authenticated` only), this is real security,
// not just a hidden UI.
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";

interface AuthContextValue {
  session: Session | null;
  /** True while the persisted session is being restored on first load. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  signIn: async () => ({ error: "Auth not initialised" }),
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    // Restore any persisted session, then follow every auth state change
    // (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, ...).
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: "Supabase is not configured" };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

/** Splash shown while the persisted session is restored (sub-second). */
const AuthLoading = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="text-center space-y-3 animate-pulse">
      <p className="font-heading text-3xl tracking-widest text-foreground">
        TRIO SPORTING
      </p>
      <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Restoring session…
      </p>
    </div>
  </div>
);

/**
 * Route guard — wraps ALL app routes (react-router v6 layout route).
 * No session -> redirect to /login (remembering where the user was going).
 */
export const RequireAuth = () => {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <p className="font-heading text-2xl tracking-wide">CLEVER Cockpit</p>
          <p className="text-sm text-destructive">
            Supabase is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
            missing) — the cockpit cannot start.
          </p>
        </div>
      </div>
    );
  }
  if (loading) return <AuthLoading />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
};
