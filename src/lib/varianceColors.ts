/**
 * Centralized variance coloring logic for financial metrics
 * 
 * Logic:
 * - Revenue, GM, EBITDA:
 *   a) Actual between 0% and -5% vs comparison = YELLOW
 *   b) Actual < -5% vs comparison = RED
 *   c) Actual >= 0% vs comparison = CYAN (good)
 * 
 * - OpEx:
 *   a) Actual between 0% and +5% vs comparison = YELLOW
 *   b) Actual > +5% vs comparison = RED
 *   c) Actual < 0% vs comparison = CYAN (good)
 */

export type MetricType = "Revenue" | "GM" | "Gross Margin" | "OpEx" | "EBITDA" | "Runway" | "Cash Balance";

// Helper to identify OpEx metrics (where lower is better)
const isOpEx = (metricLabel: string): boolean => {
  return metricLabel.toLowerCase().includes("opex") || 
         metricLabel.toLowerCase().includes("operating expense");
};

// Helper to identify Burn Rate metrics (where lower is better)
const isBurnRate = (metricLabel: string): boolean => {
  return metricLabel.toLowerCase().includes("burn");
};

/**
 * Get text color class based on variance percentage
 */
export const getVarianceTextColor = (variancePercent: number, metricLabel: string): string => {
  if (isOpEx(metricLabel) || isBurnRate(metricLabel)) {
    // OpEx and Burn Rate: lower is better (inverted logic)
    if (variancePercent < 0) return "text-success"; // Under budget = CYAN (good)
    if (variancePercent <= 5) return "text-warning"; // 0% to +5% = YELLOW
    return "text-destructive"; // > +5% = RED (bad)
  } else {
    // Revenue, GM, EBITDA: higher is better
    if (variancePercent >= 0) return "text-success"; // At or above budget = CYAN (good)
    if (variancePercent >= -5) return "text-warning"; // 0% to -5% = YELLOW
    return "text-destructive"; // < -5% = RED (bad)
  }
};

/**
 * Get background color class based on variance percentage
 */
export const getVarianceBackgroundColor = (variancePercent: number, metricLabel: string): string => {
  if (isOpEx(metricLabel) || isBurnRate(metricLabel)) {
    // OpEx and Burn Rate: lower is better (inverted logic)
    if (variancePercent < 0) return "bg-success/10 border-success/30"; // Under budget = CYAN (good)
    if (variancePercent <= 5) return "bg-warning/15 border-warning/40"; // 0% to +5% = YELLOW
    return "bg-destructive/10 border-destructive/30"; // > +5% = RED (bad)
  } else {
    // Revenue, GM, EBITDA: higher is better
    if (variancePercent >= 0) return "bg-success/10 border-success/30"; // At or above budget = CYAN (good)
    if (variancePercent >= -5) return "bg-warning/15 border-warning/40"; // 0% to -5% = YELLOW
    return "bg-destructive/10 border-destructive/30"; // < -5% = RED (bad)
  }
};

/**
 * Get solid background color class based on variance percentage
 */
export const getVarianceSolidColor = (variancePercent: number, metricLabel: string): string => {
  if (isOpEx(metricLabel) || isBurnRate(metricLabel)) {
    // OpEx and Burn Rate: lower is better (inverted logic)
    if (variancePercent < 0) return "bg-success"; // Under budget = CYAN (good)
    if (variancePercent <= 5) return "bg-warning"; // 0% to +5% = YELLOW
    return "bg-destructive"; // > +5% = RED (bad)
  } else {
    // Revenue, GM, EBITDA: higher is better
    if (variancePercent >= 0) return "bg-success"; // At or above budget = CYAN (good)
    if (variancePercent >= -5) return "bg-warning"; // 0% to -5% = YELLOW
    return "bg-destructive"; // < -5% = RED (bad)
  }
};

/**
 * Get hex color code based on variance percentage (for charts)
 */
export const getVarianceHexColor = (variancePercent: number, metricLabel: string): string => {
  if (isOpEx(metricLabel) || isBurnRate(metricLabel)) {
    // OpEx and Burn Rate: lower is better (inverted logic)
    if (variancePercent < 0) return "#22d3ee"; // Under budget = CYAN (good)
    if (variancePercent <= 5) return "#ffc107"; // 0% to +5% = YELLOW
    return "#dc3545"; // > +5% = RED (bad)
  } else {
    // Revenue, GM, EBITDA: higher is better
    if (variancePercent >= 0) return "#22d3ee"; // At or above budget = CYAN (good)
    if (variancePercent >= -5) return "#ffc107"; // 0% to -5% = YELLOW
    return "#dc3545"; // < -5% = RED (bad)
  }
};
