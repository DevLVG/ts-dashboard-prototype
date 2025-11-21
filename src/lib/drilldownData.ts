/**
 * Data fetching and aggregation functions for waterfall drill-down
 */

import mockData from '@/data/trio_mock_data_v6.json';

export interface DrilldownRow {
  bu: string;
  buDisplay: string;
  subCategory: string;
  actual: number;
  comparison: number;
  delta: number;
  deltaPercent: number;
  actualPercent?: number;  // % of total (e.g., Rev% for revenue rows)
  comparisonPercent?: number;  // % of total comparison
}

export interface OpexSubcategory {
  subcategory: string;
  actual: number;
  comparison: number;
  delta: number;
  deltaPercent: number;
}

export interface OpexRow {
  category: string;
  actual: number;
  comparison: number;
  delta: number;
  deltaPercent: number;
  allocationType?: 'direct' | 'indirect';
  subcategories: OpexSubcategory[];
  actualPercent?: number;  // OPEX% as % of revenue
  comparisonPercent?: number;  // Comparison OPEX% as % of revenue
}

export interface EBITDARow {
  bu: string;
  buDisplay: string;
  actual: number;  // EBITDA amount
  comparison: number;  // Comparison EBITDA amount
  delta: number;  // Δ in SAR
  deltaPercent: number;  // Δ%
  actualMargin: number;  // EBITDA% Act
  comparisonMargin: number;  // EBITDA% Cmp
}

export interface EBITDAData {
  rows: EBITDARow[];
  totalActual: number;  // Total EBITDA
  totalComparison: number;  // Total comparison EBITDA
  totalDelta: number;  // Total Δ in SAR
  totalDeltaPercent: number;  // Total Δ%
  totalMargin: number;  // Total EBITDA% Act
  comparisonMargin: number;  // Total EBITDA% Cmp
}

export interface DrilldownData {
  rows: DrilldownRow[];
  totalActual: number;
  totalComparison: number;
  totalDelta: number;
  totalDeltaPercent: number;
  actualPercent?: number;
  comparisonPercent?: number;
  deltaPP?: number;
}

/**
 * Format BU name for display
 */
export const formatBUName = (bu: string): string => {
  return bu.replace(/^BU\d+_/, ''); // "BU1_Equestrian" → "Equestrian"
};

/**
 * Format service/category name for display
 */
export const formatServiceName = (service: string): string => {
  return service.replace(/_/g, ' '); // "Stables_Livery" → "Stables Livery"
};

/**
 * Format currency value
 */
export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

/**
 * Format delta with sign
 */
export const formatDelta = (value: number): string => {
  const formatted = formatCurrency(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
};

/**
 * Format percentage
 */
export const formatPercent = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

/**
 * Shift date back by specified number of years
 */
function shiftDateBack(date: string, years: number): string {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().split('T')[0];
}

/**
 * Get comparison date range (shift back for PY)
 */
function getComparisonDates(
  startDate: string,
  endDate: string,
  comparison: string
): { start: string; end: string } {
  if (comparison === 'Actual') {  // PY comparison
    return {
      start: shiftDateBack(startDate, 1),
      end: shiftDateBack(endDate, 1)
    };
  }
  return { start: startDate, end: endDate };
}

/**
 * Get Revenue breakdown by BU and Service
 */
export function getRevenueBreakdown(
  startDate: string,
  endDate: string,
  scenario: string,
  comparison: string,
  bu?: string
): DrilldownData {
  // Get comparison date range (shift back for PY)
  const { start: compStart, end: compEnd } = getComparisonDates(startDate, endDate, comparison);
  
  // Filter revenues by date range
  const scenarioData = mockData.revenues.filter(r => 
    r.date >= startDate &&
    r.date <= endDate &&
    r.scenario === scenario &&
    (bu === 'All Company' || !bu || r.bu === bu)
  );
  
  const comparisonData = mockData.revenues.filter(r =>
    r.date >= compStart &&
    r.date <= compEnd &&
    r.scenario === comparison &&
    (bu === 'All Company' || !bu || r.bu === bu)
  );
  
  const rowMap = new Map<string, DrilldownRow>();
  
  // Aggregate actual values
  scenarioData.forEach(rev => {
    const key = `${rev.bu}-${rev.service}`;
    const existing = rowMap.get(key);
    
    if (existing) {
      existing.actual += rev.amount;
    } else {
      rowMap.set(key, {
        bu: rev.bu,
        buDisplay: formatBUName(rev.bu),
        subCategory: rev.service,
        actual: rev.amount,
        comparison: 0,
        delta: 0,
        deltaPercent: 0
      });
    }
  });
  
  // Aggregate comparison values
  comparisonData.forEach(rev => {
    const key = `${rev.bu}-${rev.service}`;
    const existing = rowMap.get(key);
    
    if (existing) {
      existing.comparison += rev.amount;
    } else {
      rowMap.set(key, {
        bu: rev.bu,
        buDisplay: formatBUName(rev.bu),
        subCategory: rev.service,
        actual: 0,
        comparison: rev.amount,
        delta: 0,
        deltaPercent: 0
      });
    }
  });
  
  // Calculate totals first for percentage calculations
  const totalActual = Array.from(rowMap.values()).reduce((sum, r) => sum + r.actual, 0);
  const totalComparison = Array.from(rowMap.values()).reduce((sum, r) => sum + r.comparison, 0);
  
  // Calculate deltas and convert to array with percentages
  const rows: DrilldownRow[] = Array.from(rowMap.values()).map(row => {
    const delta = row.actual - row.comparison;
    const deltaPercent = row.comparison !== 0 
      ? (delta / Math.abs(row.comparison)) * 100 
      : 0;
    const actualPercent = totalActual !== 0 ? (row.actual / totalActual) * 100 : 0;
    const comparisonPercent = totalComparison !== 0 ? (row.comparison / totalComparison) * 100 : 0;
    
    return {
      ...row,
      delta,
      deltaPercent,
      actualPercent,
      comparisonPercent
    };
  });
  
  const totalDelta = totalActual - totalComparison;
  const totalDeltaPercent = totalComparison !== 0 
    ? (totalDelta / Math.abs(totalComparison)) * 100 
    : 0;
  
  return {
    rows,
    totalActual,
    totalComparison,
    totalDelta,
    totalDeltaPercent
  };
}

/**
 * Get COGS breakdown by BU and Category
 */
export function getCogsBreakdown(
  startDate: string,
  endDate: string,
  scenario: string,
  comparison: string,
  bu?: string,
  totalRevenue?: { actual: number; comparison: number }
): DrilldownData {
  // Get comparison date range (shift back for PY)
  const { start: compStart, end: compEnd } = getComparisonDates(startDate, endDate, comparison);
  
  // Filter COGS by date range
  const scenarioData = mockData.cogs.filter(c => 
    c.date >= startDate &&
    c.date <= endDate &&
    c.scenario === scenario &&
    (bu === 'All Company' || !bu || c.bu === bu)
  );
  
  const comparisonData = mockData.cogs.filter(c =>
    c.date >= compStart &&
    c.date <= compEnd &&
    c.scenario === comparison &&
    (bu === 'All Company' || !bu || c.bu === bu)
  );
  
  const rowMap = new Map<string, DrilldownRow>();
  
  // Aggregate actual values
  scenarioData.forEach(cog => {
    const key = `${cog.bu}-${cog.category}`;
    const existing = rowMap.get(key);
    
    if (existing) {
      existing.actual += cog.amount;
    } else {
      rowMap.set(key, {
        bu: cog.bu,
        buDisplay: formatBUName(cog.bu),
        subCategory: cog.category,
        actual: cog.amount,
        comparison: 0,
        delta: 0,
        deltaPercent: 0
      });
    }
  });
  
  // Aggregate comparison values
  comparisonData.forEach(cog => {
    const key = `${cog.bu}-${cog.category}`;
    const existing = rowMap.get(key);
    
    if (existing) {
      existing.comparison += cog.amount;
    } else {
      rowMap.set(key, {
        bu: cog.bu,
        buDisplay: formatBUName(cog.bu),
        subCategory: cog.category,
        actual: 0,
        comparison: cog.amount,
        delta: 0,
        deltaPercent: 0
      });
    }
  });
  
  // Calculate deltas and convert to array
  const rows: DrilldownRow[] = Array.from(rowMap.values()).map(row => {
    const delta = row.actual - row.comparison;
    const deltaPercent = row.comparison !== 0 
      ? (delta / Math.abs(row.comparison)) * 100 
      : 0;
    
    return {
      ...row,
      delta,
      deltaPercent
    };
  });
  
  // Calculate totals
  const totalActual = rows.reduce((sum, r) => sum + r.actual, 0);
  const totalComparison = rows.reduce((sum, r) => sum + r.comparison, 0);
  const totalDelta = totalActual - totalComparison;
  const totalDeltaPercent = totalComparison !== 0 
    ? (totalDelta / Math.abs(totalComparison)) * 100 
    : 0;
  
  // Calculate percentages if revenue totals provided
  let actualPercent, comparisonPercent, deltaPP;
  if (totalRevenue) {
    actualPercent = totalRevenue.actual !== 0 
      ? (totalActual / totalRevenue.actual) * 100 
      : 0;
    comparisonPercent = totalRevenue.comparison !== 0 
      ? (totalComparison / totalRevenue.comparison) * 100 
      : 0;
    deltaPP = actualPercent - comparisonPercent;
  }
  
  return {
    rows,
    totalActual,
    totalComparison,
    totalDelta,
    totalDeltaPercent,
    actualPercent,
    comparisonPercent,
    deltaPP
  };
}

/**
 * Get OPEX breakdown by Category with Subcategories
 */
export function getOpexBreakdown(
  startDate: string,
  endDate: string,
  scenario: string,
  comparison: string,
  bu?: string,
  totalRevenue?: { actual: number; comparison: number }
): { rows: OpexRow[]; totalActual: number; totalComparison: number; totalDelta: number; totalDeltaPercent: number; actualPercent?: number; comparisonPercent?: number; deltaPP?: number } {
  // Get comparison date range (shift back for PY)
  const { start: compStart, end: compEnd } = getComparisonDates(startDate, endDate, comparison);
  
  // Filter OPEX by date range
  const scenarioData = mockData.opex.filter(o => 
    o.date >= startDate &&
    o.date <= endDate &&
    o.scenario === scenario &&
    (bu === 'All Company' || !bu || o.bu === bu)
  );
  
  const comparisonData = mockData.opex.filter(o =>
    o.date >= compStart &&
    o.date <= compEnd &&
    o.scenario === comparison &&
    (bu === 'All Company' || !bu || o.bu === bu)
  );
  
  // First, aggregate subcategories
  const subcategoryMap = new Map<string, Map<string, { actual: number; comparison: number }>>();
  
  // Aggregate actual values by category + subcategory
  scenarioData.forEach(opex => {
    if (!subcategoryMap.has(opex.category)) {
      subcategoryMap.set(opex.category, new Map());
    }
    const catMap = subcategoryMap.get(opex.category)!;
    const existing = catMap.get(opex.subcategory);
    
    if (existing) {
      existing.actual += opex.amount;
    } else {
      catMap.set(opex.subcategory, { actual: opex.amount, comparison: 0 });
    }
  });
  
  // Aggregate comparison values by category + subcategory
  comparisonData.forEach(opex => {
    if (!subcategoryMap.has(opex.category)) {
      subcategoryMap.set(opex.category, new Map());
    }
    const catMap = subcategoryMap.get(opex.category)!;
    const existing = catMap.get(opex.subcategory);
    
    if (existing) {
      existing.comparison += opex.amount;
    } else {
      catMap.set(opex.subcategory, { actual: 0, comparison: opex.amount });
    }
  });
  
  // Build OpexRow array with subcategories
  const categoryMap = new Map<string, { actual: number; comparison: number; allocationType: 'direct' | 'indirect' }>();
  
  // Aggregate category totals and track allocation type
  scenarioData.forEach(opex => {
    const existing = categoryMap.get(opex.category);
    if (existing) {
      existing.actual += opex.amount;
    } else {
      categoryMap.set(opex.category, {
        actual: opex.amount,
        comparison: 0,
        allocationType: opex.allocation_type as 'direct' | 'indirect'
      });
    }
  });
  
  comparisonData.forEach(opex => {
    const existing = categoryMap.get(opex.category);
    if (existing) {
      existing.comparison += opex.amount;
    } else {
      categoryMap.set(opex.category, {
        actual: 0,
        comparison: opex.amount,
        allocationType: opex.allocation_type as 'direct' | 'indirect'
      });
    }
  });
  
  // Build rows with subcategories
  const rows: OpexRow[] = Array.from(categoryMap.entries()).map(([category, totals]) => {
    const delta = totals.actual - totals.comparison;
    const deltaPercent = totals.comparison !== 0 
      ? (delta / Math.abs(totals.comparison)) * 100 
      : 0;
    
    // Calculate OPEX% if revenue provided
    const actualPercent = totalRevenue && totalRevenue.actual !== 0 
      ? (totals.actual / totalRevenue.actual) * 100 
      : undefined;
    const comparisonPercent = totalRevenue && totalRevenue.comparison !== 0 
      ? (totals.comparison / totalRevenue.comparison) * 100 
      : undefined;
    
    // Get subcategories for this category
    const subcatMap = subcategoryMap.get(category) || new Map();
    const subcategories: OpexSubcategory[] = Array.from(subcatMap.entries()).map(([subcategory, amounts]) => {
      const subDelta = amounts.actual - amounts.comparison;
      const subDeltaPercent = amounts.comparison !== 0 
        ? (subDelta / Math.abs(amounts.comparison)) * 100 
        : 0;
      
      return {
        subcategory,
        actual: amounts.actual,
        comparison: amounts.comparison,
        delta: subDelta,
        deltaPercent: subDeltaPercent
      };
    });
    
    return {
      category,
      actual: totals.actual,
      comparison: totals.comparison,
      delta,
      deltaPercent,
      allocationType: totals.allocationType,
      subcategories,
      actualPercent,
      comparisonPercent
    };
  });
  
  // Calculate totals
  const totalActual = rows.reduce((sum, r) => sum + r.actual, 0);
  const totalComparison = rows.reduce((sum, r) => sum + r.comparison, 0);
  const totalDelta = totalActual - totalComparison;
  const totalDeltaPercent = totalComparison !== 0 
    ? (totalDelta / Math.abs(totalComparison)) * 100 
    : 0;
  
  // Calculate percentages if revenue totals provided
  let actualPercent, comparisonPercent, deltaPP;
  if (totalRevenue) {
    actualPercent = totalRevenue.actual !== 0 
      ? (totalActual / totalRevenue.actual) * 100 
      : 0;
    comparisonPercent = totalRevenue.comparison !== 0 
      ? (totalComparison / totalRevenue.comparison) * 100 
      : 0;
    deltaPP = actualPercent - comparisonPercent;
  }
  
  return {
    rows,
    totalActual,
    totalComparison,
    totalDelta,
    totalDeltaPercent,
    actualPercent,
    comparisonPercent,
    deltaPP
  };
}

/**
 * Get Gross Margin breakdown (Revenue - COGS) by BU and Service
 */
export function getGMBreakdown(
  startDate: string,
  endDate: string,
  scenario: string,
  comparison: string,
  bu?: string
): DrilldownData {
  const revenueData = getRevenueBreakdown(startDate, endDate, scenario, comparison, bu);
  const cogsData = getCogsBreakdown(startDate, endDate, scenario, comparison, bu, {
    actual: revenueData.totalActual,
    comparison: revenueData.totalComparison
  });
  
  // Calculate GM = Revenue - COGS (can't match by service since COGS uses categories)
  // Use revenue rows, but calculate GM at total level per row
  const rows: DrilldownRow[] = revenueData.rows.map(revRow => {
    // For GM%, we show revenue services but can't directly subtract COGS categories
    // So we calculate proportional GM based on total GM%
    const totalGMActual = revenueData.totalActual - cogsData.totalActual;
    const totalGMComparison = revenueData.totalComparison - cogsData.totalComparison;
    const gmPercentActual = revenueData.totalActual !== 0 ? totalGMActual / revenueData.totalActual : 0;
    const gmPercentComparison = revenueData.totalComparison !== 0 ? totalGMComparison / revenueData.totalComparison : 0;
    
    const actual = revRow.actual * gmPercentActual;
    const comparison = revRow.comparison * gmPercentComparison;
    const delta = actual - comparison;
    const deltaPercent = comparison !== 0 
      ? (delta / Math.abs(comparison)) * 100 
      : 0;
    
    return {
      bu: revRow.bu,
      buDisplay: revRow.buDisplay,
      subCategory: revRow.subCategory,
      actual,
      comparison,
      delta,
      deltaPercent
    };
  });
  
  // Calculate totals directly from revenue and COGS totals
  const totalActual = revenueData.totalActual - cogsData.totalActual;
  const totalComparison = revenueData.totalComparison - cogsData.totalComparison;
  const totalDelta = totalActual - totalComparison;
  const totalDeltaPercent = totalComparison !== 0 
    ? (totalDelta / Math.abs(totalComparison)) * 100 
    : 0;
  
  // Calculate GM percentages using revenue as denominator
  const actualPercent = revenueData.totalActual !== 0 
    ? (totalActual / revenueData.totalActual) * 100 
    : 0;
  const comparisonPercent = revenueData.totalComparison !== 0 
    ? (totalComparison / revenueData.totalComparison) * 100 
    : 0;
  const deltaPP = actualPercent - comparisonPercent;
  
  return {
    rows,
    totalActual,
    totalComparison,
    totalDelta,
    totalDeltaPercent,
    actualPercent,
    comparisonPercent,
    deltaPP
  };
}

/**
 * Get EBITDA breakdown by BU
 * EBITDA = Revenue - COGS - OPEX per BU
 */
export function getEBITDABreakdown(
  startDate: string,
  endDate: string,
  scenario: string,
  comparison: string,
  bu?: string
): EBITDAData {
  // Get revenue by BU
  const revenueData = getRevenueBreakdown(startDate, endDate, scenario, comparison, bu);
  
  // Get COGS by BU
  const cogsData = getCogsBreakdown(startDate, endDate, scenario, comparison, bu);
  
  // Get OPEX breakdown - use the standard function for consistency
  const opexData = getOpexBreakdown(startDate, endDate, scenario, comparison, bu);
  
  // Get comparison date range (shift back for PY)
  const { start: compStart, end: compEnd } = getComparisonDates(startDate, endDate, comparison);
  
  // Aggregate OPEX by BU from the raw data (since getOpexBreakdown groups by category)
  const scenarioData = mockData.opex.filter(o => 
    o.date >= startDate &&
    o.date <= endDate &&
    o.scenario === scenario &&
    (bu === 'All Company' || !bu || o.bu === bu)
  );
  
  const comparisonData = mockData.opex.filter(o =>
    o.date >= compStart &&
    o.date <= compEnd &&
    o.scenario === comparison &&
    (bu === 'All Company' || !bu || o.bu === bu)
  );
  
  const opexByBU = new Map<string, { actual: number; comparison: number }>();
  
  scenarioData.forEach(opex => {
    const existing = opexByBU.get(opex.bu);
    if (existing) {
      existing.actual += opex.amount;
    } else {
      opexByBU.set(opex.bu, { actual: opex.amount, comparison: 0 });
    }
  });
  
  comparisonData.forEach(opex => {
    const existing = opexByBU.get(opex.bu);
    if (existing) {
      existing.comparison += opex.amount;
    } else {
      opexByBU.set(opex.bu, { actual: 0, comparison: opex.amount });
    }
  });
  
  // Aggregate revenue and COGS by BU
  const buMap = new Map<string, { 
    revenue: number; 
    cogs: number; 
    opex: number;
    comparisonRevenue: number;
    comparisonCogs: number;
    comparisonOpex: number;
  }>();
  
  revenueData.rows.forEach(row => {
    const existing = buMap.get(row.bu);
    if (existing) {
      existing.revenue += row.actual;
      existing.comparisonRevenue += row.comparison;
    } else {
      buMap.set(row.bu, {
        revenue: row.actual,
        cogs: 0,
        opex: 0,
        comparisonRevenue: row.comparison,
        comparisonCogs: 0,
        comparisonOpex: 0
      });
    }
  });
  
  cogsData.rows.forEach(row => {
    const existing = buMap.get(row.bu);
    if (existing) {
      existing.cogs += row.actual;
      existing.comparisonCogs += row.comparison;
    } else {
      buMap.set(row.bu, {
        revenue: 0,
        cogs: row.actual,
        opex: 0,
        comparisonRevenue: 0,
        comparisonCogs: row.comparison,
        comparisonOpex: 0
      });
    }
  });
  
  opexByBU.forEach((amounts, buKey) => {
    const existing = buMap.get(buKey);
    if (existing) {
      existing.opex = amounts.actual;
      existing.comparisonOpex = amounts.comparison;
    } else {
      buMap.set(buKey, {
        revenue: 0,
        cogs: 0,
        opex: amounts.actual,
        comparisonRevenue: 0,
        comparisonCogs: 0,
        comparisonOpex: amounts.comparison
      });
    }
  });
  
  // Build EBITDA rows
  const rows: EBITDARow[] = Array.from(buMap.entries()).map(([buKey, data]) => {
    const actual = data.revenue - data.cogs - data.opex;
    const comparison = data.comparisonRevenue - data.comparisonCogs - data.comparisonOpex;
    const delta = actual - comparison;
    const deltaPercent = comparison !== 0 ? (delta / Math.abs(comparison)) * 100 : 0;
    
    const actualMargin = data.revenue !== 0 ? (actual / data.revenue) * 100 : 0;
    const comparisonMargin = data.comparisonRevenue !== 0 ? (comparison / data.comparisonRevenue) * 100 : 0;
    
    return {
      bu: buKey,
      buDisplay: formatBUName(buKey),
      actual,
      comparison,
      delta,
      deltaPercent,
      actualMargin,
      comparisonMargin
    };
  });
  
  // Calculate totals - use the OPEX breakdown total for accuracy
  const totalRevenue = revenueData.totalActual;
  const totalCOGS = cogsData.totalActual;
  const totalOPEX = opexData.totalActual; // Use the breakdown function's total
  const totalActual = totalRevenue - totalCOGS - totalOPEX;
  
  const comparisonRevenue = revenueData.totalComparison;
  const comparisonCOGS = cogsData.totalComparison;
  const comparisonOPEX = opexData.totalComparison; // Use the breakdown function's total
  const totalComparison = comparisonRevenue - comparisonCOGS - comparisonOPEX;
  
  const totalDelta = totalActual - totalComparison;
  const totalDeltaPercent = totalComparison !== 0 ? (totalDelta / Math.abs(totalComparison)) * 100 : 0;
  
  const totalMargin = totalRevenue !== 0 ? (totalActual / totalRevenue) * 100 : 0;
  const comparisonMargin = comparisonRevenue !== 0 ? (totalComparison / comparisonRevenue) * 100 : 0;
  
  return {
    rows,
    totalActual,
    totalComparison,
    totalDelta,
    totalDeltaPercent,
    totalMargin,
    comparisonMargin
  };
}
