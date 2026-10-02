// LIVE data layer — Calendario slot: EXCEPTIONS (date-specific overrides).
// CEO mandate (Marcello, live-review rebuild, 2026-08-03, fix-16-slots):
// single dates that deviate from the weekly pattern — competition day,
// Eid/holiday closure, extreme-heat day — shown as a SEPARATE list from the
// weekly grid, never mixed into it. Resolution order for any date: override
// (this table) > seasonal calendar (cal_lesson_slots) > nothing.
//
// The schema and its RPCs already existed (migration 065, cal_frozen_slots)
// but per that migration's own header: "no staff-facing browser UI exists
// yet anywhere in this project to CALL these RPCs from a click." This file
// is the data layer for the FIRST browser UI onto that table — no schema
// change needed, migration 072 added nothing here.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";

export type FrozenScopeType = "recurring_weekly" | "date_specific";

export interface FrozenSlotRow {
  id: string;
  label: string;
  scope_type: FrozenScopeType;
  weekday: number | null; // ISO 1=Mon..7=Sun
  specific_date: string | null;
  start_time: string;
  end_time: string;
  slot_id: string | null;
  season: string | null;
  scope_from: string | null;
  scope_to: string | null;
  is_frozen: boolean;
  reason: string | null;
  notes: string | null;
  source_ref: string | null;
  needs_review: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const isMissingObjectError = (err: { code?: string; message?: string }): boolean => {
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || msg.includes("does not exist") || msg.includes("schema cache");
};

export const useFrozenSlots = () =>
  useQuery({
    queryKey: ["cal_frozen_slots"],
    queryFn: async (): Promise<FrozenSlotRow[]> => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase
        .from("cal_frozen_slots")
        .select("*")
        .order("specific_date", { ascending: true, nullsFirst: false })
        .order("weekday", { ascending: true, nullsFirst: false });
      if (error) {
        if (isMissingObjectError(error)) return [];
        throw toFriendlyError(error);
      }
      return (data ?? []) as FrozenSlotRow[];
    },
    enabled: isSupabaseConfigured,
    staleTime: 30 * 1000,
  });

interface CreateFrozenSlotArgs {
  label: string;
  scope_type: FrozenScopeType;
  start_time: string;
  end_time: string;
  weekday?: number;
  specific_date?: string;
  season?: string;
  scope_from?: string;
  scope_to?: string;
  reason?: string;
  actor: string;
}

export const useCreateFrozenSlot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: CreateFrozenSlotArgs) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("frozen_slot_create", {
        p_label: args.label,
        p_scope_type: args.scope_type,
        p_start_time: args.start_time,
        p_end_time: args.end_time,
        p_weekday: args.weekday ?? null,
        p_specific_date: args.specific_date ?? null,
        p_slot_id: null,
        p_season: args.season ?? null,
        p_scope_from: args.scope_from ?? null,
        p_scope_to: args.scope_to ?? null,
        p_reason: args.reason ?? null,
        p_actor: args.actor,
      });
      if (error) throw toFriendlyError(error);
      return data as FrozenSlotRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cal_frozen_slots"] }),
  });
};

export const useUpdateFrozenSlotField = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { frozenSlotId: string; field: string; value: string; actor: string; reason?: string }) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.rpc("frozen_slot_update_field", {
        p_frozen_slot_id: args.frozenSlotId,
        p_field_name: args.field,
        p_new_value: args.value,
        p_actor: args.actor,
        p_reason: args.reason ?? null,
      });
      if (error) throw toFriendlyError(error);
      return data as FrozenSlotRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cal_frozen_slots"] }),
  });
};

export const useDeleteFrozenSlot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { frozenSlotId: string; actor: string; reason?: string }) => {
      if (!supabase) throw new Error("Supabase is not configured");
      const { error } = await supabase.rpc("frozen_slot_delete", {
        p_frozen_slot_id: args.frozenSlotId,
        p_actor: args.actor,
        p_reason: args.reason ?? null,
      });
      if (error) throw toFriendlyError(error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cal_frozen_slots"] }),
  });
};
