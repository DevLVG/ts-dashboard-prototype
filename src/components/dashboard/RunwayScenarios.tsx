import { Card } from "@/components/ui/card";

interface RunwayScenario {
  label: string;
  months: number;
  description: string;
}

interface RunwayScenariosProps {
  currentBurn: number;
  budgetBurn: number;
  cashBalance: number;
}

export const RunwayScenarios = ({ currentBurn, budgetBurn, cashBalance }: RunwayScenariosProps) => {
  const scenarios: RunwayScenario[] = [
    {
      label: "Current Burn Scenario",
      months: cashBalance / currentBurn,
      description: "At current spending rate",
    },
    {
      label: "Budget Burn Scenario",
      months: cashBalance / budgetBurn,
      description: "If burn = budget",
    },
    {
      label: "Aggressive Burn Scenario",
      months: cashBalance / (currentBurn * 1.2),
      description: "If burn increases 20%",
    },
  ];

  const getScenarioColor = (months: number) => {
    if (months >= 6) return "bg-[#22d3ee]/10 border-[#22d3ee]/30";
    if (months >= 3) return "bg-[#ffc107]/15 border-[#ffc107]/40";
    return "bg-[#dc3545]/10 border-[#dc3545]/30";
  };

  const getTextColor = (months: number) => {
    if (months >= 6) return "text-[#22d3ee]";
    if (months >= 3) return "text-[#ffc107]";
    return "text-[#dc3545]";
  };

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
      <h3 className="text-2xl md:text-xl font-heading tracking-wide mb-6">
        RUNWAY SCENARIOS
      </h3>
      <div className="space-y-4">
        {scenarios.map((scenario, index) => (
          <Card
            key={index}
            className={`p-4 border-2 transition-all duration-300 hover:shadow-lg ${getScenarioColor(scenario.months)}`}
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {scenario.label}
            </p>
            <p className={`text-3xl md:text-2xl font-heading tracking-tight mb-1 ${getTextColor(scenario.months)}`}>
              {scenario.months.toFixed(1)} months
            </p>
            <p className="text-xs text-muted-foreground">
              {scenario.description}
            </p>
          </Card>
        ))}
      </div>
    </Card>
  );
};
