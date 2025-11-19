export interface KPIMetric {
  label: string;
  actual: number;
  budget: number;
  variance: number;
  variancePercent: number;
  format: "currency" | "percent" | "months" | "number";
  icon?: string;
}

export interface BUPerformance {
  name: string;
  revenue: { actual: number; budget: number };
  grossMargin: { actual: number; budget: number };
  opex: { actual: number; budget: number };
  ebitda: { actual: number; budget: number };
  services?: ServicePerformance[];
}

export interface ServicePerformance {
  name: string;
  revenue: { actual: number; budget: number };
  grossMargin: { actual: number; budget: number };
  opex: { actual: number; budget: number };
  ebitda: { actual: number; budget: number };
}

export interface TrendData {
  month: string;
  actual: number;
  budget: number;
}

export interface CashFlowData {
  category: string;
  amount: number;
  type: "inflow" | "outflow";
}

export type ViewLevel = "total" | "bu" | "service";
export type PageType = "overview" | "performance" | "cash" | "ratios";
