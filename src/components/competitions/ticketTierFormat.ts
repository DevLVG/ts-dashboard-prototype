// Competitions CMS — legacy wire-format <-> structured-row conversion.
//
// WHY this file exists: the CEO's complaint (2026-08-03, "this is really
// antique — build a proper, modern form") was about the admin UI, not the
// data contract. The DB (migration 058_competitions_cms.sql) stores
// schedule_text / spectator_tickets / competitor_entries as plain TEXT, and
// the live Shopify renderer
// (CLEVER/Marketing/Web-App/shopify-theme/snippets/competition-show-card.liquid)
// parses that exact pipe-delimited "one per line" convention today, in
// production. Changing the column types or the Liquid parsing contract would
// touch the live checkout for zero UX benefit — the fix that actually
// matters is replacing the free-text textarea with a structured repeater
// that reads/writes the SAME wire format. Nothing downstream (sync script,
// theme, live checkout) changes; only how staff edit it does.
//
// Wire formats (verified against shopify-theme/snippets/competition-show-card.liquid,
// and against the live "drift-2025-demo" row in cal_competitions):
//   spectator_tickets   — one line per tier:  Name|Price|note|feat|href
//                         `feat` is the literal token "feat" (else blank);
//                         `href` is an optional per-tier checkout override.
//                         Price is stored as "SAR <number>" — Liquid splits
//                         on the first space to render the currency + amount
//                         separately, so the number is always prefixed "SAR ".
//   competitor_entries  — one line per tier:  Name|Price|note|href
//                         (no `feat` slot at all — see the Liquid snippet's
//                         entry-grid loop, which never checks parts[3] for a
//                         flag, only ever as an href).
//   schedule_text       — one line per item:  Label|Detail
//   gallery_urls        — already JSONB array of URLs in the DB; no textual
//                         convention to preserve, just structured directly.

let uidCounter = 0;
export const uid = (): string => {
  uidCounter += 1;
  return `row_${Date.now().toString(36)}_${uidCounter}`;
};

export interface TierRow {
  id: string;
  name: string;
  price: string; // numeric text, e.g. "75" or "180.5" — SAR is implicit/fixed
  note: string;
  href: string;
  featured: boolean; // ignored/omitted for entry tiers (no wire slot)
}

export interface ScheduleRow {
  id: string;
  label: string;
  detail: string;
}

export interface GalleryRow {
  id: string;
  url: string;
}

const splitLines = (text: string | null | undefined): string[] =>
  (text ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const splitLine = (raw: string): string[] => raw.split("|").map((p) => p.trim());

/** "SAR 75" / "75" / "SAR75.5" -> "75" / "75.5" (first numeric token found). */
const extractPriceNumber = (raw: string | undefined): string => {
  const m = (raw ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? m[0] : "";
};

/** numeric text -> "SAR <n>", trimming a trailing ".00" the way the real data does. */
export const formatPriceForWire = (price: string): string => {
  const n = Number(price);
  if (!price.trim() || Number.isNaN(n)) return "SAR 0";
  if (Number.isInteger(n)) return `SAR ${n}`;
  return `SAR ${n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}`;
};

const rowHasContent = (r: TierRow) =>
  r.name.trim() || r.price.trim() || r.note.trim() || r.href.trim();

// ------------------------------------------------------------- ticket tiers

export const parseTicketTiers = (text: string | null): TierRow[] =>
  splitLines(text).map((line) => {
    const parts = splitLine(line);
    return {
      id: uid(),
      name: parts[0] ?? "",
      price: extractPriceNumber(parts[1]),
      note: parts[2] ?? "",
      featured: (parts[3] ?? "").trim().toLowerCase() === "feat",
      href: parts[4] ?? "",
    };
  });

export const serializeTicketTiers = (rows: TierRow[]): string =>
  rows
    .filter(rowHasContent)
    .map((r) => {
      const parts = [r.name.trim(), formatPriceForWire(r.price), r.note.trim().replace(/\|/g, "/")];
      // Positional wire format: index 3 = literal "feat" flag (or blank),
      // index 4 = href override. Both must be emitted (even blank) so an
      // href always lands at index 4 regardless of the featured flag.
      if (r.featured || r.href.trim()) parts.push(r.featured ? "feat" : "");
      if (r.href.trim()) parts.push(r.href.trim());
      return parts.join("|");
    })
    .join("\n");

// -------------------------------------------------------------- entry tiers

export const parseEntryTiers = (text: string | null): TierRow[] =>
  splitLines(text).map((line) => {
    const parts = splitLine(line);
    return {
      id: uid(),
      name: parts[0] ?? "",
      price: extractPriceNumber(parts[1]),
      note: parts[2] ?? "",
      featured: false, // no wire slot for entries — kept only so the row shape matches TierRow
      href: parts[3] ?? "",
    };
  });

export const serializeEntryTiers = (rows: TierRow[]): string =>
  rows
    .filter(rowHasContent)
    .map((r) => {
      const parts = [r.name.trim(), formatPriceForWire(r.price), r.note.trim().replace(/\|/g, "/")];
      if (r.href.trim()) parts.push(r.href.trim());
      return parts.join("|");
    })
    .join("\n");

// ---------------------------------------------------------------- schedule

export const parseSchedule = (text: string | null): ScheduleRow[] =>
  splitLines(text).map((line) => {
    const parts = splitLine(line);
    return { id: uid(), label: parts[0] ?? "", detail: parts[1] ?? "" };
  });

export const serializeSchedule = (rows: ScheduleRow[]): string =>
  rows
    .filter((r) => r.label.trim() || r.detail.trim())
    .map((r) => `${r.label.trim().replace(/\|/g, "/")}|${r.detail.trim().replace(/\|/g, "/")}`)
    .join("\n");

// ----------------------------------------------------------------- gallery

export const parseGallery = (urls: string[] | null | undefined): GalleryRow[] =>
  (urls ?? []).map((url) => ({ id: uid(), url }));

export const serializeGallery = (rows: GalleryRow[]): string[] =>
  rows.map((r) => r.url.trim()).filter(Boolean);

// ----------------------------------------------------------------- helpers

export const move = <T,>(arr: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= arr.length) return arr;
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};
