// Calendario slot — page shell. Rebuilt 2026-08-03 (Marcello, CEO live-
// review mandate, fix-16-slots) into the three-layer model:
//
//   1. SEASONAL CALENDARS — named calendars with validity periods; the real
//      weekly grid (opening hours x slot duration x instructor
//      availability), replacing the old artifact grid derived from
//      whatever priority claims happened to exist.
//   2. EXCEPTIONS — date-specific overrides (competition day, holiday
//      closure, extreme heat), kept separate from the weekly pattern.
//      Resolution order for any date: exception > seasonal calendar > none.
//   3. PRIORITY CLAIMS — the existing priority-booking-with-release system
//      (migration 067), repositioned as an overlay on the real grid rather
//      than being the grid itself. Its date-specific list is now grouped
//      (see PriorityClaimsPanel) — this is also where the page's "cannot
//      scroll down" bug lived: 705 flat-rendered rows made the page
//      ~40-48k px tall. Fixed by grouping, not by any CSS change (the
//      ancestor chain never actually had overflow:hidden — verified via
//      Playwright wheel-scroll tests before touching any code).
//
// Route: /slot-priority (App.tsx + Index.tsx wiring untouched by this
// rebuild — only this component's internals changed).
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CalendarDays, CalendarOff, ShieldAlert } from "lucide-react";
import { SeasonalCalendarsPanel } from "./SeasonalCalendarsPanel";
import { ExceptionsPanel } from "./ExceptionsPanel";
import { PriorityClaimsPanel } from "./PriorityClaimsPanel";

export const SlotPriorityAdmin = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-heading tracking-wide">CALENDARIO SLOT</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Seasonal calendars, date-specific exceptions, and priority claims — the three layers behind every
          bookable Horse School slot.
        </p>
      </div>

      <Tabs defaultValue="calendars" className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="calendars" className="gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> Seasonal Calendars
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="gap-1.5">
            <CalendarOff className="h-3.5 w-3.5" /> Exceptions
          </TabsTrigger>
          <TabsTrigger value="priority" className="gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Priority Claims
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendars">
          <SeasonalCalendarsPanel />
        </TabsContent>
        <TabsContent value="exceptions">
          <ExceptionsPanel />
        </TabsContent>
        <TabsContent value="priority">
          <PriorityClaimsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};
