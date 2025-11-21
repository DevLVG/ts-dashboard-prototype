import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SummaryPanelProps {
  label: string;
  actualPercent: number;
  comparisonPercent: number;
  deltaPP: number;
  colorLogic: 'lower-is-better' | 'higher-is-better';
}

function getColorForDelta(
  deltaPP: number, 
  logic: 'lower-is-better' | 'higher-is-better'
): { variant: 'default' | 'secondary' | 'destructive'; bgClass: string; textClass: string } {
  
  if (logic === 'lower-is-better') {
    // For COGS%, OPEX%: lower actual = better
    if (deltaPP < 0) {
      return { 
        variant: 'default', 
        bgClass: 'bg-chart-1/10 border-chart-1/20', 
        textClass: 'text-chart-1' 
      };
    }
    if (deltaPP <= 0.5) {
      return { 
        variant: 'secondary', 
        bgClass: 'bg-chart-3/10 border-chart-3/20', 
        textClass: 'text-chart-3' 
      };
    }
    return { 
      variant: 'destructive', 
      bgClass: 'bg-chart-5/10 border-chart-5/20', 
      textClass: 'text-chart-5' 
    };
  } else {
    // For GM%, EBITDA%: higher actual = better
    if (deltaPP >= 0) {
      return { 
        variant: 'default', 
        bgClass: 'bg-chart-1/10 border-chart-1/20', 
        textClass: 'text-chart-1' 
      };
    }
    if (deltaPP >= -0.5) {
      return { 
        variant: 'secondary', 
        bgClass: 'bg-chart-3/10 border-chart-3/20', 
        textClass: 'text-chart-3' 
      };
    }
    return { 
      variant: 'destructive', 
      bgClass: 'bg-chart-5/10 border-chart-5/20', 
      textClass: 'text-chart-5' 
    };
  }
}

export function SummaryPanel({ 
  label, 
  actualPercent, 
  comparisonPercent, 
  deltaPP,
  colorLogic 
}: SummaryPanelProps) {
  
  const colorConfig = getColorForDelta(deltaPP, colorLogic);
  
  return (
    <Card className={cn(
      "p-6 mb-6 border-2",
      colorConfig.bgClass
    )}>
      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2">{label}</p>
        
        {/* Large percentage display */}
        <div className={cn("text-7xl font-bold mb-4", colorConfig.textClass)}>
          {actualPercent.toFixed(1)}%
        </div>
        
        {/* Progress bar */}
        <Progress 
          value={Math.min(actualPercent, 100)} 
          max={100}
          className="h-3 mb-4"
        />
        
        {/* Comparison */}
        <div className="flex items-center justify-center gap-2 text-lg">
          <span className="text-muted-foreground">Comparison:</span>
          <span className="font-semibold">{comparisonPercent.toFixed(1)}%</span>
          <Badge variant={colorConfig.variant}>
            Δ {deltaPP > 0 ? '+' : ''}{deltaPP.toFixed(1)}pp
          </Badge>
        </div>
        
        <p className="text-xs text-muted-foreground mt-2">
          {colorLogic === 'lower-is-better' ? 'Lower is better' : 'Higher is better'}
        </p>
      </div>
    </Card>
  );
}
