// Canonical MoA structural tree for the Economics P&L table — fix-18,
// 2026-08-03 (Marcello, live review: "non c'è Livery, è tutto a caso").
//
// ROOT CAUSE this file fixes: PerformanceAnalysis.tsx's `buildTree()` grouped
// straight from the P&L macro section (e.g. "Gross revenue") to the MoA L3
// cluster, via `data/moaMaster.ts`'s `moaInfo()` — a [clusterCode, clusterName,
// leafName] triple with NO family (L2 BU) field at all. Every L3 cluster from
// every BU (Livery, Horse School, Membership, Events, B2B, Competitions,
// Retail) therefore rendered as a flat, unsorted sibling list directly under
// the section row — exactly the "Full Board, Add-on, Other, Holiday Camps,
// Services, Other (dup), Pony Rides, Venue Rental, National Competitions,
// Group Lessons, Box Only, Consumables, Tack Shop, Cafeteria" mess Marcello
// flagged. moaMaster.ts's cluster/leaf *names* were verified byte-identical
// to the live DB for all 188 active P&L leaves (no stale-data bug) — the
// defect was structural: the family level was simply never modelled.
//
// THIS FILE adds that missing level: every active moa_gestionale leaf
// relevant to the P&L, with its family (l2_bu) restored, so the table can
// walk Section -> Family (BU) -> Cluster (L3) -> Leaf (L4) exactly as the
// canonical MoA defines it.
//
// GENERATED, not hand-maintained: a mechanical dump of
//   select moa_code, l1_section, l2_bu, l3_cluster_code, l3_cluster_name, l4_leaf_name
//   from moa_gestionale
//   where is_active and l1_section in ('REV','COGS','OPEX','DA','NON-OP','TPC')
//   order by l1_section, l2_bu, l3_cluster_code, moa_code
// re-sorted into canonical P&L-section order (Revenue, COGS, OPEX-GA,
// OPEX-MS, OPEX-People, Project-Costs, D&A, NON-OP), then by bu, clusterCode,
// moaCode — the exact order the zero-diff verification script checks against
// (deliverables/review-fixes-2026-08-03/fix-18-moa-tree/tree-vs-master-diff.txt).
// moa_gestionale itself has no explicit sort column, so this order — the
// same one the DB naturally returns — is the only non-invented choice.
//
// The l1_section -> PLSection split for OPEX is deterministic and verified
// exhaustive against every active OPEX leaf in the DB (no leftover l3_cluster
// prefix): GA-* -> OPEX-GA, MS-* -> OPEX-MS, CORP-OPX* -> OPEX-People.
// REV -> Revenue, COGS -> COGS, DA -> D&A, NON-OP -> NON-OP, TPC ->
// Project-Costs. Regenerate this file (same query) whenever moa_gestionale
// changes — do NOT hand-edit rows.
//
// Cross-check performed 2026-08-03: every moa_code that appears in ANY
// pnl_management row tagged to one of these 8 PL sections is active in
// moa_gestionale and present below — zero orphans, so leaf-level sums always
// tie to section totals to the cent.

import { LIVE_BU_LABELS } from "@/data/liveData";

export type PLSection =
  | "Revenue" | "COGS" | "OPEX-GA" | "OPEX-MS" | "OPEX-People"
  | "Project-Costs" | "D&A" | "NON-OP";

export interface MoaLeafDef {
  moaCode: string;
  plSection: PLSection;
  bu: string;          // l2_bu code, e.g. "LIV"
  clusterCode: string; // l3_cluster_code
  clusterName: string; // l3_cluster_name
  leafName: string;    // l4_leaf_name
}

export const MOA_PL_LEAVES: MoaLeafDef[] = [
  { moaCode: "B2B-RB01", plSection: "Revenue", bu: "B2B", clusterCode: "B2B-RB", clusterName: "Venue Rental", leafName: "Business/Institutional Events" },
  { moaCode: "B2B-RB02", plSection: "Revenue", bu: "B2B", clusterCode: "B2B-RB", clusterName: "Venue Rental", leafName: "Entertainment Events" },
  { moaCode: "B2B-RB03", plSection: "Revenue", bu: "B2B", clusterCode: "B2B-RB", clusterName: "Venue Rental", leafName: "Other (Accommodation)" },
  { moaCode: "B2B-RB04", plSection: "Revenue", bu: "B2B", clusterCode: "B2B-RB", clusterName: "Venue Rental", leafName: "Educational Masterclass/Clinics" },
  { moaCode: "B2B-RC01", plSection: "Revenue", bu: "B2B", clusterCode: "B2B-RC", clusterName: "Schools", leafName: "Courses" },
  { moaCode: "B2B-RC02", plSection: "Revenue", bu: "B2B", clusterCode: "B2B-RC", clusterName: "Schools", leafName: "Trips" },
  { moaCode: "B2B-RD01", plSection: "Revenue", bu: "B2B", clusterCode: "B2B-RD", clusterName: "Equestrian Services", leafName: "Equestrian Services" },
  { moaCode: "B2B-RF01", plSection: "Revenue", bu: "B2B", clusterCode: "B2B-RF", clusterName: "Venue Sponsorship", leafName: "Venue Sponsorship" },
  { moaCode: "COMP-IA01", plSection: "Revenue", bu: "COMP", clusterCode: "COMP-IA", clusterName: "International Competitions", leafName: "Entry Fees" },
  { moaCode: "COMP-IA02", plSection: "Revenue", bu: "COMP", clusterCode: "COMP-IA", clusterName: "International Competitions", leafName: "Ticketing" },
  { moaCode: "COMP-IA03", plSection: "Revenue", bu: "COMP", clusterCode: "COMP-IA", clusterName: "International Competitions", leafName: "Event Sponsorship" },
  { moaCode: "COMP-IA04", plSection: "Revenue", bu: "COMP", clusterCode: "COMP-IA", clusterName: "International Competitions", leafName: "Stable Rental Competition" },
  { moaCode: "COMP-IA05", plSection: "Revenue", bu: "COMP", clusterCode: "COMP-IA", clusterName: "International Competitions", leafName: "Other" },
  { moaCode: "COMP-NA01", plSection: "Revenue", bu: "COMP", clusterCode: "COMP-NA", clusterName: "National Competitions", leafName: "Entry Fees" },
  { moaCode: "COMP-NA02", plSection: "Revenue", bu: "COMP", clusterCode: "COMP-NA", clusterName: "National Competitions", leafName: "Ticketing" },
  { moaCode: "COMP-NA03", plSection: "Revenue", bu: "COMP", clusterCode: "COMP-NA", clusterName: "National Competitions", leafName: "Event Sponsorship" },
  { moaCode: "COMP-NA04", plSection: "Revenue", bu: "COMP", clusterCode: "COMP-NA", clusterName: "National Competitions", leafName: "Stable Rental Competition" },
  { moaCode: "COMP-NA05", plSection: "Revenue", bu: "COMP", clusterCode: "COMP-NA", clusterName: "National Competitions", leafName: "Other" },
  { moaCode: "EVT-RA01", plSection: "Revenue", bu: "EVT", clusterCode: "EVT-RA", clusterName: "Private Events", leafName: "Birthdays" },
  { moaCode: "EVT-RA02", plSection: "Revenue", bu: "EVT", clusterCode: "EVT-RA", clusterName: "Private Events", leafName: "Marriages" },
  { moaCode: "EVT-RA03", plSection: "Revenue", bu: "EVT", clusterCode: "EVT-RA", clusterName: "Private Events", leafName: "Other" },
  { moaCode: "HSE-RA01", plSection: "Revenue", bu: "HSE", clusterCode: "HSE-RA", clusterName: "Group Lessons", leafName: "Group Lessons" },
  { moaCode: "HSE-RB01", plSection: "Revenue", bu: "HSE", clusterCode: "HSE-RB", clusterName: "Private Lessons", leafName: "Private Lessons" },
  { moaCode: "HSE-RC01", plSection: "Revenue", bu: "HSE", clusterCode: "HSE-RC", clusterName: "Lesson Pass", leafName: "Lesson Pass" },
  { moaCode: "HSE-RD01", plSection: "Revenue", bu: "HSE", clusterCode: "HSE-RD", clusterName: "Educational Programs", leafName: "Educational Programs" },
  { moaCode: "HSE-RE01", plSection: "Revenue", bu: "HSE", clusterCode: "HSE-RE", clusterName: "Holiday Camps", leafName: "Holiday Camps" },
  { moaCode: "HSE-RF01", plSection: "Revenue", bu: "HSE", clusterCode: "HSE-RF", clusterName: "Pony Rides", leafName: "Pony Rides" },
  { moaCode: "HSE-RG01", plSection: "Revenue", bu: "HSE", clusterCode: "HSE-RG", clusterName: "Other", leafName: "Other" },
  { moaCode: "LIV-RA01", plSection: "Revenue", bu: "LIV", clusterCode: "LIV-RA", clusterName: "Full Board", leafName: "Full Livery" },
  { moaCode: "LIV-RA02", plSection: "Revenue", bu: "LIV", clusterCode: "LIV-RA", clusterName: "Full Board", leafName: "Lite Livery" },
  { moaCode: "LIV-RA03", plSection: "Revenue", bu: "LIV", clusterCode: "LIV-RA", clusterName: "Full Board", leafName: "Retired Horse Livery" },
  { moaCode: "LIV-RB01", plSection: "Revenue", bu: "LIV", clusterCode: "LIV-RB", clusterName: "Box Only", leafName: "Box Only" },
  { moaCode: "LIV-RC01", plSection: "Revenue", bu: "LIV", clusterCode: "LIV-RC", clusterName: "Leasing", leafName: "Leasing" },
  { moaCode: "LIV-RD01", plSection: "Revenue", bu: "LIV", clusterCode: "LIV-RD", clusterName: "Add-on", leafName: "Add-on" },
  { moaCode: "LIV-RE01", plSection: "Revenue", bu: "LIV", clusterCode: "LIV-RE", clusterName: "Services", leafName: "Services" },
  { moaCode: "LIV-RF01", plSection: "Revenue", bu: "LIV", clusterCode: "LIV-RF", clusterName: "Consumables", leafName: "Consumables" },
  { moaCode: "LIV-RG01", plSection: "Revenue", bu: "LIV", clusterCode: "LIV-RG", clusterName: "Other", leafName: "Other" },
  { moaCode: "MEM-RA01", plSection: "Revenue", bu: "MEM", clusterCode: "MEM-RA", clusterName: "Individual", leafName: "Individual" },
  { moaCode: "MEM-RB01", plSection: "Revenue", bu: "MEM", clusterCode: "MEM-RB", clusterName: "Family", leafName: "Family" },
  { moaCode: "MEM-RC01", plSection: "Revenue", bu: "MEM", clusterCode: "MEM-RC", clusterName: "Kids", leafName: "Kids" },
  { moaCode: "MEM-RD01", plSection: "Revenue", bu: "MEM", clusterCode: "MEM-RD", clusterName: "Daily Access", leafName: "Daily Access" },
  { moaCode: "MEM-RE01", plSection: "Revenue", bu: "MEM", clusterCode: "MEM-RE", clusterName: "Other", leafName: "Other" },
  { moaCode: "RET-RA01", plSection: "Revenue", bu: "RET", clusterCode: "RET-RA", clusterName: "Tack Shop", leafName: "Helmets" },
  { moaCode: "RET-RA02", plSection: "Revenue", bu: "RET", clusterCode: "RET-RA", clusterName: "Tack Shop", leafName: "Boots" },
  { moaCode: "RET-RA03", plSection: "Revenue", bu: "RET", clusterCode: "RET-RA", clusterName: "Tack Shop", leafName: "Saddles" },
  { moaCode: "RET-RA04", plSection: "Revenue", bu: "RET", clusterCode: "RET-RA", clusterName: "Tack Shop", leafName: "Saddle Pads" },
  { moaCode: "RET-RA05", plSection: "Revenue", bu: "RET", clusterCode: "RET-RA", clusterName: "Tack Shop", leafName: "Blankets" },
  { moaCode: "RET-RA06", plSection: "Revenue", bu: "RET", clusterCode: "RET-RA", clusterName: "Tack Shop", leafName: "Halters" },
  { moaCode: "RET-RA07", plSection: "Revenue", bu: "RET", clusterCode: "RET-RA", clusterName: "Tack Shop", leafName: "Accessories" },
  { moaCode: "RET-RA08", plSection: "Revenue", bu: "RET", clusterCode: "RET-RA", clusterName: "Tack Shop", leafName: "Rider Essentials" },
  { moaCode: "RET-RA09", plSection: "Revenue", bu: "RET", clusterCode: "RET-RA", clusterName: "Tack Shop", leafName: "Horse Care" },
  { moaCode: "RET-RA10", plSection: "Revenue", bu: "RET", clusterCode: "RET-RA", clusterName: "Tack Shop", leafName: "Bundle" },
  { moaCode: "RET-RA11", plSection: "Revenue", bu: "RET", clusterCode: "RET-RA", clusterName: "Tack Shop", leafName: "Other" },
  { moaCode: "RET-RB01", plSection: "Revenue", bu: "RET", clusterCode: "RET-RB", clusterName: "Cafeteria", leafName: "Hot Drinks" },
  { moaCode: "RET-RB02", plSection: "Revenue", bu: "RET", clusterCode: "RET-RB", clusterName: "Cafeteria", leafName: "Cold Drinks" },
  { moaCode: "RET-RB03", plSection: "Revenue", bu: "RET", clusterCode: "RET-RB", clusterName: "Cafeteria", leafName: "Grab & Go" },
  { moaCode: "RET-RB04", plSection: "Revenue", bu: "RET", clusterCode: "RET-RB", clusterName: "Cafeteria", leafName: "Sweets" },
  { moaCode: "RET-RB05", plSection: "Revenue", bu: "RET", clusterCode: "RET-RB", clusterName: "Cafeteria", leafName: "Juices" },
  { moaCode: "RET-RB06", plSection: "Revenue", bu: "RET", clusterCode: "RET-RB", clusterName: "Cafeteria", leafName: "Energy" },
  { moaCode: "RET-RB07", plSection: "Revenue", bu: "RET", clusterCode: "RET-RB", clusterName: "Cafeteria", leafName: "Soft Drinks" },
  { moaCode: "RET-RB08", plSection: "Revenue", bu: "RET", clusterCode: "RET-RB", clusterName: "Cafeteria", leafName: "Combo" },
  { moaCode: "RET-RB09", plSection: "Revenue", bu: "RET", clusterCode: "RET-RB", clusterName: "Cafeteria", leafName: "Other" },
  { moaCode: "B2B-CGA01", plSection: "COGS", bu: "B2B", clusterCode: "B2B-CGA", clusterName: "Sales Commissions", leafName: "Sales Team Commission" },
  { moaCode: "B2B-CGBI1", plSection: "COGS", bu: "B2B", clusterCode: "B2B-CGBI", clusterName: "Competition Direct – International", leafName: "Competitions – Expenses" },
  { moaCode: "B2B-CGBI2", plSection: "COGS", bu: "B2B", clusterCode: "B2B-CGBI", clusterName: "Competition Direct – International", leafName: "Competitions – Prizes" },
  { moaCode: "B2B-CGBN1", plSection: "COGS", bu: "B2B", clusterCode: "B2B-CGBN", clusterName: "Competition Direct – National", leafName: "Competitions – Expenses" },
  { moaCode: "B2B-CGBN2", plSection: "COGS", bu: "B2B", clusterCode: "B2B-CGBN", clusterName: "Competition Direct – National", leafName: "Competitions – Prizes" },
  { moaCode: "B2B-CGC01", plSection: "COGS", bu: "B2B", clusterCode: "B2B-CGC", clusterName: "School Programs", leafName: "School Programs – Direct Costs" },
  { moaCode: "B2B-CGD01", plSection: "COGS", bu: "B2B", clusterCode: "B2B-CGD", clusterName: "Venue Rental", leafName: "Venue Rental – Direct Costs" },
  { moaCode: "HSE-CGA01", plSection: "COGS", bu: "HSE", clusterCode: "HSE-CGA", clusterName: "Sales Commissions", leafName: "Trainers Commission" },
  { moaCode: "HSE-CGA02", plSection: "COGS", bu: "HSE", clusterCode: "HSE-CGA", clusterName: "Sales Commissions", leafName: "Sales Team Commission" },
  { moaCode: "HSE-CGB01", plSection: "COGS", bu: "HSE", clusterCode: "HSE-CGB", clusterName: "Other Expenses", leafName: "HSE Other Direct Costs" },
  { moaCode: "HSE-CGC01", plSection: "COGS", bu: "HSE", clusterCode: "HSE-CGC", clusterName: "Events & Programs", leafName: "Gymkhana" },
  { moaCode: "LIV-CGA01", plSection: "COGS", bu: "LIV", clusterCode: "LIV-CGA", clusterName: "Horse Care", leafName: "Farrier (Horseshoeing)" },
  { moaCode: "LIV-CGA02", plSection: "COGS", bu: "LIV", clusterCode: "LIV-CGA", clusterName: "Horse Care", leafName: "Vet & Medicine" },
  { moaCode: "LIV-CGB01", plSection: "COGS", bu: "LIV", clusterCode: "LIV-CGB", clusterName: "Feed", leafName: "Hay" },
  { moaCode: "LIV-CGB02", plSection: "COGS", bu: "LIV", clusterCode: "LIV-CGB", clusterName: "Feed", leafName: "Pellets & Corn" },
  { moaCode: "LIV-CGB03", plSection: "COGS", bu: "LIV", clusterCode: "LIV-CGB", clusterName: "Feed", leafName: "Barley" },
  { moaCode: "LIV-CGB04", plSection: "COGS", bu: "LIV", clusterCode: "LIV-CGB", clusterName: "Feed", leafName: "Alpha Alpha" },
  { moaCode: "LIV-CGB05", plSection: "COGS", bu: "LIV", clusterCode: "LIV-CGB", clusterName: "Feed", leafName: "Oats" },
  { moaCode: "LIV-CGB06", plSection: "COGS", bu: "LIV", clusterCode: "LIV-CGB", clusterName: "Feed", leafName: "Other Feeds" },
  { moaCode: "LIV-CGC01", plSection: "COGS", bu: "LIV", clusterCode: "LIV-CGC", clusterName: "Bedding", leafName: "Wood Shavings" },
  { moaCode: "LIV-CGD01", plSection: "COGS", bu: "LIV", clusterCode: "LIV-CGD", clusterName: "Logistics", leafName: "Horse Transportation" },
  { moaCode: "LIV-CGE01", plSection: "COGS", bu: "LIV", clusterCode: "LIV-CGE", clusterName: "Sales Commissions", leafName: "Sales Team Commission" },
  { moaCode: "MEM-CGA01", plSection: "COGS", bu: "MEM", clusterCode: "MEM-CGA", clusterName: "Sales Commissions", leafName: "Sales Team Commission" },
  { moaCode: "RET-CGA01", plSection: "COGS", bu: "RET", clusterCode: "RET-CGA", clusterName: "Tack Shop", leafName: "Helmets" },
  { moaCode: "RET-CGA02", plSection: "COGS", bu: "RET", clusterCode: "RET-CGA", clusterName: "Tack Shop", leafName: "Boots" },
  { moaCode: "RET-CGA03", plSection: "COGS", bu: "RET", clusterCode: "RET-CGA", clusterName: "Tack Shop", leafName: "Saddles" },
  { moaCode: "RET-CGA04", plSection: "COGS", bu: "RET", clusterCode: "RET-CGA", clusterName: "Tack Shop", leafName: "Saddle Pads" },
  { moaCode: "RET-CGA05", plSection: "COGS", bu: "RET", clusterCode: "RET-CGA", clusterName: "Tack Shop", leafName: "Blankets" },
  { moaCode: "RET-CGA06", plSection: "COGS", bu: "RET", clusterCode: "RET-CGA", clusterName: "Tack Shop", leafName: "Halters" },
  { moaCode: "RET-CGA07", plSection: "COGS", bu: "RET", clusterCode: "RET-CGA", clusterName: "Tack Shop", leafName: "Accessories" },
  { moaCode: "RET-CGA08", plSection: "COGS", bu: "RET", clusterCode: "RET-CGA", clusterName: "Tack Shop", leafName: "Rider Essentials" },
  { moaCode: "RET-CGA09", plSection: "COGS", bu: "RET", clusterCode: "RET-CGA", clusterName: "Tack Shop", leafName: "Horse Care" },
  { moaCode: "RET-CGA10", plSection: "COGS", bu: "RET", clusterCode: "RET-CGA", clusterName: "Tack Shop", leafName: "Bundle" },
  { moaCode: "RET-CGA11", plSection: "COGS", bu: "RET", clusterCode: "RET-CGA", clusterName: "Tack Shop", leafName: "Other" },
  { moaCode: "RET-CGB01", plSection: "COGS", bu: "RET", clusterCode: "RET-CGB", clusterName: "Cafeteria", leafName: "Hot Drinks" },
  { moaCode: "RET-CGB02", plSection: "COGS", bu: "RET", clusterCode: "RET-CGB", clusterName: "Cafeteria", leafName: "Cold Drinks" },
  { moaCode: "RET-CGB03", plSection: "COGS", bu: "RET", clusterCode: "RET-CGB", clusterName: "Cafeteria", leafName: "Grab & Go" },
  { moaCode: "RET-CGB04", plSection: "COGS", bu: "RET", clusterCode: "RET-CGB", clusterName: "Cafeteria", leafName: "Sweets" },
  { moaCode: "RET-CGB05", plSection: "COGS", bu: "RET", clusterCode: "RET-CGB", clusterName: "Cafeteria", leafName: "Juices" },
  { moaCode: "RET-CGB06", plSection: "COGS", bu: "RET", clusterCode: "RET-CGB", clusterName: "Cafeteria", leafName: "Energy" },
  { moaCode: "RET-CGB07", plSection: "COGS", bu: "RET", clusterCode: "RET-CGB", clusterName: "Cafeteria", leafName: "Soft Drinks" },
  { moaCode: "RET-CGB08", plSection: "COGS", bu: "RET", clusterCode: "RET-CGB", clusterName: "Cafeteria", leafName: "Combo" },
  { moaCode: "RET-CGB09", plSection: "COGS", bu: "RET", clusterCode: "RET-CGB", clusterName: "Cafeteria", leafName: "Other" },
  { moaCode: "RET-CGC01", plSection: "COGS", bu: "RET", clusterCode: "RET-CGC", clusterName: "Sales Commissions", leafName: "Sales Team Commission" },
  { moaCode: "GA-BNK01", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-BNK", clusterName: "Bank Costs", leafName: "Bank Charges" },
  { moaCode: "GA-GOV01", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-GOV", clusterName: "Government & Compliance", leafName: "Operating Licenses & Gov Subscriptions" },
  { moaCode: "GA-GOV02", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-GOV", clusterName: "Government & Compliance", leafName: "Sanctions & Fines" },
  { moaCode: "GA-GOV03", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-GOV", clusterName: "Government & Compliance", leafName: "Vehicle License Renewals" },
  { moaCode: "GA-HRO01", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-HRO", clusterName: "HR Operating", leafName: "Iqama Fees" },
  { moaCode: "GA-HRO02", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-HRO", clusterName: "HR Operating", leafName: "Exit Re-entry Visa Fees" },
  { moaCode: "GA-HRO03", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-HRO", clusterName: "HR Operating", leafName: "Labor Importation Expenses" },
  { moaCode: "GA-HRO04", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-HRO", clusterName: "HR Operating", leafName: "Labor Office License" },
  { moaCode: "GA-HRO05", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-HRO", clusterName: "HR Operating", leafName: "Workwear & Uniforms" },
  { moaCode: "GA-HRO06", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-HRO", clusterName: "HR Operating", leafName: "Recruitment & Onboarding" },
  { moaCode: "GA-HRO07", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-HRO", clusterName: "HR Operating", leafName: "Training & Development" },
  { moaCode: "GA-HRO08", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-HRO", clusterName: "HR Operating", leafName: "Other HR Operating" },
  { moaCode: "GA-INS01", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-INS", clusterName: "Insurance", leafName: "Property & General Liability Insurance" },
  { moaCode: "GA-INS02", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-INS", clusterName: "Insurance", leafName: "Vehicle Insurance" },
  { moaCode: "GA-INS03", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-INS", clusterName: "Insurance", leafName: "D&O / Professional Liability Insurance" },
  { moaCode: "GA-MNT01", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-MNT", clusterName: "Maintenance", leafName: "Building & Facility Maintenance" },
  { moaCode: "GA-MNT02", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-MNT", clusterName: "Maintenance", leafName: "Stables Maintenance" },
  { moaCode: "GA-MNT03", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-MNT", clusterName: "Maintenance", leafName: "Accommodation Maintenance" },
  { moaCode: "GA-MNT04", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-MNT", clusterName: "Maintenance", leafName: "Fleet Maintenance" },
  { moaCode: "GA-MNT05", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-MNT", clusterName: "Maintenance", leafName: "Refrigerators Maintenance" },
  { moaCode: "GA-MNT06", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-MNT", clusterName: "Maintenance", leafName: "Equipment & Devices Maintenance" },
  { moaCode: "GA-MNT07", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-MNT", clusterName: "Maintenance", leafName: "Grounds Maintenance" },
  { moaCode: "GA-MNT08", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-MNT", clusterName: "Maintenance", leafName: "Arena Footing & Surface" },
  { moaCode: "GA-NRP01", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-NRP", clusterName: "Non-Recurring Professional Fees", leafName: "Project Professional Fees" },
  { moaCode: "GA-PRF01", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-PRF", clusterName: "Professional Recurring Fees", leafName: "Audit Fees" },
  { moaCode: "GA-PRF02", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-PRF", clusterName: "Professional Recurring Fees", leafName: "Legal Standing Fees" },
  { moaCode: "GA-RNT01", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-RNT", clusterName: "Rent & Leases", leafName: "Venue Rent" },
  { moaCode: "GA-RNT02", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-RNT", clusterName: "Rent & Leases", leafName: "Equipment Rent" },
  { moaCode: "GA-RNT03", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-RNT", clusterName: "Rent & Leases", leafName: "Other Rent (placeholder)" },
  { moaCode: "GA-TRV01", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-TRV", clusterName: "Travel & Business Trips", leafName: "Business Travel" },
  { moaCode: "GA-UTI01", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-UTI", clusterName: "Utilities & Consumables", leafName: "Water - Stables" },
  { moaCode: "GA-UTI02", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-UTI", clusterName: "Utilities & Consumables", leafName: "Water - Accommodation" },
  { moaCode: "GA-UTI03", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-UTI", clusterName: "Utilities & Consumables", leafName: "Electricity" },
  { moaCode: "GA-UTI04", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-UTI", clusterName: "Utilities & Consumables", leafName: "Telephone" },
  { moaCode: "GA-UTI05", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-UTI", clusterName: "Utilities & Consumables", leafName: "Internet" },
  { moaCode: "GA-UTI06", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-UTI", clusterName: "Utilities & Consumables", leafName: "App & Software Subscriptions (non-M&S)" },
  { moaCode: "GA-UTI07", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-UTI", clusterName: "Utilities & Consumables", leafName: "Cleaning Material" },
  { moaCode: "GA-UTI08", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-UTI", clusterName: "Utilities & Consumables", leafName: "Stationery" },
  { moaCode: "GA-UTI09", plSection: "OPEX-GA", bu: "CORP", clusterCode: "GA-UTI", clusterName: "Utilities & Consumables", leafName: "Diesel & Fuel" },
  { moaCode: "MS-CNT01", plSection: "OPEX-MS", bu: "CORP", clusterCode: "MS-CNT", clusterName: "Content & Creative", leafName: "Content & Creative" },
  { moaCode: "MS-EVT01", plSection: "OPEX-MS", bu: "CORP", clusterCode: "MS-EVT", clusterName: "Events & Sponsorship", leafName: "Events & Sponsorship" },
  { moaCode: "MS-INF01", plSection: "OPEX-MS", bu: "CORP", clusterCode: "MS-INF", clusterName: "Influencer & PR", leafName: "Influencer & PR" },
  { moaCode: "MS-PAD01", plSection: "OPEX-MS", bu: "CORP", clusterCode: "MS-PAD", clusterName: "Paid Advertising", leafName: "Paid Advertising" },
  { moaCode: "MS-REP01", plSection: "OPEX-MS", bu: "CORP", clusterCode: "MS-REP", clusterName: "Representation", leafName: "Representation" },
  { moaCode: "MS-TLS01", plSection: "OPEX-MS", bu: "CORP", clusterCode: "MS-TLS", clusterName: "Sales & Marketing Tools", leafName: "Sales & Marketing Tools" },
  { moaCode: "CORP-OPXA01", plSection: "OPEX-People", bu: "CORP", clusterCode: "CORP-OPXA", clusterName: "Cash Compensation", leafName: "Salary Basic" },
  { moaCode: "CORP-OPXA02", plSection: "OPEX-People", bu: "CORP", clusterCode: "CORP-OPXA", clusterName: "Cash Compensation", leafName: "Overtime" },
  { moaCode: "CORP-OPXA03", plSection: "OPEX-People", bu: "CORP", clusterCode: "CORP-OPXA", clusterName: "Cash Compensation", leafName: "Bonus" },
  { moaCode: "CORP-OPXA04", plSection: "OPEX-People", bu: "CORP", clusterCode: "CORP-OPXA", clusterName: "Cash Compensation", leafName: "Vacation Salaries" },
  { moaCode: "CORP-OPXB01", plSection: "OPEX-People", bu: "CORP", clusterCode: "CORP-OPXB", clusterName: "Benefits & Allowances", leafName: "Transport Allowance" },
  { moaCode: "CORP-OPXB02", plSection: "OPEX-People", bu: "CORP", clusterCode: "CORP-OPXB", clusterName: "Benefits & Allowances", leafName: "Food Allowance" },
  { moaCode: "CORP-OPXB03", plSection: "OPEX-People", bu: "CORP", clusterCode: "CORP-OPXB", clusterName: "Benefits & Allowances", leafName: "Housing Allowance" },
  { moaCode: "CORP-OPXB04", plSection: "OPEX-People", bu: "CORP", clusterCode: "CORP-OPXB", clusterName: "Benefits & Allowances", leafName: "Annual Tickets" },
  { moaCode: "CORP-OPXB05", plSection: "OPEX-People", bu: "CORP", clusterCode: "CORP-OPXB", clusterName: "Benefits & Allowances", leafName: "Medical Insurance" },
  { moaCode: "CORP-OPXB06", plSection: "OPEX-People", bu: "CORP", clusterCode: "CORP-OPXB", clusterName: "Benefits & Allowances", leafName: "GOSI" },
  { moaCode: "CORP-OPXC01", plSection: "OPEX-People", bu: "CORP", clusterCode: "CORP-OPXC", clusterName: "EOS Provision", leafName: "End of Service" },
  { moaCode: "CORP-OPXD01", plSection: "OPEX-People", bu: "CORP", clusterCode: "CORP-OPXD", clusterName: "Director Remuneration", leafName: "CEO Compensation (Arwa)" },
  { moaCode: "CORP-OPXD02", plSection: "OPEX-People", bu: "CORP", clusterCode: "CORP-OPXD", clusterName: "Director Remuneration", leafName: "Other Compensation" },
  { moaCode: "TPC-FF01", plSection: "Project-Costs", bu: "CORP", clusterCode: "TPC-PRJ", clusterName: "Trio Project Costs", leafName: "F&F – Awareness & Positioning" },
  { moaCode: "TPC-LEV01", plSection: "Project-Costs", bu: "CORP", clusterCode: "TPC-PRJ", clusterName: "Trio Project Costs", leafName: "Leveredge Fees" },
  { moaCode: "DA-LIA04", plSection: "D&A", bu: "B2B", clusterCode: "DA-LIA", clusterName: "Livery Direct Assets", leafName: "Tents & Temporary Structures" },
  { moaCode: "DA-BLD01", plSection: "D&A", bu: "CORP", clusterCode: "DA-BLD", clusterName: "Buildings & Land Improvements", leafName: "Buildings" },
  { moaCode: "DA-BLD02", plSection: "D&A", bu: "CORP", clusterCode: "DA-BLD", clusterName: "Buildings & Land Improvements", leafName: "Building Improvements" },
  { moaCode: "DA-BLD03", plSection: "D&A", bu: "CORP", clusterCode: "DA-BLD", clusterName: "Buildings & Land Improvements", leafName: "Playgrounds Improvements" },
  { moaCode: "DA-BLD04", plSection: "D&A", bu: "CORP", clusterCode: "DA-BLD", clusterName: "Buildings & Land Improvements", leafName: "Land Improvements" },
  { moaCode: "DA-FLT01", plSection: "D&A", bu: "CORP", clusterCode: "DA-FLT", clusterName: "Fleet", leafName: "Passenger Vehicles" },
  { moaCode: "DA-FLT02", plSection: "D&A", bu: "CORP", clusterCode: "DA-FLT", clusterName: "Fleet", leafName: "Operational Vehicles" },
  { moaCode: "DA-FUR01", plSection: "D&A", bu: "CORP", clusterCode: "DA-FUR", clusterName: "Furniture & Fixtures", leafName: "Furniture & Fixtures" },
  { moaCode: "DA-IT01", plSection: "D&A", bu: "CORP", clusterCode: "DA-IT", clusterName: "Computer & IT Equipment", leafName: "Computer Equipment" },
  { moaCode: "DA-LIA05", plSection: "D&A", bu: "CORP", clusterCode: "DA-LIA", clusterName: "Livery Direct Assets", leafName: "Fences & Perimeter" },
  { moaCode: "DA-PEM01", plSection: "D&A", bu: "CORP", clusterCode: "DA-PEM", clusterName: "Plant & Machinery", leafName: "Equipment & Machinery" },
  { moaCode: "DA-PEM02", plSection: "D&A", bu: "CORP", clusterCode: "DA-PEM", clusterName: "Plant & Machinery", leafName: "Electrical Equipment & Generators" },
  { moaCode: "DA-HSA01", plSection: "D&A", bu: "HSE", clusterCode: "DA-HSA", clusterName: "Horse School Direct Assets", leafName: "School Horses" },
  { moaCode: "DA-HSA02", plSection: "D&A", bu: "HSE", clusterCode: "DA-HSA", clusterName: "Horse School Direct Assets", leafName: "Games Amusement Equipment" },
  { moaCode: "DA-FLT03", plSection: "D&A", bu: "LIV", clusterCode: "DA-FLT", clusterName: "Fleet", leafName: "Horse Transport Trailers" },
  { moaCode: "DA-LIA01", plSection: "D&A", bu: "LIV", clusterCode: "DA-LIA", clusterName: "Livery Direct Assets", leafName: "Farrier Equipment & Tools" },
  { moaCode: "DA-LIA02", plSection: "D&A", bu: "LIV", clusterCode: "DA-LIA", clusterName: "Livery Direct Assets", leafName: "X-Ray Equipment" },
  { moaCode: "DA-LIA03", plSection: "D&A", bu: "LIV", clusterCode: "DA-LIA", clusterName: "Livery Direct Assets", leafName: "Stable Boxes" },
  { moaCode: "DA-REA01", plSection: "D&A", bu: "RET", clusterCode: "DA-REA", clusterName: "Retail Direct Assets", leafName: "Kitchen Equipment" },
  { moaCode: "NO-FIN01", plSection: "NON-OP", bu: "CORP", clusterCode: "NO-FIN", clusterName: "Financial Charges", leafName: "Bank Interest" },
  { moaCode: "NO-GAI01", plSection: "NON-OP", bu: "CORP", clusterCode: "NO-GAI", clusterName: "Gains & Disposals", leafName: "Gain/Loss on Disposal of Assets" },
  { moaCode: "NO-ZKT01", plSection: "NON-OP", bu: "CORP", clusterCode: "NO-ZKT", clusterName: "Zakat & Tax", leafName: "Zakat" },
];

/** ADR-003 authoritative BU taxonomy labels — same map `liveData.ts` already
 * uses for the BU filter, reused here (not reinvented) so family names on
 * this table are consistent with every other BU-labelled surface in CLEVER. */
export const buFamilyName = (bu: string): string => LIVE_BU_LABELS[bu] ?? bu;

/** True once for every moa_code above (verified 2026-08-03 against a fresh
 * `select moa_code, count(*) ... group by 1 having count(*)>1` — empty). Used
 * defensively by the tree builder to fail loudly instead of silently
 * mis-keying a leaf if a future MoA edit ever introduces a duplicate. */
export const assertNoDuplicateLeaves = (): void => {
  const seen = new Set<string>();
  for (const l of MOA_PL_LEAVES) {
    if (seen.has(l.moaCode)) throw new Error(`moaTree.ts: duplicate moa_code ${l.moaCode}`);
    seen.add(l.moaCode);
  }
};
