// LIVE data layer — Calendario slot: SEASONAL CALENDARS + the real weekly
// grid + instructor availability. CEO mandate (Marcello, live-review
// rebuild, 2026-08-03, fix-16-slots): the old panel derived its time rows
// from cal_slot_priority claims (an artifact of whatever claims happened to
// exist — rows like 8:00, 9:10, 10:15, 14:15..., stopping mid-afternoon).
// The REAL grid already existed and was never read by any UI:
//
//   cal_lesson_slots     -> the real weekly slot grid per (season, variant):
//                            weekdays/part_of_day/start_time/end_time/
//                            slot_type — migration 036, CMS RPCs added 072.
//   cal_calendar_periods  -> NEW (migration 072) — the named-calendar
//                            display/validity-period metadata layer
//                            Marcello's design calls for ("Cool Season",
//                            "Ramadan Schedule", each with a valid-from/to
//                            or descriptive period). Purely additive
//                            planning metadata — never drives live booking
//                            (season_for_date() in 037 is untouched).
//   cal_venue_hours       -> real published opening hours per season/role
//                            (migration 036) — read-only here, used to show
//                            "opening hours" context per calendar; some rows
//                            carry needs_review=true on genuine source
//                            ambiguities (e.g. Hot morning club_house AR
//                            07:00 vs EN 07:30) — surfaced, not hidden.
//   cal_instructor_availability -> real per-season instructor coverage
//                            (migration 037) — read-only here, used to badge
//                            each grid row with "N instructors available".
//
// WRITES to cal_lesson_slots / cal_calendar_periods go ONLY through the
// SECURITY DEFINER RPCs added by migration 072 (lesson_slot_*, calendar_
// period_*) — same allowlisted-field/audited-write discipline as every
// other CMS domain in this project (catalog/instructors/frozen-slots/
// priority-claims).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface LessonSlotRow {
  id: string;
  season: string;
  variant: number;
  weekdays: string; // CSV, e.g. 'Mon,Tue,Wed,Thu,Fri,Sat'
  part_of_day: "morning" | "afternoon" | "evening" | "night";
  start_time: string; // "HH:MM:SS"
  end_time: string;
  slot_type: "group" | "private";
  notes: string | null;
  source_ref: string | null;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
}

export interface CalendarPeriodRow {
  id: string;
  season: string;
  variant: number;
  display_name: string;
  valid_from: string | null;
  valid_to: string | null;
  period_label: string | null;
  is_ramadan: boolean;
  is_active: boolean;
  notes: string | null;
  source_ref: string | null;
  needs_review: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VenueHoursRow {
  id: string;
  season: string;
  role: string;
  part_of_day: string;
  date_range_start: string | null;
  date_range_end: string | null;
  date_range_label: string | null;
  open_time: string;
  close_time: string;
  crosses_midnight: boolean;
  is_ramadan: boolean;
  is_public_window: boolean;
  notes: string | null;
  needs_review: boolean;
}

export interface InstructorAvailabilityRow {
  instructor_id: string;
  season: string;
  kind: "available" | "unavailable";
  weekday: number | null;
  part_of_day: string | null;
  start_time: string;
  end_time: string;
  scope_from: string | null;
  scope_to: string | null;
  needs_review: boolean;
}

const isMissingObjectError = (err: { code?: string; message?: string }): boolean => {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || msg.includes("does not exist") || msg.includes("schema cache");
};

// -------------------------------------------------------------- queries

export const useLessonSlots = () =>
  useQuery({
    queryKey: ["cal_lesson_slots"],
    queryFn: async (): Promise<LessonSlotRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("cal_lesson_slots")
        .select("*")
        .order("season", { ascending: true })
        .order("variant", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as LessonSlotRow[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 30 * 1000,
  });

export const useCalendarPeriods = () =>
  useQuery({
    queryKey: ["cal_calendar_periods"],
    queryFn: async (): Promise<CalendarPeriodRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("cal_calendar_periods")
        .select("*")
        .order("season", { ascending: true })
        .order("variant", { ascending: true });
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as CalendarPeriodRow[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 30 * 1000,
  });

export const useVenueHours = () =>
  useQuery({
    queryKey: ["cal_venue_hours"],
    queryFn: async (): Promise<VenueHoursRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("cal_venue_hours")
        .select("*")
        .eq("role", "riding_lessons")
        .order("season", { ascending: true });
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as VenueHoursRow[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 60 * 1000,
  });

export const useInstructorAvailability = () =>
  useQuery({
    queryKey: ["cal_instructor_availability"],
    queryFn: async (): Promise<InstructorAvailabilityRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("cal_instructor_availability")
        .select("instructor_id,season,kind,weekday,part_of_day,start_time,end_time,scope_from,scope_to,needs_review")
        .eq("kind", "available");
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as InstructorAvailabilityRow[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 60 * 1000,
  });

/** How many instructors cover a given slot (season/weekday/time window),
 * from the real cal_instructor_availability data — a planning indicator,
 * NOT the authoritative booking-time capacity (that's instructor_capacity(),
 * called with a concrete date by the booking engine; this is date-agnostic,
 * for the CMS grid). weekday=NULL in the source data means "all working
 * days" (Mon-Sat), matching the pattern used everywhere else in this
 * schema. */
export const instructorCoverageFor = (
  availability: InstructorAvailabilityRow[] | undefined,
  season: string,
  weekdayIso: number, // 1=Mon..7=Sun
  startTime: string,
  endTime: string,
): number => {
  if (!availability) return 0;
  const ids = new Set<string>();
  for (const a of availability) {
    if (a.season !== season) continue;
    const dayMatches = a.weekday === weekdayIso || (a.weekday === null && weekdayIso >= 1 && weekdayIso <= 6);
    if (!dayMatches) continue;
    if (!(a.start_time <= startTime && a.end_time >= endTime)) continue;
    ids.add(a.instructor_id);
  }
  return ids.size;
};

// -------------------------------------------------------------- calendar grouping

export interface SeasonalCalendar {
  key: string; // `${season}::${variant}`
  season: string;
  variant: number;
  displayName: string;
  validFrom: string | null;
  validTo: string | null;
  periodLabel: string | null;
  isRamadan: boolean;
  isActive: boolean;
  needsReview: boolean;
  periodId: string | null; // null = no cal_calendar_periods row yet (synthesized default)
  periodNotes: string | null;
  slots: LessonSlotRow[];
}

/** Merge cal_calendar_periods (metadata) with cal_lesson_slots (the real
 * grid) into one list of calendars — every (season,variant) that has
 * EITHER a period row OR slot rows shows up, so a freshly-created empty
 * calendar (period only, no slots yet) and legacy slot data with no period
 * row yet (synthesized default metadata) both render correctly. */
export const buildSeasonalCalendars = (
  slots: LessonSlotRow[] | undefined,
  periods: CalendarPeriodRow[] | undefined,
): SeasonalCalendar[] => {
  const bySlotKey = new Map<string, LessonSlotRow[]>();
  for (const s of slots ?? []) {
    const key = `${s.season}::${s.variant}`;
    if (!bySlotKey.has(key)) bySlotKey.set(key, []);
    bySlotKey.get(key)!.push(s);
  }
  const byPeriodKey = new Map<string, CalendarPeriodRow>();
  for (const p of periods ?? []) byPeriodKey.set(`${p.season}::${p.variant}`, p);

  const allKeys = new Set<string>([...bySlotKey.keys(), ...byPeriodKey.keys()]);
  const out: SeasonalCalendar[] = [];
  for (const key of allKeys) {
    const [season, variantStr] = key.split("::");
    const variant = Number(variantStr);
    const period = byPeriodKey.get(key);
    out.push({
      key,
      season,
      variant,
      displayName: period?.display_name ?? `${season} Season${variant > 1 ? ` — Variant ${variant}` : ""}`,
      validFrom: period?.valid_from ?? null,
      validTo: period?.valid_to ?? null,
      periodLabel: period?.period_label ?? null,
      isRamadan: period?.is_ramadan ?? season === "Ramadan",
      isActive: period?.is_active ?? true,
      needsReview: period?.needs_review ?? false,
      periodId: period?.id ?? null,
      periodNotes: period?.notes ?? null,
      slots: (bySlotKey.get(key) ?? []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time)),
    });
  }
  // Real, non-Ramadan calendars first (Cool/Mid/Hot), then Ramadan/others; within that, active before inactive.
  return out.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.isRamadan !== b.isRamadan) return a.isRamadan ? 1 : -1;
    return a.displayName.localeCompare(b.displayName) || a.variant - b.variant;
  });
};

// -------------------------------------------------------------- lesson slot mutations

interface CreateLessonSlotArgs {
  season: string;
  variant?: number;
  weekdays?: string;
  part_of_day: string;
  start_time: string;
  end_time: string;
  slot_type?: "group" | "private";
  notes?: string;
  actor: string;
}

export const useCreateLessonSlot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateLessonSlotArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("lesson_slot_create", {
        p_season: args.season,
        p_start_time: args.start_time,
        p_end_time: args.end_time,
        p_part_of_day: args.part_of_day,
        p_variant: args.variant ?? 1,
        p_weekdays: args.weekdays ?? "Mon,Tue,Wed,Thu,Fri,Sat",
        p_slot_type: args.slot_type ?? "group",
        p_notes: args.notes ?? null,
        p_source_ref: "cms:Calendario slot panel",
        p_actor: args.actor,
      });
      if (error) throw toFriendlyError(error);
      return data as LessonSlotRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cal_lesson_slots"] }),
  });
};

export const useUpdateLessonSlotField = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { lessonSlotId: string; field: string; value: string; actor: string; reason?: string }) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("lesson_slot_update_field", {
        p_lesson_slot_id: args.lessonSlotId,
        p_field_name: args.field,
        p_new_value: args.value,
        p_actor: args.actor,
        p_reason: args.reason ?? null,
      });
      if (error) throw toFriendlyError(error);
      return data as LessonSlotRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cal_lesson_slots"] }),
  });
};

export const useDeleteLessonSlot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { lessonSlotId: string; actor: string; reason?: string }) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { error } = await supabase.rpc("lesson_slot_delete", {
        p_lesson_slot_id: args.lessonSlotId,
        p_actor: args.actor,
        p_reason: args.reason ?? null,
      });
      if (error) throw toFriendlyError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cal_lesson_slots"] }),
  });
};

// -------------------------------------------------------------- calendar period mutations

interface CreateCalendarPeriodArgs {
  season: string;
  display_name: string;
  variant?: number;
  valid_from?: string;
  valid_to?: string;
  period_label?: string;
  is_ramadan?: boolean;
  notes?: string;
  actor: string;
}

export const useCreateCalendarPeriod = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateCalendarPeriodArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("calendar_period_create", {
        p_season: args.season,
        p_display_name: args.display_name,
        p_variant: args.variant ?? 1,
        p_valid_from: args.valid_from ?? null,
        p_valid_to: args.valid_to ?? null,
        p_period_label: args.period_label ?? null,
        p_is_ramadan: args.is_ramadan ?? false,
        p_notes: args.notes ?? null,
        p_source_ref: "cms:Calendario slot panel",
        p_actor: args.actor,
      });
      if (error) throw toFriendlyError(error);
      return data as CalendarPeriodRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cal_calendar_periods"] }),
  });
};

export const useUpdateCalendarPeriodField = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { calendarPeriodId: string; field: string; value: string; actor: string; reason?: string }) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("calendar_period_update_field", {
        p_calendar_period_id: args.calendarPeriodId,
        p_field_name: args.field,
        p_new_value: args.value,
        p_actor: args.actor,
        p_reason: args.reason ?? null,
      });
      if (error) throw toFriendlyError(error);
      return data as CalendarPeriodRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cal_calendar_periods"] }),
  });
};

export const useDeleteCalendarPeriod = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { calendarPeriodId: string; actor: string; reason?: string }) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { error } = await supabase.rpc("calendar_period_delete", {
        p_calendar_period_id: args.calendarPeriodId,
        p_actor: args.actor,
        p_reason: args.reason ?? null,
      });
      if (error) throw toFriendlyError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cal_calendar_periods"] }),
  });
};
