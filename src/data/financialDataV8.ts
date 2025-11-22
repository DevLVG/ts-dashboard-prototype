import mockDataV9 from './trio_mock_data_v9.json';

export const cashRecords = mockDataV9.cash;
export const capexRecords = mockDataV9.capex;
export const equityRecords = mockDataV9.equity;

const CURRENT_DATE = new Date().toISOString().split('T')[0];

// Mapping BU names to codes
export const buMap: Record<string, string> = {
  "Equestrian": "BU1_Equestrian",
  "Events": "BU2_Events",
  "Retail": "BU3_Retail",
  "Advisory": "BU4_Advisory"
};

// Converte "Jan" → "2025-01-01"
const getMonthDate = (monthLabel: string): string => {
  const monthMap: Record<string, string> = {
    "Dec '24": "2024-12-01",
    "Jan": "2025-01-01",
    "Feb": "2025-02-01",
    "Mar": "2025-03-01",
    "Apr": "2025-04-01",
    "May": "2025-05-01",
    "Jun": "2025-06-01",
    "Jul": "2025-07-01",
    "Aug": "2025-08-01",
    "Sep": "2025-09-01",
    "Oct": "2025-10-01",
    "Nov": "2025-11-01"
  };
  return monthMap[monthLabel] || "2025-01-01";
};

// Ottiene data PY (-12 mesi)
export const getPYDate = (date: string): string => {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
};

// Primo giorno del mese
export const getMonthStart = (date: string = CURRENT_DATE): string => {
  return date.slice(0, 8) + "01"; // "2025-11-20" → "2025-11-01"
};

// Get current cash balance (to-date calculation)
export const getCashBalance = (
  scenario: string,
  date: string = CURRENT_DATE,
  bu?: string
): number => {
  if (!bu || bu === 'All Company') {
    // Enterprise-level: calculate actual cash position to date
    let cash = 3500000; // Starting equity
    
    // Add equity injections
    cash += equityRecords
      .filter(e => e.scenario === scenario && e.date <= date)
      .reduce((sum, e) => sum + e.amount, 0);
    
    // Subtract capex (when cash paid)
    cash -= capexRecords
      .filter(c => c.scenario === scenario && c.cash_date <= date)
      .reduce((sum, c) => sum + c.amount, 0);
    
    // Add revenues (when cash received)
    cash += mockDataV9.revenues
      .filter(r => r.scenario === scenario && r.cash_date <= date)
      .reduce((sum, r) => sum + r.amount, 0);
    
    // Subtract expenses (when cash paid)
    const expenses = [
      ...mockDataV9.cogs.filter(x => x.scenario === scenario && x.cash_date <= date),
      ...mockDataV9.opex.filter(x => x.scenario === scenario && x.cash_date <= date)
    ];
    cash -= expenses.reduce((sum, x) => sum + x.amount, 0);
    
    return cash;
  }
  
  // BU-specific: calculate cumulative cash position from historical flows
  const buRecords = cashRecords.filter(r => 
    r.scenario === scenario && 
    r.bu === bu &&
    r.date <= date
  );
  
  if (buRecords.length === 0) return 0;
  
  // Starting equity (Dec 2023 baseline)
  const startingCash = 3500000;
  
  // Sum all historical flows for this BU
  const cumulativeFlow = buRecords.reduce((sum, r) => 
    sum + (r.in - r.out), 0
  );
  
  return startingCash + cumulativeFlow;
};

// Calculate monthly cash flow (net change in cash balance)
export const getMonthlyBurn = (
  startDate: string,
  endDate: string,
  scenario: string,
  bu?: string
): number => {
  // Get the month start date (YYYY-MM-01)
  const monthStart = getMonthStart(startDate);
  
  // v9: Cash records now have bu field for flows (in/out)
  // open/close are enterprise-level (same for all BUs)
  
  if (!bu || bu === 'All Company') {
    // Sum cash flows across all BUs
    const records = cashRecords.filter(r =>
      r.scenario === scenario &&
      r.date === monthStart
    );
    
    if (records.length === 0) return 0;
    
    // Sum (in - out) for all BUs
    return records.reduce((sum, r) => sum + (r.in - r.out), 0);
  } else {
    // Single BU cash flow
    const record = cashRecords.find(r =>
      r.scenario === scenario &&
      r.date === monthStart &&
      r.bu === bu
    );
    
    if (!record) return 0;
    return record.in - record.out;
  }
};

// Calculate outstanding payables
export const getPayables = (
  scenario: string,
  currentDate: string = CURRENT_DATE,
  bu?: string
): { amount: number; avgAgingMonths: number } => {
  // Filter COGS + OPEX + CapEx where:
  // - Transaction already happened (date <= currentDate)
  // - Not yet paid (cash_date > currentDate)
  const cogsOutstanding = mockDataV9.cogs.filter(t => 
    t.scenario === scenario && 
    t.date <= currentDate &&
    t.cash_date > currentDate &&
    (bu ? t.bu === bu : true)
  );
  
  const opexOutstanding = mockDataV9.opex.filter(t => 
    t.scenario === scenario && 
    t.date <= currentDate &&
    t.cash_date > currentDate &&
    (bu ? t.bu === bu : true)
  );
  
  const capexOutstanding = capexRecords.filter(t => 
    t.scenario === scenario && 
    t.date <= currentDate &&
    t.cash_date > currentDate
  );
  
  const outstanding = [...cogsOutstanding, ...opexOutstanding, ...capexOutstanding];
  
  if (outstanding.length === 0) {
    return { amount: 0, avgAgingMonths: 0 };
  }
  
  const totalAmount = outstanding.reduce((sum, t) => sum + t.amount, 0);
  
  // Weighted average aging in days
  const weightedDays = outstanding.reduce((sum, t) => {
    const days = (new Date(currentDate).getTime() - new Date(t.date).getTime()) / (1000 * 60 * 60 * 24);
    return sum + (days * t.amount);
  }, 0);
  
  const avgAgingMonths = totalAmount > 0 ? (weightedDays / totalAmount) / 30 : 0;
  
  return { amount: totalAmount, avgAgingMonths: Math.max(0, avgAgingMonths) };
};

// Calculate outstanding receivables
export const getReceivables = (
  scenario: string,
  currentDate: string = CURRENT_DATE,
  bu?: string
): { amount: number; avgAgingMonths: number } => {
  // Filter revenues where:
  // - Transaction already happened (date <= currentDate)
  // - Not yet collected (cash_date > currentDate)
  const outstanding = mockDataV9.revenues.filter(t =>
    t.scenario === scenario &&
    t.date <= currentDate &&
    t.cash_date > currentDate &&
    (bu ? t.bu === bu : true)
  );
  
  if (outstanding.length === 0) {
    return { amount: 0, avgAgingMonths: 0 };
  }
  
  const totalAmount = outstanding.reduce((sum, t) => sum + t.amount, 0);
  
  const weightedDays = outstanding.reduce((sum, t) => {
    const days = (new Date(currentDate).getTime() - new Date(t.date).getTime()) / (1000 * 60 * 60 * 24);
    return sum + (days * t.amount);
  }, 0);
  
  const avgAgingMonths = totalAmount > 0 ? (weightedDays / totalAmount) / 30 : 0;
  
  return { amount: totalAmount, avgAgingMonths: Math.max(0, avgAgingMonths) };
};

// Get monthly cash balances for chart
export const getMonthlyCashBalances = (
  scenario: string,
  bu?: string
): Array<{ month: string; actual: number; budget: number }> => {
  const months = ["Dec '24", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
  
  return months.map(month => {
    const monthDate = getMonthDate(month);
    const yearMonth = monthDate.slice(0, 7); // "2025-01"
    
    const actualRecord = cashRecords.find(r =>
      r.scenario === 'Actual' &&
      r.date.startsWith(yearMonth)
    );
    
    const budgetRecord = cashRecords.find(r =>
      r.scenario === scenario &&
      r.date.startsWith(yearMonth)
    );
    
    return {
      month,
      actual: actualRecord?.close || 0,
      budget: budgetRecord?.close || 0
    };
  });
};
