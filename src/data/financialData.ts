// Financial data system using the comprehensive JSON dataset
import mockData from './trio_mock_data_full.json';

// Type definitions matching the JSON structure
export interface RevenueRecord {
  date: string;
  scenario: 'PY' | 'Actual' | 'Budget_Base' | 'Budget_Worst' | 'Budget_Best';
  bu: string;
  service: string;
  amount: number;
}

export interface CogsRecord {
  date: string;
  scenario: 'PY' | 'Actual' | 'Budget_Base' | 'Budget_Worst' | 'Budget_Best';
  bu: string;
  service: string;
  category: string;
  amount: number;
}

export interface OpexRecord {
  date: string;
  scenario: 'PY' | 'Actual' | 'Budget_Base' | 'Budget_Worst' | 'Budget_Best';
  category: string;
  amount: number;
}

export interface CashRecord {
  date: string;
  scenario: 'PY' | 'Actual' | 'Budget_Base' | 'Budget_Worst' | 'Budget_Best';
  opening_balance: number;
  inflows: number;
  outflows: number;
  closing_balance: number;
}

export interface Metadata {
  generated: string;
  date_range: {
    start: string;
    end: string;
    days: number;
  };
  scenarios: {
    PY: string;
    Actual: string;
    Budget_Base: string;
    Budget_Worst: string;
    Budget_Best: string;
  };
  targets: {
    revenue_annual: number;
    opex_annual: number;
    cogs_annual: number;
    ebitda_annual: number;
  };
  structure_note: string;
  total_records: number;
}

// Color threshold configuration
export const COLOR_THRESHOLDS = {
  POSITIVE_THRESHOLD: 5,   // >= 5% variance = green (for revenues, margins)
  NEGATIVE_THRESHOLD: -5,  // <= -5% variance = red (for revenues, margins)
};

export const getPerformanceColor = (actual: number, budget: number, isRevenue: boolean = true): string => {
  const variance = ((actual - budget) / Math.abs(budget)) * 100;
  
  if (isRevenue) {
    // For revenues/margins: higher is better
    if (variance >= COLOR_THRESHOLDS.POSITIVE_THRESHOLD) return "hsl(142, 76%, 36%)"; // Green
    if (variance <= COLOR_THRESHOLDS.NEGATIVE_THRESHOLD) return "hsl(0, 84%, 60%)"; // Red
    return "hsl(48, 96%, 53%)"; // Yellow
  } else {
    // For costs: lower is better (inverted logic)
    if (variance <= COLOR_THRESHOLDS.NEGATIVE_THRESHOLD) return "hsl(142, 76%, 36%)"; // Green
    if (variance >= COLOR_THRESHOLDS.POSITIVE_THRESHOLD) return "hsl(0, 84%, 60%)"; // Red
    return "hsl(48, 96%, 53%)"; // Yellow
  }
};

// Business Units mapping
export const businessUnits = ["BU1_Equestrian", "BU2_Events", "BU3_Retail", "BU4_Advisory"];
export const businessUnitLabels: Record<string, string> = {
  "BU1_Equestrian": "Equestrian",
  "BU2_Events": "Events",
  "BU3_Retail": "Retail",
  "BU4_Advisory": "Advisory"
};

// Access the data
export const metadata: Metadata = mockData.metadata as Metadata;
export const revenues: RevenueRecord[] = mockData.revenues as RevenueRecord[];
export const cogs: CogsRecord[] = mockData.cogs as CogsRecord[];
export const opex: OpexRecord[] = mockData.opex as OpexRecord[];
export const cash: CashRecord[] = mockData.cash as CashRecord[];

// Helper to get month label from date
export const getMonthLabel = (date: string): string => {
  const d = new Date(date);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const year = d.getFullYear();
  const month = monthNames[d.getMonth()];
  
  // Special case for Dec 2024 (first month)
  if (month === "Nov" && year === 2024) return "Dec '24";
  if (year === 2024) return `${month} '24`;
  if (year === 2025) return month;
  return `${month} '${year.toString().slice(-2)}`;
};

// Group data by month
export const groupByMonth = <T extends { date: string }>(records: T[]): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  
  records.forEach(record => {
    const monthKey = record.date.slice(0, 7); // YYYY-MM
    if (!grouped.has(monthKey)) {
      grouped.set(monthKey, []);
    }
    grouped.get(monthKey)!.push(record);
  });
  
  return grouped;
};

// Get monthly totals for a specific scenario and BU
export const getMonthlyRevenues = (scenario: string, bu?: string) => {
  const filtered = bu 
    ? revenues.filter(r => r.scenario === scenario && r.bu === bu)
    : revenues.filter(r => r.scenario === scenario);
  
  const grouped = groupByMonth(filtered);
  const result: Array<{ month: string; amount: number }> = [];
  
  grouped.forEach((records, monthKey) => {
    const total = records.reduce((sum, r) => sum + r.amount, 0);
    result.push({
      month: getMonthLabel(records[0].date),
      amount: total
    });
  });
  
  return result.sort((a, b) => {
    const months = ["Dec '24", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
    return months.indexOf(a.month) - months.indexOf(b.month);
  });
};

// Get monthly COGS for a specific scenario and BU
export const getMonthlyCogs = (scenario: string, bu?: string) => {
  const filtered = bu 
    ? cogs.filter(c => c.scenario === scenario && c.bu === bu)
    : cogs.filter(c => c.scenario === scenario);
  
  const grouped = groupByMonth(filtered);
  const result: Array<{ month: string; amount: number }> = [];
  
  grouped.forEach((records, monthKey) => {
    const total = records.reduce((sum, c) => sum + c.amount, 0);
    result.push({
      month: getMonthLabel(records[0].date),
      amount: total
    });
  });
  
  return result.sort((a, b) => {
    const months = ["Dec '24", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
    return months.indexOf(a.month) - months.indexOf(b.month);
  });
};

// Get monthly OpEx for a specific scenario
export const getMonthlyOpex = (scenario: string) => {
  const filtered = opex.filter(o => o.scenario === scenario);
  const grouped = groupByMonth(filtered);
  const result: Array<{ month: string; amount: number }> = [];
  
  grouped.forEach((records, monthKey) => {
    const total = records.reduce((sum, o) => sum + o.amount, 0);
    result.push({
      month: getMonthLabel(records[0].date),
      amount: total
    });
  });
  
  return result.sort((a, b) => {
    const months = ["Dec '24", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
    return months.indexOf(a.month) - months.indexOf(b.month);
  });
};

// Calculate gross margin
export const calculateGM = (revenue: number, cogsAmount: number) => revenue + cogsAmount;

// Calculate EBITDA
export const calculateEBITDA = (revenue: number, cogsAmount: number, opexAmount: number) => 
  revenue + cogsAmount + opexAmount;

// Get combined monthly P&L data
export interface MonthlyPLData {
  month: string;
  revenues: { actual: number; budget: number; previousYear: number };
  cogs: { actual: number; budget: number; previousYear: number };
  opex: { actual: number; budget: number; previousYear: number };
}

export const getMonthlyPLData = (bu?: string): MonthlyPLData[] => {
  const revenuesPY = getMonthlyRevenues('PY', bu);
  const revenuesActual = getMonthlyRevenues('Actual', bu);
  const revenuesBudget = getMonthlyRevenues('Budget_Base', bu);
  
  const cogsPY = getMonthlyCogs('PY', bu);
  const cogsActual = getMonthlyCogs('Actual', bu);
  const cogsBudget = getMonthlyCogs('Budget_Base', bu);
  
  const opexPY = getMonthlyOpex('PY');
  const opexActual = getMonthlyOpex('Actual');
  const opexBudget = getMonthlyOpex('Budget_Base');
  
  const months = ["Dec '24", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
  
  return months.map(month => {
    const revPY = revenuesPY.find(r => r.month === month)?.amount || 0;
    const revActual = revenuesActual.find(r => r.month === month)?.amount || 0;
    const revBudget = revenuesBudget.find(r => r.month === month)?.amount || 0;
    
    const cogPY = cogsPY.find(c => c.month === month)?.amount || 0;
    const cogActual = cogsActual.find(c => c.month === month)?.amount || 0;
    const cogBudget = cogsBudget.find(c => c.month === month)?.amount || 0;
    
    const opPY = opexPY.find(o => o.month === month)?.amount || 0;
    const opActual = opexActual.find(o => o.month === month)?.amount || 0;
    const opBudget = opexBudget.find(o => o.month === month)?.amount || 0;
    
    return {
      month,
      revenues: { 
        actual: revActual, 
        budget: revBudget, 
        previousYear: revPY 
      },
      cogs: { 
        actual: -Math.abs(cogActual), 
        budget: -Math.abs(cogBudget), 
        previousYear: -Math.abs(cogPY) 
      },
      opex: { 
        actual: -Math.abs(opActual), 
        budget: -Math.abs(opBudget), 
        previousYear: -Math.abs(opPY) 
      }
    };
  });
};

// Get data for a specific BU or total company
export const getDataForBU = (buName: string): MonthlyPLData[] => {
  if (buName === "All Company") {
    return getMonthlyPLData(); // No BU filter = total
  }
  
  // Map display names to BU codes
  const buMap: Record<string, string> = {
    "Equestrian": "BU1_Equestrian",
    "Events": "BU2_Events",
    "Retail": "BU3_Retail",
    "Advisory": "BU4_Advisory"
  };
  
  const buCode = buMap[buName] || buName;
  return getMonthlyPLData(buCode);
};

// Get specific month data
export const getMonthData = (buName: string, month: string): MonthlyPLData | null => {
  const data = getDataForBU(buName);
  return data.find(m => m.month === month) || data[data.length - 1];
};
