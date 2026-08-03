import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TrendingUp,
  Banknote,
  Wallet,
  Stamp,
  Scale,
  LogOut,
  Package,
  Image,
  Languages,
  Trophy,
  Users,
  CalendarClock,
  ChevronDown,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { PageType } from "@/types/dashboard";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { resolveRole, canAccessPage, ROLE_LABELS } from "@/lib/roles";
import { cn } from "@/lib/utils";
import tsLogo from "@/assets/ts-logo.png";

interface DashboardNavProps {
  currentPage: PageType;
}

interface NavPage {
  id: PageType;
  label: string;
  icon: LucideIcon;
  path: string;
}

// Every page the shell knows about. Grouping/order for display lives in
// NAV_GROUPS below — this is just the id -> label/icon/path lookup.
// "overview" and "analysis" are gone from the nav entirely (live review #2,
// 2026-08-03): the "performance" page — relabeled "Economics" — replaces
// both (its explodable table covers what Drill was for). The page
// components and the PageType values themselves are untouched for now;
// /overview and /analysis just redirect to /performance at the router
// level (see App.tsx) so they're never reachable, not even hidden-but-live.
const ALL_PAGES: NavPage[] = [
  { id: "performance", label: "Economics", icon: TrendingUp, path: "/performance" },
  { id: "cash", label: "Cash Flow", icon: Banknote, path: "/cash" },
  { id: "balance", label: "Balance Sheet", icon: Scale, path: "/balance" },
  // Report (fix-6-report, 2026-08-03): the ONE export place — bottom of the
  // Performance group, per Marcello's live-review spec.
  { id: "report", label: "Report", icon: FileText, path: "/report" },
  { id: "treasury", label: "Treasury", icon: Wallet, path: "/treasury" },
  { id: "payments", label: "Approvals", icon: Stamp, path: "/payments" },
  { id: "catalog", label: "Catalogue", icon: Package, path: "/catalog" },
  { id: "media", label: "Media", icon: Image, path: "/media" },
  { id: "copy", label: "Site Copy", icon: Languages, path: "/copy" },
  { id: "competitions", label: "Competitions", icon: Trophy, path: "/competitions" },
  { id: "instructors", label: "Instructors", icon: Users, path: "/instructors" },
  { id: "slot-priority", label: "Calendario slot", icon: CalendarClock, path: "/slot-priority" },
];

// Top nav IA (Marcello, live review #2, 2026-08-03): Performance (Economics
// default + Cash Flow + Balance Sheet), Admin (Treasury default + Approvals
// — renamed from "Treasury" so the group label and its default item aren't
// the same word), Marketing (CMS pages, unchanged). Adding a page later
// only means adding its id to one of the lists below; role gating
// (src/lib/roles.ts) still decides what's actually visible.
interface NavGroup {
  id: string;
  label: string;
  pageIds: PageType[];
  /** If set, clicking the group's own label navigates straight here — the
   * chevron still opens the dropdown listing every page in pageIds. Groups
   * without a default (Marketing) render as a plain click/hover-to-open
   * trigger with no independent navigation of their own. Meaningless once
   * a group collapses to its single-item form (that always links directly
   * to whichever one page survived role-filtering). */
  defaultPageId?: PageType;
}

const NAV_GROUPS: NavGroup[] = [
  { id: "performance-group", label: "Performance", defaultPageId: "performance", pageIds: ["performance", "cash", "balance", "report"] },
  { id: "admin-group", label: "Admin", defaultPageId: "treasury", pageIds: ["treasury", "payments"] },
  { id: "marketing-group", label: "Marketing", pageIds: ["catalog", "media", "copy", "competitions", "instructors", "slot-priority"] },
];

export const DashboardNav = ({ currentPage }: DashboardNavProps) => {
  const { session, signOut } = useAuth();
  const role = resolveRole(session?.user?.email);

  // Role map — proposed, to confirm (src/lib/roles.ts). Each group's pages
  // are filtered to what the signed-in role may access; the route guard in
  // Index.tsx enforces the same list, so a hidden item is never reachable
  // by typing the URL either. A group with zero accessible pages is hidden
  // entirely (no empty dropdown); a group left with exactly one accessible
  // page renders as a plain button instead of a one-item dropdown.
  const groupedNav = NAV_GROUPS.map((group) => ({
    ...group,
    pages: group.pageIds
      .map((id) => ALL_PAGES.find((page) => page.id === id))
      .filter((page): page is NavPage => !!page && canAccessPage(role, page.id)),
  })).filter((group) => group.pages.length > 0);

  // Hover-intent open/close for the desktop dropdowns, on top of native
  // click/keyboard support from the underlying Radix DropdownMenu (Enter /
  // Space / arrow keys / Esc all work unassisted since `open` stays in sync
  // via onOpenChange). Opening on hover is delayed (not instant): a plain
  // mouseenter fires — and commits its state update — *before* the browser's
  // click event reaches Radix's own open/close toggle, so an instant hover
  // -open would make every ordinary click open-then-immediately-reclose the
  // menu (Radix sees it as already open by the time the click is handled).
  // Delaying the hover-open past a normal click's mouseenter-to-click gap
  // avoids that race; gliding sideways from an already-open group to the
  // next one still switches instantly. A short close delay separately stops
  // the menu from vanishing mid-diagonal-mouse-move from trigger to content.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const openOnHover = (id: string) => {
    clearTimers();
    if (openGroup !== null && openGroup !== id) {
      // Already browsing another group — glide straight across, no delay.
      setOpenGroup(id);
      return;
    }
    openTimerRef.current = window.setTimeout(() => setOpenGroup(id), 150);
  };
  const closeOnHover = () => {
    clearTimers();
    closeTimerRef.current = window.setTimeout(() => setOpenGroup(null), 150);
  };
  useEffect(() => clearTimers, []);

  return (
    <nav className="border-b bg-card shadow-sm backdrop-blur-sm sticky top-0 z-50 animate-fade-in">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between gap-4 py-3.5">
          <div className="flex shrink-0 items-center gap-3">
            <img src={tsLogo} alt="Trio Sporting" className="h-11 w-auto" />
            <div className="border-l border-border pl-3">
              <h1 className="font-heading text-2xl tracking-wide leading-none text-foreground whitespace-nowrap">
                TRIO SPORTING
              </h1>
              {/* Subtitle: brighter (foreground, not the dimmer muted token),
                  regular weight instead of thin, a touch more room to
                  breathe under the title. Visible on true mobile (<md,
                  where it's on its own row, nothing to crowd) and at lg+
                  (1024px+, same threshold the email/role badge already
                  uses, once there's room again) — hidden only in the
                  squeezed md-but-not-lg band (768–1023px) where the
                  desktop nav groups need the space most. */}
              <p className="md:hidden lg:block mt-0.5 text-sm text-foreground/80 font-normal tracking-wide whitespace-nowrap">
                CFO Cockpit — Management Control
              </p>
            </div>
          </div>
          <div className="hidden md:flex min-w-0 items-center gap-1.5">
            {groupedNav.map((group) => {
              const isGroupActive = group.pages.some((page) => page.id === currentPage);

              // Single accessible page in the group (e.g. Administration's
              // Treasury) — a one-item dropdown is pointless UX, show the
              // page directly instead.
              if (group.pages.length === 1) {
                const page = group.pages[0];
                return (
                  <NavLink key={group.id} to={page.path}>
                    <Button
                      variant={currentPage === page.id ? "default" : "ghost"}
                      size="sm"
                      className="gap-2 transition-colors"
                    >
                      <page.icon className="h-4 w-4" />
                      {page.label}
                    </Button>
                  </NavLink>
                );
              }

              const dropdownContent = (
                <DropdownMenuContent
                  align="start"
                  className="min-w-[200px]"
                  onMouseEnter={() => openOnHover(group.id)}
                  onMouseLeave={closeOnHover}
                >
                  {group.pages.map((page) => (
                    <DropdownMenuItem key={page.id} asChild className="cursor-pointer">
                      <NavLink
                        to={page.path}
                        className={cn(
                          "flex items-center gap-2",
                          currentPage === page.id && "bg-accent/70 text-accent-foreground font-semibold",
                        )}
                      >
                        <page.icon className="h-4 w-4" />
                        {page.label}
                      </NavLink>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              );

              // Group has a default item (Performance → Economics, Admin →
              // Treasury): split button — the label itself is a plain link
              // to the default page, a separate small chevron button opens
              // the dropdown with every page in the group. Both halves share
              // one active/ghost look so they read as a single pill.
              if (group.defaultPageId) {
                const defaultPage =
                  group.pages.find((page) => page.id === group.defaultPageId) ?? group.pages[0];
                return (
                  <DropdownMenu
                    key={group.id}
                    modal={false}
                    open={openGroup === group.id}
                    onOpenChange={(open) => setOpenGroup(open ? group.id : null)}
                  >
                    <div className="flex items-center" onMouseEnter={() => openOnHover(group.id)} onMouseLeave={closeOnHover}>
                      <NavLink to={defaultPage.path}>
                        <Button
                          variant={isGroupActive ? "default" : "ghost"}
                          size="sm"
                          className="gap-1.5 rounded-r-none transition-colors"
                        >
                          {group.label}
                        </Button>
                      </NavLink>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant={isGroupActive ? "default" : "ghost"}
                          size="sm"
                          className={cn(
                            "rounded-l-none border-l px-1.5 transition-colors",
                            isGroupActive ? "border-primary-foreground/20" : "border-border/60",
                          )}
                          aria-label={`${group.label} — more pages`}
                        >
                          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                        </Button>
                      </DropdownMenuTrigger>
                      {dropdownContent}
                    </div>
                  </DropdownMenu>
                );
              }

              // No default (Marketing): plain click/hover-to-open trigger,
              // the whole pill is just the dropdown toggle.
              return (
                <DropdownMenu
                  key={group.id}
                  // Non-modal: a nav-bar dropdown shouldn't trap focus or
                  // aria-hide the sibling group triggers the way a dialog
                  // would — Tab/hover must be able to move straight from
                  // this group to the next one while it's open.
                  modal={false}
                  open={openGroup === group.id}
                  onOpenChange={(open) => setOpenGroup(open ? group.id : null)}
                >
                  <div onMouseEnter={() => openOnHover(group.id)} onMouseLeave={closeOnHover}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant={isGroupActive ? "default" : "ghost"}
                        size="sm"
                        className="gap-1.5 transition-colors"
                        aria-current={isGroupActive ? "true" : undefined}
                      >
                        {group.label}
                        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                    {dropdownContent}
                  </div>
                </DropdownMenu>
              );
            })}
            <div className="ml-3 flex shrink-0 items-center gap-2 border-l border-border pl-3">
              {session?.user?.email && (
                <span className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground max-w-[220px]" title={session.user.email}>
                  <span className="truncate">{session.user.email}</span>
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-gold/40 bg-gold/10 text-gold">
                    {ROLE_LABELS[role]}
                  </span>
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-muted-foreground hover:text-foreground"
                onClick={() => signOut()}
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
                <span className="sr-only">Sign out</span>
              </Button>
            </div>
          </div>
        </div>
        <div className="md:hidden flex overflow-x-auto gap-3 pb-2 -mx-1 px-1">
          {groupedNav.map((group, index) => (
            <div key={group.id} className="flex shrink-0 items-center gap-1.5">
              {index > 0 && <span aria-hidden="true" className="mx-0.5 h-6 w-px shrink-0 bg-border" />}
              <span className="whitespace-nowrap pr-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </span>
              {group.pages.map((page) => (
                <NavLink key={page.id} to={page.path}>
                  <Button
                    variant={currentPage === page.id ? "default" : "outline"}
                    size="sm"
                    className="gap-2 whitespace-nowrap"
                  >
                    <page.icon className="h-4 w-4" />
                    {page.label}
                  </Button>
                </NavLink>
              ))}
            </div>
          ))}
          <Button variant="outline" size="sm" className="shrink-0 gap-2 whitespace-nowrap" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </nav>
  );
};
