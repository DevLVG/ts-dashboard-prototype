// Centralized P&L data structure for all dashboards
// This ensures consistency across all charts and components

export interface MonthlyPLData {
  month: string;
  revenues: { actual: number; budget: number; previousYear: number };
  cogs: { actual: number; budget: number; previousYear: number };
  opex: { actual: number; budget: number; previousYear: number };
  da: { actual: number; budget: number; previousYear: number };
  interest: { actual: number; budget: number; previousYear: number };
  taxes: { actual: number; budget: number; previousYear: number };
}

export interface BUData {
  name: string;
  monthlyData: MonthlyPLData[];
}

// Color threshold configuration
export const COLOR_THRESHOLDS = {
  POSITIVE_THRESHOLD: 5,   // >= 5% variance = green (for revenues, margins)
  NEGATIVE_THRESHOLD: -5,  // <= -5% variance = red (for revenues, margins)
  // For costs (COGS, OpEx, etc.), logic is inverted: lower actual vs budget is better
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

// Business Units
export const businessUnits = ["Equestrian", "Events", "Hospitality"];

// Centralized monthly P&L data for each BU
export const buMonthlyPLData: BUData[] = [
  {
    name: "Equestrian",
    monthlyData: [
      {
        month: "Dec '24",
        revenues: { actual: 620000, budget: 680000, previousYear: 650000 },
        cogs: { actual: -310000, budget: -340000, previousYear: -325000 },
        opex: { actual: -195000, budget: -185000, previousYear: -190000 },
        da: { actual: -15000, budget: -16000, previousYear: -15500 },
        interest: { actual: -3500, budget: -4000, previousYear: -3800 },
        taxes: { actual: -19000, budget: -27000, previousYear: -23000 }
      },
      { month: "Jan", revenues: { actual: 610000, budget: 690000, previousYear: 665000 }, cogs: { actual: -305000, budget: -345000, previousYear: -332500 }, opex: { actual: -192000, budget: -188000, previousYear: -195000 }, da: { actual: -15000, budget: -16000, previousYear: -16000 }, interest: { actual: -3500, budget: -4000, previousYear: -4000 }, taxes: { actual: -18500, budget: -27500, previousYear: -24000 } },
      { month: "Feb", revenues: { actual: 595000, budget: 675000, previousYear: 640000 }, cogs: { actual: -297500, budget: -337500, previousYear: -320000 }, opex: { actual: -188000, budget: -184000, previousYear: -187000 }, da: { actual: -14500, budget: -15500, previousYear: -15000 }, interest: { actual: -3400, budget: -3900, previousYear: -3700 }, taxes: { actual: -18000, budget: -26500, previousYear: -22500 } },
      { month: "Mar", revenues: { actual: 640000, budget: 720000, previousYear: 685000 }, cogs: { actual: -320000, budget: -360000, previousYear: -342500 }, opex: { actual: -201000, budget: -193000, previousYear: -200000 }, da: { actual: -15500, budget: -16500, previousYear: -16000 }, interest: { actual: -3600, budget: -4100, previousYear: -4000 }, taxes: { actual: -20000, budget: -29000, previousYear: -24500 } },
      { month: "Apr", revenues: { actual: 625000, budget: 710000, previousYear: 670000 }, cogs: { actual: -312500, budget: -355000, previousYear: -335000 }, opex: { actual: -196000, budget: -190000, previousYear: -196000 }, da: { actual: -15000, budget: -16000, previousYear: -15500 }, interest: { actual: -3500, budget: -4000, previousYear: -3900 }, taxes: { actual: -19500, budget: -28500, previousYear: -24000 } },
      { month: "May", revenues: { actual: 590000, budget: 695000, previousYear: 655000 }, cogs: { actual: -295000, budget: -347500, previousYear: -327500 }, opex: { actual: -186000, budget: -187000, previousYear: -191000 }, da: { actual: -14500, budget: -15500, previousYear: -15000 }, interest: { actual: -3400, budget: -3900, previousYear: -3800 }, taxes: { actual: -18000, budget: -28000, previousYear: -23500 } },
      { month: "Jun", revenues: { actual: 615000, budget: 705000, previousYear: 675000 }, cogs: { actual: -307500, budget: -352500, previousYear: -337500 }, opex: { actual: -193000, budget: -188000, previousYear: -197000 }, da: { actual: -15000, budget: -16000, previousYear: -15500 }, interest: { actual: -3500, budget: -4000, previousYear: -3900 }, taxes: { actual: -19000, budget: -28500, previousYear: -24000 } },
      { month: "Jul", revenues: { actual: 605000, budget: 695000, previousYear: 660000 }, cogs: { actual: -302500, budget: -347500, previousYear: -330000 }, opex: { actual: -190000, budget: -186000, previousYear: -193000 }, da: { actual: -15000, budget: -15500, previousYear: -15000 }, interest: { actual: -3500, budget: -3900, previousYear: -3800 }, taxes: { actual: -18500, budget: -28000, previousYear: -23500 } },
      { month: "Aug", revenues: { actual: 635000, budget: 715000, previousYear: 690000 }, cogs: { actual: -317500, budget: -357500, previousYear: -345000 }, opex: { actual: -199000, budget: -191000, previousYear: -201000 }, da: { actual: -15500, budget: -16500, previousYear: -16000 }, interest: { actual: -3600, budget: -4000, previousYear: -4000 }, taxes: { actual: -19500, budget: -29000, previousYear: -24500 } },
      { month: "Sep", revenues: { actual: 610000, budget: 700000, previousYear: 665000 }, cogs: { actual: -305000, budget: -350000, previousYear: -332500 }, opex: { actual: -192000, budget: -188000, previousYear: -194000 }, da: { actual: -15000, budget: -16000, previousYear: -15500 }, interest: { actual: -3500, budget: -4000, previousYear: -3900 }, taxes: { actual: -18500, budget: -28500, previousYear: -23500 } },
      { month: "Oct", revenues: { actual: 595000, budget: 705000, previousYear: 670000 }, cogs: { actual: -297500, budget: -352500, previousYear: -335000 }, opex: { actual: -187000, budget: -189000, previousYear: -195000 }, da: { actual: -14500, budget: -16000, previousYear: -15500 }, interest: { actual: -3400, budget: -4000, previousYear: -3900 }, taxes: { actual: -18000, budget: -28500, previousYear: -24000 } },
      { month: "Nov", revenues: { actual: 600000, budget: 700000, previousYear: 660000 }, cogs: { actual: -300000, budget: -350000, previousYear: -330000 }, opex: { actual: -190000, budget: -188000, previousYear: -192000 }, da: { actual: -15000, budget: -16000, previousYear: -15500 }, interest: { actual: -3500, budget: -4000, previousYear: -3800 }, taxes: { actual: -18500, budget: -28000, previousYear: -23500 } }
    ]
  },
  {
    name: "Events",
    monthlyData: [
      {
        month: "Dec '24",
        revenues: { actual: 195000, budget: 245000, previousYear: 220000 },
        cogs: { actual: -117000, budget: -122500, previousYear: -110000 },
        opex: { actual: -88000, budget: -85000, previousYear: -82000 },
        da: { actual: -5500, budget: -6000, previousYear: -5800 },
        interest: { actual: -1200, budget: -1500, previousYear: -1400 },
        taxes: { actual: -4200, budget: -6000, previousYear: -5100 }
      },
      { month: "Jan", revenues: { actual: 190000, budget: 248000, previousYear: 225000 }, cogs: { actual: -114000, budget: -124000, previousYear: -112500 }, opex: { actual: -86000, budget: -86000, previousYear: -84000 }, da: { actual: -5500, budget: -6000, previousYear: -6000 }, interest: { actual: -1200, budget: -1500, previousYear: -1500 }, taxes: { actual: -4000, budget: -6100, previousYear: -5200 } },
      { month: "Feb", revenues: { actual: 185000, budget: 242000, previousYear: 215000 }, cogs: { actual: -111000, budget: -121000, previousYear: -107500 }, opex: { actual: -84000, budget: -84000, previousYear: -80000 }, da: { actual: -5000, budget: -5500, previousYear: -5300 }, interest: { actual: -1100, budget: -1400, previousYear: -1300 }, taxes: { actual: -3800, budget: -6000, previousYear: -5000 } },
      { month: "Mar", revenues: { actual: 210000, budget: 255000, previousYear: 235000 }, cogs: { actual: -126000, budget: -127500, previousYear: -117500 }, opex: { actual: -95000, budget: -89000, previousYear: -88000 }, da: { actual: -5500, budget: -6500, previousYear: -6000 }, interest: { actual: -1300, budget: -1600, previousYear: -1500 }, taxes: { actual: -4400, budget: -6500, previousYear: -5500 } },
      { month: "Apr", revenues: { actual: 205000, budget: 252000, previousYear: 230000 }, cogs: { actual: -123000, budget: -126000, previousYear: -115000 }, opex: { actual: -93000, budget: -88000, previousYear: -86000 }, da: { actual: -5500, budget: -6000, previousYear: -5800 }, interest: { actual: -1200, budget: -1500, previousYear: -1400 }, taxes: { actual: -4300, budget: -6400, previousYear: -5400 } },
      { month: "May", revenues: { actual: 180000, budget: 246000, previousYear: 222000 }, cogs: { actual: -108000, budget: -123000, previousYear: -111000 }, opex: { actual: -82000, budget: -85000, previousYear: -83000 }, da: { actual: -5000, budget: -5500, previousYear: -5500 }, interest: { actual: -1100, budget: -1400, previousYear: -1400 }, taxes: { actual: -3700, budget: -6300, previousYear: -5200 } },
      { month: "Jun", revenues: { actual: 195000, budget: 249000, previousYear: 227000 }, cogs: { actual: -117000, budget: -124500, previousYear: -113500 }, opex: { actual: -88000, budget: -86000, previousYear: -85000 }, da: { actual: -5500, budget: -6000, previousYear: -5800 }, interest: { actual: -1200, budget: -1500, previousYear: -1400 }, taxes: { actual: -4200, budget: -6200, previousYear: -5300 } },
      { month: "Jul", revenues: { actual: 188000, budget: 244000, previousYear: 218000 }, cogs: { actual: -112800, budget: -122000, previousYear: -109000 }, opex: { actual: -85000, budget: -85000, previousYear: -81000 }, da: { actual: -5000, budget: -5500, previousYear: -5300 }, interest: { actual: -1100, budget: -1400, previousYear: -1300 }, taxes: { actual: -4000, budget: -6100, previousYear: -5100 } },
      { month: "Aug", revenues: { actual: 215000, budget: 256000, previousYear: 238000 }, cogs: { actual: -129000, budget: -128000, previousYear: -119000 }, opex: { actual: -97000, budget: -89000, previousYear: -89000 }, da: { actual: -5500, budget: -6500, previousYear: -6000 }, interest: { actual: -1300, budget: -1600, previousYear: -1500 }, taxes: { actual: -4500, budget: -6600, previousYear: -5600 } },
      { month: "Sep", revenues: { actual: 198000, budget: 251000, previousYear: 228000 }, cogs: { actual: -118800, budget: -125500, previousYear: -114000 }, opex: { actual: -90000, budget: -87000, previousYear: -85000 }, da: { actual: -5500, budget: -6000, previousYear: -5800 }, interest: { actual: -1200, budget: -1500, previousYear: -1400 }, taxes: { actual: -4100, budget: -6300, previousYear: -5400 } },
      { month: "Oct", revenues: { actual: 192000, budget: 248000, previousYear: 224000 }, cogs: { actual: -115200, budget: -124000, previousYear: -112000 }, opex: { actual: -87000, budget: -86000, previousYear: -83000 }, da: { actual: -5000, budget: -6000, previousYear: -5500 }, interest: { actual: -1100, budget: -1500, previousYear: -1400 }, taxes: { actual: -4000, budget: -6200, previousYear: -5300 } },
      { month: "Nov", revenues: { actual: 200000, budget: 250000, previousYear: 226000 }, cogs: { actual: -120000, budget: -125000, previousYear: -113000 }, opex: { actual: -91000, budget: -87000, previousYear: -84000 }, da: { actual: -5500, budget: -6000, previousYear: -5800 }, interest: { actual: -1200, budget: -1500, previousYear: -1400 }, taxes: { actual: -4200, budget: -6200, previousYear: -5400 } }
    ]
  },
  {
    name: "Hospitality",
    monthlyData: [
      {
        month: "Dec '24",
        revenues: { actual: 35000, budget: 75000, previousYear: 45000 },
        cogs: { actual: -24500, budget: -37500, previousYear: -22500 },
        opex: { actual: -45000, budget: -43000, previousYear: -41000 },
        da: { actual: -3500, budget: -4000, previousYear: -3800 },
        interest: { actual: -300, budget: -500, previousYear: -400 },
        taxes: { actual: -900, budget: -2000, previousYear: -1100 }
      },
      { month: "Jan", revenues: { actual: 50000, budget: 62000, previousYear: 55000 }, cogs: { actual: -35000, budget: -31000, previousYear: -27500 }, opex: { actual: -47000, budget: -44000, previousYear: -43000 }, da: { actual: -3500, budget: -4000, previousYear: -4000 }, interest: { actual: -300, budget: -500, previousYear: -500 }, taxes: { actual: -1100, budget: -1600, previousYear: -1300 } },
      { month: "Feb", revenues: { actual: 40000, budget: 83000, previousYear: 60000 }, cogs: { actual: -28000, budget: -41500, previousYear: -30000 }, opex: { actual: -43000, budget: -46000, previousYear: -44000 }, da: { actual: -3000, budget: -3500, previousYear: -3500 }, interest: { actual: -200, budget: -400, previousYear: -400 }, taxes: { actual: -800, budget: -2100, previousYear: -1400 } },
      { month: "Mar", revenues: { actual: 100000, budget: 25000, previousYear: 52000 }, cogs: { actual: -70000, budget: -12500, previousYear: -26000 }, opex: { actual: -55000, budget: -37000, previousYear: -42000 }, da: { actual: -4000, budget: -2500, previousYear: -3800 }, interest: { actual: -400, budget: -200, previousYear: -400 }, taxes: { actual: -1500, budget: -600, previousYear: -1200 } },
      { month: "Apr", revenues: { actual: 20000, budget: 38000, previousYear: 35000 }, cogs: { actual: -14000, budget: -19000, previousYear: -17500 }, opex: { actual: -42000, budget: -40000, previousYear: -39000 }, da: { actual: -3000, budget: -3000, previousYear: -3200 }, interest: { actual: -200, budget: -300, previousYear: -300 }, taxes: { actual: -700, budget: -1000, previousYear: -900 } },
      { month: "May", revenues: { actual: 60000, budget: 59000, previousYear: 57000 }, cogs: { actual: -42000, budget: -29500, previousYear: -28500 }, opex: { actual: -48000, budget: -43000, previousYear: -42000 }, da: { actual: -3500, budget: -3500, previousYear: -3700 }, interest: { actual: -300, budget: -400, previousYear: -400 }, taxes: { actual: -1200, budget: -1500, previousYear: -1400 } },
      { month: "Jun", revenues: { actual: 110000, budget: 46000, previousYear: 48000 }, cogs: { actual: -77000, budget: -23000, previousYear: -24000 }, opex: { actual: -57000, budget: -41000, previousYear: -40000 }, da: { actual: -4000, budget: -3000, previousYear: -3500 }, interest: { actual: -400, budget: -300, previousYear: -350 }, taxes: { actual: -1600, budget: -1100, previousYear: -1150 } },
      { month: "Jul", revenues: { actual: 87000, budget: 31000, previousYear: 42000 }, cogs: { actual: -60900, budget: -15500, previousYear: -21000 }, opex: { actual: -53000, budget: -38000, previousYear: -39000 }, da: { actual: -3500, budget: -2500, previousYear: -3200 }, interest: { actual: -300, budget: -200, previousYear: -300 }, taxes: { actual: -1400, budget: -800, previousYear: -1000 } },
      { month: "Aug", revenues: { actual: 200000, budget: 29000, previousYear: 50000 }, cogs: { actual: -140000, budget: -14500, previousYear: -25000 }, opex: { actual: -65000, budget: -37000, previousYear: -41000 }, da: { actual: -5000, budget: -2500, previousYear: -3800 }, interest: { actual: -500, budget: -200, previousYear: -400 }, taxes: { actual: -2000, budget: -700, previousYear: -1100 } },
      { month: "Sep", revenues: { actual: 142000, budget: 49000, previousYear: 53000 }, cogs: { actual: -99400, budget: -24500, previousYear: -26500 }, opex: { actual: -60000, budget: -42000, previousYear: -41000 }, da: { actual: -4500, budget: -3000, previousYear: -3700 }, interest: { actual: -400, budget: -300, previousYear: -400 }, taxes: { actual: -1800, budget: -1200, previousYear: -1300 } },
      { month: "Oct", revenues: { actual: 103000, budget: 47000, previousYear: 51000 }, cogs: { actual: -72100, budget: -23500, previousYear: -25500 }, opex: { actual: -56000, budget: -41000, previousYear: -40000 }, da: { actual: -4000, budget: -3000, previousYear: -3600 }, interest: { actual: -400, budget: -300, previousYear: -350 }, taxes: { actual: -1600, budget: -1100, previousYear: -1250 } },
      { month: "Nov", revenues: { actual: 50000, budget: 50000, previousYear: 48000 }, cogs: { actual: -35000, budget: -25000, previousYear: -24000 }, opex: { actual: -47000, budget: -42000, previousYear: -41000 }, da: { actual: -3500, budget: -3000, previousYear: -3500 }, interest: { actual: -300, budget: -300, previousYear: -350 }, taxes: { actual: -1100, budget: -1200, previousYear: -1150 } }
    ]
  }
];

// Helper functions to derive calculated values
export const calculateGM = (revenues: number, cogs: number) => revenues + cogs;
export const calculateEBITDA = (revenues: number, cogs: number, opex: number) => revenues + cogs + opex;
export const calculateEBT = (revenues: number, cogs: number, opex: number, da: number, interest: number) => revenues + cogs + opex + da + interest;
export const calculateNetIncome = (revenues: number, cogs: number, opex: number, da: number, interest: number, taxes: number) => revenues + cogs + opex + da + interest + taxes;

// Get total company data by aggregating all BUs
export const getTotalCompanyData = (): MonthlyPLData[] => {
  const months = buMonthlyPLData[0].monthlyData.map(m => m.month);
  
  return months.map((month, idx) => {
    const aggregated: MonthlyPLData = {
      month,
      revenues: { actual: 0, budget: 0, previousYear: 0 },
      cogs: { actual: 0, budget: 0, previousYear: 0 },
      opex: { actual: 0, budget: 0, previousYear: 0 },
      da: { actual: 0, budget: 0, previousYear: 0 },
      interest: { actual: 0, budget: 0, previousYear: 0 },
      taxes: { actual: 0, budget: 0, previousYear: 0 }
    };

    buMonthlyPLData.forEach(bu => {
      const monthData = bu.monthlyData[idx];
      aggregated.revenues.actual += monthData.revenues.actual;
      aggregated.revenues.budget += monthData.revenues.budget;
      aggregated.revenues.previousYear += monthData.revenues.previousYear;
      aggregated.cogs.actual += monthData.cogs.actual;
      aggregated.cogs.budget += monthData.cogs.budget;
      aggregated.cogs.previousYear += monthData.cogs.previousYear;
      aggregated.opex.actual += monthData.opex.actual;
      aggregated.opex.budget += monthData.opex.budget;
      aggregated.opex.previousYear += monthData.opex.previousYear;
      aggregated.da.actual += monthData.da.actual;
      aggregated.da.budget += monthData.da.budget;
      aggregated.da.previousYear += monthData.da.previousYear;
      aggregated.interest.actual += monthData.interest.actual;
      aggregated.interest.budget += monthData.interest.budget;
      aggregated.interest.previousYear += monthData.interest.previousYear;
      aggregated.taxes.actual += monthData.taxes.actual;
      aggregated.taxes.budget += monthData.taxes.budget;
      aggregated.taxes.previousYear += monthData.taxes.previousYear;
    });

    return aggregated;
  });
};

// Get data for a specific BU or total company
export const getDataForBU = (buName: string): MonthlyPLData[] => {
  if (buName === "All Company") {
    return getTotalCompanyData();
  }
  
  const bu = buMonthlyPLData.find(b => b.name === buName);
  return bu ? bu.monthlyData : getTotalCompanyData();
};

// Get specific month data
export const getMonthData = (buName: string, month: string): MonthlyPLData | null => {
  const data = getDataForBU(buName);
  return data.find(m => m.month === month) || data[data.length - 1]; // Default to last month if not found
};
