import { Button } from "@/components/ui/button";
import { LayoutDashboard, TrendingUp, Wallet, BarChart3 } from "lucide-react";
import { PageType } from "@/types/dashboard";

interface DashboardNavProps {
  currentPage: PageType;
  onPageChange: (page: PageType) => void;
}

export const DashboardNav = ({ currentPage, onPageChange }: DashboardNavProps) => {
  const pages = [
    { id: "overview" as PageType, label: "CEO Overview", icon: LayoutDashboard },
    { id: "performance" as PageType, label: "BU Performance", icon: TrendingUp },
    { id: "cash" as PageType, label: "Cash & Treasury", icon: Wallet },
    { id: "ratios" as PageType, label: "Financial Ratios", icon: BarChart3 },
  ];

  return (
    <nav className="border-b bg-card">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">TS</span>
            </div>
            <div>
              <h1 className="font-bold text-lg">Trio Sporting</h1>
              <p className="text-xs text-muted-foreground">Management Dashboard</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {pages.map((page) => (
              <Button
                key={page.id}
                variant={currentPage === page.id ? "default" : "ghost"}
                size="sm"
                onClick={() => onPageChange(page.id)}
                className="gap-2"
              >
                <page.icon className="h-4 w-4" />
                {page.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="md:hidden flex overflow-x-auto gap-2 pb-2">
          {pages.map((page) => (
            <Button
              key={page.id}
              variant={currentPage === page.id ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(page.id)}
              className="gap-2 whitespace-nowrap"
            >
              <page.icon className="h-4 w-4" />
              {page.label}
            </Button>
          ))}
        </div>
      </div>
    </nav>
  );
};
