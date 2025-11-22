import { Button } from "@/components/ui/button";
import { LayoutDashboard, TrendingUp, Lightbulb, CheckSquare, FileText } from "lucide-react";
import { PageType } from "@/types/dashboard";
import { NavLink } from "@/components/NavLink";
import tsLogo from "@/assets/ts-logo.png";
interface DashboardNavProps {
  currentPage: PageType;
}
export const DashboardNav = ({
  currentPage
}: DashboardNavProps) => {
  const pages = [{
    id: "overview" as PageType,
    label: "CEO Overview",
    icon: LayoutDashboard,
    path: "/overview"
  }, {
    id: "performance" as PageType,
    label: "Analysis",
    icon: TrendingUp,
    path: "/performance"
  }, {
    id: "cash" as PageType,
    label: "Recommendation",
    icon: Lightbulb,
    path: "/cash"
  }, {
    id: "ratios" as PageType,
    label: "Action",
    icon: CheckSquare,
    path: "/ratios"
  }, {
    id: "statements" as PageType,
    label: "Communication",
    icon: FileText,
    path: "/statements"
  }];
  return <nav className="border-b bg-card shadow-sm backdrop-blur-sm sticky top-0 z-50 animate-fade-in">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <img src={tsLogo} alt="Trio Sporting" className="h-12 w-auto" />
            <div className="border-l border-border pl-3">
              <h1 className="font-heading text-2xl tracking-wide">TRIO SPORTING</h1>
              <p className="text-xs text-muted-foreground font-light">Management Control Dashboard</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {pages.map(page => <NavLink key={page.id} to={page.path}>
                <Button variant={currentPage === page.id ? "default" : "ghost"} size="sm" className="gap-2 transition-all duration-200 hover:scale-105">
                  <page.icon className="h-4 w-4" />
                  {page.label}
                </Button>
              </NavLink>)}
          </div>
        </div>
        <div className="md:hidden flex overflow-x-auto gap-2 pb-2">
          {pages.map(page => <NavLink key={page.id} to={page.path}>
              <Button variant={currentPage === page.id ? "default" : "outline"} size="sm" className="gap-2 whitespace-nowrap">
                <page.icon className="h-4 w-4" />
                {page.label}
              </Button>
            </NavLink>)}
        </div>
      </div>
    </nav>;
};