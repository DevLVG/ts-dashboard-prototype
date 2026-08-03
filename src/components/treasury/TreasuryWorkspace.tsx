// Treasury — operational workspace (route /treasury).
//
// REBUILT 2026-08-03 (fix-8-treasury) per Marcello's live-review spec: "qui
// serve per lavorare — molto operativo." The workspace is now THREE tabs:
//   - Receivables & Payables (NEW, default) — TreasuryDesk: circles, DSO
//     card, receivables aging + customer-lines ladder (legacy pool nested
//     inside it), payables mirror block. This is where the old standalone
//     Reminders tab's job now lives — "one operational surface, not two."
//   - Cash & Working Capital — TreasuryCash, UNCHANGED. Working capital
//     lives here per Marcello; this stays the read-only monitoring surface.
//   - Confirmations — ConfirmationsWeekly, UNCHANGED.
//
// Payment PRIORITIES/APPROVAL stays on its own nav item (/payments,
// CeoApprovalPanel) — a deliberate CEO-only surface per the mandate, not
// folded in here.
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ListChecks, Wallet, FileCheck2 } from "lucide-react";
import { TreasuryDesk } from "@/components/treasury/TreasuryDesk";
import { TreasuryCash } from "@/components/treasury/TreasuryCash";
import { ConfirmationsWeekly } from "@/components/treasury/ConfirmationsWeekly";

export const TreasuryWorkspace = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading tracking-wide">TREASURY</h2>
        <p className="text-sm text-muted-foreground">
          The operational treasurer's desk — receivables and payables ladders, cash position, working capital,
          and the weekly confirmation review, all in one workspace.
        </p>
      </div>

      <Tabs defaultValue="desk">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="desk" className="gap-1.5"><ListChecks className="h-3.5 w-3.5" /> Receivables &amp; Payables</TabsTrigger>
          <TabsTrigger value="cash" className="gap-1.5"><Wallet className="h-3.5 w-3.5" /> Cash &amp; Working Capital</TabsTrigger>
          <TabsTrigger value="confirmations" className="gap-1.5"><FileCheck2 className="h-3.5 w-3.5" /> Confirmations</TabsTrigger>
        </TabsList>
        <TabsContent value="desk" className="mt-6"><TreasuryDesk /></TabsContent>
        <TabsContent value="cash" className="mt-6"><TreasuryCash /></TabsContent>
        <TabsContent value="confirmations" className="mt-6"><ConfirmationsWeekly /></TabsContent>
      </Tabs>
    </div>
  );
};
