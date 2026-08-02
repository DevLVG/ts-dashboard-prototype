import { Button } from "@/components/ui/button";
import { LayoutDashboard, TrendingUp, Banknote, Wallet, Stamp, Scale, ListTree, LogOut, Package, Image, Languages, Trophy, Users } from "lucide-react";
import { PageType } from "@/types/dashboard";
import { NavLink } from "@/components/NavLink";
import { useAuth } from "@/contexts/AuthContext";
import { resolveRole, canAccessPage, ROLE_LABELS } from "@/lib/roles";
import tsLogo from "@/assets/ts-logo.png";

interface DashboardNavProps {
  currentPage: PageType;
}

// Four aligned screens (Dashboard-Alignment spec §1) + the R1 drill tool.
export const DashboardNav = ({ currentPage }: DashboardNavProps) => {
  const { session, signOut } = useAuth();
  const role = resolveRole(session?.user?.email);
  const allPages = [
    { id: "overview" as PageType, label: "P&L Overview", icon: LayoutDashboard, path: "/overview" },
    { id: "performance" as PageType, label: "Performance", icon: TrendingUp, path: "/performance" },
    { id: "cash" as PageType, label: "Cash Flow", icon: Banknote, path: "/cash" },
    { id: "treasury" as PageType, label: "Treasury", icon: Wallet, path: "/treasury" },
    { id: "payments" as PageType, label: "Approvals", icon: Stamp, path: "/payments" },
    { id: "balance" as PageType, label: "Balance Sheet", icon: Scale, path: "/balance" },
    { id: "analysis" as PageType, label: "Drill", icon: ListTree, path: "/analysis" },
    { id: "catalog" as PageType, label: "Catalogue", icon: Package, path: "/catalog" },
    { id: "media" as PageType, label: "Media", icon: Image, path: "/media" },
    { id: "copy" as PageType, label: "Site Copy", icon: Languages, path: "/copy" },
    { id: "competitions" as PageType, label: "Competitions", icon: Trophy, path: "/competitions" },
    { id: "instructors" as PageType, label: "Instructors", icon: Users, path: "/instructors" },
  ];
  // Role map — proposed, to confirm (src/lib/roles.ts). Nav items are
  // filtered to what the signed-in role may access; the route guard in
  // Index.tsx enforces the same list, so a hidden item is never reachable
  // by typing the URL either.
  const pages = allPages.filter((page) => canAccessPage(role, page.id));
  return (
    <nav className="border-b bg-card shadow-sm backdrop-blur-sm sticky top-0 z-50 animate-fade-in">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-3.5">
          <div className="flex items-center gap-3">
            <img src={tsLogo} alt="Trio Sporting" className="h-11 w-auto" />
            <div className="border-l border-border pl-3">
              <h1 className="font-heading text-2xl tracking-wide leading-none">TRIO SPORTING</h1>
              <p className="text-xs text-muted-foreground font-light">CFO Cockpit — Management Control</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1.5">
            {pages.map((page) => (
              <NavLink key={page.id} to={page.path}>
                <Button
                  variant={currentPage === page.id ? "default" : "ghost"}
                  size="sm"
                  className="gap-2 transition-colors"
                >
                  <page.icon className="h-4 w-4" />
                  {page.label}
                </Button>
              </NavLink>
            ))}
            <div className="ml-3 flex items-center gap-2 border-l border-border pl-3">
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
        <div className="md:hidden flex overflow-x-auto gap-2 pb-2">
          {pages.map((page) => (
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
          <Button variant="outline" size="sm" className="gap-2 whitespace-nowrap" onClick={() => signOut()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </div>
    </nav>
  );
};
