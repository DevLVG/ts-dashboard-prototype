import { BUPerformance, TrendData, CashFlowData, KPIMetric } from "@/types/dashboard";

export const kpiData: KPIMetric[] = [
  {
    label: "Revenue",
    actual: 850000,
    budget: 1000000,
    variance: -150000,
    variancePercent: -15,
    format: "currency",
  },
  {
    label: "Gross Margin",
    actual: 409700,
    budget: 500000,
    variance: -90300,
    variancePercent: -18.1,
    format: "currency",
  },
  {
    label: "OpEx",
    actual: 550000,
    budget: 565000,
    variance: -15000,
    variancePercent: -2.7,
    format: "currency",
  },
  {
    label: "EBITDA",
    actual: 120000,
    budget: 150000,
    variance: -30000,
    variancePercent: -20,
    format: "currency",
  },
];

export const trendData: TrendData[] = [
  { month: "Jun", actual: 920000, budget: 950000 },
  { month: "Jul", actual: 880000, budget: 970000 },
  { month: "Aug", actual: 1050000, budget: 1000000 },
  { month: "Sep", actual: 950000, budget: 980000 },
  { month: "Oct", actual: 890000, budget: 1010000 },
  { month: "Nov", actual: 850000, budget: 1000000 },
];

export const buPerformance: BUPerformance[] = [
  {
    name: "Equestrian",
    revenue: { actual: 600000, budget: 700000 },
    grossMargin: { actual: 190000, budget: 225000 },
    opex: { actual: 120000, budget: 115000 },
    ebitda: { actual: 70000, budget: 110000 },
    services: [
      {
        name: "Riding Lessons",
        revenue: { actual: 180000, budget: 200000 },
        grossMargin: { actual: 90000, budget: 100000 },
        opex: { actual: 55000, budget: 52000 },
        ebitda: { actual: 35000, budget: 48000 },
      },
      {
        name: "Horse Boarding",
        revenue: { actual: 150000, budget: 180000 },
        grossMargin: { actual: 75000, budget: 90000 },
        opex: { actual: 45000, budget: 43000 },
        ebitda: { actual: 30000, budget: 47000 },
      },
      {
        name: "Competition Training",
        revenue: { actual: 50000, budget: 70000 },
        grossMargin: { actual: 25000, budget: 35000 },
        opex: { actual: 20000, budget: 20000 },
        ebitda: { actual: 5000, budget: 15000 },
      },
    ],
  },
  {
    name: "Events",
    revenue: { actual: 200000, budget: 250000 },
    grossMargin: { actual: 100000, budget: 175000 },
    opex: { actual: 95000, budget: 90000 },
    ebitda: { actual: 5000, budget: 85000 },
    services: [
      {
        name: "Venue Rental Corporate",
        revenue: { actual: 80000, budget: 160000 },
        grossMargin: { actual: 32000, budget: 80000 },
        opex: { actual: 38000, budget: 36000 },
        ebitda: { actual: -6000, budget: 44000 },
      },
      {
        name: "Venue Rental Private",
        revenue: { actual: 120000, budget: 130000 },
        grossMargin: { actual: 48000, budget: 65000 },
        opex: { actual: 38000, budget: 36000 },
        ebitda: { actual: 10000, budget: 29000 },
      },
      {
        name: "Event Management",
        revenue: { actual: 50000, budget: 60000 },
        grossMargin: { actual: 20000, budget: 30000 },
        opex: { actual: 19000, budget: 18000 },
        ebitda: { actual: 1000, budget: 12000 },
      },
    ],
  },
  {
    name: "Retail",
    revenue: { actual: 40000, budget: 40000 },
    grossMargin: { actual: 56000, budget: 52000 },
    opex: { actual: 42000, budget: 40000 },
    ebitda: { actual: 14000, budget: 12000 },
    services: [
      {
        name: "Equipment Sales",
        revenue: { actual: 90000, budget: 80000 },
        grossMargin: { actual: 36000, budget: 32000 },
        opex: { actual: 27000, budget: 25000 },
        ebitda: { actual: 9000, budget: 7000 },
      },
      {
        name: "Apparel & Accessories",
        revenue: { actual: 50000, budget: 50000 },
        grossMargin: { actual: 20000, budget: 20000 },
        opex: { actual: 15000, budget: 15000 },
        ebitda: { actual: 5000, budget: 5000 },
      },
    ],
  },
  {
    name: "Advisory",
    revenue: { actual: 10000, budget: 10000 },
    grossMargin: { actual: 64000, budget: 56000 },
    opex: { actual: 33000, budget: 30000 },
    ebitda: { actual: 31000, budget: 26000 },
    services: [
      {
        name: "Consulting Services",
        revenue: { actual: 80000, budget: 70000 },
        grossMargin: { actual: 64000, budget: 56000 },
        opex: { actual: 33000, budget: 30000 },
        ebitda: { actual: 31000, budget: 26000 },
      },
    ],
  },
];

export const cashFlowData: CashFlowData[] = [
  { category: "Opening Balance", amount: 3200000, type: "inflow" },
  { category: "Revenue", amount: 820000, type: "inflow" },
  { category: "OpEx", amount: -730000, type: "outflow" },
  { category: "CAPEX", amount: -120000, type: "outflow" },
  { category: "Loan Payment", amount: -80000, type: "outflow" },
  { category: "AR Delay", amount: -290000, type: "outflow" },
  { category: "Closing Balance", amount: 2800000, type: "inflow" },
];

export const financialRatiosData = [
  { 
    month: "Jun", 
    gmPercent: 50.2, 
    gmBudget: 50.0,
    ebitdaPercent: 16.5, 
    ebitdaBudget: 17.6,
    opexPercent: 33.7,
    opexBudget: 32.0
  },
  { 
    month: "Jul", 
    gmPercent: 49.8, 
    gmBudget: 50.0,
    ebitdaPercent: 15.2, 
    ebitdaBudget: 17.6,
    opexPercent: 34.6,
    opexBudget: 32.0
  },
  { 
    month: "Aug", 
    gmPercent: 51.5, 
    gmBudget: 50.0,
    ebitdaPercent: 17.8, 
    ebitdaBudget: 17.6,
    opexPercent: 33.7,
    opexBudget: 32.0
  },
  { 
    month: "Sep", 
    gmPercent: 50.8, 
    gmBudget: 50.0,
    ebitdaPercent: 16.9, 
    ebitdaBudget: 17.6,
    opexPercent: 33.9,
    opexBudget: 32.0
  },
  { 
    month: "Oct", 
    gmPercent: 49.2, 
    gmBudget: 50.0,
    ebitdaPercent: 14.8, 
    ebitdaBudget: 17.6,
    opexPercent: 34.4,
    opexBudget: 32.0
  },
  { 
    month: "Nov", 
    gmPercent: 48.2, 
    gmBudget: 50.0,
    ebitdaPercent: 14.1, 
    ebitdaBudget: 17.6,
    opexPercent: 34.1,
    opexBudget: 32.0
  },
];

export const buMarginComparisonData = [
  {
    name: "Equestrian",
    gmActual: 50.0,
    gmBudget: 50.0,
    ebitdaActual: 18.4,
    ebitdaBudget: 24.4,
  },
  {
    name: "Events",
    gmActual: 40.0,
    gmBudget: 40.0,
    ebitdaActual: 2.0,
    ebitdaBudget: 24.3,
  },
  {
    name: "Retail",
    gmActual: 40.0,
    gmBudget: 40.0,
    ebitdaActual: 10.0,
    ebitdaBudget: 9.2,
  },
  {
    name: "Advisory",
    gmActual: 80.0,
    gmBudget: 80.0,
    ebitdaActual: 38.8,
    ebitdaBudget: 37.1,
  },
];

export const costStructureData = [
  {
    name: "Equestrian",
    directCosts: 50.0,
    opex: 31.6,
    ebitda: 18.4,
  },
  {
    name: "Events",
    directCosts: 60.0,
    opex: 38.0,
    ebitda: 2.0,
  },
  {
    name: "Retail",
    directCosts: 60.0,
    opex: 30.0,
    ebitda: 10.0,
  },
  {
    name: "Advisory",
    directCosts: 20.0,
    opex: 41.2,
    ebitda: 38.8,
  },
  {
    name: "Total",
    directCosts: 52.2,
    opex: 33.7,
    ebitda: 14.1,
  },
];
