import { Card } from "@/components/ui/card";
import { Treemap, ResponsiveContainer, Tooltip } from "recharts";
import { BUPerformance } from "@/types/dashboard";

interface ServiceMixTreemapProps {
  data: BUPerformance[];
}

export const ServiceMixTreemap = ({ data }: ServiceMixTreemapProps) => {
  const getMarginColor = (gm: number) => {
    if (gm >= 70) return "#06b6d4"; // bright cyan
    if (gm >= 50) return "#22d3ee"; // cyan
    if (gm >= 40) return "#84cc16"; // yellow-green
    if (gm >= 30) return "#ff6b35"; // orange
    return "#dc3545"; // red
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-SA", {
      style: "currency",
      currency: "SAR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatCurrencyShort = (value: number) => {
    return `SAR ${(value / 1000).toFixed(0)}K`;
  };

  // Transform BU data into treemap hierarchical format and create lookup
  const dataLookup: Record<string, any> = {};
  
  const children = data.map((bu) => {
    const gmPercent = (bu.grossMargin.actual / bu.revenue.actual) * 100;
    const ebitdaPercent = (bu.ebitda.actual / bu.revenue.actual) * 100;
    
    const item = {
      name: bu.name,
      revenue: bu.revenue.actual,
      revenueBudget: bu.revenue.budget,
      grossMargin: gmPercent,
      ebitda: bu.ebitda.actual,
      ebitdaPercent: ebitdaPercent,
      size: bu.revenue.actual,
    };
    
    // Store in lookup for easy access
    dataLookup[bu.name] = item;
    
    return item;
  });

  // Recharts Treemap requires a root node with children
  const treemapData = [
    {
      name: "Business Units",
      children: children,
    }
  ];

  const CustomizedContent = (props: any) => {
    const { x, y, width, height, name, depth } = props;
    
    // Skip the root node (depth 0)
    if (depth === 0) return null;
    
    // Only show content if rectangle is large enough and has valid coordinates
    if (!x || !y || width < 80 || height < 60 || !name) return null;

    // Look up the data by name
    const itemData = dataLookup[name];
    if (!itemData) return null;

    const { revenue, grossMargin } = itemData;

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: getMarginColor(grossMargin),
            stroke: "#fff",
            strokeWidth: 3,
            strokeOpacity: 1,
          }}
          className="transition-all duration-300 hover:brightness-110"
        />
        {width > 100 && height > 80 && (
          <>
            <text
              x={x + width / 2}
              y={y + height / 2 - 15}
              textAnchor="middle"
              fill="#fff"
              fontSize={16}
              fontWeight="bold"
            >
              {name}
            </text>
            <text
              x={x + width / 2}
              y={y + height / 2 + 5}
              textAnchor="middle"
              fill="#fff"
              fontSize={14}
            >
              {formatCurrencyShort(revenue)}
            </text>
            <text
              x={x + width / 2}
              y={y + height / 2 + 25}
              textAnchor="middle"
              fill="rgba(255, 255, 255, 0.9)"
              fontSize={12}
            >
              {grossMargin.toFixed(1)}% GM
            </text>
          </>
        )}
      </g>
    );
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div
          style={{
            backgroundColor: "hsl(var(--popover))",
            border: "2px solid hsl(var(--gold))",
            borderRadius: "var(--radius)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            padding: "12px 16px",
          }}
        >
          <p
            style={{
              color: "hsl(var(--popover-foreground))",
              fontWeight: 700,
              fontSize: "15px",
              marginBottom: "8px",
            }}
          >
            {data.name}
          </p>
          <p
            style={{
              color: "hsl(var(--popover-foreground))",
              fontWeight: 600,
              fontSize: "13px",
              padding: "3px 0",
            }}
          >
            Revenue Actual: {formatCurrency(data.revenue)}
          </p>
          <p
            style={{
              color: "hsl(var(--muted-foreground))",
              fontWeight: 600,
              fontSize: "12px",
              padding: "2px 0",
            }}
          >
            Revenue Budget: {formatCurrency(data.revenueBudget)}
          </p>
          <p
            style={{
              color: "hsl(var(--popover-foreground))",
              fontWeight: 600,
              fontSize: "13px",
              padding: "3px 0",
            }}
          >
            Gross Margin: {data.grossMargin.toFixed(1)}%
          </p>
          <p
            style={{
              color: "hsl(var(--popover-foreground))",
              fontWeight: 600,
              fontSize: "13px",
              padding: "3px 0",
            }}
          >
            EBITDA: {formatCurrency(data.ebitda)} ({data.ebitdaPercent.toFixed(1)}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-6 shadow-sm animate-fade-in hover:shadow-xl transition-all duration-300">
      <h3 className="text-2xl md:text-xl font-heading tracking-wide mb-6">
        SERVICE MIX ANALYSIS
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <Treemap
          data={treemapData}
          dataKey="size"
          aspectRatio={4 / 3}
          stroke="#fff"
          fill="#8884d8"
          content={<CustomizedContent />}
        >
          <Tooltip content={<CustomTooltip />} />
        </Treemap>
      </ResponsiveContainer>
    </Card>
  );
};
