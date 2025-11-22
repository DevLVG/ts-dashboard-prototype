import mockDataV8 from './trio_mock_data_v8.json';

export const cashRecords = mockDataV8.cash;
export const capexRecords = mockDataV8.capex;
export const equityRecords = mockDataV8.equity;

const CURRENT_DATE = "2025-11-20";

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

// Get current cash balance (uses month start date for closing balance)
export const getCashBalance = (
  scenario: string,
  date: string = CURRENT_DATE,
  bu?: string
): number => {
  // For cash balance, we want the closing balance at the start of the month
  const monthStartDate = getMonthStart(date);
  
  // Filter records by scenario and date
  // Note: cash table has one record per date per scenario (company-wide)
  const records = cashRecords.filter(r => 
    r.scenario === scenario && 
    r.date === monthStartDate
  );
  
  if (records.length === 0) return 0;
  return records[0]?.close || 0;
};

// Calculate monthly cash flow (net change in cash balance)
export const getMonthlyBurn = (
  startDate: string,
  endDate: string,
  scenario: string
): number => {
  // Get the month start date (YYYY-MM-01)
  const monthStart = getMonthStart(startDate);
  
  // Find the cash record for this month
  const record = cashRecords.find(r =>
    r.scenario === scenario &&
    r.date === monthStart
  );
  
  if (!record) return 0;
  
  // Monthly burn = closing balance - opening balance
  // Positive = cash increased, Negative = cash decreased
  return record.close - record.open;
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
  const cogsOutstanding = mockDataV8.cogs.filter(t => 
    t.scenario === scenario && 
    t.date <= currentDate &&
    t.cash_date > currentDate &&
    (bu ? t.bu === bu : true)
  );
  
  const opexOutstanding = mockDataV8.opex.filter(t => 
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
  const outstanding = mockDataV8.revenues.filter(t =>
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
