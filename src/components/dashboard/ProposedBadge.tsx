// Badge marking a threshold, tier, score, cadence, or bucket whose LOGIC
// comes from the Treasury Decision-Rules DRAFT (2026-07-23) and has not yet
// been signed off by Marcello / Arwa. Every figure whose threshold/logic
// traces to that document must carry this badge — see the doc's own framing:
// "DRAFT — PROPOSAL. Everything below is proposed, not decided."
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ProposedBadgeProps {
  className?: string;
  /** Optional extra context appended to the tooltip (e.g. which §-section). */
  detail?: string;
}

export const ProposedBadge = ({ className, detail }: ProposedBadgeProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        className={cn(
          "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider align-middle border border-amber-500/40 bg-amber-500/10 text-amber-400 cursor-help",
          className,
        )}
      >
        Proposed — to confirm
      </span>
    </TooltipTrigger>
    <TooltipContent side="top" className="max-w-xs text-xs">
      Threshold/logic from the Treasury Decision-Rules DRAFT (2026-07-23) — not yet signed off by
      Marcello / Arwa.{detail ? ` ${detail}` : ""}
    </TooltipContent>
  </Tooltip>
);
