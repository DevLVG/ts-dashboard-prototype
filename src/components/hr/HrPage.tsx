// CLEVER HR — "Obiettivi e valutazione" (route /hr). Standalone page (same
// pattern as Report/Confirmations/CashForecast — own <DashboardNav/> mount,
// own role gate) hosting the four screens from the spec as tabs: Persone,
// Scheda, Valutazione, Cicli (HR-Specifica-CLEVER-HR_2026-09-12_IT.md §2).
import { useMemo, useState } from "react";
import { useSearchParams, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { resolveRole, landingPageFor } from "@/lib/roles";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { useHrCycles } from "@/data/hrLive";
import { HrPeopleTab } from "@/components/hr/HrPeopleTab";
import { HrCardTab } from "@/components/hr/HrCardTab";
import { HrEvaluationTab } from "@/components/hr/HrEvaluationTab";
import { HrCyclesTab } from "@/components/hr/HrCyclesTab";

export const HrPage = () => {
  const { session, loading: authLoading } = useAuth();
  const role = resolveRole(session?.user?.email);
  // leveredge + ceo + administration — spec §5 "visibile ai ruoli Leveredge,
  // CEO e Amministrazione".
  const allowed = role === "leveredge" || role === "ceo" || role === "administration";

  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<string>(params.get("view") ?? "people");
  const personId = params.get("person") ?? undefined;

  const { data: cycles } = useHrCycles();
  const openCycle = useMemo(() => cycles?.find((c) => c.status === "open" || c.status === "closing"), [cycles]);
  const cycleId = params.get("cycle") ?? openCycle?.cycle_id;

  const goToCard = (newPersonId: string, newCycleId?: string) => {
    const next = new URLSearchParams(params);
    next.set("view", "card");
    next.set("person", newPersonId);
    if (newCycleId) next.set("cycle", newCycleId);
    setParams(next);
    setTab("card");
  };

  const setTabAndParam = (t: string) => {
    setTab(t);
    const next = new URLSearchParams(params);
    next.set("view", t);
    setParams(next);
  };

  if (authLoading) return null;
  if (!allowed) return <Navigate to={`/${landingPageFor(role)}`} replace />;

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav currentPage="hr" />
      <main className="container mx-auto px-4 py-6 space-y-5">
        <div>
          <h1 className="font-heading text-2xl tracking-wide text-foreground">HR — Objectives & Performance Review</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Hard, soft and values objectives per person; quarterly review under the system agreed in January 2026.
          </p>
        </div>

        {!isSupabaseConfigured ? (
          <p className="text-sm text-destructive">Supabase is not configured — the HR section cannot load.</p>
        ) : (
          <Tabs value={tab} onValueChange={setTabAndParam}>
            <TabsList>
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="card" disabled={!personId}>Card</TabsTrigger>
              <TabsTrigger value="evaluate" disabled={!personId}>Evaluation</TabsTrigger>
              <TabsTrigger value="cycles">Cycles</TabsTrigger>
            </TabsList>

            <TabsContent value="people" className="mt-4">
              <HrPeopleTab role={role} cycleId={cycleId} onOpenCard={goToCard} />
            </TabsContent>
            <TabsContent value="card" className="mt-4">
              {personId && cycleId ? (
                <HrCardTab personId={personId} cycleId={cycleId} role={role} />
              ) : (
                <p className="text-sm text-muted-foreground">Select a person from the People screen.</p>
              )}
            </TabsContent>
            <TabsContent value="evaluate" className="mt-4">
              {personId && cycleId ? (
                <HrEvaluationTab personId={personId} cycleId={cycleId} />
              ) : (
                <p className="text-sm text-muted-foreground">Select a person from the People screen.</p>
              )}
            </TabsContent>
            <TabsContent value="cycles" className="mt-4">
              <HrCyclesTab role={role} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};
