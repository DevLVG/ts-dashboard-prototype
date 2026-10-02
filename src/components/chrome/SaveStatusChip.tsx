// Shared "is my edit saved?" indicator — CEO live-review 2026-08-03: saving
// must be unambiguous everywhere edits happen (Catalogue, Site Copy, Media
// Library). Three states only: Saving… / Saved ✓ hh:mm:ss / Error — retry.
// Presentational only — each caller owns its own save lifecycle and passes
// the current state in.
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type SaveStatusKind = "idle" | "saving" | "saved" | "error";

export interface SaveStatusChipProps {
  state: SaveStatusKind;
  savedAt?: Date | null;
  errorMessage?: string;
  onRetry?: () => void;
  className?: string;
}

const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const SaveStatusChip = ({ state, savedAt, errorMessage, onRetry, className }: SaveStatusChipProps) => {
  if (state === "saving") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground shrink-0", className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-emerald-500 shrink-0", className)}>
        <CheckCircle2 className="h-3.5 w-3.5" /> Saved ✓{savedAt ? ` ${fmtTime(savedAt)}` : ""}
      </span>
    );
  }
  if (state === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        title={errorMessage}
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-destructive shrink-0 underline decoration-dotted hover:text-destructive/80",
          className,
        )}
      >
        <XCircle className="h-3.5 w-3.5" /> Error — retry
      </button>
    );
  }
  return null;
};
