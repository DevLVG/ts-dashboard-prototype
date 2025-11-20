// Financial data system using trio_mock_data_v2.json
import mockData from './trio_mock_data_v2.json';

// Type definitions matching the JSON structure
export interface RevenueRecord {
  date: string;
  scenario: 'Actual' | 'Budget_Base' | 'Budget_Worst' | 'Budget_Best';
  bu: string;
  service: string;
  amount: number;
}

export interface CogsRecord {
  date: string;
  scenario: 'Actual' | 'Budget_Base' | 'Budget_Worst' | 'Budget_Best';
  bu: string;
  service: string;
  category: string;
  amount: number;
}

export interface OpexRecord {
  date: string;
  scenario: 'Actual' | 'Budget_Base' | 'Budget_Worst' | 'Budget_Best';
  category: string;
  amount: number;
}

export interface CashRecord {
  date: string;
  scenario: 'Actual' | 'Budget_Base' | 'Budget_Worst' | 'Budget_Best';
  opening_balance: number;
  inflows: number;
  outflows: number;
  closing_balance: number;
}

export interface Metadata {
  generated: string;
  current_date: string;
  date_range: {
    actual: {
      start: string;
      end: string;
    };
    budget: {
      start: string;
      end: string;
    };
  };
  scenarios: {
    Actual: string;
    Budget_Base: string;
    Budget_Worst: string;
    Budget_Best: string;
  };
  structure_note: string;
  overlap_period: string;
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

// Current date from metadata
export const CURRENT_DATE = metadata.current_date; // "2025-11-20"

// Helper to get month label from date
export const getMonthLabel = (date: string): string => {
  const d = new Date(date);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const year = d.getFullYear();
  const month = monthNames[d.getMonth()];
  
  // CRITICAL: Nov 2024 (PY) must return "Nov" to match Nov 2025 for YoY comparison
  if (month === "Nov" && year === 2024) return "Nov";
  if (month === "Dec" && year === 2024) return "Dec '24";
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

// Helper to get offset date for PY comparison (12 months earlier)
const getOffsetDate = (date: string, monthsOffset: number): string => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + monthsOffset);
  return d.toISOString().slice(0, 10);
};

// Get data for a specific date range, scenario, and optional BU
export const getRevenuesForPeriod = (
  scenario: string,
  startDate: string,
  endDate: string,
  bu?: string
): number => {
  const filtered = revenues.filter(r => 
    r.scenario === scenario &&
    r.date >= startDate &&
    r.date <= endDate &&
    (bu ? r.bu === bu : true)
  );
  return filtered.reduce((sum, r) => sum + r.amount, 0);
};

export const getCogsForPeriod = (
  scenario: string,
  startDate: string,
  endDate: string,
  bu?: string
): number => {
  const filtered = cogs.filter(c => 
    c.scenario === scenario &&
    c.date >= startDate &&
    c.date <= endDate &&
    (bu ? c.bu === bu : true)
  );
  return filtered.reduce((sum, c) => sum + c.amount, 0);
};

export const getOpexForPeriod = (
  scenario: string,
  startDate: string,
  endDate: string
): number => {
  const filtered = opex.filter(o => 
    o.scenario === scenario &&
    o.date >= startDate &&
    o.date <= endDate
  );
  return filtered.reduce((sum, o) => sum + o.amount, 0);
};

// Get monthly totals for a specific scenario and BU (LEGACY - kept for compatibility)
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

// Get monthly COGS for a specific scenario and BU (LEGACY - kept for compatibility)
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

// Get monthly OpEx for a specific scenario (LEGACY - kept for compatibility)
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
  da?: { actual: number; budget: number; previousYear: number };
  interest?: { actual: number; budget: number; previousYear: number };
  taxes?: { actual: number; budget: number; previousYear: number };
}

// Type for P&L period data
export interface PLPeriodData {
  actual: {
    revenue: number;
    cogs: number;
    opex: number;
    grossMargin: number;
    ebitda: number;
  };
  budget: {
    revenue: number;
    cogs: number;
    opex: number;
    grossMargin: number;
    ebitda: number;
  };
  previousYear: {
    revenue: number;
    cogs: number;
    opex: number;
    grossMargin: number;
    ebitda: number;
  };
}

// NEW: Get P&L data for a specific period with proper PY offset
export const getPLDataForPeriod = (
  startDate: string,
  endDate: string,
  scenario: 'Budget_Base' | 'Budget_Worst' | 'Budget_Best',
  bu?: string
): PLPeriodData => {
  // Actual data for current period
  const actualRev = getRevenuesForPeriod('Actual', startDate, endDate, bu);
  const actualCogs = getCogsForPeriod('Actual', startDate, endDate, bu);
  const actualOpex = getOpexForPeriod('Actual', startDate, endDate);
  
  // Budget data for current period
  const budgetRev = getRevenuesForPeriod(scenario, startDate, endDate, bu);
  const budgetCogs = getCogsForPeriod(scenario, startDate, endDate, bu);
  const budgetOpex = getOpexForPeriod(scenario, startDate, endDate);
  
  // Previous Year: offset dates by -12 months, use Actual scenario
  const pyStartDate = getOffsetDate(startDate, -12);
  const pyEndDate = getOffsetDate(endDate, -12);
  const pyRev = getRevenuesForPeriod('Actual', pyStartDate, pyEndDate, bu);
  const pyCogs = getCogsForPeriod('Actual', pyStartDate, pyEndDate, bu);
  const pyOpex = getOpexForPeriod('Actual', pyStartDate, pyEndDate);
  
  return {
    actual: {
      revenue: actualRev,
      cogs: actualCogs,
      opex: actualOpex,
      grossMargin: actualRev - actualCogs,
      ebitda: actualRev - actualCogs - actualOpex
    },
    budget: {
      revenue: budgetRev,
      cogs: budgetCogs,
      opex: budgetOpex,
      grossMargin: budgetRev - budgetCogs,
      ebitda: budgetRev - budgetCogs - budgetOpex
    },
    previousYear: {
      revenue: pyRev,
      cogs: pyCogs,
      opex: pyOpex,
      grossMargin: pyRev - pyCogs,
      ebitda: pyRev - pyCogs - pyOpex
    }
  };
};

// IMPROVED: Get monthly P&L data with proper PY calculation
export const getMonthlyPLData = (bu?: string, scenario: 'Budget_Base' | 'Budget_Worst' | 'Budget_Best' = 'Budget_Base'): MonthlyPLData[] => {
  const months = ["Dec '24", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
  
  // Map month labels to actual dates (2024-12 to 2025-11)
  const monthDates: Record<string, string> = {
    "Dec '24": "2024-12",
    "Jan": "2025-01",
    "Feb": "2025-02",
    "Mar": "2025-03",
    "Apr": "2025-04",
    "May": "2025-05",
    "Jun": "2025-06",
    "Jul": "2025-07",
    "Aug": "2025-08",
    "Sep": "2025-09",
    "Oct": "2025-10",
    "Nov": "2025-11"
  };
  
  return months.map(month => {
    const monthKey = monthDates[month];
    const startDate = `${monthKey}-01`;
    const endDate = `${monthKey}-${new Date(parseInt(monthKey.split('-')[0]), parseInt(monthKey.split('-')[1]), 0).getDate()}`;
    
    // Get Actual data
    const revActual = getRevenuesForPeriod('Actual', startDate, endDate, bu);
    const cogActual = getCogsForPeriod('Actual', startDate, endDate, bu);
    const opActual = getOpexForPeriod('Actual', startDate, endDate);
    
    // Get Budget data
    const revBudget = getRevenuesForPeriod(scenario, startDate, endDate, bu);
    const cogBudget = getCogsForPeriod(scenario, startDate, endDate, bu);
    const opBudget = getOpexForPeriod(scenario, startDate, endDate);
    
    // Get PY data (12 months earlier)
    const pyStartDate = getOffsetDate(startDate, -12);
    const pyEndDate = getOffsetDate(endDate, -12);
    const revPY = getRevenuesForPeriod('Actual', pyStartDate, pyEndDate, bu);
    const cogPY = getCogsForPeriod('Actual', pyStartDate, pyEndDate, bu);
    const opPY = getOpexForPeriod('Actual', pyStartDate, pyEndDate);
    
    return {
      month,
      revenues: { 
        actual: revActual, 
        budget: revBudget, 
        previousYear: revPY 
      },
      cogs: { 
        actual: cogActual, 
        budget: cogBudget, 
        previousYear: cogPY 
      },
      opex: { 
        actual: opActual, 
        budget: opBudget, 
        previousYear: opPY 
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
