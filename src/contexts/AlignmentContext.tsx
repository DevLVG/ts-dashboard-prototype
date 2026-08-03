// Global alignment state (spec §0.1 / §0.2): the basis toggle and the window
// preset are GLOBAL controls, persisted per user (localStorage), composing
// with every screen. Cash Flow and Balance Sheet disable the basis toggle
// with an explanatory tooltip (cash/BS are basis-independent by nature).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Basis, WindowPresetId, Win } from "@/data/alignment";
import { resolveWindow, pyWin, winLabel, windowIncludesOpenMonths } from "@/data/alignment";
import { todayMonthKey } from "@/data/liveData";

interface AlignmentState {
  basis: Basis;
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
  /** Founder gate (spec §1.1 / punch item 3): the model-adjustment memo
   * ladder is OPT-IN for client viewing — default OFF on load, persisted.
   * One switch governs both the P&L View-B memo lines and the P3 tile
   * ladder, so the memo layer is never half-visible. */
  memoOn: boolean;
  setMemoOn: (v: boolean) => void;
}

const Ctx = createContext<AlignmentState | null>(null);

const BASIS_KEY = "clever.basis";
const PRESET_KEY = "clever.windowPreset";
const MEMO_KEY = "clever.memoLadder";

// Presets dropped from the selector per Marcello's live-review addendum
// 2026-08-03 ("As delivered" — "non serve a nulla in prospettiva"; "Last
// closed month" — redundant, the month itself now leads the list; "FY to
// date" — "non esiste"). A session with one of these still in localStorage
// falls back to TTM (always present, always a valid Select value) instead of
// resolving to an option the picker no longer shows.
const DEPRECATED_PRESETS = new Set(["AS_DELIVERED", "LAST_MONTH", "FY"]);

export const AlignmentProvider = ({ children }: { children: ReactNode }) => {
  const [basis, setBasisState] = useState<Basis>(() => {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(BASIS_KEY) : null;
    return v === "STRICT" ? "STRICT" : "VALIDATED"; // Validated is the DEFAULT (§0.1)
  });
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

  const setBasis = (b: Basis) => { setBasisState(b); try { localStorage.setItem(BASIS_KEY, b); } catch { /* private mode */ } };
  const setPreset = (p: WindowPresetId) => { setPresetState(p); try { localStorage.setItem(PRESET_KEY, p); } catch { /* private mode */ } };
  const setMemoOn = (v: boolean) => { setMemoOnState(v); try { localStorage.setItem(MEMO_KEY, v ? "on" : "off"); } catch { /* private mode */ } };

  const value = useMemo<AlignmentState>(() => {
    const { win, name } = resolveWindow(preset, lastComplete, todayKey);
    const py = pyWin(win);
    return {
      basis, setBasis, preset, setPreset, win, windowName: name, py,
      winLabelText: winLabel(win), pyLabelText: winLabel(py),
      lastComplete, setLastComplete,
      todayKey, includesOpenMonths: windowIncludesOpenMonths(win, lastComplete),
      memoOn, setMemoOn,
    };
  }, [basis, preset, lastComplete, memoOn, todayKey]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAlignment = (): AlignmentState => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAlignment must be used inside AlignmentProvider");
  return ctx;
};
