import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine, Cell,
} from "recharts";
import { cashFlowStatementData, getWCChangeDrivers, type CashFlowStatementMonth } from "@/data/workingCapitalData";
import { ChevronLeft, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

const formatSAR = (value: number) => {
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toFixed(0);
};

const formatSARFull = (value: number) =>
  new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 0 }).format(value);

type DrillLevel = "summary" | "operating" | "investing" | "financing";

const getVarianceColor = (actual: number, budget: number, isExpense: boolean = false) => {
  const variance = actual - budget;
  const pct = budget !== 0 ? Math.abs(variance / budget) * 100 : 0;
  if (pct < 5) return "text-[#ffc107]"; // within 5% tolerance
  if (isExpense) return variance < 0 ? "text-[#22d3ee]" : "text-[#dc3545]"; // lower expense = good
  return variance > 0 ? "text-[#22d3ee]" : "text-[#dc3545]"; // higher inflow = good
};

const getBarColor = (actual: number, budget: number) => {
  const pct = budget !== 0 ? ((actual - budget) / Math.abs(budget)) * 100 : 0;
  if (Math.abs(pct) < 5) return "#ffc107";
  return pct > 0 ? "#22d3ee" : "#dc3545";
};

interface CFSLineProps {
  label: string;
  actual: number;
  budget: number;
  isExpense?: boolean;
  isBold?: boolean;
  indent?: number;
  onClick?: () => void;
  expandable?: boolean;
}

const CFSLine = ({ label, actual, budget, isExpense, isBold, indent = 0, onClick, expandable }: CFSLineProps) => {
  const variance = actual - budget;
  const variancePct = budget !== 0 ? ((variance / Math.abs(budget)) * 100).toFixed(1) : "—";
  const varColor = getVarianceColor(actual, budget, isExpense);

  return (
    <div
      className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 py-2 px-3 items-center ${
        isBold ? "font-semibold border-t border-border bg-muted/20" : "hover:bg-muted/10"
      } ${onClick ? "cursor-pointer" : ""}`}
      style={{ paddingLeft: `${12 + indent * 16}px` }}
      onClick={onClick}
    >
      <div className="flex items-center gap-1.5">
        {expandable && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
        <span className={isBold ? "text-foreground" : "text-foreground/90"}>{label}</span>
      </div>
      <span className="text-right tabular-nums w-28">{formatSARFull(actual)}</span>
      <span className="text-right tabular-nums text-muted-foreground w-28">{formatSARFull(budget)}</span>
      <span className={`text-right tabular-nums w-28 font-medium ${varColor}`}>
        {variance > 0 ? "+" : ""}{formatSARFull(variance)}
      </span>
      <span className={`text-right tabular-nums w-16 text-sm ${varColor}`}>
        {variancePct}%
      </span>
    </div>
  );
};

export const CashFlowBudgetVsActual = () => {
  const [selectedMonth, setSelectedMonth] = useState(cashFlowStatementData.length - 1);
  const [drillLevel, setDrillLevel] = useState<DrillLevel>("summary");
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const d = cashFlowStatementData[selectedMonth];
  const wcDrivers = getWCChangeDrivers(selectedMonth);

  // Bar chart data for monthly comparison
  const barData = cashFlowStatementData.map((m) => ({
    month: m.month,
    actual: m.netCashFlow.actual,
    budget: m.netCashFlow.budget,
    variance: m.netCashFlow.actual - m.netCashFlow.budget,
  }));

  // Variance flags (>10% deviation)
  const hasOperatingFlag = d.operating.total.budget !== 0 &&
    Math.abs((d.operating.total.actual - d.operating.total.budget) / d.operating.total.budget) > 0.1;
  const hasInvestingFlag = d.investing.total.budget !== 0 &&
    Math.abs((d.investing.total.actual - d.investing.total.budget) / Math.abs(d.investing.total.budget)) > 0.1;

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300 group">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-2xl md:text-xl font-heading tracking-wide transition-colors group-hover:text-gold">
            CASH FLOW STATEMENT — BUDGET VS ACTUAL
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Operating · Investing · Financing · Drill-down by cause
          </p>
        </div>
        {drillLevel !== "summary" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDrillLevel("summary")}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Summary
          </Button>
        )}
      </div>

      {/* Monthly bar chart */}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={barData} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
          <XAxis
            dataKey="month"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: "hsl(var(--foreground))", fontSize: 11 }}
          />
          <YAxis
            tickFormatter={formatSAR}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]?.payload;
              return (
                <div
                  style={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "2px solid hsl(var(--gold))",
                    borderRadius: "var(--radius)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    padding: "10px 14px",
                  }}
                >
                  <p style={{ color: "hsl(var(--popover-foreground))", fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                    {label}
                  </p>
                  <p style={{ color: "hsl(var(--popover-foreground))", fontSize: 12 }}>
                    Actual: {formatSARFull(p.actual)} · Budget: {formatSARFull(p.budget)}
                  </p>
                  <p style={{
                    color: p.variance >= 0 ? "#22d3ee" : "#dc3545",
                    fontSize: 12, fontWeight: 600, marginTop: 2,
                  }}>
                    Variance: {p.variance > 0 ? "+" : ""}{formatSARFull(p.variance)}
                  </p>
                </div>
              );
            }}
          />
          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1.5} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="actual" name="Actual" barSize={16} radius={[3, 3, 0, 0]}>
            {barData.map((entry, i) => (
              <Cell
                key={i}
                fill={i === selectedMonth ? "#ffc107" : entry.actual >= 0 ? "#22d3ee" : "#dc3545"}
                opacity={i === selectedMonth ? 1 : 0.6}
                className="cursor-pointer"
                onClick={() => setSelectedMonth(i)}
              />
            ))}
          </Bar>
          <Bar dataKey="budget" name="Budget" barSize={16} fill="#6c757d" opacity={0.4} radius={[3, 3, 0, 0]}>
            {barData.map((_, i) => (
              <Cell
                key={i}
                className="cursor-pointer"
                onClick={() => setSelectedMonth(i)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Selected month label */}
      <div className="flex items-center justify-center gap-2 my-3">
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setSelectedMonth(Math.max(0, selectedMonth - 1))}
          disabled={selectedMonth === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold px-3 py-1 rounded-full bg-muted/50 border">
          {d.month} — Click a bar to navigate
        </span>
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setSelectedMonth(Math.min(cashFlowStatementData.length - 1, selectedMonth + 1))}
          disabled={selectedMonth === cashFlowStatementData.length - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* CFS Detail Table */}
      <div className="border rounded-lg overflow-hidden text-sm">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-4 py-2 px-3 bg-muted/40 font-semibold text-muted-foreground border-b">
          <span>Cash Flow Statement — {d.month}</span>
          <span className="text-right w-28">Actual</span>
          <span className="text-right w-28">Budget</span>
          <span className="text-right w-28">Variance</span>
          <span className="text-right w-16">%</span>
        </div>

        {/* Opening Balance */}
        <CFSLine
          label="Opening Cash Balance"
          actual={d.openingBalance.actual}
          budget={d.openingBalance.budget}
          isBold
        />

        {/* Operating Activities */}
        <CFSLine
          label={`Operating Activities ${hasOperatingFlag ? "⚠" : ""}`}
          actual={d.operating.total.actual}
          budget={d.operating.total.budget}
          isBold
          expandable
          onClick={() => setExpandedSection(expandedSection === "operating" ? null : "operating")}
        />
        {expandedSection === "operating" && (
          <>
            <CFSLine label="EBITDA" actual={d.operating.ebitda.actual} budget={d.operating.ebitda.budget} indent={1} />
            <CFSLine label="Working Capital Change" actual={d.operating.wcChange.actual} budget={d.operating.wcChange.budget} indent={1} isExpense />
            {wcDrivers.length > 0 && (
              <div className="px-3 py-2 bg-muted/10" style={{ paddingLeft: "60px" }}>
                {wcDrivers.map((driver, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground py-0.5">
                    <span className={`font-semibold ${driver.impact >= 0 ? "text-[#22d3ee]" : "text-[#dc3545]"}`}>
                      {driver.driver}: {driver.impact > 0 ? "+" : ""}{formatSARFull(driver.impact)}
                    </span>
                    <span>— {driver.explanation}</span>
                  </div>
                ))}
              </div>
            )}
            <CFSLine label="Other Operating" actual={d.operating.otherOperating.actual} budget={d.operating.otherOperating.budget} indent={1} isExpense />
          </>
        )}

        {/* Investing Activities */}
        <CFSLine
          label={`Investing Activities ${hasInvestingFlag ? "⚠" : ""}`}
          actual={d.investing.total.actual}
          budget={d.investing.total.budget}
          isBold
          isExpense
          expandable
          onClick={() => setExpandedSection(expandedSection === "investing" ? null : "investing")}
        />
        {expandedSection === "investing" && (
          <>
            <CFSLine label="Capital Expenditure" actual={d.investing.capex.actual} budget={d.investing.capex.budget} indent={1} isExpense />
            {d.investing.otherInvesting.actual !== 0 && (
              <CFSLine label="Other Investing" actual={d.investing.otherInvesting.actual} budget={d.investing.otherInvesting.budget} indent={1} isExpense />
            )}
          </>
        )}

        {/* Financing Activities */}
        <CFSLine
          label="Financing Activities"
          actual={d.financing.total.actual}
          budget={d.financing.total.budget}
          isBold
          isExpense
          expandable
          onClick={() => setExpandedSection(expandedSection === "financing" ? null : "financing")}
        />
        {expandedSection === "financing" && (
          <>
            <CFSLine label="Loan Repayment" actual={d.financing.loanRepayment.actual} budget={d.financing.loanRepayment.budget} indent={1} isExpense />
            {d.financing.otherFinancing.actual !== 0 && (
              <CFSLine label="Other Financing" actual={d.financing.otherFinancing.actual} budget={d.financing.otherFinancing.budget} indent={1} isExpense />
            )}
          </>
        )}

        {/* Net Cash Flow */}
        <div className="border-t-2 border-border">
          <CFSLine
            label="Net Cash Flow"
            actual={d.netCashFlow.actual}
            budget={d.netCashFlow.budget}
            isBold
          />
        </div>

        {/* Closing Balance */}
        <CFSLine
          label="Closing Cash Balance"
          actual={d.closingBalance.actual}
          budget={d.closingBalance.budget}
          isBold
        />
      </div>

      {/* Variance alerts */}
      {(hasOperatingFlag || hasInvestingFlag) && (
        <div className="mt-4 p-3 bg-[#ffc107]/10 border border-[#ffc107]/30 rounded-lg flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-[#ffc107] mt-0.5 shrink-0" />
          <div className="text-sm text-muted-foreground">
            {hasOperatingFlag && (
              <p>
                <span className="font-semibold text-foreground">Operating CF variance &gt;10%:</span>{" "}
                {d.operating.wcChange.actual < d.operating.wcChange.budget
                  ? "Working capital consumed more cash than budgeted — investigate AR collection delays and inventory build-up."
                  : "Operating cash generation below budget — check EBITDA shortfall vs working capital release."
                }
              </p>
            )}
            {hasInvestingFlag && (
              <p className={hasOperatingFlag ? "mt-1" : ""}>
                <span className="font-semibold text-foreground">CapEx variance &gt;10%:</span>{" "}
                {Math.abs(d.investing.capex.actual) > Math.abs(d.investing.capex.budget)
                  ? "CapEx spending above budget — verify if acceleration is planned or uncontrolled."
                  : "CapEx below budget — check if deferrals impact future capacity."
                }
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};
