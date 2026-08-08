// Role-based access — single source of truth for nav + route gating.
// Greenfield, config-driven: one email→role map below, one role→pages map
// below. To add/change access, edit this file only.
//
// Role map — proposed, to confirm. The email lists and the page grants below
// reflect Marcello's mandate as given (2026-07-29). ceo@ / direction@ / admin@
// have since been provisioned as live Supabase Auth logins by Trio, alongside
// the two original go-live accounts (marcello.piccardo@leveredge.pro,
// arwa@triosporting.com — panel-golive-2026-07-21.md) and office.ceo@triosporting.com.
//
// BUG FIXED 2026-08-03 (fix-12-admin, found while wiring Confirmations role
// access — flagged by the master-checklist row naming Arwa explicitly):
// arwa@triosporting.com — Trio's actual Chairman/CEO (Finance-Flows.md,
// CLEVER-R1-CFO-View-Requirements.md, CLEVER-Handbook-Storyline-2026-07-21.md
// all identify her as CEO) and one of only two users on the cockpit since its
// very first go-live — was NOT in ROLE_EMAILS at all. Verified live against
// clever.leveredge.pro: she resolved to "unknown" (Guest, Economics-only,
// landing on /performance) — locked out of Treasury/Confirmations/
// Approvals/Cash Flow/Balance Sheet entirely. Added to the ceo role below.
// office.ceo@triosporting.com is a real Supabase Auth account too, but with no
// documentary evidence of who uses it or what role it should carry — left
// unmapped (resolves to "unknown", the safe default) rather than guessed;
// confirm with Trio before adding it anywhere.
//
// UPDATED 2026-08-04 (evening, Marcello's order): ceo@triosporting.com is the
// internal review/test login (not Arwa) — moved from role "ceo" to role
// "leveredge" so it gets full access incl. Content Studio/CMS; Arwa
// (arwa@triosporting.com) is unchanged and stays on role "ceo".
import { PageType } from "@/types/dashboard";

export type Role = "leveredge" | "ceo" | "administration" | "unknown";

const ROLE_EMAILS: Record<Exclude<Role, "unknown">, string[]> = {
  leveredge: ["marcello.piccardo@leveredge.pro", "analyst@leveredge.pro", "ceo@triosporting.com"],
  ceo: ["arwa@triosporting.com"],
  administration: ["direction@triosporting.com", "admin@triosporting.com"],
};

/** Resolve a signed-in user's role from their email. Unmatched (or no)
 * email → "unknown" (Economics only — the safe, minimal default for any
 * authenticated user not yet on the role map). Case-insensitive exact match. */
export const resolveRole = (email?: string | null): Role => {
  if (!email) return "unknown";
  const e = email.trim().toLowerCase();
  for (const role of Object.keys(ROLE_EMAILS) as Exclude<Role, "unknown">[]) {
    if (ROLE_EMAILS[role].some((candidate) => candidate.toLowerCase() === e)) return role;
  }
  return "unknown";
};

const CMS_PAGES: PageType[] = ["catalog", "media", "copy", "competitions", "instructors", "slot-priority"];
// "overview" and "analysis" are retired from the nav (live review #2,
// 2026-08-03) — the "performance" page ("Economics" in the nav; see
// DashboardNav.tsx) replaces both, and /overview + /analysis hard-redirect
// to /performance at the router level (App.tsx). Deliberately left out of
// ALL_PAGES/BUSINESS_PAGES below: nothing should be granted role access to
// a destination that no longer exists. The PageType values and page
// components themselves are untouched for now — this is an access-list
// change only.
// Handbook package job (2026-08-07): four DB views existed live with real
// data but were never surfaced anywhere in the cockpit — cash forecast,
// EOSB/leave accruals, VAT pre-filing checks, month-end close assistant.
// Role grants below are a first-pass call (documented per-page in each
// component's own header) — proposed, to confirm with Marcello/Luca, same
// posture as the rest of this file.
const ALL_PAGES: PageType[] = [
  "performance", "monthly", "cash", "cash-forecast", "treasury", "confirmations", "payments", "balance", "report",
  "accruals", "vat-prefile", "month-close",
  ...CMS_PAGES,
];
/** "Everything business" = every screen except the CMS admin tabs. */
const BUSINESS_PAGES: PageType[] = ALL_PAGES.filter((p) => !CMS_PAGES.includes(p));

/** Pages each role may see. First entry is that role's landing page. */
export const ROLE_PAGES: Record<Role, PageType[]> = {
  leveredge: ALL_PAGES,                    // everything, incl. CMS admin
  ceo: BUSINESS_PAGES,                     // Economics + Cash Flow + Balance Sheet + Treasury + Confirmations + Approvals + the 4 new screens; not CMS
  // Treasury workspace (2 sub-tabs) + Cash Flow + Confirmations (live review
  // #3, 2026-08-03 — "confirmation staff" work, promoted out of Treasury into
  // its own standalone page/nav item; administration keeps access to it).
  // cash-forecast (extension of "cash") and month-close (process visibility,
  // like confirmations) added 2026-08-07; accruals/vat-prefile withheld —
  // payroll-sensitive / filing-compliance, same class as "payments" and
  // "report" which administration also does not see.
  administration: ["treasury", "cash", "cash-forecast", "confirmations", "month-close"],
  unknown: ["performance"],                // Economics only, read-only default landing
};

export const ROLE_LABELS: Record<Role, string> = {
  leveredge: "Leveredge",
  ceo: "CEO",
  administration: "Administration",
  unknown: "Guest",
};

// NOTE (concurrency guard, 2026-07-29): a second, unrelated workstream is
// landing new PageType values (e.g. "competitions") in this same working
// tree while this file is maintained separately. Rather than let a
// not-yet-listed page silently lock leveredge OUT of its own new screens,
// `leveredge` bypasses the allow-list entirely — always full access,
// including any page type added after this file was last touched.
// Every other role stays strictly allow-listed (default-deny), so a new,
// not-yet-classified page never leaks to ceo/administration/unknown by
// accident — it just needs adding to CMS_PAGES/ROLE_PAGES explicitly.
export const canAccessPage = (role: Role, page: PageType): boolean =>
  role === "leveredge" ? true : ROLE_PAGES[role].includes(page);

export const landingPageFor = (role: Role): PageType => ROLE_PAGES[role][0];
