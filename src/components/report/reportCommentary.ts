// EXECUTIVE COMMENTARY ENGINE — Trio Sporting cockpit "Report" PDF v2
// (2026-08-03, second-round fix squad, Marcello's live-review mandate item 4).
//
// Deterministic, rule-based sentence generation — NOT a free-text/LLM
// narrative. Every function here is a pure transform of `ReportSnapshot`
// fields (the SAME aggregates the on-screen tables and the PDF tables
// render), so every number quoted in a commentary sentence ties exactly to a
// number already shown in a table on the same page. No qualitative claim is
// invented: "led by X" only fires when `familyMoves` actually contains a
// real, non-null, above-noise-floor delta for that family; "no comparable
// figure" / "not yet published" clauses only fire when the underlying
// snapshot field is genuinely null/absent (absent ≠ zero, the convention
// this whole cockpit already follows).
//
// Each `build*Commentary` returns an ordered array of sentences — the PDF
// layer joins them into one paragraph. Section length is ORGANIC (task item
// 6): optional clauses (family movers, budget-N/A note, open-period caveat,
// fallback-month caveat) only appear when the corresponding condition is
// true, so a section naturally lands in the 3-6 sentence range without
// padding for its own sake.
import { fmtSAR, fmtDeltaSAR, fmtPct, fmtDeltaPct, pctChange } from "@/lib/format";
import type { ReportSnapshot } from "./reportData";

const MATERIAL_SAR = 1000; // below this, a delta reads as "broadly flat" / "in line with", not a move

// ---------------------------------------------------------------- economics

export const buildEconomicsCommentary = (s: ReportSnapshot): string[] => {
  const sentences: string[] = [];
  const { period, comparisonLabel } = s;
  const rev = s.kpi.revenue;
  const gm = s.kpi.grossMargin;
  const ebitda = s.kpi.ebitda;

  // 1 — revenue headline, always present.
  if (rev.comparison === null) {
    sentences.push(
      `Gross revenue for ${period.label} was SAR ${fmtSAR(rev.actual)}; no comparable ${comparisonLabel.toLowerCase()} figure exists for this window.`,
    );
  } else {
    const delta = rev.actual - rev.comparison;
    const pct = pctChange(rev.actual, rev.comparison);
    if (Math.abs(delta) < MATERIAL_SAR) {
      sentences.push(
        `Gross revenue for ${period.label} was SAR ${fmtSAR(rev.actual)}, broadly flat versus ${comparisonLabel} (SAR ${fmtSAR(rev.comparison)}).`,
      );
    } else {
      sentences.push(
        `Gross revenue for ${period.label} was SAR ${fmtSAR(rev.actual)}, ${delta > 0 ? "up" : "down"} SAR ${fmtSAR(Math.abs(delta))}` +
          `${pct !== null ? ` (${fmtDeltaPct(pct)})` : ""} versus ${comparisonLabel} (SAR ${fmtSAR(rev.comparison)}).`,
      );
    }
  }

  // 2 — top revenue drivers by family (BU), only when real movers exist.
  // NOTE: `fmtDeltaSAR` already parenthesizes a negative delta (the app-wide
  // convention) — these sentences never wrap it in a SECOND pair of parens,
  // which would otherwise print an ugly "Family ((23,236))" for a decline.
  const movers = s.familyMoves.slice(0, 2);
  if (movers.length === 1) {
    const m = movers[0];
    sentences.push(
      `The move was almost entirely driven by ${m.name}, ${fmtDeltaSAR(m.delta)} versus ${comparisonLabel}.`,
    );
  } else if (movers.length >= 2) {
    const [a, b] = movers;
    sentences.push(
      `The move was led by ${a.name} ${fmtDeltaSAR(a.delta)} and ${b.name} ${fmtDeltaSAR(b.delta)} versus ${comparisonLabel}.`,
    );
  }

  // 3 — margin story, always present when revenue is non-trivial.
  if (Math.abs(rev.actual) > 1) {
    const gmPctActual = (gm.actual / rev.actual) * 100;
    let marginSentence = `Gross margin was SAR ${fmtSAR(gm.actual)}, ${fmtPct(gmPctActual)} of revenue`;
    if (gm.comparison !== null && rev.comparison !== null && Math.abs(rev.comparison) > 1) {
      const gmPctComparison = (gm.comparison / rev.comparison) * 100;
      const ppDelta = gmPctActual - gmPctComparison;
      marginSentence += Math.abs(ppDelta) < 0.15
        ? `, in line with ${comparisonLabel} (${fmtPct(gmPctComparison)})`
        : `, ${ppDelta > 0 ? "up" : "down"} ${Math.abs(ppDelta).toFixed(1)} points versus ${comparisonLabel} (${fmtPct(gmPctComparison)})`;
    }
    sentences.push(`${marginSentence}.`);
  }

  // 4 — EBITDA (reported), always present.
  if (ebitda.comparison === null) {
    sentences.push(`EBITDA (reported) came in at SAR ${fmtSAR(ebitda.actual)}.`);
  } else {
    const d = ebitda.actual - ebitda.comparison;
    sentences.push(
      Math.abs(d) < MATERIAL_SAR
        ? `EBITDA (reported) came in at SAR ${fmtSAR(ebitda.actual)}, in line with ${comparisonLabel}.`
        : `EBITDA (reported) came in at SAR ${fmtSAR(ebitda.actual)}, ${d > 0 ? "up" : "down"} SAR ${fmtSAR(Math.abs(d))} versus ${comparisonLabel}.`,
    );
  }

  // 5 — notable items, ORGANIC: only the clauses that actually apply.
  if (s.budgetNaNote) sentences.push(s.budgetNaNote);
  if (period.isOpen) {
    sentences.push(
      "This window includes a period that has not yet closed — revenue is live, but supplier bills and other costs may not be fully posted.",
    );
  }

  return sentences;
};

// ---------------------------------------------------------------- cash flow

export const buildCashFlowCommentary = (s: ReportSnapshot): string[] => {
  const cf = s.cashFlow;
  const sentences: string[] = [];

  if (!cf.hasData) {
    sentences.push(`No cash flow statement has been published for ${s.period.label} yet.`);
    return sentences;
  }

  const lineValue = (label: string): number => cf.lines.find((l) => l.label === label)?.value ?? 0;
  const operating = lineValue("Operating cash flow");
  const investing = lineValue("Investing cash flow");
  const financing = lineValue("Financing cash flow");
  const net = lineValue("Net cash flow");

  // 1 — book cash bridge.
  if (cf.openingBookCash !== null && cf.closingBookCash !== null) {
    const delta = cf.closingBookCash - cf.openingBookCash;
    sentences.push(
      Math.abs(delta) < MATERIAL_SAR
        ? `Book cash was essentially unchanged over ${s.period.label}, at SAR ${fmtSAR(cf.closingBookCash)}.`
        : `Book cash moved from SAR ${fmtSAR(cf.openingBookCash)} to SAR ${fmtSAR(cf.closingBookCash)} over ${s.period.label}, ` +
          `${delta > 0 ? "an increase" : "a decrease"} of SAR ${fmtSAR(Math.abs(delta))}.`,
    );
  } else {
    sentences.push(`Book cash at the start and/or end of ${s.period.label} is not yet available from the published balance sheet.`);
  }

  // 2 — what drove it (operating always cited; investing/financing/other only
  // if material — "other" included so the listed components approximately
  // account for the stated net rather than leaving an unexplained residual;
  // QA caught net a caller could otherwise not reconcile to the three
  // headline components alone).
  const other = lineValue("Other cash flow");
  const parts: string[] = [`operating activity ${operating >= 0 ? "generated" : "used"} SAR ${fmtSAR(Math.abs(operating))}`];
  if (Math.abs(investing) >= MATERIAL_SAR) parts.push(`investing ${investing >= 0 ? "contributed" : "absorbed"} SAR ${fmtSAR(Math.abs(investing))}`);
  if (Math.abs(financing) >= MATERIAL_SAR) parts.push(`financing ${financing >= 0 ? "added" : "used"} SAR ${fmtSAR(Math.abs(financing))}`);
  if (Math.abs(other) >= MATERIAL_SAR) parts.push(`other items ${other >= 0 ? "added" : "used"} SAR ${fmtSAR(Math.abs(other))}`);
  sentences.push(`Of this, ${parts.join(", ")} — a net cash flow of SAR ${fmtDeltaSAR(net)} for the window.`);

  // 3 — live bank position, when synced.
  if (cf.liveBankTotal !== null) {
    sentences.push(
      `The live bank & cash position stands at SAR ${fmtSAR(cf.liveBankTotal)}${cf.lastSynced ? ` as of the ${cf.lastSynced} Qoyod sync` : ""}.`,
    );
  }

  // 4 — cash-burn caveat, organic (only when net cash flow is negative AND book cash actually fell).
  if (net < -MATERIAL_SAR && cf.openingBookCash !== null && cf.closingBookCash !== null && cf.closingBookCash < cf.openingBookCash) {
    sentences.push("Cash consumption this window warrants monitoring if the trend continues into the next close.");
  }

  return sentences;
};

// ------------------------------------------------------------ balance sheet

export const buildBalanceSheetCommentary = (s: ReportSnapshot): string[] => {
  const bs = s.balanceSheet;
  const sentences: string[] = [];

  if (!bs.available) {
    sentences.push("No balance sheet has been published for this window yet.");
    return sentences;
  }

  // 1 — headline totals, always present.
  sentences.push(
    `As at ${s.asAtLabel}, total assets stood at SAR ${fmtSAR(bs.assets.total)}, funded by liabilities of SAR ${fmtSAR(bs.liabilities.total)} ` +
      `and equity of SAR ${fmtSAR(bs.equity.total)}.`,
  );

  // 2 — balance check, always present (its wording is itself the "watch item" trigger — see buildWatchItems).
  sentences.push(
    bs.isBalanced
      ? "The statement balances — assets equal liabilities plus equity."
      : `The statement carries a reconciliation delta of SAR ${fmtSAR(Math.abs(bs.checkDelta))} between assets and liabilities + equity, flagged below.`,
  );

  // 3 — fallback-month caveat, organic.
  if (bs.fellBackFrom) {
    sentences.push(
      `This reflects the most recently published month within the window — the statement for the window's final month has not closed yet.`,
    );
  }

  // 4 — prior-month movement, organic (only when material and available).
  if (bs.assets.pmTotal !== null) {
    const delta = bs.assets.total - bs.assets.pmTotal;
    if (Math.abs(delta) >= MATERIAL_SAR) {
      sentences.push(`Total assets are ${delta > 0 ? "up" : "down"} SAR ${fmtSAR(Math.abs(delta))} versus the prior month (${bs.pmLabel}).`);
    }
  }

  // 5 — financing-mix filler, only if the above left the block thin (keeps the
  // 3-6 sentence target without ever inventing a claim the numbers don't support).
  if (sentences.length < 3) {
    const financingTotal = bs.liabilities.total + bs.equity.total;
    if (Math.abs(financingTotal) > 1) {
      const liabShare = (bs.liabilities.total / financingTotal) * 100;
      sentences.push(`Liabilities represent ${fmtPct(liabShare)} of total financing, with equity covering the remainder.`);
    }
  }

  return sentences;
};

// --------------------------------------------------------------- watch items

/** ORGANIC block (task item 6): rendered only when at least one real,
 * data-driven flag exists — never a placeholder "all clear" line. Limited to
 * structural balance-sheet integrity flags (the ones with real follow-up
 * consequence); the no-budget and open-period caveats already surface inline
 * in the Economics commentary, so they are not duplicated here. */
export const buildWatchItems = (s: ReportSnapshot): string[] => {
  const items: string[] = [];
  const bs = s.balanceSheet;
  if (bs.available && !bs.isBalanced) {
    items.push(`Balance sheet check: assets vs liabilities + equity differ by SAR ${fmtSAR(Math.abs(bs.checkDelta))} as at ${s.asAtLabel}.`);
  }
  if (bs.available && bs.fellBackFrom) {
    items.push(`Balance sheet shown as at ${s.asAtLabel} — the window's final month has not published a statement yet.`);
  }
  return items;
};
