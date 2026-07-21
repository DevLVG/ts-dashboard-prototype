// Balance-Sheet screen — LIVE from Supabase v_balance_sheet_monthly
// (contract: month, section Assets|Liabilities|Equity, subsection, line_item,
// amount, sort_order, is_adjustment, note — migration 023).
//
// Classic two-column statement: Assets left, Liabilities + Equity right, with
// subsection groups, section totals and a balance check. Month selector
// defaults to the latest closed month. `note` renders as an info tooltip
// (data-quality flags from the DB agent); `is_adjustment` lines carry an ADJ
// badge. If the view has not landed yet, a graceful placeholder shows and the
// hook re-polls every 60s.
import { Fragment, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info, Scale, HardHat } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { DataFreshnessNote } from "@/components/dashboard/DataFreshnessNote";
import { monthKey, monthKeyLabel, LAST_CLOSED_MONTH, isIncompleteMonth } from "@/data/liveData";
import { useBalanceSheet, type BalanceSheetRow } from "@/data/statementsLive";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-SA", { maximumFractionDigits: 0 }).format(v);

/** Last day of a "YYYY-MM" key, e.g. "2026-06" -> "30 June 2026". */
const endOfMonthLabel = (key: string): string => {
  const [y, m] = key.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${lastDay} ${monthNames[m - 1]} ${y}`;
};

interface SubsectionGroup {
  subsection: string;
  rows: BalanceSheetRow[];
  total: number;
}

const groupBySubsection = (rows: BalanceSheetRow[]): SubsectionGroup[] => {
  const map = new Map<string, BalanceSheetRow[]>();
  for (const r of rows) {
    const list = map.get(r.subsection) ?? [];
    list.push(r);
    map.set(r.subsection, list);
  }
  return [...map.entries()].map(([subsection, groupRows]) => ({
    subsection,
    rows: groupRows,
    total: groupRows.reduce((s, r) => s + r.amount, 0),
  }));
};

const LineRow = ({ row }: { row: BalanceSheetRow }) => (
  <tr className="border-b border-border/10">
    <td className="py-1.5 pr-2 pl-4 text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        {row.line_item}
        {row.is_adjustment && (
          <span
            className="inline-flex items-center rounded bg-amber-500/15 border border-amber-500/30 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-amber-400"
            title="Management adjustment line"
          >
            ADJ
          </span>
        )}
        {row.note && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-gold/80 cursor-help shrink-0" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {row.note}
            </TooltipContent>
          </Tooltip>
        )}
      </span>
    </td>
    <td className={`py-1.5 pl-2 text-right tabular-nums whitespace-nowrap ${row.amount < 0 ? "text-muted-foreground" : ""}`}>
      {fmt(row.amount)}
    </td>
  </tr>
);

const SectionCard = ({
  title,
  groups,
  total,
}: {
  title: string;
  groups: SubsectionGroup[];
  total: number;
}) => (
  <div>
    <h4 className="font-heading text-lg tracking-wide mb-2 text-gold">{title.toUpperCase()}</h4>
    <table className="w-full text-sm">
      <tbody>
        {groups.map((g) => (
          <Fragment key={g.subsection}>
            <tr className="border-b border-border/30">
              <td className="pt-3 pb-1 pr-2 font-semibold text-xs uppercase tracking-wider text-muted-foreground" colSpan={2}>
                {g.subsection}
              </td>
            </tr>
            {g.rows.map((r, i) => (
              <LineRow key={`${r.subsection}-${r.line_item}-${i}`} row={r} />
            ))}
            <tr className="border-b border-border/40">
              <td className="py-1.5 pr-2 font-medium">Total {g.subsection}</td>
              <td className="py-1.5 pl-2 text-right tabular-nums font-medium whitespace-nowrap">
                {fmt(g.total)}
              </td>
            </tr>
          </Fragment>
        ))}
        <tr className="border-t-2 border-t-border font-semibold text-base">
          <td className="py-2.5 pr-2">Total {title}</td>
          <td className="py-2.5 pl-2 text-right tabular-nums whitespace-nowrap">{fmt(total)}</td>
        </tr>
      </tbody>
    </table>
  </div>
);

export const BalanceSheetLive = () => {
  const { data, isLoading, isError } = useBalanceSheet();
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const months = useMemo(() => {
    if (!data?.available) return [] as string[];
    return [...new Set(data.rows.map((r) => monthKey(r.month)))].sort();
  }, [data]);

  // Default month: latest CLOSED month present (fall back to latest month).
  const defaultMonth = useMemo(() => {
    if (months.length === 0) return null;
    const closed = months.filter((m) => m <= LAST_CLOSED_MONTH);
    return closed.length > 0 ? closed[closed.length - 1] : months[months.length - 1];
  }, [months]);

  const activeMonth = selectedMonth && months.includes(selectedMonth) ? selectedMonth : defaultMonth;

  const monthRows = useMemo(() => {
    if (!data?.available || !activeMonth) return [] as BalanceSheetRow[];
    return data.rows
      .filter((r) => monthKey(r.month) === activeMonth)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [data, activeMonth]);

  const assets = monthRows.filter((r) => r.section === "Assets");
  const liabilities = monthRows.filter((r) => r.section === "Liabilities");
  const equity = monthRows.filter((r) => r.section === "Equity");

  const totalAssets = assets.reduce((s, r) => s + r.amount, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.amount, 0);
  const totalEquity = equity.reduce((s, r) => s + r.amount, 0);
  const checkDelta = totalAssets - (totalLiabilities + totalEquity);
  const isBalanced = Math.abs(checkDelta) < 1; // rounding tolerance, SAR

  // ------------------------------------------------- not yet available state
  if (!isLoading && !isError && data && !data.available) {
    return (
      <div className="space-y-6">
        <DataFreshnessNote />
        <Card className="p-10 text-center space-y-3 animate-fade-in">
          <HardHat className="h-8 w-8 mx-auto text-gold/70" />
          <h3 className="text-xl font-heading tracking-wide">BALANCE SHEET — NOT YET AVAILABLE</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            The monthly balance-sheet statement (v_balance_sheet_monthly) is being
            finalised in the data layer. This screen will populate automatically as
            soon as the statement is published — no reload needed.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DataFreshnessNote showIncompleteWarning={activeMonth ? isIncompleteMonth(activeMonth) : false} />
        {months.length > 0 && (
          <Select value={activeMonth ?? undefined} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-44 bg-background font-medium">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {[...months].reverse().map((m) => (
                <SelectItem key={m} value={m}>
                  {monthKeyLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

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
          </p>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Loading balance sheet…</p>}
        {isError && (
          <p className="text-sm text-destructive">
            Could not load the balance sheet from Supabase.
          </p>
        )}

        {!isLoading && !isError && monthRows.length > 0 && (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-12 gap-y-8">
              <SectionCard title="Assets" groups={groupBySubsection(assets)} total={totalAssets} />
              <div className="space-y-8">
                <SectionCard
                  title="Liabilities"
                  groups={groupBySubsection(liabilities)}
                  total={totalLiabilities}
                />
                <SectionCard title="Equity" groups={groupBySubsection(equity)} total={totalEquity} />
              </div>
            </div>

            {/* Balance check */}
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
                  Balanced — Assets {fmt(totalAssets)} = Liabilities {fmt(totalLiabilities)} + Equity {fmt(totalEquity)}
                </span>
              ) : (
                <span>
                  Balance check delta: {fmt(checkDelta)} SAR (Assets {fmt(totalAssets)} vs L+E {fmt(totalLiabilities + totalEquity)})
                </span>
              )}
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Statement built from the synced Qoyod ledger (migration 023). Lines marked
              <span className="mx-1 inline-flex items-center rounded bg-amber-500/15 border border-amber-500/30 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-amber-400">ADJ</span>
              are management adjustments; the <Info className="inline h-3 w-3 text-gold/80" /> icon
              flags data-quality notes from the ingestion audit.
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
