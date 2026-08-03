// Treasury — operational workspace (route /treasury).
//
// REBUILT 2026-08-03 (fix-8-treasury) per Marcello's live-review spec: "qui
// serve per lavorare — molto operativo." The workspace has TWO tabs:
//   - Receivables & Payables (default) — TreasuryDesk: circles, DSO
//     card, receivables aging + customer-lines ladder (legacy pool nested
//     inside it), payables mirror block. This is where the old standalone
//     Reminders tab's job now lives — "one operational surface, not two."
//   - Cash & Working Capital — TreasuryCash, UNCHANGED. Working capital
//     lives here per Marcello; this stays the read-only monitoring surface.
//
// Confirmations PROMOTED OUT (live review #3, 2026-08-03): it was sub-tab
// 4/4 here — Marcello reported its content wasn't visible to him inside
// Treasury. It's now its own standalone page (see
// src/components/confirmations/ConfirmationsPage.tsx, route /confirmations,
// own Admin-dropdown nav item) with the identical ConfirmationsWeekly
// component underneath, unchanged in content — only the chrome around it
// moved.
//
// Payment PRIORITIES/APPROVAL stays on its own nav item (/payments,
// CeoApprovalPanel) — a deliberate CEO-only surface per the mandate, not
// folded in here.
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ListChecks, Wallet } from "lucide-react";
import { TreasuryDesk } from "@/components/treasury/TreasuryDesk";
import { TreasuryCash } from "@/components/treasury/TreasuryCash";

export const TreasuryWorkspace = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading tracking-wide">TREASURY</h2>
        <p className="text-sm text-muted-foreground">
          The operational treasurer's desk — receivables and payables ladders, cash position, and working
          capital, all in one workspace.
        </p>
      </div>

      <Tabs defaultValue="desk">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="desk" className="gap-1.5"><ListChecks className="h-3.5 w-3.5" /> Receivables &amp; Payables</TabsTrigger>
          <TabsTrigger value="cash" className="gap-1.5"><Wallet className="h-3.5 w-3.5" /> Cash &amp; Working Capital</TabsTrigger>
        </TabsList>
        <TabsContent value="desk" className="mt-6"><TreasuryDesk /></TabsContent>
        <TabsContent value="cash" className="mt-6"><TreasuryCash /></TabsContent>
      </Tabs>
    </div>
  );
};
