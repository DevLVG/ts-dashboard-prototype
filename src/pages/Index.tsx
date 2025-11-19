import { useState } from "react";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { KPICard } from "@/components/dashboard/KPICard";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { BUPerformanceChart } from "@/components/dashboard/BUPerformanceChart";
import { PLMatrix } from "@/components/dashboard/PLMatrix";
import { CashFlowWaterfall } from "@/components/dashboard/CashFlowWaterfall";
import { FinancialRatiosChart } from "@/components/dashboard/FinancialRatiosChart";
import { OpExDrawer } from "@/components/dashboard/OpExDrawer";
import { GrossMarginDrawer } from "@/components/dashboard/GrossMarginDrawer";
import { PageType } from "@/types/dashboard";
import { kpiData, trendData, buPerformance, cashFlowData, financialRatiosData } from "@/data/mockData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";

const Index = () => {
  const [currentPage, setCurrentPage] = useState<PageType>("overview");
  const [selectedMonth, setSelectedMonth] = useState("November");
  const [selectedScenario, setSelectedScenario] = useState("actual-vs-budget");
  const [opexDrawerOpen, setOpexDrawerOpen] = useState(false);
  const [selectedOpExBreakdown, setSelectedOpExBreakdown] = useState<any>(null);
  const [gmDrawerOpen, setGmDrawerOpen] = useState(false);
  const [selectedGMBreakdown, setSelectedGMBreakdown] = useState<any>(null);

  const renderFilters = () => (
    <div className="flex flex-wrap gap-4 mb-6">
      <Select value={selectedMonth} onValueChange={setSelectedMonth}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="November">November 2025</SelectItem>
          <SelectItem value="October">October 2025</SelectItem>
          <SelectItem value="September">September 2025</SelectItem>
        </SelectContent>
      </Select>
      <Select value={selectedScenario} onValueChange={setSelectedScenario}>
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="actual-vs-budget">Actual vs Budget Base</SelectItem>
          <SelectItem value="actual-vs-optimistic">Actual vs Optimistic</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  const renderOverview = () => (
    <div className="space-y-6 animate-fade-in">
      {renderFilters()}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((metric, index) => (
          <KPICard
            key={index}
            metric={metric}
            onClick={() => {
              if (metric.label.includes("Revenue") || metric.label.includes("EBITDA") || metric.label.includes("OpEx")) {
                setCurrentPage("performance");
              } else if (metric.label.includes("Cash")) {
                setCurrentPage("cash");
              }
            }}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueTrendChart data={trendData} />
        <BUPerformanceChart data={buPerformance} onClick={() => setCurrentPage("performance")} />
      </div>
    </div>
  );

  const renderPerformance = () => (
    <div className="space-y-6 animate-fade-in">
      {renderFilters()}
      <PLMatrix 
        data={buPerformance} 
        onOpExClick={(bu, service) => {
          // Generate OpEx breakdown data based on actual BU data
          const buData = buPerformance.find(b => b.name === bu);
          if (!buData) return;
          
          let actual, budget;
          if (service) {
            const serviceData = buData.services?.find(s => s.name === service);
            if (!serviceData) return;
            actual = serviceData.opex.actual;
            budget = serviceData.opex.budget;
          } else {
            actual = buData.opex.actual;
            budget = buData.opex.budget;
          }
          
          // Calculate proportional breakdown (simplified mock logic)
          const directRatio = 0.75; // 75% direct costs
          const allocatedRatio = 0.25; // 25% allocated costs
          
          const breakdown = {
            buName: bu,
            serviceName: service,
            actual: actual,
            budget: budget,
            directCosts: {
              personnel: Math.round(actual * directRatio * 0.5),
              operations: Math.round(actual * directRatio * 0.3),
              facilities: Math.round(actual * directRatio * 0.2),
            },
            allocatedCosts: {
              adminPersonnel: { 
                amount: Math.round(actual * allocatedRatio * 0.4), 
                method: "Headcount" 
              },
              utilities: { 
                amount: Math.round(actual * allocatedRatio * 0.35), 
                method: "Square Meters" 
              },
              marketing: { 
                amount: Math.round(actual * allocatedRatio * 0.25), 
                method: "Revenue proportion" 
              },
            },
          };
          setSelectedOpExBreakdown(breakdown);
          setOpexDrawerOpen(true);
        }}
        onGrossMarginClick={(bu, service) => {
          // Generate GM breakdown data based on actual BU data
          const buData = buPerformance.find(b => b.name === bu);
          if (!buData) return;
          
          let revenue, gmActual, gmBudget;
          if (service) {
            const serviceData = buData.services?.find(s => s.name === service);
            if (!serviceData) return;
            revenue = serviceData.revenue.actual;
            gmActual = serviceData.grossMargin.actual;
            gmBudget = serviceData.grossMargin.budget;
          } else {
            revenue = buData.revenue.actual;
            gmActual = buData.grossMargin.actual;
            gmBudget = buData.grossMargin.budget;
          }
          
          // Calculate direct costs (Revenue - GM)
          const cogsActual = revenue - gmActual;
          const cogsBudget = revenue - gmBudget;
          
          // Generate BU-specific breakdown data
          let personnelItems: { label: string; amount: number }[] = [];
          let operationsItems: { label: string; amount: number }[] = [];
          let cogsItems: { label: string; amount: number }[] = [];
          
          switch(bu) {
            case "Equestrian":
              personnelItems = [
                { label: "Instructor Salaries", amount: Math.round(cogsActual * 0.5) },
                { label: "Stable Staff", amount: Math.round(cogsActual * 0.12) }
              ];
              operationsItems = [
                { label: "Feed & Nutrition", amount: Math.round(cogsActual * 0.15) },
                { label: "Veterinary", amount: Math.round(cogsActual * 0.08) },
                { label: "Farrier", amount: Math.round(cogsActual * 0.07) },
                { label: "Equipment & Supplies", amount: Math.round(cogsActual * 0.08) }
              ];
              break;
            case "Events":
              operationsItems = [
                { label: "Prize Money", amount: Math.round(cogsActual * 0.33) },
                { label: "Venue Setup", amount: Math.round(cogsActual * 0.13) },
                { label: "Course Design", amount: Math.round(cogsActual * 0.10) },
                { label: "Catering & F&B", amount: Math.round(cogsActual * 0.27) },
                { label: "Event Staff", amount: Math.round(cogsActual * 0.10) },
                { label: "Event Marketing", amount: Math.round(cogsActual * 0.07) }
              ];
              break;
            case "Retail":
              cogsItems = [
                { label: "Tack Shop Inventory", amount: Math.round(cogsActual * 0.60) },
                { label: "F&B Ingredients", amount: Math.round(cogsActual * 0.24) }
              ];
              personnelItems = [
                { label: "Retail Staff", amount: Math.round(cogsActual * 0.16) }
              ];
              break;
            case "Advisory":
              operationsItems = [
                { label: "Consultant Time", amount: Math.round(cogsActual * 0.62) },
                { label: "Travel & Expenses", amount: Math.round(cogsActual * 0.38) }
              ];
              break;
          }
          
          const breakdown = {
            buName: bu,
            serviceName: service,
            revenue: revenue,
            directCosts: {
              personnel: personnelItems.length > 0 ? { items: personnelItems } : undefined,
              operations: operationsItems.length > 0 ? { items: operationsItems } : undefined,
              cogs: cogsItems.length > 0 ? { items: cogsItems } : undefined,
              total: cogsActual,
              budget: cogsBudget,
            },
            grossMargin: {
              actual: gmActual,
              actualPercent: (gmActual / revenue) * 100,
              budget: gmBudget,
              budgetPercent: (gmBudget / revenue) * 100,
            },
          };
          setSelectedGMBreakdown(breakdown);
          setGmDrawerOpen(true);
        }}
      />
    </div>
  );

  const renderCash = () => (
    <div className="space-y-6 animate-fade-in">
      {renderFilters()}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
          <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wide mb-2">Cash Balance</p>
          <p className="text-3xl font-heading">2.8M SAR</p>
        </Card>
        <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
          <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wide mb-2">Monthly Burn</p>
          <p className="text-3xl font-heading text-destructive">-667K</p>
        </Card>
        <Card className="p-6 shadow-sm bg-gold/15 border-gold/40 animate-fade-in hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
          <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wide mb-2">Runway</p>
          <p className="text-3xl font-heading text-foreground">4.2 months</p>
        </Card>
      </div>
      <CashFlowWaterfall data={cashFlowData} />
    </div>
  );

  const renderRatios = () => (
    <div className="space-y-6 animate-fade-in">
      {renderFilters()}
      <FinancialRatiosChart data={financialRatiosData} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 shadow-sm animate-fade-in-delay hover:shadow-xl transition-all duration-300">
          <h3 className="text-xl font-heading tracking-wide mb-6">CURRENT MONTH RATIOS</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded">
              <span className="font-medium">Gross Margin %</span>
              <span className="text-xl font-bold text-primary">48.2%</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded">
              <span className="font-medium">EBITDA %</span>
              <span className="text-xl font-bold text-success">14.1%</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded">
              <span className="font-medium">OpEx % of Revenue</span>
              <span className="text-xl font-bold text-warning">34.1%</span>
            </div>
          </div>
        </Card>
        <Card className="p-6 shadow-sm animate-fade-in-delay hover:shadow-xl transition-all duration-300">
          <h3 className="text-xl font-heading tracking-wide mb-6">BU COMPARISON</h3>
          <div className="space-y-3">
            {buPerformance.map((bu) => {
              const gmPercent = (bu.grossMargin.actual / bu.revenue.actual) * 100;
              const ebitdaPercent = (bu.ebitda.actual / bu.revenue.actual) * 100;
              return (
                <div key={bu.name} className="border-b pb-3 last:border-0">
                  <p className="font-medium mb-2">{bu.name}</p>
                  <div className="flex gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">GM: </span>
                      <span className="font-semibold">{gmPercent.toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">EBITDA: </span>
                      <span className="font-semibold">{ebitdaPercent.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (currentPage) {
      case "overview":
        return renderOverview();
      case "performance":
        return renderPerformance();
      case "cash":
        return renderCash();
      case "ratios":
        return renderRatios();
      default:
        return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav currentPage={currentPage} onPageChange={setCurrentPage} />
      <main className="container mx-auto px-4 py-6">{renderContent()}</main>
      <OpExDrawer 
        isOpen={opexDrawerOpen} 
        onClose={() => setOpexDrawerOpen(false)}
        breakdown={selectedOpExBreakdown}
      />
      <GrossMarginDrawer 
        isOpen={gmDrawerOpen} 
        onClose={() => setGmDrawerOpen(false)}
        breakdown={selectedGMBreakdown}
      />
    </div>
  );
};

export default Index;
