// Login — Supabase email+password, same dark/gold executive language as the
// cockpit (Bebas Neue headings, gold accent, charcoal surfaces). Deliberately
// spare: one card, one action.
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Lock, LogIn } from "lucide-react";
import tsLogo from "@/assets/ts-logo.png";

const Login = () => {
  const { session, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in -> straight to the cockpit.
  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from ?? "/overview";
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: err } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (err) {
      setError(
        err === "Invalid login credentials"
          ? "Invalid email or password."
          : err,
      );
      return;
    }
    const from = (location.state as { from?: string } | null)?.from ?? "/overview";
    navigate(from, { replace: true });
  };

  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center p-6 overflow-hidden">
      {/* Quiet atmosphere: a single gold radial glow behind the card */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(600px 420px at 50% 38%, hsl(42 45% 66% / 0.07), transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="flex flex-col items-center mb-8 text-center">
          <img src={tsLogo} alt="Trio Sporting" className="h-16 w-auto mb-4" />
          <h1 className="font-heading text-4xl tracking-widest">TRIO SPORTING</h1>
          <div className="mt-2 h-px w-16 bg-gold/60" />
          <p className="mt-3 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            {/* On-screen label only (CEO live-review request, 2026-08-08) —
                see the matching note in DashboardNav.tsx. */}
            CLEVER · CEO Dashboard
          </p>
        </div>

        <Card className="p-6 shadow-xl border-border/60">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@triosporting.com"
                className="bg-background"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="bg-background"
              />
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className="w-full gap-2 font-semibold"
            >
              {submitting ? (
                "Signing in…"
              ) : (
                <>
                  <LogIn className="h-4 w-4" /> Sign in
                </>
              )}
            </Button>
          </form>
        </Card>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3" />
          Private financial data — authorised users only.
        </p>
      </div>
    </div>
  );
};

export default Login;
