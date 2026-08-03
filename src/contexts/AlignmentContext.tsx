// Global alignment state (spec §0.1 / §0.2): window preset, comparison mode
// and scope are GLOBAL controls, persisted per user (localStorage), composing
// with every screen.
//
// 2026-08-03 live-review decision (Marcello, via Luca — supersedes part of
// the earlier basis-toggle work): "una sola" — only the STRICT basis (net of
// customer credit notes) is shown anywhere, no toggle. `basis` below is now
// PINNED to "STRICT" and `setBasis` is a no-op kept only so screens still
// destructuring it (Performance Analysis, pre-migration) don't fail to
// compile; it does nothing and is not called from any control anymore.
// Two new global toggles replace it + the old A/B structure toggle:
//   Comparison: "PY" | "BUDGET" — ONE comparison shown at a time everywhere
//     (KPI cards, charts, table) — "vederli assieme fa solo casino." Default PY.
//   Scope: "ALL" | "RECURRING" — absorbs the old "Management (validated)"
//     view: recurring-only statement lines when RECURRING. Default ALL.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Basis, WindowPresetId, Win } from "@/data/alignment";
import { resolveWindow, pyWin, winLabel, windowIncludesOpenMonths } from "@/data/alignment";
import { todayMonthKey } from "@/data/liveData";

export type ComparisonMode = "PY" | "BUDGET";
export type Scope = "ALL" | "RECURRING";

interface AlignmentState {
  /** Pinned to "STRICT" (2026-08-03 decision) — kept typed as `Basis` so
   * existing consumers compile unchanged; no control sets anything else. */
  basis: Basis;
  /** No-op — the basis toggle was removed everywhere. */
  setBasis: (b: Basis) => void;
  preset: WindowPresetId;
  setPreset: (p: WindowPresetId) => void;
  /** Resolved active window + its PY (same window −12m, always). */
  win: Win;
  windowName: string;
  py: Win;
  winLabelText: string;
  pyLabelText: string;
  /** Last complete month (set by the data host once rows load). */
  lastComplete: string;
  setLastComplete: (k: string) => void;
  /** Today's real calendar month (device clock, refreshed hourly) — anchors
   * "to date" windows (Month to date / YTD / FY to date). Never hard-coded. */
  todayKey: string;
  /** True when the ACTIVE window reaches past the last closed month — i.e.
   * it contains at least one still-open month (revenue live, costs partial). */
  includesOpenMonths: boolean;
  /** Which single comparison (PY or Budget) is shown right now — global,
   * persisted (2026-08-03 decision #2). */
  comparisonMode: ComparisonMode;
  setComparisonMode: (m: ComparisonMode) => void;
  /** All lines vs recurring-only lines (dim_recurrence) — global, persisted,
   * absorbs the old Statutory/Management structure toggle (decision #3). */
  scope: Scope;
  setScope: (s: Scope) => void;
  /** Founder gate (spec §1.1 / punch item 3): the model-adjustment memo
   * ladder is OPT-IN for client viewing — default OFF on load, persisted.
   * One switch governs both the P&L recurring-scope memo lines and the P3
   * tile ladder, so the memo layer is never half-visible. */
  memoOn: boolean;
  setMemoOn: (v: boolean) => void;
}

const Ctx = createContext<AlignmentState | null>(null);

const PRESET_KEY = "clever.windowPreset";
const MEMO_KEY = "clever.memoLadder";
const COMPARISON_KEY = "clever.comparisonMode";
const SCOPE_KEY = "clever.scope";

// Presets dropped from the selector per Marcello's live-review addendum
// 2026-08-03 ("As delivered" — "non serve a nulla in prospettiva"; "Last
// closed month" — redundant, the month itself now leads the list; "FY to
// date" — "non esiste"). A session with one of these still in localStorage
// falls back to TTM (always present, always a valid Select value) instead of
// resolving to an option the picker no longer shows.
const DEPRECATED_PRESETS = new Set(["AS_DELIVERED", "LAST_MONTH", "FY"]);

export const AlignmentProvider = ({ children }: { children: ReactNode }) => {
  // Basis is pinned — no state, no localStorage, no toggle (2026-08-03).
  const basis: Basis = "STRICT";
  const setBasis = () => { /* removed — only STRICT basis is shown anywhere */ };
  const [preset, setPresetState] = useState<WindowPresetId>(() => {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(PRESET_KEY) : null;
    return v && !DEPRECATED_PRESETS.has(v) ? v : "TTM";
  });
  const [lastComplete, setLastComplete] = useState<string>("2026-06");
  const [memoOn, setMemoOnState] = useState<boolean>(() => {
    // Founder gate: memo ladder is opt-in — default OFF on load (§1.1).
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(MEMO_KEY) : null;
    return v === "on";
  });
  const [comparisonMode, setComparisonModeState] = useState<ComparisonMode>(() => {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(COMPARISON_KEY) : null;
    return v === "BUDGET" ? "BUDGET" : "PY"; // PY is the DEFAULT (decision #2)
  });
  const [scope, setScopeState] = useState<Scope>(() => {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(SCOPE_KEY) : null;
    return v === "RECURRING" ? "RECURRING" : "ALL"; // All is the DEFAULT (decision #3)
  });
  // Today's calendar month, read from the device clock — refreshed hourly so
  // a cockpit left open overnight rolls MTD/YTD/FYTD to the new month/year on
  // its own, with no reload and nothing hard-coded (Marcello: "il 'to date'
  // non può essere June — deve essere aggiornato costantemente alla data
  // odierna").
  const [todayKey, setTodayKey] = useState<string>(() => todayMonthKey());
  useEffect(() => {
    const id = setInterval(() => setTodayKey(todayMonthKey()), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const setPreset = (p: WindowPresetId) => { setPresetState(p); try { localStorage.setItem(PRESET_KEY, p); } catch { /* private mode */ } };
  const setMemoOn = (v: boolean) => { setMemoOnState(v); try { localStorage.setItem(MEMO_KEY, v ? "on" : "off"); } catch { /* private mode */ } };
  const setComparisonMode = (m: ComparisonMode) => { setComparisonModeState(m); try { localStorage.setItem(COMPARISON_KEY, m); } catch { /* private mode */ } };
  const setScope = (s: Scope) => { setScopeState(s); try { localStorage.setItem(SCOPE_KEY, s); } catch { /* private mode */ } };

  const value = useMemo<AlignmentState>(() => {
    const { win, name } = resolveWindow(preset, lastComplete, todayKey);
    const py = pyWin(win);
    return {
      basis, setBasis, preset, setPreset, win, windowName: name, py,
      winLabelText: winLabel(win), pyLabelText: winLabel(py),
      lastComplete, setLastComplete,
      todayKey, includesOpenMonths: windowIncludesOpenMonths(win, lastComplete),
      comparisonMode, setComparisonMode, scope, setScope,
      memoOn, setMemoOn,
    };
  }, [preset, lastComplete, memoOn, todayKey, comparisonMode, scope]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAlignment = (): AlignmentState => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAlignment must be used inside AlignmentProvider");
  return ctx;
};
