// Role-based access — single source of truth for nav + route gating.
// Greenfield, config-driven: one email→role map below, one role→pages map
// below. To add/change access, edit this file only.
//
// Role map — proposed, to confirm. The email lists and the page grants below
// reflect Marcello's mandate as given (2026-07-29); Trio has not yet
// provisioned the ceo@ / direction@ / admin@ mailboxes as live Supabase Auth
// logins (verified live 2026-07-29: the only real accounts are
// marcello.piccardo@leveredge.pro, arwa@triosporting.com, office.ceo@triosporting.com,
// and a handful of personnel test accounts) — confirm the exact addresses
// with Trio before go-live, then create/rename the Supabase Auth users to
// match (or update ROLE_EMAILS to match what Trio actually provisions).
import { PageType } from "@/types/dashboard";

export type Role = "leveredge" | "ceo" | "administration" | "unknown";

const ROLE_EMAILS: Record<Exclude<Role, "unknown">, string[]> = {
  leveredge: ["marcello.piccardo@leveredge.pro", "analyst@leveredge.pro"],
  ceo: ["ceo@triosporting.com"],
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
const ALL_PAGES: PageType[] = [
  "performance", "cash", "treasury", "payments", "balance",
  ...CMS_PAGES,
];
/** "Everything business" = every screen except the CMS admin tabs. */
const BUSINESS_PAGES: PageType[] = ALL_PAGES.filter((p) => !CMS_PAGES.includes(p));

/** Pages each role may see. First entry is that role's landing page. */
export const ROLE_PAGES: Record<Role, PageType[]> = {
  leveredge: ALL_PAGES,                    // everything, incl. CMS admin
  ceo: BUSINESS_PAGES,                     // Economics + Cash Flow + Balance Sheet + Treasury + Approvals; not CMS
  administration: ["treasury", "cash"],    // Treasury workspace (4 sub-tabs) + Cash Flow only
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
