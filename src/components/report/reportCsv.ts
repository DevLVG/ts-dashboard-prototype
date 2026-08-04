// REPORT — secondary "data (CSV)" export. Report supersedes the scattered
// per-page "Export (audit CSV)" buttons as THE export place, but the raw CSV
// capability stays available here (spec: "keep the CSV capability available
// inside Report as a secondary data (CSV) download if trivial to preserve").
// Reuses the SAME audit-stamped CSV builders the Cash Flow / Balance Sheet
// screens already ship (@/lib/exportStatements) — no new file format, just a
// third caller windowed to the report's own period. Economics gets one
// small bespoke builder since its column shape (Actual / active comparison /
// Δ / Δ%) doesn't match the old three-way Actual/Budget/PY P&L Overview
// export it would otherwise borrow from.
import { exportStatementCsv, buildCashFlowExport, buildBalanceSheetExport } from "@/lib/exportStatements";
import { comparePct } from "@/lib/format";
import type { ReportSnapshot } from "./reportData";

const ENTITY = "Trio Sporting Club";
const SOURCE = "Supabase · v_pnl_basis/pnl_management + v_cashflow_statement_monthly + v_balance_sheet_monthly (Qoyod-certified warehouse)";

export const downloadReportCsvs = (snapshot: ReportSnapshot): void => {
  const periodMeta = {
    entity: ENTITY,
    period: snapshot.period.label,
    source: SOURCE,
    dataAsOf: snapshot.period.isOpen ? `${snapshot.period.label} — includes an open period` : snapshot.period.label,
  };

  // ---- Economics
  exportStatementCsv({
    meta: { ...periodMeta, statement: `Economics — ${snapshot.period.label}`, structure: `vs ${snapshot.comparisonLabel}` },
    columns: ["Line item", "This window", snapshot.comparisonLabel, "Delta", "Delta %"],
    rows: snapshot.macroRows.map((r) => {
      // owner-audit #14 (2026-08-04): r.actual can be null (not yet posted).
      const deltaAbs = r.actual === null || r.comparison === null ? null : r.actual - r.comparison;
      // comparePct (not pctChange): 2026-08-04, owner-audit recheck fix-22 —
      // same guard as the on-screen preview / PDF; a sign-flip or near-zero
      // comparison base exports blank, never a +1026.2%-style artifact cell.
      const deltaPct = r.actual === null || r.comparison === null ? null : comparePct(r.actual, r.comparison);
      return [r.label, r.actual, r.comparison, deltaAbs, deltaPct];
    }),
    notes: snapshot.budgetNaNote ? [snapshot.budgetNaNote] : undefined,
  });

  // ---- Cash Flow
  exportStatementCsv(
    buildCashFlowExport({
      windowRows: snapshot.cashFlow.windowRows,
      lines: snapshot.cashFlow.lines.map((l) => ({ label: l.label, value: () => l.value })),
      bookCashByMonth: new Map(), // per-window aggregate report — monthly book-cash detail lives on the Cash Flow screen itself
      wcRows: null,
      windowSize: snapshot.cashFlow.windowRows.length,
      meta: { ...periodMeta, statement: `Cash Flow — ${snapshot.period.label}` },
    }),
  );

  // ---- Balance Sheet
  if (snapshot.balanceSheet.available) {
    exportStatementCsv(
      buildBalanceSheetExport({
        sections: [
          { title: "Assets", data: snapshot.balanceSheet.assets },
          { title: "Liabilities", data: snapshot.balanceSheet.liabilities },
          { title: "Equity", data: snapshot.balanceSheet.equity },
        ],
        asAtLabel: snapshot.asAtLabel,
        pmLabel: snapshot.balanceSheet.pmLabel,
        pyLabel: snapshot.balanceSheet.pyLabel,
        checkDelta: snapshot.balanceSheet.checkDelta,
        isBalanced: snapshot.balanceSheet.isBalanced,
        meta: { ...periodMeta, statement: `Balance Sheet — as at ${snapshot.asAtLabel}` },
      }),
    );
  }
};
