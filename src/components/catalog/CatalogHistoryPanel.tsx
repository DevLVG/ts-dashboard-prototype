// History panel — the Catalogue CMS's change/sync audit trail, tucked away.
// CEO live-review 2026-08-03: "keep it but tuck it away" — collapsed by
// default so it never competes with the working surface (the product
// table + edit dialog). One-line tooltip explains what it's for; the full
// audit table (CatalogAuditLog) only mounts once expanded.
import { useState } from "react";
import { ChevronRight, History, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CatalogAuditLog } from "@/components/catalog/CatalogAuditLog";
import { cn } from "@/lib/utils";

export const CatalogHistoryPanel = () => {
  const [open, setOpen] = useState(false);

  return (
    <Card className="shadow-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full flex items-center gap-2 px-6 py-3 text-left">
            <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")} />
            <History className="h-4 w-4 text-gold" />
            <h3 className="text-sm font-heading tracking-wide">HISTORY</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex items-center justify-center h-5 w-5 rounded-full text-muted-foreground/70 hover:text-muted-foreground cursor-help"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="h-3.5 w-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs">
                Change &amp; sync log for traceability — who edited what, when, and when it reached Shopify.
              </TooltipContent>
            </Tooltip>
            <span className="text-xs text-muted-foreground ml-auto">{open ? "Hide" : "Show"}</span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-6 pb-6 pt-1">
            <CatalogAuditLog />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
