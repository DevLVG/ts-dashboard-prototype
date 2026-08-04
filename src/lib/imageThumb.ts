// Shared "give me a small version of this image" helper — fix-29-cms-perf
// (2026-08-04). Root cause across the Catalogue/Competitions CMS grids: full
// original images (Catalogue: 2K AI-bridge PNGs up to ~3.4MB each; see
// CLEVER/Cockpit/deliverables/review-fixes-2026-08-03/fix-14-photos/manifest.md)
// were requested at full resolution just to render a 40-80px thumbnail —
// with 98+ of them on one page, the browser's per-origin connection limit
// serializes the downloads into a multi-MB trickle (~1 image every 4-5s),
// which is what made the Catalogue/Competitions panels feel like they
// "don't load".
//
// Both hosts used by this app's CMS images support on-the-fly resizing —
// verified live 2026-08-04:
//   - Supabase Storage (catalog-images bucket): /storage/v1/render/image/
//     transform endpoint. HSE-202.png: 3.49MB original -> 62KB at width=300.
//   - Shopify CDN (cdn.shopify.com, competition hero/gallery images): plain
//     ?width= query param. DSC_7158-L.jpg: 1.63MB original -> 3.8KB at
//     width=100.
// Anything else (e.g. Media Library's trio-preview-site.vercel.app assets —
// a static Vercel host with no resize endpoint, confirmed via 404 on
// /_next/image) is returned unchanged; those rely on lazy-loading +
// pagination instead (see MediaAdmin.tsx).

const SUPABASE_STORAGE_OBJECT_PATH = "/storage/v1/object/public/";
const SUPABASE_STORAGE_RENDER_PATH = "/storage/v1/render/image/public/";

interface ThumbOpts {
  /** Target width in CSS px of the largest on-screen use — pick ~2x the
   * visual size to stay crisp on retina displays without over-fetching. */
  width: number;
  quality?: number; // default 70 — plenty for a grid thumbnail
}

/** Supabase Storage public object URL -> resized/recompressed variant via
 * the Storage image-transformation endpoint. Any URL that isn't a Supabase
 * Storage public object URL is returned unchanged (transform endpoint only
 * works for objects actually stored there — never guess). */
export function supabaseImageThumb(url: string | null | undefined, opts: ThumbOpts): string | null | undefined {
  if (!url) return url;
  const idx = url.indexOf(SUPABASE_STORAGE_OBJECT_PATH);
  if (idx === -1) return url; // not a Supabase Storage URL (e.g. a local blob: preview) — pass through
  const quality = opts.quality ?? 70;
  const transformed = url.replace(SUPABASE_STORAGE_OBJECT_PATH, SUPABASE_STORAGE_RENDER_PATH);
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=${opts.width}&quality=${quality}`;
}

/** Shopify CDN URL -> resized variant via the ?width= query param Shopify's
 * image CDN already serves. Any non-cdn.shopify.com URL is returned
 * unchanged. */
export function shopifyImageThumb(url: string | null | undefined, opts: ThumbOpts): string | null | undefined {
  if (!url) return url;
  if (!url.includes("cdn.shopify.com")) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}width=${opts.width}`;
}

/** Auto-detects the host and applies whichever transform applies; returns
 * the original URL untouched for hosts with no known resize endpoint
 * (e.g. the Media Library's Vercel-hosted assets). Safe default for any
 * "just give me a small thumbnail" call site that may see either host. */
export function remoteImageThumb(url: string | null | undefined, opts: ThumbOpts): string | null | undefined {
  if (!url) return url;
  if (url.includes(SUPABASE_STORAGE_OBJECT_PATH)) return supabaseImageThumb(url, opts);
  if (url.includes("cdn.shopify.com")) return shopifyImageThumb(url, opts);
  return url;
}
