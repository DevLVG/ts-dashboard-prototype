// Global alignment state (spec §0.1 / §0.2): the basis toggle and the window
// preset are GLOBAL controls, persisted per user (localStorage), composing
// with every screen. Cash Flow and Balance Sheet disable the basis toggle
// with an explanatory tooltip (cash/BS are basis-independent by nature).
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Basis, WindowPresetId, Win } from "@/data/alignment";
import { resolveWindow, pyWin, winLabel } from "@/data/alignment";

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

export const AlignmentProvider = ({ children }: { children: ReactNode }) => {
  const [basis, setBasisState] = useState<Basis>(() => {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(BASIS_KEY) : null;
    return v === "STRICT" ? "STRICT" : "VALIDATED"; // Validated is the DEFAULT (§0.1)
  });
  const [preset, setPresetState] = useState<WindowPresetId>(() => {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(PRESET_KEY) : null;
    return v || "TTM";
  });
  const [lastComplete, setLastComplete] = useState<string>("2026-06");
  const [memoOn, setMemoOnState] = useState<boolean>(() => {
    // Founder gate: memo ladder is opt-in — default OFF on load (§1.1).
    const v = typeof localStorage !== "undefined" ? localStorage.getItem(MEMO_KEY) : null;
    return v === "on";
  });

  const setBasis = (b: Basis) => { setBasisState(b); try { localStorage.setItem(BASIS_KEY, b); } catch { /* private mode */ } };
  const setPreset = (p: WindowPresetId) => { setPresetState(p); try { localStorage.setItem(PRESET_KEY, p); } catch { /* private mode */ } };
  const setMemoOn = (v: boolean) => { setMemoOnState(v); try { localStorage.setItem(MEMO_KEY, v ? "on" : "off"); } catch { /* private mode */ } };

  const value = useMemo<AlignmentState>(() => {
    const { win, name } = resolveWindow(preset, lastComplete);
    const py = pyWin(win);
    return {
      basis, setBasis, preset, setPreset, win, windowName: name, py,
      winLabelText: winLabel(win), pyLabelText: winLabel(py),
      lastComplete, setLastComplete,
      memoOn, setMemoOn,
    };
  }, [basis, preset, lastComplete, memoOn]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useAlignment = (): AlignmentState => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAlignment must be used inside AlignmentProvider");
  return ctx;
};
