import { useState } from "react";
import { Card } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Line, ComposedChart,
} from "recharts";
import { workingCapitalData, type WorkingCapitalMonth } from "@/data/workingCapitalData";
import { TrendingUp, TrendingDown, ArrowUpDown } from "lucide-react";

const formatSAR = (value: number) => {
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toFixed(0);
};

const formatSARFull = (value: number) =>
  new Intl.NumberFormat("en-SA", { style: "currency", currency: "SAR", minimumFractionDigits: 0 }).format(value);

export const WorkingCapitalPanel = () => {
  const [showBudget, setShowBudget] = useState(true);

  const latest = workingCapitalData[workingCapitalData.length - 1];
  const previous = workingCapitalData[workingCapitalData.length - 2];
  const netWCChange = latest.netWC.actual - previous.netWC.actual;
  const wcVsBudget = latest.netWC.actual - latest.netWC.budget;
  const wcVsBudgetPct = ((wcVsBudget / latest.netWC.budget) * 100).toFixed(1);

  // Chart data: stacked AR + Inventory (positive) and AP (negative) + Net WC line
  const chartData = workingCapitalData.map((d) => ({
    month: d.month,
    receivables: d.receivables.actual,
    inventory: d.inventory.actual,
    payables: -d.payables.actual,
    netWC: d.netWC.actual,
    netWCBudget: d.netWC.budget,
    // For tooltip
    arBudget: d.receivables.budget,
    invBudget: d.inventory.budget,
    apBudget: d.payables.budget,
  }));

  const WCIndicator = ({ label, actual, budget, isPayable }: {
    label: string; actual: number; budget: number; isPayable?: boolean;
  }) => {
    const variance = actual - budget;
    // For payables: higher actual = more cash retained (good). For AR/Inv: higher actual = more cash tied up (bad)
    const isGood = isPayable ? variance > 0 : variance < 0;
    const color = Math.abs(variance / budget) < 0.05
      ? "text-[#ffc107]"
      : isGood ? "text-[#22d3ee]" : "text-[#dc3545]";

    return (
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground font-semibold uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-heading">{formatSARFull(actual)}</p>
        <p className={`text-sm font-semibold ${color}`}>
          {variance > 0 ? "+" : ""}{formatSARFull(variance)} vs Budget
        </p>
      </div>
    );
  };

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300 group">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl md:text-xl font-heading tracking-wide transition-colors group-hover:text-gold">
            WORKING CAPITAL
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Receivables + Inventory − Payables · Monthly trend
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowBudget(!showBudget)}
            className={`text-xs px-3 py-1.5 rounded-full border font-semibold transition-colors ${
              showBudget
                ? "bg-[#22d3ee]/15 border-[#22d3ee]/40 text-[#22d3ee]"
                : "bg-muted/50 border-border text-muted-foreground"
            }`}
          >
            Budget overlay
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-4 bg-muted/30 border">
          <WCIndicator label="Net Working Capital" actual={latest.netWC.actual} budget={latest.netWC.budget} />
          <div className="flex items-center gap-1 mt-2">
            {netWCChange > 0
              ? <TrendingUp className="h-4 w-4 text-[#dc3545]" />
              : <TrendingDown className="h-4 w-4 text-[#22d3ee]" />}
            <span className="text-xs text-muted-foreground">
              {netWCChange > 0 ? "+" : ""}{formatSARFull(netWCChange)} MoM
            </span>
          </div>
        </Card>
        <Card className="p-4 bg-muted/30 border">
          <WCIndicator label="Receivables" actual={latest.receivables.actual} budget={latest.receivables.budget} />
        </Card>
        <Card className="p-4 bg-muted/30 border">
          <WCIndicator label="Inventory" actual={latest.inventory.actual} budget={latest.inventory.budget} />
        </Card>
        <Card className="p-4 bg-muted/30 border">
          <WCIndicator label="Payables" actual={latest.payables.actual} budget={latest.payables.budget} isPayable />
        </Card>
      </div>

      {/* Stacked Bar + Line Chart */}
      <ResponsiveContainer width="100%" height={380}>
        <ComposedChart data={chartData} stackOffset="sign">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
          <XAxis
            dataKey="month"
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
          />
          <YAxis
            tickFormatter={formatSAR}
            stroke="hsl(var(--muted-foreground))"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null;
              const d = payload[0]?.payload;
              return (
                <div
                  style={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "2px solid hsl(var(--gold))",
                    borderRadius: "var(--radius)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                    padding: "12px 16px",
                    minWidth: 240,
                  }}
                >
                  <p style={{ color: "hsl(var(--popover-foreground))", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>
                    {label}
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "4px 12px", fontSize: 13 }}>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}></span>
                    <span style={{ color: "hsl(var(--muted-foreground))", fontWeight: 600 }}>Actual</span>
                    <span style={{ color: "hsl(var(--muted-foreground))", fontWeight: 600 }}>Budget</span>

                    <span style={{ color: "#22d3ee" }}>Receivables</span>
                    <span style={{ color: "hsl(var(--popover-foreground))" }}>{formatSARFull(d.receivables)}</span>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>{formatSARFull(d.arBudget)}</span>

                    <span style={{ color: "#6366f1" }}>Inventory</span>
                    <span style={{ color: "hsl(var(--popover-foreground))" }}>{formatSARFull(d.inventory)}</span>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>{formatSARFull(d.invBudget)}</span>

                    <span style={{ color: "#dc3545" }}>Payables</span>
                    <span style={{ color: "hsl(var(--popover-foreground))" }}>{formatSARFull(Math.abs(d.payables))}</span>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>{formatSARFull(d.apBudget)}</span>

                    <span style={{ color: "#ffc107", fontWeight: 700, borderTop: "1px solid hsl(var(--border))", paddingTop: 4 }}>Net WC</span>
                    <span style={{ color: "hsl(var(--popover-foreground))", fontWeight: 700, borderTop: "1px solid hsl(var(--border))", paddingTop: 4 }}>
                      {formatSARFull(d.netWC)}
                    </span>
                    <span style={{ color: "hsl(var(--muted-foreground))", fontWeight: 700, borderTop: "1px solid hsl(var(--border))", paddingTop: 4 }}>
                      {formatSARFull(d.netWCBudget)}
                    </span>
                  </div>
                </div>
              );
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value: string) => {
              const map: Record<string, string> = {
                receivables: "Receivables",
                inventory: "Inventory",
                payables: "Payables",
                netWC: "Net WC (Actual)",
                netWCBudget: "Net WC (Budget)",
              };
              return map[value] || value;
            }}
          />
          <Bar dataKey="receivables" stackId="a" fill="#22d3ee" radius={[0, 0, 0, 0]} name="receivables" />
          <Bar dataKey="inventory" stackId="a" fill="#6366f1" radius={[4, 4, 0, 0]} name="inventory" />
          <Bar dataKey="payables" stackId="a" fill="#dc3545" opacity={0.8} name="payables" />
          <Line
            type="monotone"
            dataKey="netWC"
            stroke="#ffc107"
            strokeWidth={3}
            dot={{ r: 4, fill: "#ffc107" }}
            name="netWC"
          />
          {showBudget && (
            <Line
              type="monotone"
              dataKey="netWCBudget"
              stroke="#ffc107"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 3, fill: "transparent", stroke: "#ffc107" }}
              name="netWCBudget"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Insight bar */}
      <div className="mt-4 p-3 bg-muted/30 rounded-lg border">
        <div className="flex items-start gap-2">
          <ArrowUpDown className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Why cash moves:</span>{" "}
            Net WC is{" "}
            <span className={`font-semibold ${Number(wcVsBudgetPct) > 10 ? "text-[#dc3545]" : "text-[#ffc107]"}`}>
              {wcVsBudgetPct}% above budget
            </span>{" "}
            — receivables growing faster than collections ({formatSARFull(latest.receivables.actual - latest.receivables.budget)} over budget).
            {latest.payables.actual < latest.payables.budget &&
              ` Payables below budget by ${formatSARFull(latest.payables.budget - latest.payables.actual)} — faster vendor payments consuming cash.`
            }
          </p>
        </div>
      </div>
    </Card>
  );
};
