// LIVE data layer — Calendario slot / Slot Priority CMS (priority booking
// with release window). CEO mandate (Marcello, via Luca, 2026-08-03):
// Excel calendars (Trio_Calendar_<Month>2026.xlsx) encode a "priority
// activity claims the slot first, releases if unbooked by a configurable
// window before it happens" rule. This panel is the staff-facing, no-
// developer-needed editor for that rule.
//
//   cal_slot_priority          -> the priority claim per (activity, weekday
//                                  or specific date, time window) +
//                                  release_window_hours (editable, default
//                                  48) — migration 067
//   cal_slot_priority_audit    -> field-level audit trail
//   priority_activity_bookings -> proof the priority activity actually
//                                  claimed a given date's occurrence
//
// WRITES go ONLY through the SECURITY DEFINER RPCs added by migration 067
// (slot_priority_create / slot_priority_update_field / slot_priority_delete
// / slot_priority_bulk_set_release_window) — direct table writes are
// service_role-only (RLS), so every edit here is guaranteed to also write
// its audit row. See migration 067_slot_priority_release_window.sql.
//
// needs_review=true by default on every Excel-sourced row (Marta has not
// confirmed instructor names — same gate as cal_instructors, 065).
// Instructor names stay INTERNAL to this panel/engine — never exposed on
// the public site.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";

export type ScopeType = "recurring_weekly" | "date_specific";

export interface SlotPriorityRow {
  id: string;
  label: string;
  scope_type: ScopeType;
  weekday: number | null; // ISO 1=Mon..7=Sun
  specific_date: string | null;
  start_time: string; // "HH:MM:SS"
  end_time: string;
  slot_id: string | null;
  season: string | null;
  scope_from: string | null;
  scope_to: string | null;
  priority_instructor_id: string | null;
  priority_instructor_raw: string | null;
  release_window_hours: number;
  fallback_note: string | null;
  is_active: boolean;
  notes: string | null;
  source_ref: string | null;
  needs_review: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SlotPriorityAuditRow {
  audit_id: number;
  slot_priority_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
  changed_by: string | null;
  change_reason: string | null;
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const EDITABLE_FIELDS = [
  "label", "release_window_hours", "start_time", "end_time", "weekday", "specific_date",
  "scope_from", "scope_to", "season", "priority_instructor_id", "priority_instructor_raw",
  "fallback_note", "is_active", "notes", "needs_review",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

const isMissingObjectError = (err: { code?: string; message?: string }): boolean => {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || msg.includes("does not exist") || msg.includes("schema cache");
};

// -------------------------------------------------------------- queries

export const useSlotPriority = () =>
  useQuery({
    queryKey: ["cal_slot_priority"],
    queryFn: async (): Promise<SlotPriorityRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("cal_slot_priority")
        .select("*")
        .order("start_time", { ascending: true })
        .order("weekday", { ascending: true, nullsFirst: false });
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as SlotPriorityRow[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 30 * 1000,
  });

export const useSlotPriorityAudit = (limit = 100) =>
  useQuery({
    queryKey: ["cal_slot_priority_audit", limit],
    queryFn: async (): Promise<SlotPriorityAuditRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("cal_slot_priority_audit")
        .select("*")
        .order("changed_at", { ascending: false })
        .limit(limit);
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as SlotPriorityAuditRow[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 15 * 1000,
  });

/** Live "is this slot/date currently blocked?" preview — calls the same RPC
 * the booking engine uses, so the panel never shows a status that disagrees
 * with what a real booking attempt would see. */
export const usePriorityPreview = (slotPriorityId: string | null, date: string | null) =>
  useQuery({
    queryKey: ["priority_preview", slotPriorityId, date],
    queryFn: async (): Promise<{ released: boolean; releaseAt: string | null }> => {
      if (!supabase || !slotPriorityId || !date) throw new Error("not ready");
      const { data: releaseAt, error: e1 } = await supabase.rpc("priority_release_at", {
        p_date: date,
        p_slot_priority_id: slotPriorityId,
      });
      if (e1) throw toFriendlyError(e1);
      const { data: released, error: e2 } = await supabase.rpc("priority_slot_released", {
        p_date: date,
        p_slot_priority_id: slotPriorityId,
      });
      if (e2) throw toFriendlyError(e2);
      return { released: Boolean(released), releaseAt: (releaseAt as string) ?? null };
    },
    enabled: isSupabaseConfigured && Boolean(slotPriorityId) && Boolean(date),
    staleTime: 10 * 1000,
  });

// -------------------------------------------------------------- mutations

interface UpdateFieldArgs {
  slotPriorityId: string;
  field: EditableField;
  value: string;
  actor: string;
  reason?: string;
}

export const useUpdateSlotPriorityField = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slotPriorityId, field, value, actor, reason }: UpdateFieldArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("slot_priority_update_field", {
        p_slot_priority_id: slotPriorityId,
        p_field_name: field,
        p_new_value: value,
        p_actor: actor,
        p_reason: reason ?? null,
      });
      if (error) throw toFriendlyError(error);
      return data as SlotPriorityRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal_slot_priority"] });
      qc.invalidateQueries({ queryKey: ["cal_slot_priority_audit"] });
      qc.invalidateQueries({ queryKey: ["priority_preview"] });
    },
  });
};

interface CreateSlotPriorityArgs {
  label: string;
  scope_type: ScopeType;
  start_time: string;
  end_time: string;
  weekday?: number;
  specific_date?: string;
  priority_instructor_id?: string;
  priority_instructor_raw?: string;
  release_window_hours?: number;
  actor: string;
}

export const useCreateSlotPriority = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateSlotPriorityArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("slot_priority_create", {
        p_label: args.label,
        p_scope_type: args.scope_type,
        p_start_time: args.start_time,
        p_end_time: args.end_time,
        p_weekday: args.weekday ?? null,
        p_specific_date: args.specific_date ?? null,
        p_slot_id: null,
        p_season: null,
        p_priority_instructor_id: args.priority_instructor_id ?? null,
        p_priority_instructor_raw: args.priority_instructor_raw ?? null,
        p_release_window_hours: args.release_window_hours ?? 48,
        p_source_ref: "cms:Calendario slot panel",
        p_actor: args.actor,
      });
      if (error) throw toFriendlyError(error);
      return data as SlotPriorityRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal_slot_priority"] });
      qc.invalidateQueries({ queryKey: ["cal_slot_priority_audit"] });
    },
  });
};

export const useDeleteSlotPriority = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { slotPriorityId: string; actor: string; reason?: string }) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { error } = await supabase.rpc("slot_priority_delete", {
        p_slot_priority_id: args.slotPriorityId,
        p_actor: args.actor,
        p_reason: args.reason ?? null,
      });
      if (error) throw toFriendlyError(error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal_slot_priority"] });
      qc.invalidateQueries({ queryKey: ["cal_slot_priority_audit"] });
    },
  });
};

/** "Apply to all slots with this activity name" — the per-attività editing
 * granularity, on top of the per-row (per-slot) editing above. */
export const useBulkSetReleaseWindow = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { label: string; hours: number; actor: string; reason?: string }) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("slot_priority_bulk_set_release_window", {
        p_label: args.label,
        p_release_window_hours: args.hours,
        p_actor: args.actor,
        p_reason: args.reason ?? null,
      });
      if (error) throw toFriendlyError(error);
      return data as number; // rows changed
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cal_slot_priority"] });
      qc.invalidateQueries({ queryKey: ["cal_slot_priority_audit"] });
    },
  });
};
