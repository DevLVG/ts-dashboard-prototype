// REMINDER TEMPLATE MODAL — shared preview-before-send surface for both the
// customer reminder ladder and the vendor acknowledgement ladder. Always
// shows the filled template BEFORE anything is recorded or sent — nothing
// fires from a bare button click.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Send, FlaskConical, ShieldAlert, MailX } from "lucide-react";
import type { DunningSendResult } from "@/lib/dunningSend";

export interface ReminderTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heading: string; // "Send reminder — Sara Yamani"
  templateLabel: string; // "Stage 2 — Second reminder"
  subject: string;
  body: string;
  recipientEmail: string | null;
  sendEnabled: boolean;
  isBusy: boolean;
  onConfirm: () => void | Promise<void>;
  onSendTest: () => void | Promise<void>;
  lastResult?: DunningSendResult | null;
}

export const ReminderTemplateModal = ({
  open, onOpenChange, heading, templateLabel, subject, body, recipientEmail,
  sendEnabled, isBusy, onConfirm, onSendTest, lastResult,
}: ReminderTemplateModalProps) => {
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    try { await onSendTest(); } finally { setTesting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-gold" /> {heading}
          </DialogTitle>
          <DialogDescription>{templateLabel} — preview before recording / sending.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            <ShieldAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              {sendEnabled
                ? "Sending is ARMED — this will attempt a real dispatch to the recipient below."
                : "Send is in rehearsal mode until go-live. Confirming below records the decision and advances the status — nothing is actually sent."}
            </span>
          </div>

          <div className="rounded-md border border-border bg-muted/10 p-3 text-sm space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">To:</span>
              {recipientEmail ? (
                <span className="tabular-nums">{recipientEmail}</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-400"><MailX className="h-3 w-3" /> No email on file</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Subject:</span> {subject}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm text-foreground max-h-64 overflow-y-auto">{body}</pre>
          </div>

          {lastResult && (
            <p className={`text-xs ${lastResult.mode === "error" ? "text-destructive" : lastResult.mode === "test" || lastResult.mode === "live" ? "text-success" : "text-muted-foreground"}`}>
              {lastResult.detail}
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" disabled={testing || isBusy} onClick={handleTest}>
            <FlaskConical className="h-3.5 w-3.5" /> {testing ? "Sending test…" : "Send test to analyst@leveredge.pro"}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={isBusy} onClick={onConfirm} className="gap-1.5">
            <Send className="h-3.5 w-3.5" /> {isBusy ? "Recording…" : sendEnabled ? "Send & record" : "Record decision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
