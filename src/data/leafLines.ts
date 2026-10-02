// Leaf-line drill-down — the real transaction lines behind a P&L leaf.
//
// FIX-24 FOLLOW-UP (2026-08-04, Marcello — "i prodotti devono essere
// uguali agli SKU, voglio arrivare all'ultima foglia e vedere cosa c'e'
// dentro"): the tree-hygiene pass made every leaf render cleanly, but a
// leaf was still a dead end — no way to see the real bookings it's built
// from. This is the old "Drill" screen's job, reborn at the one place it
// actually belongs: the leaf itself.
//
// Source: `v_pnl_leaf_lines` (migration 076) — the SAME 5-source union
// (qoyod invoices/bills/simple-bills/journal-entries/credit-notes), SAME
// filters, SAME VAT-net formula and SAME moa_code resolution as
// `v_pnl_by_leaf` (which pnl_management's own numbers are built from), just
// without the final GROUP BY/SUM — one row per real transaction line
// instead of one row per leaf-month. Verified live 2026-08-04: sums to
// pnl_management to the cent for every one of the 3,547 (moa_code, month)
// cells in the warehouse that carry a real moa_code (the sole exception —
// SAR 247.23 of moa_code IS NULL residual in Mar-2026 — can never surface
// here, since every call site passes a real, named leaf code).
import { useQuery } from "@tanstack/react-query";
import { supabase, toFriendlyError } from "@/lib/supabaseClient";
import { shiftMonthKey } from "@/data/liveData";
import type { Win } from "@/data/alignment";

export type LeafLineSource = "invoice" | "bill" | "simple_bill" | "journal" | "credit_note";

export interface LeafLine {
  source: LeafLineSource;
  line_id: string;
  moa_code: string;
  line_date: string; // "YYYY-MM-DD"
  product_code: string | null;
  description: string | null;
  qty: number | null;
  amount_sar: number; // signed, same convention as every other figure on this table
  doc_ref: string | null; // invoice/bill/JE number, or credit-note reference
}

const dateBounds = (win: Win) => ({
  gte: `${win.startKey}-01`,
  lt: `${shiftMonthKey(win.endKey, 1)}-01`,
});

/** Exact total line count for a leaf+window (cheap head-only count query) —
 * drives the "Showing X of Y lines" footer without pulling every row just
 * to know how many there are. */
export const useLeafLineCount = (moaCode: string | undefined, win: Win) => {
  const { gte, lt } = dateBounds(win);
  return useQuery({
    queryKey: ["leaf-line-count", moaCode, win.startKey, win.endKey],
    enabled: !!supabase && !!moaCode,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase!
        .from("v_pnl_leaf_lines")
        .select("line_id", { count: "exact", head: true })
        .eq("moa_code", moaCode!)
        .gte("line_date", gte)
        .lt("line_date", lt);
      if (error) throw toFriendlyError(error);
      return count ?? 0;
    },
  });
};

/** The first `limit` lines for a leaf+window, most recent first — bounded,
 * never a runaway explosion. The caller (LeafLineRows) grows `limit` on
 * "Show more"; react-query caches each distinct limit so growing the page
 * only fetches the incremental rows' round-trip, not a re-fetch from zero. */
export const useLeafLines = (moaCode: string | undefined, win: Win, limit: number) => {
  const { gte, lt } = dateBounds(win);
  return useQuery({
    queryKey: ["leaf-lines", moaCode, win.startKey, win.endKey, limit],
    enabled: !!supabase && !!moaCode,
    queryFn: async (): Promise<LeafLine[]> => {
      const { data, error } = await supabase!
        .from("v_pnl_leaf_lines")
        .select("source,line_id,moa_code,line_date,product_code,description,qty,amount_sar,doc_ref")
        .eq("moa_code", moaCode!)
        .gte("line_date", gte)
        .lt("line_date", lt)
        .order("line_date", { ascending: false })
        .order("line_id", { ascending: false })
        .limit(limit);
      if (error) throw toFriendlyError(error);
      return (data ?? []) as LeafLine[];
    },
  });
};

/** Human label for a line's source — shown as a small secondary tag next to
 * its doc reference, same "quiet metadata" convention as a leaf's moa_code
 * tag elsewhere on this table. */
export const LEAF_LINE_SOURCE_LABEL: Record<LeafLineSource, string> = {
  invoice: "Invoice",
  bill: "Bill",
  simple_bill: "Bill",
  journal: "Journal",
  credit_note: "Credit note",
};
