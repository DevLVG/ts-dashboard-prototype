// Plain-language labels for Site Copy CMS navigation — CEO-usable, no
// internal jargon (page_handle / setting_key raw strings stay in tooltips
// only). Deliberately a hand-maintained map + a sane fallback formatter,
// not derived from the theme — the theme's file/setting names are
// developer-facing, the CMS is staff-facing.
export const PAGE_LABELS: Record<string, string> = {
  index: "Home",
  "page.about": "About",
  "page.account": "Account / Sign In",
  "page.competition-services": "Competition Services",
  "page.competitions-calendar": "Competitions Calendar",
  "page.competitions": "Competitions",
  "page.contact": "Contact",
  "page.day-pass-poster": "Day Pass — Poster",
  "page.day-pass": "Day Pass",
  "page.educational-business": "Educational — Business",
  "page.educational-consumer": "Educational — Consumer",
  "page.educational": "Educational (Hub)",
  "page.events-corporate": "Events — Corporate",
  "page.events-entertainment": "Events — Entertainment",
  "page.events-private": "Events — Private",
  "page.events": "Events (Hub)",
  "page.horse-school": "Horse School",
  "page.legal": "Legal",
  "page.livery": "Livery",
  "page.membership": "Membership",
  "page.school": "Trips & Courses (School)",
  "header-group": "Header / Navigation",
  "footer-group": "Footer — Links",
  "footer.liquid": "Footer — Contact & Titles",
};

export const pageLabel = (pageHandle: string): string =>
  PAGE_LABELS[pageHandle] ?? pageHandle.replace(/^page\./, "").replace(/[-.]/g, " ");

// setting_key like 'blocks.cta_join.label' or 'eyebrow' -> 'cta join · label' / 'Eyebrow'
export const settingLabel = (settingKey: string): string => {
  if (settingKey.startsWith("blocks.")) {
    const [, blockId, ...rest] = settingKey.split(".");
    const leaf = rest.join(".");
    return `${blockId.replace(/_/g, " ")} · ${leaf.replace(/_/g, " ")}`;
  }
  return settingKey.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
};
