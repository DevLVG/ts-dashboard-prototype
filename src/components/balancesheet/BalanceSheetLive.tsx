// Balance-Sheet screen — LIVE from Supabase v_balance_sheet_monthly.
// Alignment additions (spec §1.4, 2026-07-21):
//   - comparison columns: PRIOR MONTH and PY (same month −12) — no budget
//     column ("n/a — no balance-sheet budget exists", never zero);
//   - as-at banner: "As booked at <month-end> — book cash not yet
//     bank-confirmed";
//   - basis toggle DISABLED with tooltip (the BS is post-CN by nature:
//     credit notes are booked against AR);
//   - AR footnote (credit notes back-loaded 2026-07-21) + known-issue flags
//     stay visible via the DB `note` field.
import { Fragment, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Scale, HardHat } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { DataFreshnessNote } from "@/components/dashboard/DataFreshnessNote";
import { ExportButton } from "@/components/dashboard/ExportButton";
import { BasisToggle, ScrollHint } from "@/components/chrome/AlignmentChrome";
import {
  monthKey,
  monthKeyLabel,
  shiftMonthKey,
  LAST_CLOSED_MONTH_FALLBACK,
  isIncompleteMonth,
  endOfMonthLabel,
  usePnlByBu,
  deriveLastCompleteMonth,
} from "@/data/liveData";
import { useBalanceSheet, type BalanceSheetRow } from "@/data/statementsLive";
import { fmtSAR } from "@/lib/format";
import { buildBalanceSheetExport, exportStatementCsv } from "@/lib/exportStatements";

// Negative-zero guard: rounding a tiny negative must render "0", never "(0)".
const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);

interface LineTriple {
  row: BalanceSheetRow;
  pm: number | null; // prior month
  py: number | null; // same month −12
}

interface SubsectionGroup {
  subsection: string;
  lines: LineTriple[];
  total: number;
  pmTotal: number | null;
  pyTotal: number | null;
}

const LineRow = ({ t }: { t: LineTriple }) => (
  <tr className="border-b border-border/10">
    <td className="py-1.5 pr-2 pl-4 text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        {t.row.line_item}
        {t.row.is_adjustment && (
          <span
            className="inline-flex items-center rounded bg-amber-500/15 border border-amber-500/30 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-amber-400"
            title="Management adjustment line"
          >
            ADJ
          </span>
        )}
        {t.row.note && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-gold/80 cursor-help shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">{t.row.note}</TooltipContent>
          </Tooltip>
        )}
      </span>
    </td>
    <td className={`py-1.5 pl-2 text-right tabular-nums whitespace-nowrap ${t.row.amount < 0 ? "text-muted-foreground" : ""}`}>
      {fmt(t.row.amount)}
    </td>
    <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">
      {t.pm === null ? "—" : fmt(t.pm)}
    </td>
    <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">
      {t.py === null ? "—" : fmt(t.py)}
    </td>
  </tr>
);

const SectionCard = ({
  title, groups, total, pmTotal, pyTotal, pmLabel, pyLabel, asAtLabel,
}: {
  title: string;
  groups: SubsectionGroup[];
  total: number;
  pmTotal: number | null;
  pyTotal: number | null;
  pmLabel: string;
  pyLabel: string;
  asAtLabel: string;
}) => (
  <div>
    <h4 className="font-heading text-lg tracking-wide mb-2 text-gold">{title.toUpperCase()}</h4>
    {/* Item 7: the 4-column section table overflows a 390px viewport — it
        scrolls inside its own container (with a visible hint); the page body
        never scrolls horizontally. */}
    <ScrollHint>
    <table className="w-full min-w-[430px] text-sm">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
          <th className="text-left py-1 pr-2 font-semibold">SAR</th>
          <th className="text-right py-1 pl-2 font-semibold whitespace-nowrap">As at ({asAtLabel})</th>
          <th className="text-right py-1 pl-2 font-semibold whitespace-nowrap">{pmLabel}</th>
          <th className="text-right py-1 pl-2 font-semibold whitespace-nowrap">PY ({pyLabel})</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <Fragment key={g.subsection}>
            <tr className="border-b border-border/30">
              <td className="pt-3 pb-1 pr-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground" colSpan={4}>
                {g.subsection}
              </td>
            </tr>
            {g.lines.map((t, i) => (
              <LineRow key={`${t.row.subsection}-${t.row.line_item}-${i}`} t={t} />
            ))}
            <tr className="border-b border-border/40">
              <td className="py-1.5 pr-2 font-medium">Total {g.subsection}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums font-medium whitespace-nowrap">{fmt(g.total)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">{g.pmTotal === null ? "—" : fmt(g.pmTotal)}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">{g.pyTotal === null ? "—" : fmt(g.pyTotal)}</td>
            </tr>
          </Fragment>
        ))}
        <tr className="border-t-2 border-t-border font-semibold text-base">
          <td className="py-2.5 pr-2">Total {title}</td>
          <td className="py-2.5 pl-2 text-right tabular-nums whitespace-nowrap">{fmt(total)}</td>
          <td className="py-2.5 pl-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">{pmTotal === null ? "—" : fmt(pmTotal)}</td>
          <td className="py-2.5 pl-2 text-right tabular-nums whitespace-nowrap text-muted-foreground">{pyTotal === null ? "—" : fmt(pyTotal)}</td>
        </tr>
      </tbody>
    </table>
    </ScrollHint>
  </div>
);

export const BalanceSheetLive = () => {
  const { data, isLoading, isError, error } = useBalanceSheet();
  const { data: pnlRows } = usePnlByBu();
  const lastClosed = deriveLastCompleteMonth(pnlRows) ?? LAST_CLOSED_MONTH_FALLBACK;
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const months = useMemo(() => {
    if (!data?.available) return [] as string[];
    return [...new Set(data.rows.map((r) => monthKey(r.month)))].sort();
  }, [data]);

  const defaultMonth = useMemo(() => {
    if (months.length === 0) return null;
    const closed = months.filter((m) => m <= lastClosed);
    return closed.length > 0 ? closed[closed.length - 1] : months[months.length - 1];
  }, [months, lastClosed]);

  const activeMonth = selectedMonth && months.includes(selectedMonth) ? selectedMonth : defaultMonth;
  const pmKey = activeMonth ? shiftMonthKey(activeMonth, -1) : null;
  const pyKey = activeMonth ? shiftMonthKey(activeMonth, -12) : null;

  const rowsFor = (key: string | null): BalanceSheetRow[] =>
    !data?.available || !key ? [] : data.rows.filter((r) => monthKey(r.month) === key);

  const monthRows = useMemo(() => rowsFor(activeMonth).sort((a, b) => a.sort_order - b.sort_order), [data, activeMonth]);
  const pmRows = useMemo(() => rowsFor(pmKey), [data, pmKey]);
  const pyRows = useMemo(() => rowsFor(pyKey), [data, pyKey]);

  const compMap = (rows: BalanceSheetRow[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(`${r.section}|${r.subsection}|${r.line_item}`, (m.get(`${r.section}|${r.subsection}|${r.line_item}`) ?? 0) + r.amount);
    return m;
  };
  const pmMap = useMemo(() => compMap(pmRows), [pmRows]);
  const pyMap = useMemo(() => compMap(pyRows), [pyRows]);
  const pmAvailable = pmRows.length > 0;
  const pyAvailable = pyRows.length > 0;

  const groupSection = (section: BalanceSheetRow["section"]): { groups: SubsectionGroup[]; total: number; pmTotal: number | null; pyTotal: number | null } => {
    const rows = monthRows.filter((r) => r.section === section);
    const map = new Map<string, LineTriple[]>();
    for (const r of rows) {
      const key = `${r.section}|${r.subsection}|${r.line_item}`;
      const list = map.get(r.subsection) ?? [];
      list.push({
        row: r,
        pm: pmAvailable ? pmMap.get(key) ?? 0 : null,
        py: pyAvailable ? pyMap.get(key) ?? 0 : null,
      });
      map.set(r.subsection, list);
    }
    const groups: SubsectionGroup[] = [...map.entries()].map(([subsection, lines]) => ({
      subsection,
      lines,
      total: lines.reduce((s, t) => s + t.row.amount, 0),
      pmTotal: pmAvailable ? lines.reduce((s, t) => s + (t.pm ?? 0), 0) : null,
      pyTotal: pyAvailable ? lines.reduce((s, t) => s + (t.py ?? 0), 0) : null,
    }));
    return {
      groups,
      total: groups.reduce((s, g) => s + g.total, 0),
      pmTotal: pmAvailable ? groups.reduce((s, g) => s + (g.pmTotal ?? 0), 0) : null,
      pyTotal: pyAvailable ? groups.reduce((s, g) => s + (g.pyTotal ?? 0), 0) : null,
    };
  };

  const assets = groupSection("Assets");
  const liabilities = groupSection("Liabilities");
  const equity = groupSection("Equity");

  const checkDelta = assets.total - (liabilities.total + equity.total);
  const isBalanced = Math.abs(checkDelta) < 1;

  // Audit-ready export: every line + subsection/section totals + PM/PY
  // comparatives + the balance check, stamped with as-at, source and asOf.
  const handleExport = () => {
    if (!activeMonth) return;
    exportStatementCsv(
      buildBalanceSheetExport({
        sections: [
          { title: "Assets", data: assets },
          { title: "Liabilities", data: liabilities },
          { title: "Equity", data: equity },
        ],
        asAtLabel: endOfMonthLabel(activeMonth),
        pmLabel: pmKey ? monthKeyLabel(pmKey) : "—",
        pyLabel: pyKey ? monthKeyLabel(pyKey) : "—",
        checkDelta,
        isBalanced,
        meta: {
          entity: "Trio Sporting Club",
          statement: `Balance Sheet — as at ${endOfMonthLabel(activeMonth)}`,
          period: `As at ${endOfMonthLabel(activeMonth)} (as booked)`,
          basis: "n/a — the balance sheet is post credit-notes by nature (the basis toggle applies to the P&L only)",
          source: "Supabase · v_balance_sheet_monthly (Qoyod-certified warehouse, migration 023)",
          dataAsOf: `${monthKeyLabel(lastClosed)} close complete`,
        },
        notes: [
          "Book cash is as booked — not yet bank-confirmed.",
          "Receivables are net of the customer credit notes back-loaded to the ledger on 2026-07-21.",
          "Lines marked [ADJ] are management adjustments.",
          "No budget column — no balance-sheet budget exists (n/a, not zero).",
        ],
      }),
    );
  };

  if (!isLoading && !isError && data && !data.available) {
    return (
      <div className="space-y-6">
        <DataFreshnessNote />
        <Card className="p-10 text-center space-y-3 animate-fade-in">
          <HardHat className="h-8 w-8 mx-auto text-gold/70" />
          <h3 className="text-xl font-heading tracking-wide">BALANCE SHEET — NOT YET AVAILABLE</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The monthly balance-sheet statement (v_balance_sheet_monthly) is being finalised in
            the data layer. This screen will populate automatically as soon as the statement is
            published — no reload needed.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DataFreshnessNote
          lastClosedKey={lastClosed}
          showIncompleteWarning={activeMonth ? isIncompleteMonth(activeMonth, lastClosed) : false}
        />
        <div className="flex items-center gap-3">
          <BasisToggle
            disabled
            disabledReason="The balance sheet is post-credit-notes by nature — credit notes are booked against receivables. The basis toggle applies to the P&L screens only."
          />
          {months.length > 0 && (
            <Select value={activeMonth ?? undefined} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-44 bg-background font-medium">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {[...months].reverse().map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthKeyLabel(m)}{isIncompleteMonth(m, lastClosed) ? " — partial" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {months.length > 0 && <ExportButton onClick={handleExport} />}
        </div>
      </div>

      {/* As-at banner (§1.4) */}
      {activeMonth && (
        <div className="rounded-md border border-border bg-muted/30 px-4 py-2 text-sm">
          <strong className="font-semibold">As booked at {endOfMonthLabel(activeMonth)}</strong>
          <span className="text-muted-foreground"> — book cash not yet bank-confirmed. No budget column: no balance-sheet budget exists (n/a, not zero).</span>
        </div>
      )}

      <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h3 className="text-xl font-heading tracking-wide">BALANCE SHEET</h3>
          <DataSourceBadge source="live" />
          <span className="text-xs text-muted-foreground">
            Supabase · v_balance_sheet_monthly · SAR
          </span>
        </div>
        {activeMonth && (
          <p className="text-sm text-muted-foreground mb-6">
            As of <span className="text-foreground font-medium">{endOfMonthLabel(activeMonth)}</span>
            {pmKey && <> · prior month {monthKeyLabel(pmKey)}</>}
            {pyKey && <> · PY {monthKeyLabel(pyKey)} (same month −12)</>}
          </p>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading balance sheet…</p>}
        {isError && (
          <p className="text-sm text-destructive">
            {(error as Error | null)?.name === "PermissionDeniedError"
              ? (error as Error).message
              : "Could not load the balance sheet from Supabase."}
          </p>
        )}

        {!isLoading && !isError && monthRows.length > 0 && (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-12 gap-y-8">
              <SectionCard
                title="Assets"
                groups={assets.groups}
                total={assets.total}
                pmTotal={assets.pmTotal}
                pyTotal={assets.pyTotal}
                pmLabel={pmKey ? monthKeyLabel(pmKey) : "—"}
                pyLabel={pyKey ? monthKeyLabel(pyKey) : "—"}
                asAtLabel={activeMonth ? monthKeyLabel(activeMonth) : "—"}
              />
              <div className="space-y-8">
                <SectionCard
                  title="Liabilities"
                  groups={liabilities.groups}
                  total={liabilities.total}
                  pmTotal={liabilities.pmTotal}
                  pyTotal={liabilities.pyTotal}
                  pmLabel={pmKey ? monthKeyLabel(pmKey) : "—"}
                  pyLabel={pyKey ? monthKeyLabel(pyKey) : "—"}
                  asAtLabel={activeMonth ? monthKeyLabel(activeMonth) : "—"}
                />
                <SectionCard
                  title="Equity"
                  groups={equity.groups}
                  total={equity.total}
                  pmTotal={equity.pmTotal}
                  pyTotal={equity.pyTotal}
                  pmLabel={pmKey ? monthKeyLabel(pmKey) : "—"}
                  pyLabel={pyKey ? monthKeyLabel(pyKey) : "—"}
                  asAtLabel={activeMonth ? monthKeyLabel(activeMonth) : "—"}
                />
              </div>
            </div>

            <div
              className={`mt-8 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                isBalanced
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-400"
              }`}
            >
              <Scale className="h-4 w-4" />
              {isBalanced ? (
                <span>
                  Balanced — Assets {fmt(assets.total)} = Liabilities {fmt(liabilities.total)} + Equity {fmt(equity.total)}
                </span>
              ) : (
                <span>
                  Balance check delta: {fmt(checkDelta)} SAR (Assets {fmt(assets.total)} vs L+E {fmt(liabilities.total + equity.total)})
                </span>
              )}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Statement built from the synced Qoyod ledger (migration 023). Receivables are net of
              the customer credit notes back-loaded to the ledger on 2026-07-21. Lines marked
              <span className="mx-1 inline-flex items-center rounded bg-amber-500/15 border border-amber-500/30 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-amber-400">ADJ</span>
              are management adjustments; the <Info className="inline h-3 w-3 text-gold/80" /> icon
              flags data-quality notes from the ingestion audit (known issues stay visible).
            </p>
          </>
        )}

        {!isLoading && !isError && data?.available && monthRows.length === 0 && (
          <p className="text-sm text-muted-foreground">No balance-sheet data for the selected month.</p>
        )}
      </Card>
    </div>
  );
};
