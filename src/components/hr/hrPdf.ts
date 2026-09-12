// CLEVER HR — per-person outcome PDF, generated at cycle close (spec §5
// "Il documento PDF per la persona alla chiusura, nello stesso stile dei
// rapporti del cruscotto"). Reuses the Report page's stack (jsPDF +
// jspdf-autotable, `loadLogo` from reportPdf.ts) and the same white,
// print-friendly, Trio-branded palette — a lighter v1 layout of its own
// rather than a refactor of reportPdf.ts's internal (non-exported) layout
// engine, which stays untouched (financial export path, out of scope for
// this build beyond reusing what it already exports).
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { loadLogo } from "@/components/report/reportPdf";
import type { HrObjective, HrEvaluation, HrScoreRow } from "@/data/hrLive";
import { reviewerLabel } from "@/data/hrLive";
import tsLogoUrl from "@/assets/ts-logo.png";

const CREAM: [number, number, number] = [247, 241, 228];
const BLACK: [number, number, number] = [20, 18, 15];
const GOLD_DEEP: [number, number, number] = [163, 122, 61];
const MUTED: [number, number, number] = [104, 94, 78];
const DESTRUCTIVE: [number, number, number] = [176, 48, 48];
const SUCCESS: [number, number, number] = [27, 122, 92];
const PAGE_W = 210, MARGIN = 16, CONTENT_W = PAGE_W - MARGIN * 2;

const fmtScore = (v: number | null) => (v == null ? "—" : v.toFixed(2));
const fmtSAR = (v: number | null) => (v == null ? "—" : new Intl.NumberFormat("en-US").format(Math.round(v)) + " SAR");

const componentLabel: Record<string, string> = { hard: "Obiettivi hard (50%)", soft: "Obiettivi soft (20%)", value: "Attitudine e valori (30%)" };

export const generateHrOutcomePdf = async (
  score: HrScoreRow,
  cycleLabel: string,
  objectives: HrObjective[],
  evaluations: HrEvaluation[],
): Promise<void> => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogo(tsLogoUrl);

  let y = MARGIN;
  if (logo) {
    const h = 12, w = h * logo.aspect;
    doc.addImage(logo.dataUrl, "PNG", MARGIN, y, w, h);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...BLACK);
  doc.text("Trio Sporting — Esito valutazione", PAGE_W - MARGIN, y + 8, { align: "right" });
  y += 18;
  doc.setDrawColor(...GOLD_DEEP);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...BLACK);
  doc.text(`${score.full_name}`, MARGIN, y); y += 6;
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(`${score.job_position ?? ""}${score.department ? " — " + score.department : ""}`, MARGIN, y); y += 5;
  doc.text(`Ciclo: ${cycleLabel}`, MARGIN, y); y += 10;

  // Summary tile
  doc.setFillColor(...CREAM);
  doc.roundedRect(MARGIN, y, CONTENT_W, 26, 2, 2, "F");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text("Punteggio finale", MARGIN + 6, y + 7);
  doc.text("Fascia bonus", MARGIN + 60, y + 7);
  doc.text("Aumento", MARGIN + 110, y + 7);
  doc.text("Up or out", MARGIN + 155, y + 7);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...BLACK);
  doc.text(fmtScore(score.final_score), MARGIN + 6, y + 17);
  doc.text(score.bonus_months == null ? "—" : `${score.bonus_months} mensilità`, MARGIN + 60, y + 17);
  doc.text(fmtSAR(score.salary_increase_sar), MARGIN + 110, y + 17);
  doc.setTextColor(...(score.up_or_out_flag ? DESTRUCTIVE : SUCCESS));
  doc.text(score.up_or_out_flag ? "SI — revisione" : "No", MARGIN + 155, y + 17);
  y += 32;

  for (const component of ["hard", "soft", "value"] as const) {
    const rows = objectives.filter((o) => o.component === component);
    if (rows.length === 0) continue;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BLACK);
    doc.text(componentLabel[component], MARGIN, y);
    y += 4;

    const body = rows.map((o) => {
      const evals = evaluations.filter((e) => e.objective_id === o.objective_id);
      const scoresTxt = evals.length
        ? evals.map((e) => `${reviewerLabel(e.reviewer_email)}: ${e.score}`).join(" · ")
        : "—";
      return [o.title, o.description ?? "", `${Math.round(o.weight * 100)}%`, scoresTxt];
    });
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [["Voce", "Descrizione / target", "Peso", "Punteggi valutatori"]],
      body,
      styles: { font: "helvetica", fontSize: 8, textColor: BLACK },
      headStyles: { fillColor: CREAM, textColor: BLACK, fontStyle: "bold" },
      columnStyles: { 2: { cellWidth: 16, halign: "right" } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(
    `Documento generato automaticamente alla chiusura del ciclo — CLEVER HR. ${new Date().toLocaleString()}`,
    MARGIN, 290,
  );

  doc.save(`HR-Esito-${score.full_name.replace(/\s+/g, "-")}-${score.cycle_id}.pdf`);
};
