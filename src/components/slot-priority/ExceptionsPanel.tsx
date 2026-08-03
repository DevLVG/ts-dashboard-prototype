// Calendario slot — Layer 2: DATE-SPECIFIC OVERRIDES ("exceptions").
// Marcello's live-review mandate (2026-08-03, fix-16-slots): single dates
// that deviate from the weekly pattern — competition day, Eid/holiday
// closure, extreme-heat day — shown as a SEPARATE list (date, reason,
// modified/closed schedule), never mixed into the weekly grid. Resolution
// order for any date: override (this list) > seasonal calendar > nothing.
//
// Backed by cal_frozen_slots (migration 065) — schema and RPCs already
// existed; this is the first browser UI built onto them (065's own header
// flagged "no staff-facing browser UI exists yet anywhere in this project").
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, CalendarOff, AlertTriangle } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { useFrozenSlots, type FrozenSlotRow } from "@/data/frozenSlotsLive";
import { FrozenSlotEditDialog } from "./FrozenSlotEditDialog";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const timeShort = (t: string) => t.slice(0, 5);

const fmtDate = (d: string) => {
  const dt = new Date(`${d}T00:00:00`);
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
};

const scheduleLabel = (r: FrozenSlotRow) => {
  const fullDay = r.start_time.slice(0, 5) === "00:00" && r.end_time.slice(0, 5) === "23:59";
  if (fullDay) return "Closed — full day";
  return `Closed ${timeShort(r.start_time)}–${timeShort(r.end_time)}`;
};

export const ExceptionsPanel = () => {
  const { session } = useAuth();
  const actor = session?.user?.email ?? "unknown";
  const { data: rows, isLoading, isError } = useFrozenSlots();
  const [editing, setEditing] = useState<FrozenSlotRow | null | "new">(null);

  const dateSpecific = useMemo(
    () => (rows ?? []).filter((r) => r.scope_type === "date_specific" && r.is_frozen)
      .sort((a, b) => (a.specific_date ?? "").localeCompare(b.specific_date ?? "")),
    [rows],
  );
  const recurring = useMemo(
    () => (rows ?? []).filter((r) => r.scope_type === "recurring_weekly" && r.is_frozen),
    [rows],
  );
  const inactive = useMemo(() => (rows ?? []).filter((r) => !r.is_frozen), [rows]);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = dateSpecific.filter((r) => (r.specific_date ?? "") >= today);
  const past = dateSpecific.filter((r) => (r.specific_date ?? "") < today);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm flex items-start gap-2">
        <CalendarOff className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
        <span>
          <strong>Exceptions — the override layer.</strong> A single date or recurring weekday window that closes
          or modifies the schedule (competition day, Eid/holiday, extreme heat). An exception ALWAYS wins over the
          seasonal calendar for the date(s) it covers.
        </span>
      </div>

      <Card className="p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-heading tracking-wide">EXCEPTIONS</h3>
            <DataSourceBadge source="live" />
            <span className="text-xs text-muted-foreground">Supabase · cal_frozen_slots</span>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> New exception
          </Button>
        </div>

        {!isSupabaseConfigured ? (
          <p className="text-sm text-destructive">Supabase is not configured — exceptions cannot load.</p>
        ) : isError ? (
          <p className="text-sm text-destructive">Could not load exceptions.</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : dateSpecific.length === 0 && recurring.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No exceptions recorded — the seasonal calendars apply to every date. Add one for a competition day,
            holiday closure, or extreme-heat day.
          </p>
        ) : (
          <div className="space-y-5">
            {upcoming.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Upcoming ({upcoming.length})</h4>
                <div className="space-y-2">
                  {upcoming.map((r) => (
                    <ExceptionRow key={r.id} row={r} onEdit={() => setEditing(r)} />
                  ))}
                </div>
              </div>
            )}
            {recurring.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Recurring ({recurring.length})</h4>
                <div className="space-y-2">
                  {recurring.map((r) => (
                    <ExceptionRow key={r.id} row={r} onEdit={() => setEditing(r)} />
                  ))}
                </div>
              </div>
            )}
            {past.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Past ({past.length})</h4>
                <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                  {past.map((r) => (
                    <ExceptionRow key={r.id} row={r} onEdit={() => setEditing(r)} muted />
                  ))}
                </div>
              </div>
            )}
            {inactive.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Turned off ({inactive.length})</h4>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {inactive.map((r) => (
                    <ExceptionRow key={r.id} row={r} onEdit={() => setEditing(r)} muted />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <FrozenSlotEditDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        row={editing === "new" ? null : editing}
        actor={actor}
      />
    </div>
  );
};

const ExceptionRow = ({ row, onEdit, muted }: { row: FrozenSlotRow; onEdit: () => void; muted?: boolean }) => (
  <button
    onClick={onEdit}
    className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/40 transition-colors text-left ${muted ? "opacity-60" : ""}`}
  >
    <span className="flex-1 min-w-0">
      <strong className="truncate">{row.label}</strong>
      <span className="text-muted-foreground">
        {" — "}
        {row.scope_type === "date_specific" && row.specific_date ? fmtDate(row.specific_date) : `Every ${WEEKDAY_LABELS[(row.weekday ?? 1) - 1]}`}
        {" · "}{scheduleLabel(row)}
      </span>
      {row.reason && <span className="block text-xs text-muted-foreground/80 mt-0.5 truncate">{row.reason}</span>}
    </span>
    <span className="flex items-center gap-2 shrink-0 ml-3">
      {row.needs_review && (
        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500/40 text-amber-500 gap-0.5">
          <AlertTriangle className="h-2.5 w-2.5" /> review
        </Badge>
      )}
      {!row.is_frozen && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">off</Badge>}
      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
    </span>
  </button>
);
