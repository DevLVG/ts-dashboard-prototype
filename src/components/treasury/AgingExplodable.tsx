// AGING EXPLODABLE — generic bucket table shared by receivables (item 3)
// and its payables mirror (item 5). Each bucket row (Current / 1-30 / 31-60
// / 61-90 / 90+) shows count + SAR + share of book, and expands in place to
// list the invoices/bills sitting in that bucket — no navigation away, no
// modal, matches the "explodable row" pattern fix-7-balance already
// validated for the balance sheet (05-exploded-row screenshot).
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DataSourceBadge } from "@/components/dashboard/DataSourceBadge";
import { ScrollHint } from "@/components/chrome/AlignmentChrome";
import { AGING_BUCKET_ORDER, type AgingBucket } from "@/data/statementsLive";
import { fmtSAR } from "@/lib/format";

const fmt = (v: number) => fmtSAR(Math.abs(v) < 0.5 ? 0 : v);
const pctOf = (part: number, whole: number) => (Math.abs(whole) < 0.5 ? 0 : (part / whole) * 100);

const BUCKET_META: Record<AgingBucket, { label: string; short: string; bar: string; text: string }> = {
  current: { label: "Current (not due)", short: "Current", bar: "bg-muted-foreground/40", text: "text-muted-foreground" },
  "1-30": { label: "1–30 days overdue", short: "1–30", bar: "bg-sky-400/70", text: "text-foreground" },
  "31-60": { label: "31–60 days overdue", short: "31–60", bar: "bg-warning/70", text: "text-warning" },
  "61-90": { label: "61–90 days overdue", short: "61–90", bar: "bg-amber-500/80", text: "text-warning" },
  ">90": { label: "90+ days overdue", short: "90+", bar: "bg-destructive/70", text: "text-destructive" },
};

export interface ExplodableRow {
  key: string;
  partyName: string;
  ref: string;
  amount: number;
  daysOverdue: number;
  bucket: AgingBucket;
}

export interface AgingExplodableProps {
  title: string;
  /** Owner-audit #16 (2026-08-04): plain-language now — the raw table name
   * moved to `sourceLabel` (the LIVE badge's tooltip only). */
  subtitle: string;
  sourceLabel: string;
  rows: ExplodableRow[];
  partyLabel: string; // "Customer" | "Vendor"
  refLabel: string; // "Invoice" | "Bill"
  className?: string;
}

export const AgingExplodable = ({ title, subtitle, sourceLabel, rows, partyLabel, refLabel, className }: AgingExplodableProps) => {
  const [open, setOpen] = useState<Set<AgingBucket>>(new Set());
  const toggle = (b: AgingBucket) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(b)) next.delete(b); else next.add(b);
      return next;
    });

  const byBucket = new Map<AgingBucket, ExplodableRow[]>();
  for (const b of AGING_BUCKET_ORDER) byBucket.set(b, []);
  let total = 0;
  for (const r of rows) { byBucket.get(r.bucket)?.push(r); total += r.amount; }

  return (
    <Card className={`p-6 shadow-sm animate-fade-in ${className ?? ""}`}>
      <div className="flex items-center gap-3 mb-1 flex-wrap">
        <h3 className="text-xl font-heading tracking-wide">{title}</h3>
        <DataSourceBadge source="live" sourceLabel={sourceLabel} />
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Open book <span className="text-foreground font-medium tabular-nums">{fmt(total)}</span> SAR across{" "}
        <span className="text-foreground font-medium">{rows.length}</span> {refLabel.toLowerCase()}s. Click a bucket
        to see what's inside it.
      </p>

      <div className="space-y-1.5">
        {AGING_BUCKET_ORDER.map((b) => {
          const items = byBucket.get(b) ?? [];
          const amount = items.reduce((s, r) => s + r.amount, 0);
          const share = pctOf(amount, total);
          const meta = BUCKET_META[b];
          const isOpen = open.has(b);
          return (
            <div key={b} className="rounded-lg border border-border/60 overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(b)}
                disabled={items.length === 0}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors disabled:cursor-default disabled:hover:bg-transparent"
              >
                {items.length > 0 ? (
                  isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <span className="w-4 shrink-0" />
                )}
                <span className={`w-28 shrink-0 text-sm font-medium ${meta.text}`}>{meta.label}</span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {items.length || "—"}
                </span>
                <span className="w-28 shrink-0 text-right text-sm tabular-nums font-medium">
                  {amount > 0.5 ? fmt(amount) : "—"}
                </span>
                <span className="hidden sm:block flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
                  <span className={`block h-full rounded-full ${meta.bar}`} style={{ width: `${Math.max(share, amount > 0.5 ? 3 : 0)}%` }} />
                </span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {amount > 0.5 ? `${share.toFixed(0)}%` : "—"}
                </span>
              </button>
              {isOpen && items.length > 0 && (
                <div className="px-4 pb-4 bg-muted/10">
                  <ScrollHint>
                    <table className="w-full min-w-[520px] text-sm">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                          <th className="text-left py-1 pr-2 font-semibold">{partyLabel}</th>
                          <th className="text-left py-1 px-2 font-semibold">{refLabel}</th>
                          <th className="text-right py-1 px-2 font-semibold whitespace-nowrap">Residual SAR</th>
                          <th className="text-right py-1 pl-2 font-semibold whitespace-nowrap">Overdue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...items].sort((a, c) => c.amount - a.amount).map((it) => (
                          <tr key={it.key} className="border-b border-border/10">
                            <td className="py-1.5 pr-2 max-w-[220px] truncate" title={it.partyName}>{it.partyName}</td>
                            <td className="py-1.5 px-2 text-muted-foreground whitespace-nowrap">{it.ref}</td>
                            <td className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">{fmt(it.amount)}</td>
                            <td className="py-1.5 pl-2 text-right tabular-nums whitespace-nowrap">
                              {it.daysOverdue > 0 ? `${it.daysOverdue}d` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </ScrollHint>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};
