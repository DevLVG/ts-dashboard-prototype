/**
 * Concentration metrics calculator for revenue diversification analysis
 * Uses Herfindahl-Hirschman Index (HHI) methodology
 */

import { DrilldownRow } from './drilldownData';

export interface ConcentrationMetrics {
  hhi: number;
  effectiveServices: number;
  level: 'LOW' | 'MODERATE' | 'HIGH';
  topStreams: {
    name: string;
    amount: number;
    percent: number;
  }[];
}

/**
 * Calculate concentration metrics for revenue streams
 * 
 * @param rows - Revenue breakdown rows by BU and Service
 * @param totalRevenue - Total revenue amount
 * @returns Concentration metrics including HHI, effective services, and top streams
 */
export function calculateConcentration(
  rows: DrilldownRow[],
  totalRevenue: number
): ConcentrationMetrics {
  
  if (totalRevenue === 0 || rows.length === 0) {
    return {
      hhi: 0,
      effectiveServices: 0,
      level: 'LOW',
      topStreams: []
    };
  }
  
  // Calculate HHI: Sum of squared market shares
  // HHI = Σ(market_share_i)² where market_share is in percentage
  const hhi = rows.reduce((sum, row) => {
    const share = (row.actual / totalRevenue) * 100;
    return sum + (share * share);
  }, 0);
  
  // Effective services (Simpson's Index): 10000 / HHI
  // Represents the "equivalent number" of equally-sized services
  const effectiveServices = hhi > 0 ? 10000 / hhi : 0;
  
  // Determine concentration level
  // LOW: < 1500 (competitive market)
  // MODERATE: 1500-2500 (moderately concentrated)
  // HIGH: > 2500 (highly concentrated)
  let level: 'LOW' | 'MODERATE' | 'HIGH';
  if (hhi < 1500) {
    level = 'LOW';
  } else if (hhi <= 2500) {
    level = 'MODERATE';
  } else {
    level = 'HIGH';
  }
  
  // Get top 3 revenue streams
  const sorted = [...rows].sort((a, b) => b.actual - a.actual);
  const topStreams = sorted.slice(0, 3).map(row => ({
    name: row.subCategory.replace(/_/g, ' '), // Format service name
    amount: row.actual,
    percent: (row.actual / totalRevenue) * 100
  }));
  
  return {
    hhi,
    effectiveServices,
    level,
    topStreams
  };
}
