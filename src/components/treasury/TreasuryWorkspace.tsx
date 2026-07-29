// Treasury — operational workspace (route /treasury).
//
// SCOPE (Marcello mandate, 2026-07-29): assemble the operational Treasury
// area — payments + priorities + confirmations + role-based access — as one
// workspace with four sub-tabs. Reuses existing, working components where
// they already exist (Cash & Working Capital = the existing TreasuryCash
// screen, unchanged) and adds the three new sub-tabs the mandate calls for.
//
// Payment PRIORITIES/APPROVAL stays on its own nav item (/payments,
// CeoApprovalPanel) — a deliberate CEO-only surface per the mandate, not
// folded in here.
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Wallet, ListChecks, BellRing, FileCheck2 } from "lucide-react";
import { TreasuryCash } from "@/components/treasury/TreasuryCash";
import { ReceivablesUnified } from "@/components/treasury/ReceivablesUnified";
import { RemindersWorklist } from "@/components/treasury/RemindersWorklist";
import { ConfirmationsWeekly } from "@/components/treasury/ConfirmationsWeekly";

export const TreasuryWorkspace = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading tracking-wide">TREASURY</h2>
        <p className="text-sm text-muted-foreground">
          Cash position, unified receivables, the reminder queue and the weekly confirmation review — one
          operational workspace.
        </p>
      </div>

      <Tabs defaultValue="cash">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="cash" className="gap-1.5"><Wallet className="h-3.5 w-3.5" /> Cash &amp; Working Capital</TabsTrigger>
          <TabsTrigger value="receivables" className="gap-1.5"><ListChecks className="h-3.5 w-3.5" /> Receivables</TabsTrigger>
          <TabsTrigger value="reminders" className="gap-1.5"><BellRing className="h-3.5 w-3.5" /> Reminders</TabsTrigger>
          <TabsTrigger value="confirmations" className="gap-1.5"><FileCheck2 className="h-3.5 w-3.5" /> Confirmations</TabsTrigger>
        </TabsList>
        <TabsContent value="cash" className="mt-6"><TreasuryCash /></TabsContent>
        <TabsContent value="receivables" className="mt-6"><ReceivablesUnified /></TabsContent>
        <TabsContent value="reminders" className="mt-6"><RemindersWorklist /></TabsContent>
        <TabsContent value="confirmations" className="mt-6"><ConfirmationsWeekly /></TabsContent>
      </Tabs>
    </div>
  );
};
