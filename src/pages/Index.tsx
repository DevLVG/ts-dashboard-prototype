import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { KPICard } from "@/components/dashboard/KPICard";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { BUPerformanceChart } from "@/components/dashboard/BUPerformanceChart";
import { PerformanceWaterfall } from "@/components/dashboard/PerformanceWaterfall";
import { PLMatrix } from "@/components/dashboard/PLMatrix";
import { OpExDrawer } from "@/components/dashboard/OpExDrawer";
import { GrossMarginDrawer } from "@/components/dashboard/GrossMarginDrawer";
import { CashTrendChart } from "@/components/dashboard/CashTrendChart";
import { PageType, type KPIMetric } from "@/types/dashboard";
import { trendData, buPerformance } from "@/data/mockData";
import { 
  getPLDataForPeriod, 
  type PLPeriodData,
  CURRENT_DATE,
  businessUnits as buCodes,
  businessUnitLabels 
} from "@/data/financialData";
import {
  getCashBalance,
  getMonthlyBurn,
  getPayables,
  getReceivables,
  getPYDate,
  getMonthStart,
  buMap
} from "@/data/financialDataV8";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Tabs, TabsListPill, TabsTriggerPill, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";


const Index = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // Derive current page from URL path
  const getCurrentPageFromPath = (): PageType => {
    const path = location.pathname.slice(1); // Remove leading slash
    if (path === "overview" || path === "performance" || path === "cash" || path === "ratios" || path === "statements") {
      return path as PageType;
    }
    return "overview";
  };
  
  const [currentPage, setCurrentPage] = useState<PageType>(getCurrentPageFromPath());
  const [selectedMonth, setSelectedMonth] = useState("MTD");
  const [selectedScenario, setSelectedScenario] = useState<'Budget_Base' | 'Budget_Worst' | 'Budget_Best' | 'PY'>("Budget_Base");
  const [selectedBU, setSelectedBU] = useState("All Company");
  const [opexDrawerOpen, setOpexDrawerOpen] = useState(false);
  const [selectedOpExBreakdown, setSelectedOpExBreakdown] = useState<any>(null);
  const [gmDrawerOpen, setGmDrawerOpen] = useState(false);
  const [selectedGMBreakdown, setSelectedGMBreakdown] = useState<any>(null);
  const [currentView, setCurrentView] = useState<'economics' | 'cash'>('economics');

  // Sync currentPage state with URL changes
  useEffect(() => {
    setCurrentPage(getCurrentPageFromPath());
  }, [location.pathname]);

  const months = [
    { value: "January", label: "January 2025" },
    { value: "February", label: "February 2025" },
    { value: "March", label: "March 2025" },
    { value: "April", label: "April 2025" },
    { value: "May", label: "May 2025" },
    { value: "June", label: "June 2025" },
    { value: "July", label: "July 2025" },
    { value: "August", label: "August 2025" },
    { value: "September", label: "September 2025" },
    { value: "October", label: "October 2025" },
    { value: "November", label: "November 2025" },
    { value: "December", label: "December 2025" },
    { value: "MTD", label: "MTD (Month to Date)" },
    { value: "QTD", label: "QTD (Quarter to Date)" },
    { value: "YTD", label: "YTD (Year to Date)" },
  ];

  const businessUnits = [
    { value: "All Company", label: "All Company" },
    { value: "Equestrian", label: "Equestrian" },
    { value: "Events", label: "Events" },
    { value: "Retail", label: "Retail" },
    { value: "Advisory", label: "Advisory" },
  ];

  const scenarioOptions = [
    { value: "Budget_Base", label: "Actual vs Budget Base" },
    { value: "Budget_Worst", label: "Actual vs Budget Worst" },
    { value: "Budget_Best", label: "Actual vs Budget Best" },
    { value: "PY", label: "Actual vs PY" },
  ];

  // Calculate date range based on selected month
  const getDateRange = (): { startDate: string; endDate: string } => {
    const currentDate = new Date(CURRENT_DATE); // "2025-11-20"
    
    if (selectedMonth === "MTD") {
      // Month to Date: Nov 1 to Nov 20, 2025
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      return {
        startDate: `${year}-${month}-01`,
        endDate: `${year}-${month}-${day}`
      };
    } else if (selectedMonth === "QTD") {
      // Quarter to Date: Oct 1 to Nov 20 (Q4: Aug-Oct in guide, but seems to be Oct-Dec)
      return {
        startDate: "2025-10-01",
        endDate: CURRENT_DATE
      };
    } else if (selectedMonth === "YTD") {
      // Year to Date: Nov 1, 2024 to Nov 20, 2025 (fiscal year)
      return {
        startDate: "2024-11-01",
        endDate: CURRENT_DATE
      };
    } else {
      // Specific month selected (e.g., "January" -> "2025-01-01" to "2025-01-31")
      const monthMap: Record<string, { month: string; year: string; lastDay: string }> = {
        "December": { month: "12", year: "2024", lastDay: "31" },
        "January": { month: "01", year: "2025", lastDay: "31" },
        "February": { month: "02", year: "2025", lastDay: "28" },
        "March": { month: "03", year: "2025", lastDay: "31" },
        "April": { month: "04", year: "2025", lastDay: "30" },
        "May": { month: "05", year: "2025", lastDay: "31" },
        "June": { month: "06", year: "2025", lastDay: "30" },
        "July": { month: "07", year: "2025", lastDay: "31" },
        "August": { month: "08", year: "2025", lastDay: "31" },
        "September": { month: "09", year: "2025", lastDay: "30" },
        "October": { month: "10", year: "2025", lastDay: "31" },
        "November": { month: "11", year: "2025", lastDay: "30" },
      };
      
      const monthInfo = monthMap[selectedMonth] || monthMap["November"];
      return {
        startDate: `${monthInfo.year}-${monthInfo.month}-01`,
        endDate: `${monthInfo.year}-${monthInfo.month}-${monthInfo.lastDay}`
      };
    }
  };

  // Filter/aggregate data based on selected BU using new financialData system
  const getFilteredKPIData = () => {
    const { startDate, endDate } = getDateRange();
    
    // Map BU display name to code
    const buMap: Record<string, string> = {
      "Equestrian": "BU1_Equestrian",
      "Events": "BU2_Events",
      "Retail": "BU3_Retail",
      "Advisory": "BU4_Advisory"
    };
    const buCode = selectedBU === "All Company" ? undefined : buMap[selectedBU];
    
    // Get the correct budget scenario
    const budgetScenario = selectedScenario === 'PY' ? 'Budget_Base' : selectedScenario;
    
    // Get P&L data for the period
    const plData = getPLDataForPeriod(startDate, endDate, budgetScenario, buCode);
    
    // Determine comparison values based on scenario
    let revComparison: number, cogsComparison: number, opexComparison: number;
    
    if (selectedScenario === 'PY') {
      // Compare against Previous Year
      revComparison = plData.previousYear.revenue;
      cogsComparison = plData.previousYear.cogs;
      opexComparison = plData.previousYear.opex;
    } else {
      // Compare against selected budget scenario
      revComparison = plData.budget.revenue;
      cogsComparison = plData.budget.cogs;
      opexComparison = plData.budget.opex;
    }
    
    const gmActual = plData.actual.grossMargin;
    const gmComparison = selectedScenario === 'PY' 
      ? plData.previousYear.grossMargin 
      : plData.budget.grossMargin;
    
    const ebitdaActual = plData.actual.ebitda;
    const ebitdaComparison = selectedScenario === 'PY'
      ? plData.previousYear.ebitda
      : plData.budget.ebitda;

    // Helper to detect opposite signs
    const hasOppositeSigns = (actual: number, comparison: number): boolean => {
      return (actual >= 0 && comparison < 0) || (actual < 0 && comparison >= 0);
    };

    return [
      {
        label: "Revenue",
        actual: plData.actual.revenue,
        budget: revComparison,
        variance: plData.actual.revenue - revComparison,
        variancePercent: revComparison !== 0 ? ((plData.actual.revenue - revComparison) / Math.abs(revComparison)) * 100 : 0,
        format: "currency" as const,
        isOppositeSigns: hasOppositeSigns(plData.actual.revenue, revComparison),
      },
      {
        label: "Gross Margin",
        actual: gmActual,
        budget: gmComparison,
        variance: gmActual - gmComparison,
        variancePercent: gmComparison !== 0 ? ((gmActual - gmComparison) / Math.abs(gmComparison)) * 100 : 0,
        format: "currency" as const,
        isOppositeSigns: hasOppositeSigns(gmActual, gmComparison),
      },
      {
        label: "OpEx",
        actual: Math.abs(plData.actual.opex),
        budget: Math.abs(opexComparison),
        variance: Math.abs(plData.actual.opex) - Math.abs(opexComparison),
        variancePercent: opexComparison !== 0 ? ((Math.abs(plData.actual.opex) - Math.abs(opexComparison)) / Math.abs(opexComparison)) * 100 : 0,
        format: "currency" as const,
        isOppositeSigns: hasOppositeSigns(Math.abs(plData.actual.opex), Math.abs(opexComparison)),
      },
      {
        label: "EBITDA",
        actual: ebitdaActual,
        budget: ebitdaComparison,
        variance: ebitdaActual - ebitdaComparison,
        variancePercent: ebitdaComparison !== 0 
          ? ((ebitdaActual - ebitdaComparison) / Math.abs(ebitdaComparison)) * 100
          : 0,
        format: "currency" as const,
        isOppositeSigns: hasOppositeSigns(ebitdaActual, ebitdaComparison),
      },
    ];
  };

  const getFilteredBUPerformance = () => {
    // Only show BU performance when "All Company" is selected
    if (selectedBU !== "All Company") {
      return [];
    }
    
    const { startDate, endDate } = getDateRange();
    const budgetScenario = selectedScenario === 'PY' ? 'Budget_Base' : selectedScenario;
    
    // Get data for all BUs
    return buCodes.map(buCode => {
      const plData = getPLDataForPeriod(startDate, endDate, budgetScenario, buCode);
      const label = businessUnitLabels[buCode];
      
      // Determine comparison values based on scenario
      const comparison = selectedScenario === 'PY' ? plData.previousYear : plData.budget;
      
      return {
        name: label,
        revenue: {
          actual: plData.actual.revenue,
          budget: comparison.revenue,
        },
        grossMargin: {
          actual: plData.actual.grossMargin,
          budget: comparison.grossMargin,
        },
        opex: {
          actual: Math.abs(plData.actual.opex),
          budget: Math.abs(comparison.opex),
        },
        ebitda: {
          actual: plData.actual.ebitda,
          budget: comparison.ebitda,
        },
        services: undefined,
      };
    });
  };

  const filteredKPIData = getFilteredKPIData();
  const filteredBUPerformance = getFilteredBUPerformance();

  const renderFilters = () => (
    <div className="flex flex-wrap gap-4 mb-6">
      <Select value={selectedMonth} onValueChange={setSelectedMonth}>
        <SelectTrigger className="w-56 bg-background font-medium">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-[300px]">
          {months.map((month) => (
            <SelectItem key={month.value} value={month.value}>
              {month.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select 
        value={selectedScenario} 
        onValueChange={(value) => setSelectedScenario(value as typeof selectedScenario)}
      >
        <SelectTrigger className="w-56 bg-background font-medium">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {scenarioOptions.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={selectedBU} onValueChange={setSelectedBU}>
        <SelectTrigger className="w-56 bg-background font-medium">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {businessUnits.map((bu) => (
            <SelectItem key={bu.value} value={bu.value}>
              {bu.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  // Get Cash KPI Data for the drawer
  const getCashKPIData = (): KPIMetric[] => {
    const buCode = selectedBU === "All Company" ? undefined : buMap[selectedBU];
    const budgetScenario = selectedScenario === 'PY' ? 'Budget_Base' : selectedScenario;
    
    // 1. Cash Balance
    const cashActual = getCashBalance('Actual', CURRENT_DATE, buCode);
    const cashComparison = selectedScenario === 'PY'
      ? getCashBalance('Actual', getPYDate(CURRENT_DATE), buCode)
      : getCashBalance(budgetScenario, CURRENT_DATE, buCode);
    
    // 2. Burn Rate (current month)
    const monthStart = getMonthStart(CURRENT_DATE);
    const burnActual = getMonthlyBurn(monthStart, CURRENT_DATE, 'Actual', buCode);
    const burnComparison = selectedScenario === 'PY'
      ? getMonthlyBurn(getPYDate(monthStart), getPYDate(CURRENT_DATE), 'Actual', buCode)
      : getMonthlyBurn(monthStart, CURRENT_DATE, budgetScenario, buCode);
    
    // 3. Payables
    const payablesActual = getPayables('Actual', CURRENT_DATE, buCode);
    const payablesComparison = selectedScenario === 'PY'
      ? getPayables('Actual', getPYDate(CURRENT_DATE), buCode)
      : getPayables(budgetScenario, CURRENT_DATE, buCode);
    
    // 4. Receivables
    const receivablesActual = getReceivables('Actual', CURRENT_DATE, buCode);
    const receivablesComparison = selectedScenario === 'PY'
      ? getReceivables('Actual', getPYDate(CURRENT_DATE), buCode)
      : getReceivables(budgetScenario, CURRENT_DATE, buCode);
    
    // Helper to detect opposite signs
    const hasOppositeSigns = (actual: number, comparison: number): boolean => {
      return (actual >= 0 && comparison < 0) || (actual < 0 && comparison >= 0);
    };

    return [
      {
        label: "Cash Balance TO DATE",
        actual: cashActual,
        budget: cashComparison,
        variance: cashActual - cashComparison,
        variancePercent: cashComparison !== 0 ? ((cashActual - cashComparison) / Math.abs(cashComparison)) * 100 : 0,
        format: "currency" as const,
        isOppositeSigns: hasOppositeSigns(cashActual, cashComparison),
      },
      {
        label: "Cash Flow MTD",
        actual: burnActual,
        budget: burnComparison,
        variance: burnActual - burnComparison,
        variancePercent: burnComparison !== 0 ? ((burnActual - burnComparison) / Math.abs(burnComparison)) * 100 : 0,
        format: "currency" as const,
        isOppositeSigns: hasOppositeSigns(burnActual, burnComparison),
      },
      {
        label: "Payables TO DATE",
        actual: payablesActual.amount,
        budget: payablesComparison.amount,
        variance: payablesActual.amount - payablesComparison.amount,
        variancePercent: payablesComparison.amount !== 0 ? ((payablesActual.amount - payablesComparison.amount) / Math.abs(payablesComparison.amount)) * 100 : 0,
        format: "currency" as const,
        isOppositeSigns: hasOppositeSigns(payablesActual.amount, payablesComparison.amount),
      },
      {
        label: "Receivables TO DATE",
        actual: receivablesActual.amount,
        budget: receivablesComparison.amount,
        variance: receivablesActual.amount - receivablesComparison.amount,
        variancePercent: receivablesComparison.amount !== 0 ? ((receivablesActual.amount - receivablesComparison.amount) / Math.abs(receivablesComparison.amount)) * 100 : 0,
        format: "currency" as const,
        isOppositeSigns: hasOppositeSigns(receivablesActual.amount, receivablesComparison.amount),
      }
    ];
  };

  const renderCashSection = () => {
    const cashKPIData = getCashKPIData();
    
    return (
      <div className="space-y-6">
        {/* Filter Controls - Only Scenario and BU */}
        <div className="flex gap-4">
          <Select 
            value={selectedScenario} 
            onValueChange={(value) => setSelectedScenario(value as typeof selectedScenario)}
          >
            <SelectTrigger className="w-56 bg-background font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scenarioOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedBU} onValueChange={setSelectedBU}>
            <SelectTrigger className="w-56 bg-background font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {businessUnits.map((bu) => (
                <SelectItem key={bu.value} value={bu.value}>
                  {bu.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {cashKPIData.map((metric) => (
            <KPICard
              key={metric.label}
              metric={metric}
              periodLabel=""
              scenario={selectedScenario === 'PY' ? 'py' : 'base'}
            />
          ))}
        </div>

        {/* Chart Section */}
        <Card className="p-6">
          <CashTrendChart 
            scenario={selectedScenario} 
            selectedBU={selectedBU} 
          />
        </Card>
      </div>
    );
  };

  const renderEconomicsContent = () => (
    <div className="space-y-6">
      {/* Filter Controls */}
      <div className="flex gap-4">
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-56 bg-background font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {months.map((month) => (
              <SelectItem key={month.value} value={month.value}>
                {month.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select 
          value={selectedScenario} 
          onValueChange={(value) => setSelectedScenario(value as typeof selectedScenario)}
        >
          <SelectTrigger className="w-56 bg-background font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scenarioOptions.map(option => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedBU} onValueChange={setSelectedBU}>
          <SelectTrigger className="w-56 bg-background font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {businessUnits.map((bu) => (
              <SelectItem key={bu.value} value={bu.value}>
                {bu.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filteredKPIData.map((metric, index) => (
          <KPICard
            key={index}
            metric={metric}
            periodLabel={selectedMonth}
            scenario={selectedScenario}
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

      {/* Charts */}
      <RevenueTrendChart scenario={selectedScenario} selectedBU={selectedBU} />
      {selectedBU === "All Company" && (
        <BUPerformanceChart data={filteredBUPerformance} onClick={() => setCurrentPage("performance")} />
      )}
    </div>
  );

  const renderOverview = () => (
    <div className="space-y-8 animate-fade-in">
      {/* Centered Pill Tab - Professional Design */}
      <div className="flex justify-center pt-4">
        <Tabs value={currentView} onValueChange={(v) => setCurrentView(v as 'economics' | 'cash')}>
          <TabsListPill className="shadow-lg">
            <TabsTriggerPill value="economics">Performance</TabsTriggerPill>
            <TabsTriggerPill value="cash">Cash</TabsTriggerPill>
          </TabsListPill>
        </Tabs>
      </div>

      {/* Content with proper spacing */}
      <div className="pt-2">
        {currentView === 'economics' ? renderEconomicsContent() : renderCashSection()}
      </div>
    </div>
  );

  const renderPerformance = () => (
    <div className="space-y-6 animate-fade-in">
      {renderFilters()}
      <PerformanceWaterfall 
        selectedMonth={selectedMonth}
        selectedScenario={selectedScenario}
        selectedBU={selectedBU}
      />
    </div>
  );

  const renderCash = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-4">Recommendation</h2>
        <p className="text-muted-foreground">This page is under construction.</p>
      </Card>
    </div>
  );

  const renderRatios = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-4">Action</h2>
        <p className="text-muted-foreground">This page is under construction.</p>
      </Card>
    </div>
  );

  const renderStatements = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-2xl font-semibold mb-4">Communication</h2>
        <p className="text-muted-foreground">This page is under construction.</p>
      </Card>
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
      case "statements":
        return renderStatements();
      default:
        return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DashboardNav currentPage={currentPage} />
      <main className="container mx-auto px-4 py-6">
        {renderContent()}
      </main>
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
