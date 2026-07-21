// Canonical number formatting — Dashboard Alignment 2026-07-21 (spec §5).
// ONE formatting grammar for the whole cockpit:
//   - SAR amounts: thousands separators, NEGATIVES IN PARENTHESES, no decimals
//     at table grain (cent precision available via `decimals`).
//   - Percentages: ONE decimal, explicit sign on deltas.
//   - Absent ≠ zero: `fmtOrDash` renders null/undefined as an em-dash.
// All helpers are pure; no locale surprises (en-US digit grouping).

const nf0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** SAR amount, negatives in parentheses: 3,914,462 · (381,361). */
export const fmtSAR = (v: number, decimals: 0 | 2 = 0): string => {
  // Negative-zero guard: |v| < 0.5 renders "0", never "(0)" / "-0".
  const nf = decimals === 2 ? nf2 : nf0;
  if (Math.abs(v) < (decimals === 2 ? 0.005 : 0.5)) return decimals === 2 ? "0.00" : "0";
  return v < 0 ? `(${nf.format(-v)})` : nf.format(v);
};

/** Signed SAR delta: +886,565 · (981,594). */
export const fmtDeltaSAR = (v: number): string =>
  Math.abs(v) < 0.5 ? "0" : v < 0 ? `(${nf0.format(-v)})` : `+${nf0.format(v)}`;

/** Percentage, one decimal: 29.3% · (20.0)%. */
export const fmtPct = (v: number): string =>
  v < 0 ? `(${Math.abs(v).toFixed(1)})%` : `${v.toFixed(1)}%`;

/** Signed percentage delta, one decimal: +29.3% · −20.0%. */
export const fmtDeltaPct = (v: number): string =>
  `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;

/** Compact axis label: 3.9M · 382K · 74. */
export const fmtCompact = (v: number): string => {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${sign}${(a / 1_000).toFixed(0)}K`;
  return `${sign}${a.toFixed(0)}`;
};

/** null/undefined -> "—" (absent, not zero). */
export const fmtOrDash = (v: number | null | undefined, decimals: 0 | 2 = 0): string =>
  v === null || v === undefined ? "—" : fmtSAR(v, decimals);

/** Safe percent change vs a base (null when base ~ 0 — never a fake ∞%). */
export const pctChange = (actual: number, base: number): number | null =>
  Math.abs(base) < 0.5 ? null : ((actual - base) / Math.abs(base)) * 100;

/** Comparison % for P&L matrix cells (signed storage: revenue +, costs −).
 * - base ~ 0 → null (no fake ∞%);
 * - sign flip (e.g. profit vs loss) → null: a % against an opposite-sign
 *   base is meaningless — the SAR delta carries the story;
 * - cost rows (`magnitude`) → % change of the magnitude, so "costs down
 *   70%" prints −70.0%, never a confusing +70%. */
export const comparePct = (actual: number, base: number, magnitude = false): number | null => {
  if (Math.abs(base) < 0.5) return null;
  if (actual !== 0 && (actual >= 0) !== (base >= 0)) return null;
  if (magnitude) return ((Math.abs(actual) - Math.abs(base)) / Math.abs(base)) * 100;
  return ((actual - base) / Math.abs(base)) * 100;
};
