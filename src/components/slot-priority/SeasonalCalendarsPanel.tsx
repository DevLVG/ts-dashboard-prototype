// Calendario slot — Layer 1: SEASONAL CALENDARS WITH VALIDITY PERIODS.
// Marcello's live-review mandate (2026-08-03, fix-16-slots): "the Monday-
// Sunday weekly grid is right, but it must belong to a NAMED CALENDAR with
// a valid-from -> to period... multiple calendars creatable; for any date,
// the applicable calendar is the one whose period covers it."
//
// The grid here is the REAL one — cal_lesson_slots (opening hours x slot
// duration, migration 036) — not an artifact derived from bookings/claims.
// Each row is overlaid with:
//   - instructor coverage (cal_instructor_availability, real data)
//   - priority-claim badges (cal_slot_priority) marking peak/reserved slots
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Pencil, AlertTriangle, Sun, Moon, Users, ShieldAlert } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  WEEKDAY_LABELS, buildSeasonalCalendars, instructorCoverageFor,
  useLessonSlots, useCalendarPeriods, useVenueHours, useInstructorAvailability,
  type SeasonalCalendar, type LessonSlotRow,
} from "@/data/lessonSlotsLive";
import { useSlotPriority } from "@/data/slotPriorityLive";
import { CalendarEditDialog } from "./CalendarEditDialog";
import { LessonSlotEditDialog } from "./LessonSlotEditDialog";

const timeShort = (t: string) => t.slice(0, 5);

const fmtDate = (d: string | null) => {
  if (!d) return null;
  const dt = new Date(`${d}T00:00:00`);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

export const SeasonalCalendarsPanel = () => {
  const { session } = useAuth();
  const actor = session?.user?.email ?? "unknown";

  const { data: slots, isLoading: slotsLoading, isError: slotsError } = useLessonSlots();
  const { data: periods, isLoading: periodsLoading } = useCalendarPeriods();
  const { data: venueHours } = useVenueHours();
  const { data: availability } = useInstructorAvailability();
  const { data: priorityClaims } = useSlotPriority();

  const calendars = useMemo(() => buildSeasonalCalendars(slots, periods), [slots, periods]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = calendars.find((c) => c.key === selectedKey) ?? calendars[0] ?? null;

  const [editingCalendar, setEditingCalendar] = useState<SeasonalCalendar | null | "new">(null);
  const [editingSlot, setEditingSlot] = useState<LessonSlotRow | null | "new">(null);

  const isLoading = slotsLoading || periodsLoading;

  // Distinct time rows for the selected calendar, sorted by start time.
  const timeRows = useMemo(() => {
    if (!selected) return [];
    const seen = new Map<string, LessonSlotRow>();
    for (const s of selected.slots) {
      const key = `${s.start_time}-${s.end_time}`;
      if (!seen.has(key)) seen.set(key, s);
    }
    return Array.from(seen.values()).sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [selected]);

  const rowForWeekday = (row: LessonSlotRow, weekdayLabel: string) =>
    selected?.slots.find((s) => s.start_time === row.start_time && s.end_time === row.end_time
      && s.weekdays.split(",").map((d) => d.trim()).includes(weekdayLabel));

  const priorityBadgeFor = (season: string, weekdayIso: number, start: string, end: string) => {
    const claim = (priorityClaims ?? []).find((c) =>
      c.is_active && c.scope_type === "recurring_weekly" && c.weekday === weekdayIso
      && c.start_time < end && c.end_time > start
      && (c.season === null || c.season === season));
    return claim ?? null;
  };

  const venueHoursForSeason = (season: string) => (venueHours ?? []).filter((v) => v.season === season);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm flex items-start gap-2">
        <Sun className="h-4 w-4 mt-0.5 shrink-0 text-sky-400" />
        <span>
          <strong>Seasonal calendars.</strong> Every weekly grid belongs to a named calendar with its own validity
          period (e.g. Cool / Mid / Hot Season, or a Ramadan schedule). For any date, the calendar whose period
          covers it applies — unless a date-specific exception overrides it (see the Exceptions tab).
        </span>
      </div>

      <Card className="p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Calendars</h3>
            <DataSourceBadge source="live" />
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingCalendar("new")}>
            <Plus className="h-4 w-4" /> New calendar
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {calendars.map((c) => (
            <button
              key={c.key}
              onClick={() => setSelectedKey(c.key)}
              className={`rounded-lg border px-3 py-2 text-left transition-colors min-w-[160px] ${
                (selected?.key === c.key) ? "border-gold bg-gold/10" : "border-border hover:bg-muted/40"
              } ${!c.isActive ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-1.5">
                {c.isRamadan ? <Moon className="h-3.5 w-3.5 text-sky-400 shrink-0" /> : <Sun className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                <span className="text-sm font-medium truncate">{c.displayName}</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {c.periodLabel ?? (c.validFrom && c.validTo ? `${fmtDate(c.validFrom)} – ${fmtDate(c.validTo)}` : "No validity set")}
              </div>
              <div className="flex items-center gap-1 mt-1.5">
                {!c.isActive && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">inactive</Badge>}
                {c.needsReview && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500/40 text-amber-500">review</Badge>
                )}
                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{c.slots.length} slot{c.slots.length === 1 ? "" : "s"}</Badge>
              </div>
            </button>
          ))}
        </div>
      </Card>

      {!isSupabaseConfigured ? (
        <p className="text-sm text-destructive">Supabase is not configured — calendars cannot load.</p>
      ) : slotsError ? (
        <p className="text-sm text-destructive">Could not load the seasonal calendars.</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : selected ? (
        <Card className="p-6 shadow-sm">
          <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-heading tracking-wide">{selected.displayName.toUpperCase()}</h3>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingCalendar(selected)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Valid: {selected.periodLabel ?? (selected.validFrom && selected.validTo ? `${fmtDate(selected.validFrom)} – ${fmtDate(selected.validTo)}` : "not set")}
                {!selected.isActive && " · inactive (not currently in rotation)"}
              </p>
              {venueHoursForSeason(selected.season).length > 0 && (
                <p className="text-xs text-muted-foreground mt-1.5">
                  Published opening hours: {venueHoursForSeason(selected.season).map((v) => (
                    <span key={v.id} className="mr-2 inline-flex items-center gap-1">
                      {v.part_of_day} {timeShort(v.open_time)}–{timeShort(v.close_time)}
                      {v.needs_review && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <AlertTriangle className="h-3 w-3 text-amber-400 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            To validate with Marta — {v.notes || "source ambiguity flagged, not yet confirmed."}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  ))}
                </p>
              )}
              {selected.periodNotes && (
                <p className="text-xs text-muted-foreground mt-1.5 italic max-w-2xl">{selected.periodNotes}</p>
              )}
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingSlot("new")}>
              <Plus className="h-4 w-4" /> Add time slot
            </Button>
          </div>

          {timeRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No time slots yet — use "Add time slot" to build this calendar's grid.</p>
          ) : (
            <ScrollHint>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground pb-2 pr-3 whitespace-nowrap">Time</th>
                    {WEEKDAY_LABELS.map((d) => (
                      <th key={d} className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground pb-2 px-2 min-w-[140px]">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeRows.map((row) => {
                    const coverageByDay = WEEKDAY_LABELS.map((_, i) =>
                      instructorCoverageFor(availability, selected.season, i + 1, row.start_time, row.end_time));
                    const uniformCoverage = coverageByDay.every((n) => n === coverageByDay[0]) ? coverageByDay[0] : null;
                    return (
                      <tr key={`${row.start_time}-${row.end_time}`} className="border-t align-top">
                        <td className="py-2 pr-3 text-xs font-mono text-muted-foreground whitespace-nowrap align-top">
                          <button onClick={() => setEditingSlot(row)} className="hover:underline">
                            {timeShort(row.start_time)}–{timeShort(row.end_time)}
                          </button>
                          <div className="text-[10px] text-muted-foreground/70 mt-0.5">{row.part_of_day}</div>
                          {uniformCoverage !== null && (
                            <div className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                              <Users className="h-2.5 w-2.5" /> {uniformCoverage} instructor{uniformCoverage === 1 ? "" : "s"}
                            </div>
                          )}
                        </td>
                        {WEEKDAY_LABELS.map((d, i) => {
                          const iso = i + 1;
                          const cell = rowForWeekday(row, d);
                          const priority = priorityBadgeFor(selected.season, iso, row.start_time, row.end_time);
                          const coverage = uniformCoverage === null ? coverageByDay[i] : null;
                          return (
                            <td key={d} className="py-2 px-2 align-top">
                              {cell ? (
                                <button
                                  onClick={() => setEditingSlot(cell)}
                                  className={`w-full text-left rounded-md border px-2 py-1.5 hover:bg-muted/40 transition-colors ${
                                    cell.needs_review ? "border-dashed border-amber-500/40" : "border-border"
                                  }`}
                                >
                                  <div className="text-xs font-medium capitalize">{cell.slot_type}</div>
                                  {coverage !== null && (
                                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                                      <Users className="h-2.5 w-2.5" /> {coverage}
                                    </div>
                                  )}
                                  {priority && (
                                    <Badge variant="outline" className="mt-1 text-[9px] px-1 py-0 h-4 border-gold/50 text-gold gap-0.5">
                                      <ShieldAlert className="h-2.5 w-2.5" /> {priority.label}
                                    </Badge>
                                  )}
                                  {cell.needs_review && (
                                    <Badge variant="outline" className="mt-1 ml-1 text-[9px] px-1 py-0 h-4 border-amber-500/40 text-amber-500">review</Badge>
                                  )}
                                </button>
                              ) : (
                                <div className="w-full rounded-md border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground/60 text-center">
                                  Closed
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollHint>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Click a time row or a slot cell to edit it. "Closed" means this calendar has no defined slot on that
            weekday for this time window.
          </p>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">No calendars yet — create one to get started.</p>
      )}

      <CalendarEditDialog
        open={editingCalendar !== null}
        onOpenChange={(o) => !o && setEditingCalendar(null)}
        calendar={editingCalendar === "new" ? null : editingCalendar}
        actor={actor}
      />
      <LessonSlotEditDialog
        open={editingSlot !== null}
        onOpenChange={(o) => !o && setEditingSlot(null)}
        row={editingSlot === "new" ? null : editingSlot}
        actor={actor}
        defaultSeason={selected?.season}
        defaultVariant={selected?.variant}
      />
    </div>
  );
};
