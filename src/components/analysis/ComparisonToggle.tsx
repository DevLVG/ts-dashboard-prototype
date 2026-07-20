// Comparison column toggles — Actual is always shown; the user can switch on
// up to TWO of Budget / Prev Year / Prev Period (Marcello's ratified middle
// path, 2026-07-20). Selecting a third drops the oldest selection.
import { cn } from "@/lib/utils";
import { COMPARISON_LABELS, type ComparisonKind } from "@/data/analysisModel";

interface ComparisonToggleProps {
  active: ComparisonKind[]; // ordered, max 2
  onChange: (next: ComparisonKind[]) => void;
}

const ALL: ComparisonKind[] = ["BUD", "PY", "PP"];
export const MAX_COMPARISONS = 2;

export const ComparisonToggle = ({ active, onChange }: ComparisonToggleProps) => {
  const toggle = (kind: ComparisonKind) => {
    if (active.includes(kind)) {
      onChange(active.filter((k) => k !== kind));
    } else {
      const next = [...active, kind];
      onChange(next.length > MAX_COMPARISONS ? next.slice(next.length - MAX_COMPARISONS) : next);
    }
  };

  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-muted p-1 shadow-sm">
      <span className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Compare
      </span>
      {ALL.map((kind) => {
        const on = active.includes(kind);
        return (
          <button
            key={kind}
            type="button"
            onClick={() => toggle(kind)}
            title={`${on ? "Hide" : "Show"} the ${COMPARISON_LABELS[kind]} columns (Actual always shown; max ${MAX_COMPARISONS} comparisons)`}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200",
              on
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground hover:bg-background/60",
            )}
          >
            {COMPARISON_LABELS[kind]}
          </button>
        );
      })}
    </div>
  );
};
