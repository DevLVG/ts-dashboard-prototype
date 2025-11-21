/**
 * Data fetching and aggregation functions for waterfall drill-down
 */

import mockData from '@/data/trio_mock_data_v4.json';

export interface DrilldownRow {
  bu: string;
  buDisplay: string;
  subCategory: string;
  actual: number;
  comparison: number;
  delta: number;
  deltaPercent: number;
}

export interface OpexRow extends DrilldownRow {
  allocationType?: 'direct' | 'indirect';
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
 * Get Revenue breakdown by BU and Service
 */
export function getRevenueBreakdown(
  startDate: string,
  endDate: string,
  scenario: string,
  comparison: string,
  bu?: string
): DrilldownData {
  // Filter revenues by date range
  const filtered = mockData.revenues.filter(r => 
    r.date >= startDate &&
    r.date <= endDate &&
    (bu === 'All Company' || !bu || r.bu === bu)
  );
  
  // Group by BU and Service
  const scenarioData = filtered.filter(r => r.scenario === scenario);
  const comparisonData = filtered.filter(r => r.scenario === comparison);
  
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
  
  return {
    rows,
    totalActual,
    totalComparison,
    totalDelta,
    totalDeltaPercent
  };
}

/**
 * Get COGS breakdown by BU and Service
 */
export function getCogsBreakdown(
  startDate: string,
  endDate: string,
  scenario: string,
  comparison: string,
  bu?: string,
  totalRevenue?: { actual: number; comparison: number }
): DrilldownData {
  // Filter COGS by date range
  const filtered = mockData.cogs.filter(c => 
    c.date >= startDate &&
    c.date <= endDate &&
    (bu === 'All Company' || !bu || c.bu === bu)
  );
  
  // Group by BU and Service
  const scenarioData = filtered.filter(c => c.scenario === scenario);
  const comparisonData = filtered.filter(c => c.scenario === comparison);
  
  const rowMap = new Map<string, DrilldownRow>();
  
  // Aggregate actual values
  scenarioData.forEach(cog => {
    const key = `${cog.bu}-${cog.service}`;
    const existing = rowMap.get(key);
    
    if (existing) {
      existing.actual += cog.amount;
    } else {
      rowMap.set(key, {
        bu: cog.bu,
        buDisplay: formatBUName(cog.bu),
        subCategory: cog.service,
        actual: cog.amount,
        comparison: 0,
        delta: 0,
        deltaPercent: 0
      });
    }
  });
  
  // Aggregate comparison values
  comparisonData.forEach(cog => {
    const key = `${cog.bu}-${cog.service}`;
    const existing = rowMap.get(key);
    
    if (existing) {
      existing.comparison += cog.amount;
    } else {
      rowMap.set(key, {
        bu: cog.bu,
        buDisplay: formatBUName(cog.bu),
        subCategory: cog.service,
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
 * Get OPEX breakdown by BU and Category
 */
export function getOpexBreakdown(
  startDate: string,
  endDate: string,
  scenario: string,
  comparison: string,
  bu?: string,
  totalRevenue?: { actual: number; comparison: number }
): { rows: OpexRow[]; totalActual: number; totalComparison: number; totalDelta: number; totalDeltaPercent: number; actualPercent?: number; comparisonPercent?: number; deltaPP?: number } {
  // Filter OPEX by date range
  const filtered = mockData.opex.filter(o => 
    o.date >= startDate &&
    o.date <= endDate &&
    (bu === 'All Company' || !bu || o.bu === bu)
  );
  
  // Group by BU and Category
  const scenarioData = filtered.filter(o => o.scenario === scenario);
  const comparisonData = filtered.filter(o => o.scenario === comparison);
  
  const rowMap = new Map<string, OpexRow>();
  
  // Aggregate actual values
  scenarioData.forEach(opex => {
    const key = `${opex.bu}-${opex.category}`;
    const existing = rowMap.get(key);
    
    if (existing) {
      existing.actual += opex.amount;
    } else {
      rowMap.set(key, {
        bu: opex.bu,
        buDisplay: formatBUName(opex.bu),
        subCategory: opex.category,
        actual: opex.amount,
        comparison: 0,
        delta: 0,
        deltaPercent: 0,
        allocationType: opex.allocation_type as 'direct' | 'indirect'
      });
    }
  });
  
  // Aggregate comparison values
  comparisonData.forEach(opex => {
    const key = `${opex.bu}-${opex.category}`;
    const existing = rowMap.get(key);
    
    if (existing) {
      existing.comparison += opex.amount;
    } else {
      rowMap.set(key, {
        bu: opex.bu,
        buDisplay: formatBUName(opex.bu),
        subCategory: opex.category,
        actual: 0,
        comparison: opex.amount,
        delta: 0,
        deltaPercent: 0,
        allocationType: opex.allocation_type as 'direct' | 'indirect'
      });
    }
  });
  
  // Calculate deltas and convert to array
  const rows: OpexRow[] = Array.from(rowMap.values()).map(row => {
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
  
  // Create a map for easy lookup
  const cogsMap = new Map<string, DrilldownRow>();
  cogsData.rows.forEach(row => {
    const key = `${row.bu}-${row.subCategory}`;
    cogsMap.set(key, row);
  });
  
  // Calculate GM = Revenue - COGS for each service
  const rows: DrilldownRow[] = revenueData.rows.map(revRow => {
    const key = `${revRow.bu}-${revRow.subCategory}`;
    const cogRow = cogsMap.get(key);
    
    const actual = revRow.actual - (cogRow?.actual || 0);
    const comparison = revRow.comparison - (cogRow?.comparison || 0);
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
  
  const totalActual = rows.reduce((sum, r) => sum + r.actual, 0);
  const totalComparison = rows.reduce((sum, r) => sum + r.comparison, 0);
  const totalDelta = totalActual - totalComparison;
  const totalDeltaPercent = totalComparison !== 0 
    ? (totalDelta / Math.abs(totalComparison)) * 100 
    : 0;
  
  // Calculate GM percentages
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
