// HR — allegare/vedere le prove di un obiettivo hard (spec §3 "Prove").
// File (Supabase Storage, bucket privato hr-evidence) o collegamento.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Paperclip, Link as LinkIcon, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase, isSupabaseConfigured, toFriendlyError } from "@/lib/supabaseClient";
import { uploadHrEvidenceFile, addHrEvidenceLink, hrEvidenceSignedUrl, type HrEvidence } from "@/data/hrLive";

interface Props { objectiveId: number; open: boolean; onOpenChange: (open: boolean) => void }

export const HrEvidencePanel = ({ objectiveId, open, onOpenChange }: Props) => {
  const { session } = useAuth();
  const actor = session?.user?.email ?? "unknown";
  const { toast } = useToast();
  const qc = useQueryClient();
  const [linkUrl, setLinkUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: evidence, isLoading } = useQuery({
    queryKey: ["hr", "evidence", objectiveId],
    enabled: isSupabaseConfigured && open,
    queryFn: async (): Promise<HrEvidence[]> => {
      const { data, error } = await supabase!.from("hr_evidence").select("*").eq("objective_id", objectiveId).order("uploaded_at", { ascending: false });
      if (error) throw toFriendlyError(error);
      return data as HrEvidence[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["hr", "evidence", objectiveId] });
    qc.invalidateQueries({ queryKey: ["hr", "card"] });
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      await uploadHrEvidenceFile(objectiveId, file, actor);
      toast({ title: "Prova allegata" });
      refresh();
    } catch (e) {
      toast({ title: "Errore nel caricamento", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleLink = async () => {
    if (!linkUrl.trim()) return;
    setBusy(true);
    try {
      await addHrEvidenceLink(objectiveId, linkUrl.trim(), actor);
      setLinkUrl("");
      toast({ title: "Collegamento aggiunto" });
      refresh();
    } catch (e) {
      toast({ title: "Errore", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (path: string) => {
    // iOS Safari blocca window.open dopo un await (il tap non conta piu' come
    // gesto utente): la finestra va aperta SUBITO, sincrona, e reindirizzata poi.
    const win = window.open("", "_blank");
    try {
      const url = await hrEvidenceSignedUrl(path);
      if (!url) throw new Error("Link al file non generato");
      if (win) win.location.href = url;
      else window.location.assign(url);
    } catch (e) {
      win?.close();
      toast({ title: "Il file non si apre", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Prove per questo obiettivo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : !evidence || evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna prova allegata — l'obiettivo è "non dimostrato".</p>
          ) : (
            <ul className="space-y-1.5">
              {evidence.map((e) => (
                <li key={e.evidence_id} className="text-sm flex items-center gap-2">
                  {e.kind === "file" ? (
                    <button className="flex items-center gap-1.5 underline decoration-dotted" onClick={() => openFile(e.file_path!)}>
                      <Paperclip className="h-3.5 w-3.5" /> {e.file_path?.split("/").pop()}
                    </button>
                  ) : (
                    <a href={e.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 underline decoration-dotted">
                      <ExternalLink className="h-3.5 w-3.5" /> {e.url}
                    </a>
                  )}
                  <span className="text-xs text-muted-foreground">— {e.uploaded_by}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="pt-2 border-t space-y-2">
            <label className="text-xs text-muted-foreground">Allega file</label>
            <Input type="file" disabled={busy} onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <label className="text-xs text-muted-foreground">Oppure incolla un collegamento</label>
            <div className="flex gap-2">
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" disabled={busy} />
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleLink} disabled={busy || !linkUrl.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />} Aggiungi
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
