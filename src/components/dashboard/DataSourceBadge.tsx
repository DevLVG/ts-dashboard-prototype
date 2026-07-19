// Small inline badge marking a series/section as LIVE (Supabase) or MOCK.
// Used during the mock -> real-data migration so every number's provenance
// is visible at a glance.
import { cn } from "@/lib/utils";

interface DataSourceBadgeProps {
  source: "live" | "mock";
  className?: string;
}

export const DataSourceBadge = ({ source, className }: DataSourceBadgeProps) => (
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
        ? "Live data from Supabase (pnl_by_bu / pnl_management)"
        : "Mock data — backend source not yet populated"
    }
  >
    {source === "live" ? "LIVE" : "MOCK"}
  </span>
);
