import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { KPICard } from "@/components/dashboard/KPICard";
import { RevenueTrendChart } from "@/components/dashboard/RevenueTrendChart";
import { BUPerformanceChart } from "@/components/dashboard/BUPerformanceChart";
import { PerformanceWaterfall } from "@/components/dashboard/PerformanceWaterfall";
import { PLMatrix } from "@/components/dashboard/PLMatrix";
import { CashFlowWaterfall } from "@/components/dashboard/CashFlowWaterfall";
import { FinancialRatiosChart } from "@/components/dashboard/FinancialRatiosChart";
import { OpExDrawer } from "@/components/dashboard/OpExDrawer";
import { GrossMarginDrawer } from "@/components/dashboard/GrossMarginDrawer";
import { CashTrendChart } from "@/components/dashboard/CashTrendChart";
import { RunwayScenarios } from "@/components/dashboard/RunwayScenarios";
import { Statements } from "@/pages/Statements";
import { PageType } from "@/types/dashboard";
import { trendData, buPerformance, cashFlowData, financialRatiosData, buMarginComparisonData, costStructureData } from "@/data/mockData";
import { getMonthlyPLData, calculateGM, calculateEBITDA } from "@/data/financialData";
import { BUMarginComparison } from "@/components/dashboard/BUMarginComparison";
import { CostStructureChart } from "@/components/dashboard/CostStructureChart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";

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
  const [selectedScenario, setSelectedScenario] = useState("base");
  const [selectedBU, setSelectedBU] = useState("All Company");
  const [opexDrawerOpen, setOpexDrawerOpen] = useState(false);
  const [selectedOpExBreakdown, setSelectedOpExBreakdown] = useState<any>(null);
  const [gmDrawerOpen, setGmDrawerOpen] = useState(false);
  const [selectedGMBreakdown, setSelectedGMBreakdown] = useState<any>(null);

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
    { value: "base", label: "Actual vs Budget Base" },
    { value: "worst", label: "Actual vs Budget Worst" },
    { value: "best", label: "Actual vs Budget Best" },
    { value: "py", label: "Actual vs PY" },
  ];

  // Filter/aggregate data based on selected BU using new financialData system
  const getFilteredKPIData = () => {
    const plData = getMonthlyPLData(selectedBU === "All Company" ? undefined : selectedBU);
    
    // Determine which months to include based on selectedMonth
    let monthsToInclude: string[] = [];
    const allMonths = ["Dec '24", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
    
    if (selectedMonth === "MTD") {
      // Month to Date - use only the latest month
      monthsToInclude = [allMonths[allMonths.length - 1]];
    } else if (selectedMonth === "QTD") {
      // Quarter to Date - last 3 months
      monthsToInclude = allMonths.slice(-3);
    } else if (selectedMonth === "YTD") {
      // Year to Date - all months
      monthsToInclude = allMonths;
    } else {
      // Specific month selected
      const monthMap: Record<string, string> = {
        "December": "Dec '24",
        "January": "Jan",
        "February": "Feb",
        "March": "Mar",
        "April": "Apr",
        "May": "May",
        "June": "Jun",
        "July": "Jul",
        "August": "Aug",
        "September": "Sep",
        "October": "Oct",
        "November": "Nov",
      };
      monthsToInclude = [monthMap[selectedMonth] || "Nov"];
    }
    
    // Filter data for selected months
    const filteredData = plData.filter(m => monthsToInclude.includes(m.month));
    
    // Debug: Log what data we're aggregating
    console.log('Index.tsx - Aggregating data for months:', monthsToInclude);
    console.log('Index.tsx - Filtered PL data:', filteredData);
    
    // Sum up the values
    let revActual = 0, revBudget = 0, revPY = 0;
    let cogsActual = 0, cogsBudget = 0, cogsPY = 0;
    let opexActual = 0, opexBudget = 0, opexPY = 0;
    
    filteredData.forEach(month => {
      revActual += month.revenues.actual;
      revBudget += month.revenues.budget;
      revPY += month.revenues.previousYear;
      cogsActual += month.cogs.actual;
      cogsBudget += month.cogs.budget;
      cogsPY += month.cogs.previousYear;
      opexActual += month.opex.actual;
      opexBudget += month.opex.budget;
      opexPY += month.opex.previousYear;
    });
    
    // Debug: Log aggregated values
    console.log('Index.tsx - Aggregated Actual values:', JSON.stringify({
      revenue: revActual,
      cogs: cogsActual,
      opex: opexActual,
      grossMargin: revActual + cogsActual,
      ebitda: revActual + cogsActual + opexActual
    }, null, 2));
    
    // Determine comparison values based on scenario
    let revComparison = revBudget;
    let cogsComparison = cogsBudget;
    let opexComparison = opexBudget;
    
    if (selectedScenario === "worst") {
      // Budget Worst: -20% revenue, +10% opex
      revComparison = revBudget * 0.8;
      cogsComparison = cogsBudget * 0.8; // proportional to revenue
      opexComparison = opexBudget * 1.1;
    } else if (selectedScenario === "best") {
      // Budget Best: +15% revenue, -5% opex
      revComparison = revBudget * 1.15;
      cogsComparison = cogsBudget * 1.15; // proportional to revenue
      opexComparison = opexBudget * 0.95;
    } else if (selectedScenario === "py") {
      // Compare against Previous Year
      revComparison = revPY;
      cogsComparison = cogsPY;
      opexComparison = opexPY;
    }
    
    const gmActual = calculateGM(revActual, cogsActual);
    const gmComparison = calculateGM(revComparison, cogsComparison);
    const ebitdaActual = calculateEBITDA(revActual, cogsActual, opexActual);
    const ebitdaComparison = calculateEBITDA(revComparison, cogsComparison, opexComparison);

    return [
      {
        label: "Revenue",
        actual: revActual,
        budget: revComparison,
        variance: revActual - revComparison,
        variancePercent: revComparison !== 0 ? ((revActual - revComparison) / Math.abs(revComparison)) * 100 : 0,
        format: "currency" as const,
      },
      {
        label: "Gross Margin",
        actual: gmActual,
        budget: gmComparison,
        variance: gmActual - gmComparison,
        variancePercent: gmComparison !== 0 ? ((gmActual - gmComparison) / Math.abs(gmComparison)) * 100 : 0,
        format: "currency" as const,
      },
      {
        label: "OpEx",
        actual: Math.abs(opexActual),
        budget: Math.abs(opexComparison),
        variance: Math.abs(opexActual) - Math.abs(opexComparison),
        variancePercent: opexComparison !== 0 ? ((Math.abs(opexActual) - Math.abs(opexComparison)) / Math.abs(opexComparison)) * 100 : 0,
        format: "currency" as const,
      },
      {
        label: "EBITDA",
        actual: ebitdaActual,
        budget: ebitdaComparison,
        variance: ebitdaActual - ebitdaComparison,
        // When EBITDA crosses zero (pos to neg or neg to pos), percentage is meaningless
        variancePercent: (ebitdaActual > 0 && ebitdaComparison < 0) || (ebitdaActual < 0 && ebitdaComparison > 0)
          ? 999999 // Special flag to indicate "N/A" or show absolute value
          : ebitdaComparison !== 0 
            ? ((ebitdaActual - ebitdaComparison) / Math.abs(ebitdaComparison)) * 100
            : 0,
        format: "currency" as const,
      },
    ];
  };

  const getFilteredBUPerformance = () => {
    // Only show BU performance when "All Company" is selected
    if (selectedBU !== "All Company") {
      return [];
    }
    
    // Get data for all BUs - use the BU codes from the JSON
    const buCodes = [
      { code: "BU1_Equestrian", label: "Equestrian" },
      { code: "BU2_Events", label: "Events" },
      { code: "BU3_Retail", label: "Retail" },
      { code: "BU4_Advisory", label: "Advisory" }
    ];
    
    return buCodes.map(({ code, label }) => {
      const plData = getMonthlyPLData(code);
      
      // Determine which months to include based on selectedMonth
      let monthsToInclude: string[] = [];
      const allMonths = ["Dec '24", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
      
      if (selectedMonth === "MTD") {
        monthsToInclude = [allMonths[allMonths.length - 1]];
      } else if (selectedMonth === "QTD") {
        monthsToInclude = allMonths.slice(-3);
      } else if (selectedMonth === "YTD") {
        monthsToInclude = allMonths;
      } else {
        const monthMap: Record<string, string> = {
          "December": "Dec '24",
          "January": "Jan",
          "February": "Feb",
          "March": "Mar",
          "April": "Apr",
          "May": "May",
          "June": "Jun",
          "July": "Jul",
          "August": "Aug",
          "September": "Sep",
          "October": "Oct",
          "November": "Nov",
        };
        monthsToInclude = [monthMap[selectedMonth] || "Nov"];
      }
      
      // Filter and sum data
      const filteredData = plData.filter(m => monthsToInclude.includes(m.month));
      
      let revActual = 0, revBudget = 0, revPY = 0;
      let cogsActual = 0, cogsBudget = 0, cogsPY = 0;
      let opexActual = 0, opexBudget = 0, opexPY = 0;
      
      filteredData.forEach(month => {
        revActual += month.revenues.actual;
        revBudget += month.revenues.budget;
        revPY += month.revenues.previousYear;
        cogsActual += month.cogs.actual;
        cogsBudget += month.cogs.budget;
        cogsPY += month.cogs.previousYear;
        opexActual += month.opex.actual;
        opexBudget += month.opex.budget;
        opexPY += month.opex.previousYear;
      });
      
      // Apply scenario adjustments
      let revComparison = revBudget;
      let cogsComparison = cogsBudget;
      let opexComparison = opexBudget;
      
      if (selectedScenario === "worst") {
        revComparison = revBudget * 0.8;
        cogsComparison = cogsBudget * 0.8;
        opexComparison = opexBudget * 1.1;
      } else if (selectedScenario === "best") {
        revComparison = revBudget * 1.15;
        cogsComparison = cogsBudget * 1.15;
        opexComparison = opexBudget * 0.95;
      } else if (selectedScenario === "py") {
        revComparison = revPY;
        cogsComparison = cogsPY;
        opexComparison = opexPY;
      }
      
      const gmActual = calculateGM(revActual, cogsActual);
      const gmComparison = calculateGM(revComparison, cogsComparison);
      const ebitdaActual = calculateEBITDA(revActual, cogsActual, opexActual);
      const ebitdaComparison = calculateEBITDA(revComparison, cogsComparison, opexComparison);
      
      return {
        name: label,
        revenue: {
          actual: revActual,
          budget: revComparison,
        },
        grossMargin: {
          actual: gmActual,
          budget: gmComparison,
        },
        opex: {
          actual: Math.abs(opexActual),
          budget: Math.abs(opexComparison),
        },
        ebitda: {
          actual: ebitdaActual,
          budget: ebitdaComparison,
        },
        services: undefined, // Services data not available from new system yet
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
      <Select value={selectedScenario} onValueChange={setSelectedScenario}>
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

  const renderOverview = () => (
    <div className="space-y-6 animate-fade-in">
      {renderFilters()}
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
      <RevenueTrendChart scenario={selectedScenario} selectedBU={selectedBU} />
      {selectedBU === "All Company" && (
        <BUPerformanceChart data={filteredBUPerformance} onClick={() => setCurrentPage("performance")} />
      )}
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
      <PLMatrix 
        data={filteredBUPerformance} 
        onOpExClick={(bu, service) => {
          // Generate OpEx breakdown data based on actual BU data
          const buData = filteredBUPerformance.find(b => b.name === bu);
          if (!buData) return;
          
          let actual, budget;
          if (service && buData.services) {
            const serviceData = buData.services.find(s => s.name === service);
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
          const buData = filteredBUPerformance.find(b => b.name === bu);
          if (!buData) return;
          
          let revenue, gmActual, gmBudget;
          if (service && buData.services) {
            const serviceData = buData.services.find(s => s.name === service);
            if (!serviceData) return;
            revenue = serviceData.revenue.actual;
            gmActual = serviceData.grossMargin.actual;
            gmBudget = serviceData.grossMargin.budget;
          } else {
            revenue = buData.revenue.actual;
            gmActual = buData.grossMargin.actual;
            gmBudget = buData.grossMargin.budget;
          }
          
          const cogsActual = revenue - gmActual;
          const cogsBudget = revenue - gmBudget;
          
          // Create BU-specific COGS breakdown
          let personnelItems: { label: string; amount: number }[] = [];
          let operationsItems: { label: string; amount: number }[] = [];
          let cogsItems: { label: string; amount: number }[] = [];
          
          switch (bu) {
            case "Equestrian":
              personnelItems = [
                { label: "Coaches & Instructors", amount: Math.round(cogsActual * 0.35) },
                { label: "Stable Staff", amount: Math.round(cogsActual * 0.20) }
              ];
              operationsItems = [
                { label: "Feed & Supplements", amount: Math.round(cogsActual * 0.25) },
                { label: "Veterinary & Farrier", amount: Math.round(cogsActual * 0.12) },
                { label: "Equipment Maintenance", amount: Math.round(cogsActual * 0.08) }
              ];
              break;
            case "Events":
              cogsItems = [
                { label: "Venue Costs", amount: Math.round(cogsActual * 0.45) },
                { label: "Catering", amount: Math.round(cogsActual * 0.30) },
                { label: "Event Equipment", amount: Math.round(cogsActual * 0.18) }
              ];
              personnelItems = [
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

  const renderCash = () => {
    const cashBalance = 2800000;
    const actualBurn = 667000;
    const budgetBurn = 565000;
    const burnVariance = actualBurn - budgetBurn;
    const burnVariancePercent = (burnVariance / budgetBurn) * 100;
    
    const getBurnColor = () => {
      if (burnVariancePercent <= 5) return "bg-[#22d3ee]/10 border-[#22d3ee]/30";
      if (burnVariancePercent <= 10) return "bg-[#ffc107]/15 border-[#ffc107]/40";
      return "bg-[#dc3545]/10 border-[#dc3545]/30";
    };
    
    const getVarianceTextColor = () => {
      if (burnVariancePercent <= 5) return "text-[#22d3ee]";
      if (burnVariancePercent <= 10) return "text-[#ffc107]";
      return "text-[#dc3545]";
    };

    // Cash trend data
    const cashTrendData = [
      { month: "Jun", balance: 3500000, runway: 5.2 },
      { month: "Jul", balance: 3400000, runway: 5.1 },
      { month: "Aug", balance: 3300000, runway: 4.9 },
      { month: "Sep", balance: 3300000, runway: 4.9 },
      { month: "Oct", balance: 3200000, runway: 4.8 },
      { month: "Nov", balance: 2800000, runway: 4.2 },
      { month: "Dec", balance: 2600000, forecast: true, runway: 3.9 },
      { month: "Jan", balance: 2400000, forecast: true, runway: 3.6 },
      { month: "Feb", balance: 2200000, forecast: true, runway: 3.3 },
    ];

    return (
      <div className="space-y-6 animate-fade-in">
        {renderFilters()}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wide mb-2">Cash Balance</p>
            <p className="text-3xl md:text-2xl font-heading">SAR 2,800,000</p>
          </Card>
          <Card className={`p-6 shadow-sm border-2 animate-fade-in hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${getBurnColor()}`}>
            <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wide mb-2">Monthly Burn</p>
            <p className="text-3xl md:text-2xl font-heading mb-2">SAR 667,000</p>
            <p className="text-sm text-muted-foreground mb-1">vs Budget: SAR 565,000</p>
            <p className={`text-base md:text-sm font-semibold ${getVarianceTextColor()}`}>
              +{burnVariancePercent.toFixed(1)}% (+{new Intl.NumberFormat("en-SA", {
                style: "currency",
                currency: "SAR",
                minimumFractionDigits: 0,
              }).format(burnVariance)})
            </p>
          </Card>
          <Card className="p-6 shadow-sm bg-[#ffc107]/15 border-[#ffc107]/40 border-2 animate-fade-in hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wide mb-2">Runway</p>
            <p className="text-3xl md:text-2xl font-heading text-foreground">4.2 months</p>
          </Card>
        </div>
        <CashFlowWaterfall data={cashFlowData} />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <CashTrendChart data={cashTrendData} />
          </div>
          <div className="lg:col-span-2">
            <RunwayScenarios 
              currentBurn={actualBurn} 
              budgetBurn={budgetBurn} 
              cashBalance={cashBalance}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderRatios = () => {
    // KPI data for ratios
    const ratiosKPIData = [
      {
        label: "Gross Margin %",
        actual: 48.2,
        budget: 50.0,
        variance: -1.8,
        variancePercent: -1.8,
        format: "percent" as const,
      },
      {
        label: "EBITDA %",
        actual: 14.1,
        budget: 17.6,
        variance: -3.5,
        variancePercent: -3.5,
        format: "percent" as const,
      },
      {
        label: "OpEx % of Revenue",
        actual: 34.1,
        budget: 32.0,
        variance: 2.1,
        variancePercent: 2.1,
        format: "percent" as const,
      },
    ];

    return (
      <div className="space-y-6 animate-fade-in">
        {renderFilters()}
        
        {/* KPI Cards at top */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ratiosKPIData.map((metric, index) => {
            const isOpEx = metric.label.includes("OpEx");
            const varianceColor = isOpEx 
              ? (metric.variance > 1 ? "text-destructive" : metric.variance > 0 ? "text-warning" : "text-success")
              : (metric.variance < -1 ? "text-destructive" : metric.variance < 0 ? "text-warning" : "text-success");
            
            const bgColor = isOpEx
              ? (metric.variance > 1 ? "bg-destructive/15 border-destructive/40" : "bg-muted/50")
              : (metric.variance < -1 ? "bg-destructive/15 border-destructive/40" : "bg-muted/50");

            return (
              <Card 
                key={index}
                className={`p-6 shadow-sm border-2 animate-fade-in hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer ${bgColor}`}
                onClick={() => setCurrentPage("performance")}
              >
                <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wide mb-2">
                  {metric.label}
                </p>
                <p className="text-4xl font-heading mb-2">
                  {metric.actual.toFixed(1)}%
                </p>
                <p className={`text-base font-semibold mb-1 ${varianceColor}`}>
                  {metric.variance > 0 ? "+" : ""}{metric.variance.toFixed(1)}pp vs Budget
                </p>
                <p className="text-sm text-muted-foreground">
                  Budget: {metric.budget.toFixed(1)}%
                </p>
              </Card>
            );
          })}
        </div>

        {/* Middle Section: BU Comparison and Cost Structure */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BUMarginComparison 
            data={buMarginComparisonData}
            onClick={(buName) => {
              setCurrentPage("performance");
              // Could add BU filter logic here
            }}
          />
          <CostStructureChart data={costStructureData} />
        </div>

        {/* Bottom Section: Trend Chart */}
        <FinancialRatiosChart data={financialRatiosData} />
      </div>
    );
  };

  const renderStatements = () => {
    return <Statements />;
  };

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
