// Calendario slot — PRIORITY CLAIMS (cal_slot_priority, migration 067).
// Repositioned in the fix-16-slots rebuild (2026-08-03): this is an
// OVERLAY on top of the real seasonal-calendar grid (see the Seasonal
// Calendars tab, where each matching cell shows a priority badge) — not
// the grid itself anymore. This panel remains the full editor for the
// underlying claim/release-window rule.
//
// ROOT-CAUSE FIX (scroll bug): the old "date-specific overrides" list
// flat-rendered every row — 705 of them live in production today, mostly
// individual "Schools" date occurrences — making the page ~40,000-48,000px
// tall (confirmed via Playwright: document.documentElement.scrollHeight).
// The page technically still scrolled (verified: wheel events moved
// scrollY correctly at 1440 and 390, no CSS overflow:hidden anywhere in
// the ancestor chain) but was practically unusable — dozens of screens of
// near-identical cards to get past before reaching anything else. Fix:
// group by (label, start_time, end_time) into compact summary rows with a
// bounded, internally-scrollable date list (max-h-56 overflow-y-auto)
// instead of one flat unbounded list.
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, Plus, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { useSlotPriority, type SlotPriorityRow, WEEKDAY_LABELS } from "@/data/slotPriorityLive";
import { SlotPriorityEditDialog } from "./SlotPriorityEditDialog";
import { SlotPriorityAuditLog } from "./SlotPriorityAuditLog";

const timeShort = (t: string) => t.slice(0, 5);
const fmtDate = (d: string) => {
  const dt = new Date(`${d}T00:00:00`);
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

interface DateGroup {
  key: string;
  label: string;
  start_time: string;
  end_time: string;
  rows: SlotPriorityRow[]; // sorted by date
}

export const PriorityClaimsPanel = () => {
  const { session } = useAuth();
  const actor = session?.user?.email ?? "unknown";
  const { data: rows, isLoading, isError, error } = useSlotPriority();

  const [editing, setEditing] = useState<SlotPriorityRow | null | "new">(null);
  const [prefill, setPrefill] = useState<{ weekday: number; startTime: string; endTime: string } | undefined>(undefined);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const recurring = useMemo(() => (rows ?? []).filter((r) => r.scope_type === "recurring_weekly"), [rows]);
  const dateSpecific = useMemo(() => (rows ?? []).filter((r) => r.scope_type === "date_specific"), [rows]);

  const dateGroups = useMemo<DateGroup[]>(() => {
    const byKey = new Map<string, DateGroup>();
    for (const r of dateSpecific) {
      const key = `${r.label}__${r.start_time}__${r.end_time}`;
      if (!byKey.has(key)) byKey.set(key, { key, label: r.label, start_time: r.start_time, end_time: r.end_time, rows: [] });
      byKey.get(key)!.rows.push(r);
    }
    for (const g of byKey.values()) g.rows.sort((a, b) => (a.specific_date ?? "").localeCompare(b.specific_date ?? ""));
    return Array.from(byKey.values()).sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label));
  }, [dateSpecific]);

  // Distinct time-slot rows, sorted by start time.
  const slotKeys = useMemo(() => {
    const seen = new Map<string, { start: string; end: string }>();
    for (const r of recurring) {
      const key = `${r.start_time}-${r.end_time}`;
      if (!seen.has(key)) seen.set(key, { start: r.start_time, end: r.end_time });
    }
    return Array.from(seen.values()).sort((a, b) => a.start.localeCompare(b.start));
  }, [recurring]);

  const cellFor = (start: string, end: string, weekday: number) =>
    recurring.find((r) => r.start_time === start && r.end_time === end && r.weekday === weekday);

  const needsReviewCount = (rows ?? []).filter((r) => r.needs_review).length;
  const activeCount = (rows ?? []).filter((r) => r.is_active).length;

  const openNew = (weekday: number, start: string, end: string) => {
    setPrefill({ weekday, startTime: timeShort(start), endTime: timeShort(end) });
    setEditing("new");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0 text-sky-400" />
        <span>
          <strong>Priority booking with release.</strong> Each claimed slot below belongs FIRST to the named
          activity — nothing else can book it until its release window (default 48h, editable per row via Edit,
          or for every slot sharing an activity name via "Apply to every slot") passes with no booking recorded
          for that activity. Then it opens to Horse School group/private lessons automatically. These claims also
          appear as badges on the real weekly grid in the Seasonal Calendars tab. Instructor names are internal to
          this panel — never shown on the public site until Marta confirms them.
        </span>
      </div>

      <Card className="p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-1 flex-wrap justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-heading tracking-wide">PRIORITY CLAIMS</h3>
            <DataSourceBadge source="live" />
            <span className="text-xs text-muted-foreground">Supabase · cal_slot_priority</span>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setPrefill(undefined); setEditing("new"); }}>
            <Plus className="h-4 w-4" /> New claim
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-4 mb-4">
          <Badge variant="outline" className="text-xs">{rows?.length ?? 0} claims total</Badge>
          <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-500">{activeCount} active</Badge>
          {needsReviewCount > 0 && (
            <Badge variant="outline" className="gap-1 text-xs border-amber-500/40 text-amber-400">
              <AlertTriangle className="h-3 w-3" /> {needsReviewCount} need review
            </Badge>
          )}
        </div>

        {!isSupabaseConfigured ? (
          <p className="text-sm text-destructive">Supabase is not configured — the slot priority registry cannot load.</p>
        ) : isError ? (
          <p className="text-sm text-destructive">{(error as Error)?.message ?? "Could not load slot priority."}</p>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : slotKeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recurring claims yet — add the first one above.</p>
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
                {slotKeys.map(({ start, end }) => (
                  <tr key={`${start}-${end}`} className="border-t">
                    <td className="py-2 pr-3 text-xs font-mono text-muted-foreground whitespace-nowrap align-top">
                      {timeShort(start)}–{timeShort(end)}
                    </td>
                    {WEEKDAY_LABELS.map((_, i) => {
                      const weekday = i + 1;
                      const claim = cellFor(start, end, weekday);
                      return (
                        <td key={weekday} className="py-2 px-2 align-top">
                          {claim ? (
                            <button
                              onClick={() => setEditing(claim)}
                              className={`w-full text-left rounded-md border px-2 py-1.5 hover:bg-muted/40 transition-colors ${
                                !claim.is_active ? "opacity-50 border-dashed" : "border-border"
                              }`}
                            >
                              <div className="text-xs font-medium truncate" title={claim.label}>{claim.label}</div>
                              {(claim.priority_instructor_raw) && (
                                <div className="text-[10px] text-muted-foreground truncate">{claim.priority_instructor_raw}</div>
                              )}
                              <div className="flex items-center gap-1 mt-1">
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">{claim.release_window_hours}h</Badge>
                                {claim.needs_review && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500/40 text-amber-500">review</Badge>
                                )}
                              </div>
                            </button>
                          ) : (
                            <button
                              onClick={() => openNew(weekday, start, end)}
                              className="w-full text-left rounded-md border border-dashed px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/20 transition-colors"
                            >
                              Open — Horse School <Plus className="h-3 w-3 inline ml-1" />
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollHint>
        )}
        <p className="text-xs text-muted-foreground mt-3">Click any claimed slot to edit; click an open cell to add a new claim there.</p>
      </Card>

      {dateGroups.length > 0 && (
        <Card className="p-6 shadow-sm">
          <h3 className="text-base font-heading tracking-wide mb-1">DATE-SPECIFIC CLAIMS</h3>
          <p className="text-xs text-muted-foreground mb-3">
            {dateSpecific.length} individual dated claims, grouped by activity + time window so this list stays
            readable regardless of how many dates exist.
          </p>
          <div className="space-y-2">
            {dateGroups.map((g) => {
              const isOpen = expandedGroup === g.key;
              return (
                <div key={g.key} className="rounded-md border">
                  <button
                    onClick={() => setExpandedGroup(isOpen ? null : g.key)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-muted/40 transition-colors text-left"
                  >
                    <span className="flex items-center gap-1.5">
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <strong>{g.label}</strong>
                      <span className="text-muted-foreground">— {timeShort(g.start_time)}–{timeShort(g.end_time)}</span>
                    </span>
                    <Badge variant="outline" className="text-xs">{g.rows.length} date{g.rows.length === 1 ? "" : "s"}</Badge>
                  </button>
                  {isOpen && (
                    <div className="max-h-56 overflow-y-auto border-t px-3 py-2 space-y-1">
                      {g.rows.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => setEditing(r)}
                          className="w-full flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-muted/40 transition-colors text-left"
                        >
                          <span>{r.specific_date ? fmtDate(r.specific_date) : "—"}{r.priority_instructor_raw ? ` · ${r.priority_instructor_raw}` : ""}</span>
                          <Badge variant="outline" className="text-[9px]">{r.release_window_hours}h</Badge>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <SlotPriorityAuditLog />

      <SlotPriorityEditDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        row={editing === "new" ? null : editing}
        actor={actor}
        prefill={editing === "new" ? prefill : undefined}
      />
    </div>
  );
};
