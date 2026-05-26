// Working Capital & Cash Flow Statement data for C3b
// Derived from Trio Sporting operational data patterns
// WC = Receivables + Inventory - Payables

export interface WorkingCapitalMonth {
  month: string;
  monthKey: string; // YYYY-MM for sorting
  receivables: { actual: number; budget: number };
  inventory: { actual: number; budget: number };
  payables: { actual: number; budget: number };
  netWC: { actual: number; budget: number };
}

export interface CashFlowStatementMonth {
  month: string;
  monthKey: string;
  operating: {
    ebitda: { actual: number; budget: number };
    wcChange: { actual: number; budget: number };
    otherOperating: { actual: number; budget: number };
    total: { actual: number; budget: number };
  };
  investing: {
    capex: { actual: number; budget: number };
    otherInvesting: { actual: number; budget: number };
    total: { actual: number; budget: number };
  };
  financing: {
    loanRepayment: { actual: number; budget: number };
    otherFinancing: { actual: number; budget: number };
    total: { actual: number; budget: number };
  };
  netCashFlow: { actual: number; budget: number };
  openingBalance: { actual: number; budget: number };
  closingBalance: { actual: number; budget: number };
}

// Working Capital monthly data (Dec 2024 – Nov 2025)
// Realistic pattern: AR grows with revenue seasonality, inventory stable, AP follows procurement cycles
export const workingCapitalData: WorkingCapitalMonth[] = [
  {
    month: "Dec '24", monthKey: "2024-12",
    receivables: { actual: 680000, budget: 650000 },
    inventory: { actual: 220000, budget: 210000 },
    payables: { actual: 410000, budget: 400000 },
    netWC: { actual: 490000, budget: 460000 },
  },
  {
    month: "Jan", monthKey: "2025-01",
    receivables: { actual: 710000, budget: 670000 },
    inventory: { actual: 235000, budget: 215000 },
    payables: { actual: 420000, budget: 405000 },
    netWC: { actual: 525000, budget: 480000 },
  },
  {
    month: "Feb", monthKey: "2025-02",
    receivables: { actual: 690000, budget: 660000 },
    inventory: { actual: 240000, budget: 215000 },
    payables: { actual: 430000, budget: 410000 },
    netWC: { actual: 500000, budget: 465000 },
  },
  {
    month: "Mar", monthKey: "2025-03",
    receivables: { actual: 750000, budget: 700000 },
    inventory: { actual: 250000, budget: 220000 },
    payables: { actual: 440000, budget: 420000 },
    netWC: { actual: 560000, budget: 500000 },
  },
  {
    month: "Apr", monthKey: "2025-04",
    receivables: { actual: 730000, budget: 690000 },
    inventory: { actual: 245000, budget: 218000 },
    payables: { actual: 435000, budget: 415000 },
    netWC: { actual: 540000, budget: 493000 },
  },
  {
    month: "May", monthKey: "2025-05",
    receivables: { actual: 700000, budget: 670000 },
    inventory: { actual: 230000, budget: 212000 },
    payables: { actual: 425000, budget: 408000 },
    netWC: { actual: 505000, budget: 474000 },
  },
  {
    month: "Jun", monthKey: "2025-06",
    receivables: { actual: 720000, budget: 680000 },
    inventory: { actual: 235000, budget: 215000 },
    payables: { actual: 430000, budget: 410000 },
    netWC: { actual: 525000, budget: 485000 },
  },
  {
    month: "Jul", monthKey: "2025-07",
    receivables: { actual: 760000, budget: 690000 },
    inventory: { actual: 245000, budget: 218000 },
    payables: { actual: 420000, budget: 412000 },
    netWC: { actual: 585000, budget: 496000 },
  },
  {
    month: "Aug", monthKey: "2025-08",
    receivables: { actual: 800000, budget: 710000 },
    inventory: { actual: 260000, budget: 222000 },
    payables: { actual: 450000, budget: 425000 },
    netWC: { actual: 610000, budget: 507000 },
  },
  {
    month: "Sep", monthKey: "2025-09",
    receivables: { actual: 780000, budget: 700000 },
    inventory: { actual: 255000, budget: 220000 },
    payables: { actual: 445000, budget: 418000 },
    netWC: { actual: 590000, budget: 502000 },
  },
  {
    month: "Oct", monthKey: "2025-10",
    receivables: { actual: 820000, budget: 720000 },
    inventory: { actual: 265000, budget: 225000 },
    payables: { actual: 440000, budget: 420000 },
    netWC: { actual: 645000, budget: 525000 },
  },
  {
    month: "Nov", monthKey: "2025-11",
    receivables: { actual: 850000, budget: 730000 },
    inventory: { actual: 270000, budget: 228000 },
    payables: { actual: 435000, budget: 415000 },
    netWC: { actual: 685000, budget: 543000 },
  },
];

// Cash Flow Statement monthly data
// Operating = EBITDA +/- WC change + other adjustments
// Investing = CapEx + asset purchases
// Financing = Loan repayments + equity movements
export const cashFlowStatementData: CashFlowStatementMonth[] = (() => {
  const months = workingCapitalData;
  let actualBalance = 2800000; // Opening Dec 2024
  let budgetBalance = 2800000;

  return months.map((wc, i) => {
    // WC change = prior month WC - current month WC (cash impact: WC increase = cash outflow)
    const prevWC = i > 0 ? months[i - 1] : null;
    const wcChangeActual = prevWC ? -(wc.netWC.actual - prevWC.netWC.actual) : 0;
    const wcChangeBudget = prevWC ? -(wc.netWC.budget - prevWC.netWC.budget) : 0;

    // EBITDA from P&L patterns (approximate, consistent with existing data)
    const ebitdaActuals = [150000, 145000, 138000, 180000, 155000, 130000, 140000, 125000, 175000, 135000, 115000, 120000];
    const ebitdaBudgets = [160000, 165000, 155000, 175000, 170000, 160000, 155000, 160000, 150000, 155000, 165000, 150000];

    const ebitdaActual = ebitdaActuals[i];
    const ebitdaBudget = ebitdaBudgets[i];

    // Other operating (D&A add-back already in EBITDA, minor tax/interest adjustments)
    const otherOpActual = -15000 + Math.round((Math.random() - 0.5) * 10000);
    const otherOpBudget = -12000;

    const opTotalActual = ebitdaActual + wcChangeActual + otherOpActual;
    const opTotalBudget = ebitdaBudget + wcChangeBudget + otherOpBudget;

    // CapEx pattern (higher in Q1 and Q3 for facility improvements)
    const capexActuals = [-80000, -45000, -35000, -120000, -50000, -40000, -55000, -65000, -110000, -45000, -50000, -60000];
    const capexBudgets = [-70000, -50000, -40000, -100000, -55000, -45000, -50000, -60000, -90000, -50000, -55000, -55000];
    const capexActual = capexActuals[i];
    const capexBudget = capexBudgets[i];

    const invTotalActual = capexActual;
    const invTotalBudget = capexBudget;

    // Financing: loan repayment steady, occasional equity
    const loanActual = -30000;
    const loanBudget = -30000;
    const otherFinActual = i === 0 ? 0 : 0; // No equity movements in this period
    const otherFinBudget = 0;

    const finTotalActual = loanActual + otherFinActual;
    const finTotalBudget = loanBudget + otherFinBudget;

    const netActual = opTotalActual + invTotalActual + finTotalActual;
    const netBudget = opTotalBudget + invTotalBudget + finTotalBudget;

    const openActual = actualBalance;
    const openBudget = budgetBalance;
    actualBalance += netActual;
    budgetBalance += netBudget;

    return {
      month: wc.month,
      monthKey: wc.monthKey,
      operating: {
        ebitda: { actual: ebitdaActual, budget: ebitdaBudget },
        wcChange: { actual: wcChangeActual, budget: wcChangeBudget },
        otherOperating: { actual: otherOpActual, budget: otherOpBudget },
        total: { actual: opTotalActual, budget: opTotalBudget },
      },
      investing: {
        capex: { actual: capexActual, budget: capexBudget },
        otherInvesting: { actual: 0, budget: 0 },
        total: { actual: invTotalActual, budget: invTotalBudget },
      },
      financing: {
        loanRepayment: { actual: loanActual, budget: loanBudget },
        otherFinancing: { actual: otherFinActual, budget: otherFinBudget },
        total: { actual: finTotalActual, budget: finTotalBudget },
      },
      netCashFlow: { actual: netActual, budget: netBudget },
      openingBalance: { actual: openActual, budget: openBudget },
      closingBalance: { actual: actualBalance, budget: budgetBalance },
    };
  });
})();

// Helper: get WC change drivers for drill-down explanation
export const getWCChangeDrivers = (monthIndex: number): Array<{
  driver: string;
  impact: number;
  explanation: string;
}> => {
  if (monthIndex <= 0) return [];
  const curr = workingCapitalData[monthIndex];
  const prev = workingCapitalData[monthIndex - 1];

  const arChange = -(curr.receivables.actual - prev.receivables.actual);
  const invChange = -(curr.inventory.actual - prev.inventory.actual);
  const apChange = curr.payables.actual - prev.payables.actual;

  const drivers = [];
  if (arChange !== 0) {
    drivers.push({
      driver: "Receivables",
      impact: arChange,
      explanation: arChange < 0
        ? "AR grew — customers paying slower or higher billings"
        : "AR shrank — faster collections",
    });
  }
  if (invChange !== 0) {
    drivers.push({
      driver: "Inventory",
      impact: invChange,
      explanation: invChange < 0
        ? "Inventory build-up — seasonal stock or slow-moving items"
        : "Inventory reduced — efficient sell-through",
    });
  }
  if (apChange !== 0) {
    drivers.push({
      driver: "Payables",
      impact: apChange,
      explanation: apChange > 0
        ? "Payables increased — extended vendor terms (positive for cash)"
        : "Payables decreased — faster vendor payments (cash outflow)",
    });
  }
  return drivers;
};
