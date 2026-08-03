// Global chrome — basis toggle, window preset picker, basis badge and the
// warehouse-driven completeness banner (spec §1 global chrome + §1.5).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Scale, Lock, Archive, ChevronsRight, Info, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAlignment } from "@/contexts/AlignmentContext";
import {
  BASIS_LABELS, deriveCompleteness, useCompletenessMonthly, resolveWindow,
  flagsFromCompletenessView, type Basis, type BasisRow,
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

// Plain-language basis labels (Marcello: the old "Validated/Strict · pre-CN/
// net-CN" jargon was opaque). The internal enum (VALIDATED/STRICT) and every
// underlying figure are UNCHANGED — this relabels the two buttons only.
const BASIS_PLAIN_LABEL: Record<Basis, string> = {
  VALIDATED: "Before credit notes",
  STRICT: "Net of credit notes",
};

export const BasisToggle = ({ disabled, disabledReason }: { disabled?: boolean; disabledReason?: string }) => {
  const { basis, setBasis } = useAlignment();
  const seg = (b: Basis, label: string) => (
    <button
      type="button"
      onClick={() => !disabled && setBasis(b)}
      disabled={disabled}
      aria-pressed={basis === b}
      className={cn(
        "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors min-h-[36px]",
        basis === b && !disabled
          ? b === "VALIDATED"
            ? "bg-gold text-gold-foreground shadow-sm"
            : "bg-sky-500 text-white shadow-sm"
          : "text-muted-foreground hover:text-foreground",
        disabled && "opacity-50 cursor-not-allowed",
      )}
      title={BASIS_LABELS[b]}
    >
      {label}
    </button>
  );
  const control = (
    <div className="inline-flex items-center gap-1.5">
      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
        {seg("VALIDATED", BASIS_PLAIN_LABEL.VALIDATED)}
        {seg("STRICT", BASIS_PLAIN_LABEL.STRICT)}
        {disabled && <Lock className="h-3.5 w-3.5 text-muted-foreground mr-1" />}
      </div>
      {!disabled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="What are credit notes?"
              className="inline-flex items-center justify-center h-6 w-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs text-xs space-y-1">
            <p>
              A <strong>credit note</strong> reverses part of an invoice after it was booked — a refund,
              a discount, or a billing correction. It reduces the revenue that invoice originally showed.
            </p>
            <p>
              <strong>Before credit notes</strong> matches the delivered performance package (the numbers
              everyone already validated). <strong>Net of credit notes</strong> is the stricter view where
              those reversals are subtracted — same underlying data, more conservative revenue.
            </p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
  if (!disabled) return control;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{control}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm text-xs">
        {disabledReason ?? "The basis toggle does not apply to this statement."}
      </TooltipContent>
    </Tooltip>
  );
};

// ---------------------------------------------------------- window picker

export const WindowPicker = ({ months }: { months?: string[] }) => {
  const { preset, setPreset, lastComplete, todayKey } = useAlignment();
  // Marcello, live-review addendum 2026-08-03 — exact selector contents and
  // order: (1) Month to date, (2) YTD, (3) TTM (last 12 CLOSED months), then
  // (4) individual CLOSED months, newest first, down to January of the
  // CURRENT (calendar) year — dynamic length: today Jun '26 → Jun..Jan '26
  // (6 items); becomes Jul..Jan once July closes; resets to just the newest
  // month every January. "As delivered", "Last closed month" (redundant —
  // the month itself now leads the list) and "FY to date" are dropped from
  // the picker entirely (still valid `resolveWindow` presets internally,
  // just not offered here — see AlignmentContext's preset sanitizer for
  // sessions with one of these persisted from before).
  const monthItems = useMemo(() => {
    const yearStart = `${todayKey.slice(0, 4)}-01`;
    const range: string[] = [];
    let k = lastComplete;
    while (k >= yearStart) {
      range.push(k);
      k = shiftMonthKey(k, -1);
    }
    if (months && months.length > 0) {
      const have = new Set(months);
      return range.filter((m) => have.has(m));
    }
    return range;
  }, [months, lastComplete, todayKey]);
  // Every label is derived from resolveWindow — the SAME function that
  // resolves the active window — so menu text can never drift from what
  // selecting it actually computes. Nothing here is hard-coded: MTD/YTD
  // track `todayKey` (today's real calendar month); TTM tracks
  // `lastComplete` (the last CLOSED month) and relabels on its own once a
  // new month's costs post (§0.2).
  const mtd = useMemo(() => resolveWindow("MTD", lastComplete, todayKey), [lastComplete, todayKey]);
  const ytd = useMemo(() => resolveWindow("YTD", lastComplete, todayKey), [lastComplete, todayKey]);
  const ttm = useMemo(() => resolveWindow("TTM", lastComplete, todayKey), [lastComplete, todayKey]);
  return (
    <Select value={preset} onValueChange={setPreset}>
      <SelectTrigger className="w-[290px] bg-background font-medium">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-h-[340px]">
        <SelectItem value="MTD">
          <span className="inline-flex items-center gap-2">
            <Radio className="h-3 w-3 text-amber-400" />
            {mtd.name}
          </span>
        </SelectItem>
        <SelectItem value="YTD">
          <span className="inline-flex items-center gap-2">
            <Radio className="h-3 w-3 text-amber-400" />
            {ytd.name}
          </span>
        </SelectItem>
        <SelectItem value="TTM">{ttm.name}</SelectItem>
        {monthItems.map((m) => (
          <SelectItem key={m} value={`M:${m}`}>{monthKeyLabel(m)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

// ------------------------------------------------------- open-months badge

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
    const monthFlags = all.filter((f) => f.kind !== "lev-unbooked");
    const maxKey = monthFlags.reduce((m, f) => (f.key > m ? f.key : m), "");
    const cutoff = maxKey ? shiftMonthKey(maxKey, -12) : "";
    return all.filter((f) => f.kind === "lev-unbooked" || f.key >= cutoff);
  }, [viewState, rows]);
  if (flags.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300 flex items-start gap-2.5">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-400" />
      <div className="space-y-0.5">
        <p className="font-semibold text-amber-300">
          Data completeness — certified figures are as-booked; supplier bills and LEV fees outstanding.
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
