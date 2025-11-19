import { useState } from "react";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { KPICard } from "@/components/dashboard/KPICard";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { BUPerformanceChart } from "@/components/dashboard/BUPerformanceChart";
import { PLMatrix } from "@/components/dashboard/PLMatrix";
import { CashFlowWaterfall } from "@/components/dashboard/CashFlowWaterfall";
import { FinancialRatiosChart } from "@/components/dashboard/FinancialRatiosChart";
import { PageType } from "@/types/dashboard";
import { kpiData, trendData, buPerformance, cashFlowData, financialRatiosData } from "@/data/mockData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";

const Index = () => {
  const [currentPage, setCurrentPage] = useState<PageType>("overview");
  const [selectedMonth, setSelectedMonth] = useState("November");
  const [selectedScenario, setSelectedScenario] = useState("actual-vs-budget");

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
    <div className="space-y-6">
      {renderFilters()}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiData.map((metric, index) => (
          <KPICard
            key={index}
            metric={metric}
            onClick={() => {
              if (metric.label.includes("Revenue") || metric.label.includes("EBITDA")) {
                setCurrentPage("performance");
              } else if (metric.label.includes("Cash") || metric.label.includes("Runway")) {
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
    <div className="space-y-6">
      {renderFilters()}
      <PLMatrix data={buPerformance} />
      <div className="grid grid-cols-1 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Service Mix Analysis</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {buPerformance.map((bu) => {
              const gmPercent = (bu.grossMargin.actual / bu.revenue.actual) * 100;
              return (
                <div key={bu.name} className="p-4 border rounded-lg">
                  <p className="text-sm font-medium mb-2">{bu.name}</p>
                  <p className="text-2xl font-bold">{gmPercent.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">Gross Margin</p>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );

  const renderCash = () => (
    <div className="space-y-6">
      {renderFilters()}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-2">Cash Balance</p>
          <p className="text-3xl font-bold">2.8M SAR</p>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground mb-2">Monthly Burn</p>
          <p className="text-3xl font-bold text-destructive">-667K</p>
        </Card>
        <Card className="p-6 bg-warning/10 border-warning/20">
          <p className="text-sm text-muted-foreground mb-2">Runway</p>
          <p className="text-3xl font-bold text-warning">4.2 months</p>
        </Card>
      </div>
      <CashFlowWaterfall data={cashFlowData} />
    </div>
  );

  const renderRatios = () => (
    <div className="space-y-6">
      {renderFilters()}
      <FinancialRatiosChart data={financialRatiosData} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Current Month Ratios</h3>
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
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">BU Comparison</h3>
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
    </div>
  );
};

export default Index;
