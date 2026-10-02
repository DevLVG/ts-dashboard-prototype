// Global chrome — basis toggle, window preset picker, basis badge and the
// warehouse-driven completeness banner (spec §1 global chrome + §1.5).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { AlertTriangle, Scale, Archive, ChevronsRight, ChevronLeft, ChevronRight, Radio, TrendingUp, Wallet, Layers, Repeat, CalendarRange, X, History, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlignment, type ComparisonMode, type Scope } from "@/contexts/AlignmentContext";
import {
  BASIS_LABELS, deriveCompleteness, useCompletenessMonthly, resolveWindow,
  flagsFromCompletenessView, calendarQuarters, lastFinishedCalendarMonth, winLabel,
  LEV_FLAG_KINDS, type Basis, type BasisRow,
} from "@/data/alignment";
import { monthKeyLabel, shiftMonthKey } from "@/data/liveData";

// ------------------------------------------------------------ basis badge

/** Per-tile basis chip (spec §0.1: every figure carries its basis badge). */
export const BasisBadge = ({ basis, className }: { basis: Basis; className?: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        className={cn(
          "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider align-middle cursor-help",
          basis === "VALIDATED"
            ? "bg-gold/15 text-gold border border-gold/40"
            : "bg-sky-500/15 text-sky-400 border border-sky-500/40",
          className,
        )}
      >
        {basis === "VALIDATED" ? "Validated" : "Strict"}
      </span>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs text-xs">{BASIS_LABELS[basis]}</TooltipContent>
  </Tooltip>
);

// ------------------------------------------------------------ basis toggle

/** REMOVED 2026-08-03 (Marcello, live review — "una sola: net of credit
 * notes, niente toggle"). Kept as a no-op export so any not-yet-migrated
 * screen that still renders `<BasisToggle />` compiles and simply shows
 * nothing, rather than needing a coordinated multi-file edit to land this
 * decision. Use `StrictBasisNote` for the plain-language footnote instead. */
export const BasisToggle = (_props: { disabled?: boolean; disabledReason?: string }) => null;

/** REMOVED (fix-25, 2026-08-04, Marcello — CEO Cockpit chrome cleanup): the
 * "Figures net of customer credit notes" footnote is retired from the shared
 * chrome — STRICT basis is already the only basis shown anywhere (2026-08-03
 * decision above), restating it on every screen was noise. No-op export kept
 * so existing `<StrictBasisNote />` call sites (Economics; the retired P&L
 * Overview) compile unchanged and simply render nothing — same pattern as
 * `BasisToggle` above. Does NOT touch `OpenMonthsBadge` below, which stays. */
export const StrictBasisNote = (_props: { className?: string }) => null;

// ------------------------------------------------------- comparison toggle

/** Decision #2 (2026-08-03): ONE comparison shown at a time everywhere — KPI
 * cards, charts, the P&L table — never more than one together ("fa solo
 * casino" together). Global + persisted, default "Versus Previous Year".
 * Third segment "Versus Previous Period" added 2026-08-08 (CEO live-review
 * request): the window immediately preceding the active one, same length
 * (`ppWin` in data/alignment.ts) — distinct from Previous Year, which is
 * always a fixed −12 months regardless of the window's own length. */
export const ComparisonToggle = () => {
  const { comparisonMode, setComparisonMode } = useAlignment();
  const seg = (m: ComparisonMode, label: string, Icon: typeof TrendingUp) => (
    <button
      type="button"
      onClick={() => setComparisonMode(m)}
      aria-pressed={comparisonMode === m}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[36px]",
        comparisonMode === m
          ? "bg-gold text-gold-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1 flex-wrap">
      {seg("PY", "Versus Previous Year", TrendingUp)}
      {seg("PP", "Versus Previous Period", History)}
      {seg("BUDGET", "Versus Budget", Wallet)}
    </div>
  );
};

// ------------------------------------------------------------- scope toggle

/** Decision #3 (2026-08-03): absorbs the old Statutory/Management structure
 * toggle — "Only Recurring" filters the statement to recurring lines only
 * (dim_recurrence). Global + persisted, default "All". */
export const ScopeToggle = () => {
  const { scope, setScope } = useAlignment();
  const seg = (s: Scope, label: string, Icon: typeof Layers) => (
    <button
      type="button"
      onClick={() => setScope(s)}
      aria-pressed={scope === s}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[36px]",
        scope === s
          ? "bg-gold text-gold-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {seg("ALL", "All", Layers)}
      {seg("RECURRING", "Only Recurring", Repeat)}
    </div>
  );
};

// ------------------------------------------------- month-range calendar

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Real, clickable calendar for the Custom range panel below (Marcello,
 * live review 2026-08-08 — "voglio un calendario vero, non solo digitare le
 * date"). Deliberately a MONTH grid, not a day grid: the picker everywhere
 * else here works at month-key grain (see the long note on `WindowPicker`
 * below on why day grain would be dishonest — no daily P&L fact exists), so
 * a day-level `react-day-picker` <Calendar/> would invite a precision the
 * data can't back up. Built from the exact same primitives/tokens as the
 * shadcn `Calendar` in `components/ui/calendar.tsx` (`buttonVariants`,
 * `bg-primary`/`text-primary-foreground` for the selected day, `bg-accent`
 * for the in-range fill, ghost hover) so it reads as part of the same
 * component family and inherits the dashboard's charcoal/gold theme for
 * free — no new dependency, no new palette. Year-at-a-time nav, clamped to
 * [min, max] (the real warehouse history), so out-of-range years/months are
 * simply unreachable rather than clickable-then-rejected. */
const MonthRangeCalendar = ({
  min,
  max,
  start,
  end,
  onPick,
}: {
  min: string;
  max: string;
  start: string;
  end: string;
  onPick: (key: string) => void;
}) => {
  const [viewYear, setViewYear] = useState(() => Number((end || start || max).slice(0, 4)) || Number(max.slice(0, 4)));
  const minYear = Number(min.slice(0, 4));
  const maxYear = Number(max.slice(0, 4));
  const navBtn = "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 disabled:opacity-20 disabled:pointer-events-none disabled:hover:opacity-20";
  return (
    <div className="select-none">
      <div className="flex items-center justify-between pb-2">
        <button
          type="button"
          aria-label="Previous year"
          disabled={viewYear <= minYear}
          onClick={() => setViewYear((y) => y - 1)}
          className={cn(buttonVariants({ variant: "outline" }), navBtn)}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium tabular-nums">{viewYear}</span>
        <button
          type="button"
          aria-label="Next year"
          disabled={viewYear >= maxYear}
          onClick={() => setViewYear((y) => y + 1)}
          className={cn(buttonVariants({ variant: "outline" }), navBtn)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {MONTH_ABBR.map((label, i) => {
          const key = `${viewYear}-${String(i + 1).padStart(2, "0")}`;
          const disabled = key < min || key > max;
          const isEdge = key === start || key === end;
          const inRange = !!start && !!end && key > start && key < end;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-pressed={isEdge}
              onClick={() => onPick(key)}
              title={monthKeyLabel(key)}
              className={cn(
                buttonVariants({ variant: "ghost" }),
                "h-9 w-full p-0 font-normal text-sm rounded-md",
                disabled && "text-muted-foreground opacity-40 pointer-events-none",
                inRange && "bg-accent/60 text-accent-foreground rounded-none",
                isEdge && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------- window picker

export const WindowPicker = ({ months }: { months?: string[] }) => {
  const { preset, setPreset, lastComplete, todayKey, windowName } = useAlignment();
  // Marcello (CEO), live-review — FINAL shape of the shared period selector
  // (2026-08-03), one control for Economics AND Cash Flow. Exact contents,
  // in this exact order, nothing else:
  //   1. Month to date
  //   2. Year to date
  //   3. Last 12 months (TTM)
  //   4. The MONTHS, rolling: from the most recently FINISHED calendar month
  //      (today Aug '26 -> tops out at Jul '26; flips to Aug once September
  //      starts) back to January of the current year -- dynamic length,
  //      resets every January. Anchored to the CALENDAR
  //      (`lastFinishedCalendarMonth`), NOT to accounting close
  //      (`lastComplete`): an open month (costs still partial) is listed and
  //      selectable regardless -- the page's existing open-month/
  //      completeness badge carries that signal, the selector never hides
  //      the month.
  //   5. The QUARTERS -- Q1..Q4 of the current calendar year -- ALWAYS all
  //      four, regardless of whether the warehouse has data for them yet
  //      ("indipendentemente dal fatto che sia alimentato o no"); a quarter
  //      with no data renders the page's honest empty state, it is never
  //      hidden from the picker.
  //   6. "Custom…" (fix-25, 2026-08-04, live request — Marcello), pinned at
  //      the BOTTOM, below a separator. Opens a small popover with two
  //      Start/End month inputs instead of committing a value straight from
  //      the dropdown — picking it does NOT change the active window until
  //      "Apply". Resolves through the exact same `resolveWindow` path as
  //      every other item (preset `"CUSTOM:YYYY-MM:YYYY-MM"`), so PY (-12mo
  //      shift), Budget aggregation and the open-months badge all fall out
  //      for free with zero extra code. Month-key grain, same as every other
  //      window here — the warehouse has no daily P&L fact (see the MTD
  //      proration note elsewhere in this file's sibling module), so day
  //      inputs would either silently round to the containing month (fine)
  //      or fabricate a same-day precision the data can't actually support
  //      (not fine) — month inputs make the real grain honest and obvious
  //      instead of quietly rounding a day the user typed.
  // Item labels stay CLEAN -- no "(Jul '25->Jun '26)" window annotations
  // cluttering the visible text; the full window detail moves to a hover
  // tooltip (native `title`) on each option instead. "As delivered", "Last
  // closed month" and "FY to date" stay dropped from the picker (still valid
  // internal `resolveWindow` presets -- see AlignmentContext's sanitizer for
  // sessions with one persisted from before). The `months` prop (fact months
  // actually present in the warehouse, fed by the page) now bounds the
  // Custom start/end inputs to real data history — it is NOT used to filter
  // the calendar/quarter items above, which stay calendar-driven per the
  // 2026-08-03 decision.
  const monthItems = useMemo(() => {
    const yearStart = `${todayKey.slice(0, 4)}-01`;
    const top = lastFinishedCalendarMonth(todayKey);
    const range: string[] = [];
    let k = top;
    while (k >= yearStart) {
      range.push(k);
      k = shiftMonthKey(k, -1);
    }
    return range;
  }, [todayKey]);
  const quarterItems = useMemo(() => calendarQuarters(todayKey), [todayKey]);
  // Every window (and its tooltip detail) is derived from resolveWindow —
  // the SAME function that resolves the active window — so the hover text
  // can never drift from what selecting the item actually computes. Nothing
  // here is hard-coded: MTD/YTD track `todayKey` (today's real calendar
  // month); TTM tracks `lastComplete` (the last CLOSED month, for trend
  // comparability) and relabels on its own once a new month's costs post
  // (§0.2).
  const mtd = useMemo(() => resolveWindow("MTD", lastComplete, todayKey), [lastComplete, todayKey]);
  const ytd = useMemo(() => resolveWindow("YTD", lastComplete, todayKey), [lastComplete, todayKey]);
  const ttm = useMemo(() => resolveWindow("TTM", lastComplete, todayKey), [lastComplete, todayKey]);

  // ------------------------------------------------------- Custom range
  const isCustom = preset.startsWith("CUSTOM:");
  const [customOpen, setCustomOpen] = useState(false);
  const [draftStart, setDraftStart] = useState("");
  const [draftEnd, setDraftEnd] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  // "Within data history" (spec, fix-25): bound the two inputs to the
  // earliest/latest month the warehouse actually has fact rows for, fed by
  // the page via `months`. Falls back to a generous, never-blocking range
  // if the page hasn't loaded rows yet (first paint) so the inputs are
  // always usable, never stuck disabled on a slow connection.
  const monthBounds = useMemo(() => {
    const sorted = (months ?? []).filter(Boolean).sort();
    return { min: sorted[0] ?? "2020-01", max: sorted[sorted.length - 1] ?? todayKey };
  }, [months, todayKey]);

  const openCustomPicker = () => {
    if (isCustom) {
      const [, s, e] = preset.split(":");
      setDraftStart(s ?? monthBounds.max);
      setDraftEnd(e ?? monthBounds.max);
    } else if (!draftStart || !draftEnd) {
      // Sensible default seed the first time: trailing 3 full months.
      setDraftStart(shiftMonthKey(monthBounds.max, -2));
      setDraftEnd(monthBounds.max);
    }
    setCustomOpen(true);
  };

  const draftInvalid = !draftStart || !draftEnd || draftStart > draftEnd;
  const applyCustom = () => {
    if (draftInvalid) return;
    setPreset(`CUSTOM:${draftStart}:${draftEnd}`);
    setCustomOpen(false);
  };

  // Clear the in-progress selection (CEO live-review request, 2026-08-08 —
  // he had a month already picked and couldn't find an obvious way to wipe
  // it and start over). Resets BOTH the calendar's own start/end and the two
  // typed inputs, since they share the same draftStart/draftEnd state — one
  // click empties the panel back to its opening state, ready for a fresh
  // first click on the calendar. Only shown once there is something to
  // clear (see the button's own `(draftStart || draftEnd) &&` guard below).
  const clearDraft = () => {
    setDraftStart("");
    setDraftEnd("");
  };

  // Calendar click semantics (fix — 2026-08-08, Marcello live review, real
  // clickable calendar): first click starts a new range (clears end);
  // clicking again either closes the range (if on/after start) or restarts
  // it (if before start) — the same two-click convention as every other
  // month-range calendar. Shares `draftStart`/`draftEnd` with the two text
  // inputs below so clicking and typing stay in lockstep either direction.
  const pickCalendarMonth = (key: string) => {
    if (!draftStart || draftEnd) {
      setDraftStart(key);
      setDraftEnd("");
    } else if (key < draftStart) {
      setDraftStart(key);
    } else {
      setDraftEnd(key);
    }
  };

  // Click-outside + Escape to close — a plain conditional panel (NOT a
  // second Radix portal primitive) deliberately: an earlier version used
  // <Popover> anchored to the Select, but closing/opening the Popover in the
  // same tick as `setPreset`'s page-wide re-render raced Radix's own
  // portal/anchor bookkeeping and threw a DOM removeChild error (two
  // portal-based primitives mounting/unmounting off the same state change).
  // A plain div has no competing imperative DOM tracking, so it can't race.
  useEffect(() => {
    if (!customOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setCustomOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCustomOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [customOpen]);

  return (
    <div ref={containerRef} className="relative">
      <Select
        value={preset}
        onValueChange={(v) => {
          if (v === "CUSTOM_PICK") { openCustomPicker(); return; }
          setPreset(v);
        }}
      >
        <SelectTrigger className="w-[290px] bg-background font-medium">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[420px]">
          <SelectItem value="MTD" title={mtd.name}>
            <span className="inline-flex items-center gap-2">
              <Radio className="h-3 w-3 text-amber-400" />
              Month to date
            </span>
          </SelectItem>
          <SelectItem value="YTD" title={ytd.name}>
            <span className="inline-flex items-center gap-2">
              <Radio className="h-3 w-3 text-amber-400" />
              Year to date
            </span>
          </SelectItem>
          <SelectItem value="TTM" title={ttm.name}>Last 12 months</SelectItem>
          <SelectSeparator />
          {monthItems.map((m) => (
            <SelectItem key={m} value={`M:${m}`}>{monthKeyLabel(m)}</SelectItem>
          ))}
          <SelectSeparator />
          {quarterItems.map((q) => (
            <SelectItem key={q.id} value={q.id} title={winLabel(q.win)}>{q.label}</SelectItem>
          ))}
          <SelectSeparator />
          {/* Live custom value gets its OWN item (matching `value={preset}`
              exactly) so Radix's normal value->label lookup resolves it —
              deliberately NOT done via a `<SelectValue>` children override,
              which triggered a Radix Select portal removeChild crash on the
              live YTD-> Custom transition (root-caused during fix-25 QA;
              worked fine on a fresh mount, only broke on a live value swap —
              see git history for the debugging trail). */}
          {isCustom && (
            <SelectItem value={preset} title={windowName}>
              <span className="inline-flex items-center gap-2">
                <CalendarRange className="h-3.5 w-3.5 text-gold/80" />
                {windowName}
              </span>
            </SelectItem>
          )}
          <SelectItem value="CUSTOM_PICK" title="Pick a start and end month">
            <span className="inline-flex items-center gap-2">
              <CalendarRange className="h-3.5 w-3.5 text-gold/80" />
              Custom…
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      {customOpen && (
        <div
          role="dialog"
          aria-label="Custom range"
          className="absolute left-0 top-full z-50 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] space-y-3 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-md"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">Custom range</p>
            <div className="flex items-center gap-2">
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {draftStart ? monthKeyLabel(draftStart) : "Start"} → {draftEnd ? monthKeyLabel(draftEnd) : "End"}
              </p>
              {(draftStart || draftEnd) && (
                <button
                  type="button"
                  onClick={clearDraft}
                  className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-semibold text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  aria-label="Clear selected dates"
                  title="Clear selected dates"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Click-driven calendar (fix — 2026-08-08, Marcello live review:
              "voglio un calendario vero da cliccare"). Month grain, clamped
              to the real warehouse history in `monthBounds`. */}
          <MonthRangeCalendar
            min={monthBounds.min}
            max={monthBounds.max}
            start={draftStart}
            end={draftEnd}
            onPick={pickCalendarMonth}
          />

          {/* Typing stays available for anyone who prefers it — shares the
              same draftStart/draftEnd state as the calendar above, so either
              input method stays in sync with the other. */}
          <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
            <div className="space-y-1">
              <label htmlFor="custom-range-start" className="text-xs text-muted-foreground">Start month</label>
              <input
                id="custom-range-start"
                type="month"
                value={draftStart}
                min={monthBounds.min}
                max={draftEnd || monthBounds.max}
                onChange={(e) => setDraftStart(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="custom-range-end" className="text-xs text-muted-foreground">End month</label>
              <input
                id="custom-range-end"
                type="month"
                value={draftEnd}
                min={draftStart || monthBounds.min}
                max={monthBounds.max}
                onChange={(e) => setDraftEnd(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
              />
            </div>
          </div>
          {draftStart && draftEnd && draftStart > draftEnd && (
            <p className="text-xs text-destructive">Start must be on or before end.</p>
          )}
          <p className="text-[11px] text-muted-foreground">
            Data available from {monthKeyLabel(monthBounds.min)} to {monthKeyLabel(monthBounds.max)}.
          </p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCustomOpen(false)}>Cancel</Button>
            <Button type="button" size="sm" disabled={draftInvalid} onClick={applyCustom}>Apply</Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------- loading state

/** Shared "still working" block for pages whose first load takes long enough
 * (2026-08-08, CEO live review) to read as frozen — Balance Sheet and Cash
 * Flow each ran several paginated warehouse fetches with only a single small
 * muted sentence as any loading signal, easy to miss entirely; the CEO
 * mistook a genuinely-still-loading page for a broken one mid-demo and asked
 * for an emergency restart. This is the immediate fix (a clear, hard-to-miss
 * spinner + message) — NOT a fix for the underlying slowness itself, which
 * is a separate, measured diagnosis (see the perf investigation notes on
 * useCashFlowPageData.ts / BalanceSheetLive.tsx). Callers should render this
 * INSTEAD OF their content while loading (never alongside it) — showing the
 * two together is what let stale/placeholder "—" figures read as "loaded but
 * empty" during the wait. */
export const LoadingState = ({ label }: { label: string }) => (
  <div
    role="status"
    aria-live="polite"
    className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card py-16 text-center animate-fade-in"
  >
    <Loader2 className="h-8 w-8 animate-spin text-gold" aria-hidden />
    <p className="text-sm font-semibold text-foreground">{label}</p>
    <p className="text-xs text-muted-foreground max-w-xs">
      Pulling live figures from the warehouse — this can take several seconds. The page is working, not stuck.
    </p>
  </div>
);

// ------------------------------------------------------------- open-months badge

/** Spec §0.3 honesty rule: any window reaching past the last closed month
 * carries this badge — revenue is live, costs may still be partial. Reuses
 * the same "closed vs open" signal as the completeness banner so certified
 * and open data are never silently mixed without a visible flag. */
export const OpenMonthsBadge = () => {
  const { includesOpenMonths } = useAlignment();
  if (!includesOpenMonths) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300 cursor-help">
          <Radio className="h-3 w-3" />
          Includes open months
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs">
        This window reaches into a month that hasn't closed yet: revenue is live and up to date, but
        supplier bills and other costs may still be partially posted. See the completeness banner below
        for which month(s) and why.
      </TooltipContent>
    </Tooltip>
  );
};

// ----------------------------------------------------- completeness banner

/** §1.5 — single warehouse-driven banner; no hardcoded month list.
 * Prefers the DB-7 view (v_data_completeness_monthly); falls back to the
 * client heuristic on the fact rows until DB-7 lands. */
export const CompletenessBanner = ({ rows }: { rows: BasisRow[] | undefined }) => {
  const { data: viewState } = useCompletenessMonthly();
  const flags = useMemo(() => {
    const all = viewState?.available
      ? flagsFromCompletenessView(viewState.rows)
      : deriveCompleteness(rows);
    // Recency filter: the banner is about the CURRENT close state — keep the
    // trailing 13 months (historical partial closes live in the fix reports).
    // The lev-* flags (unbooked / not-invoiced / awaiting-entry / F&F note)
    // are always current-status, not subject to the trailing window.
    const monthFlags = all.filter((f) => !LEV_FLAG_KINDS.has(f.kind));
    const maxKey = monthFlags.reduce((m, f) => (f.key > m ? f.key : m), "");
    const cutoff = maxKey ? shiftMonthKey(maxKey, -12) : "";
    return all.filter((f) => LEV_FLAG_KINDS.has(f.kind) || f.key >= cutoff);
  }, [viewState, rows]);
  if (flags.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300 flex items-start gap-2.5">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
      <div className="space-y-0.5">
        <p className="font-semibold text-amber-300">
          Data completeness — certified figures are as-booked; some recent months are pending entry.
        </p>
        <p className="text-amber-300/90">
          {flags.map((f) => f.detail).join(" · ")}
        </p>
      </div>
    </div>
  );
};

/** Cell-level marker for incomplete months (tables). */
export const IncompleteMark = ({ flagged, className }: { flagged: boolean; className?: string }) => {
  if (!flagged) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("text-amber-400 cursor-help select-none", className)}>◦</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">Month incomplete — costs not fully posted.</TooltipContent>
    </Tooltip>
  );
};

// ---------------------------------------------------- frozen-reference chip

/** Spec §0.3 / §5-A (punch item 6): a clearly-labeled STATIC citation of the
 * delivered package — frozen figures that legitimately exist nowhere in the
 * warehouse. Visually distinct from live figures: dashed border, archive
 * icon, muted ink; the label always says "as delivered". */
export const FrozenRefChip = ({ label, children }: { label: string; children: ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 px-2 py-1 text-[11px] leading-snug text-muted-foreground cursor-help max-w-full">
        <Archive className="h-3 w-3 shrink-0 text-muted-foreground/70" />
        <span className="font-semibold uppercase tracking-wider text-[9px] text-muted-foreground/80 shrink-0">{label}</span>
        <span className="tabular-nums">{children}</span>
      </span>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-sm text-xs">
      Static citation of the delivered package ({label.toLowerCase()}) — NOT a live warehouse
      figure. The panel always computes live; this chip preserves what the client received.
    </TooltipContent>
  </Tooltip>
);

// ------------------------------------------------------------- scroll hint

/** Horizontal-overflow affordance for wide tables: wraps an overflow-x-auto
 * container and shows a "scroll →" pill + right-edge fade while the content
 * actually overflows (recomputed on resize/content change). */
export const ScrollHint = ({ children, className }: { children: ReactNode; className?: string }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atEnd, setAtEnd] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setOverflowing(el.scrollWidth > el.clientWidth + 2);
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    const t = setTimeout(measure, 300); // post-paint (fonts/columns settle)
    return () => { ro.disconnect(); el.removeEventListener("scroll", measure); clearTimeout(t); };
  }, [children]);
  return (
    <div className="relative">
      <div ref={ref} className={cn("overflow-x-auto", className)}>{children}</div>
      {overflowing && !atEnd && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background/90 to-transparent" />
          <div className="pointer-events-none absolute right-1 top-1 inline-flex items-center gap-0.5 rounded-full border border-border bg-background/95 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground shadow-sm">
            scroll <ChevronsRight className="h-3 w-3" />
          </div>
        </>
      )}
    </div>
  );
};

// -------------------------------------------------------- basis footnote

export const BudgetBasisFootnote = () => (
  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
    <Scale className="h-3.5 w-3.5 mt-px shrink-0 text-gold/70" />
    Budget is net of VAT and has no credit-note concept. On Strict basis, actuals are net of
    credit notes (conservative vs budget); on Validated basis the comparison is like-for-like
    with the delivered deck.
  </p>
);
