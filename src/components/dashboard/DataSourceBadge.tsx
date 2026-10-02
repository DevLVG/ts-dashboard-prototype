// Small inline badge marking a series/section as LIVE (Supabase) or MOCK.
// Used during the mock -> real-data migration so every number's provenance
// is visible at a glance.
import { cn } from "@/lib/utils";

interface DataSourceBadgeProps {
  source: "live" | "mock";
  className?: string;
  /** Owner-audit #17 (2026-08-04): page-specific tooltip text — this badge is
   * mounted on 7+ pages backed by entirely different tables (ar_aging_v2,
   * v_ready_to_pay, pricing_master_snap, cal_competitions, cal_instructors,
   * …), but the tooltip used to be a single hardcoded string naming
   * Performance/Cash's own source ("pnl_by_bu / pnl_management") everywhere.
   * Pass the real source here; default keeps the original text so any call
   * site that doesn't pass it (Performance/Cash, where it's correct) is
   * unchanged. */
  sourceLabel?: string;
}

const DEFAULT_LIVE_LABEL = "Live data from Supabase (pnl_by_bu / pnl_management)";

export const DataSourceBadge = ({ source, className, sourceLabel }: DataSourceBadgeProps) => (
  <span
    className={cn(
      "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider align-middle",
      source === "live"
        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
        : "bg-amber-500/15 text-amber-400 border border-amber-500/30",
      className,
    )}
    title={
      source === "live"
        ? (sourceLabel ?? DEFAULT_LIVE_LABEL)
        : "Mock data — backend source not yet populated"
    }
  >
    {source === "live" ? "LIVE" : "MOCK"}
  </span>
);
