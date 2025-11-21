import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { ConcentrationMetrics } from "@/lib/concentration";
import { cn } from "@/lib/utils";

interface ConcentrationPanelProps {
  metrics: ConcentrationMetrics;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export function ConcentrationPanel({ metrics }: ConcentrationPanelProps) {
  const getLevelColor = (level: 'LOW' | 'MODERATE' | 'HIGH') => {
    switch (level) {
      case 'LOW':
        return 'default';
      case 'MODERATE':
        return 'secondary';
      case 'HIGH':
        return 'destructive';
    }
  };

  const getLevelBgClass = (level: 'LOW' | 'MODERATE' | 'HIGH') => {
    switch (level) {
      case 'LOW':
        return 'bg-chart-1/5';
      case 'MODERATE':
        return 'bg-chart-3/5';
      case 'HIGH':
        return 'bg-chart-5/5';
    }
  };

  const topThreeConcentration = metrics.topStreams.reduce((sum, stream) => sum + stream.percent, 0);

  return (
    <Card className="p-6 mt-6">
      <h3 className="font-semibold text-lg mb-6">Revenue Concentration Analysis</h3>
      
      {/* HHI Gauge */}
      <div className="mb-8">
        <p className="text-sm text-muted-foreground mb-3">Herfindahl-Hirschman Index (HHI)</p>
        <div className="flex items-center justify-center gap-4 mb-4">
          <span className="text-5xl font-bold">{metrics.hhi.toFixed(0)}</span>
          <Badge variant={getLevelColor(metrics.level)} className="text-sm px-3 py-1">
            {metrics.level}
          </Badge>
        </div>
        
        {/* HHI Scale visualization */}
        <div className="relative h-8 rounded-full overflow-hidden bg-gradient-to-r from-chart-1 via-chart-3 to-chart-5 mb-2">
          <div 
            className="absolute top-0 bottom-0 w-1 bg-foreground"
            style={{ left: `${Math.min((metrics.hhi / 10000) * 100, 100)}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-foreground rounded-full border-2 border-background" />
          </div>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mb-3">
          <span>0</span>
          <span>1500</span>
          <span>2500</span>
          <span>10000</span>
        </div>
        
        <p className="text-center text-sm">
          <span className="text-muted-foreground">Diversification: </span>
          <span className="font-semibold">{metrics.effectiveServices.toFixed(1)} effective services</span>
        </p>
      </div>
      
      {/* Top Revenue Streams */}
      <div className="mb-6">
        <p className="text-sm font-medium mb-4">Top Revenue Streams</p>
        <div className="space-y-3">
          {metrics.topStreams.map((stream, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold",
                    getLevelBgClass(metrics.level)
                  )}>
                    {i + 1}
                  </span>
                  <span className="font-medium">{stream.name}</span>
                </div>
                <span className="font-semibold">{stream.percent.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-2">
                <Progress value={stream.percent} max={100} className="h-2 flex-1" />
                <span className="text-xs text-muted-foreground min-w-[80px] text-right">
                  {formatCurrency(stream.amount)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Top 3 Concentration Summary */}
      <div className="pt-4 border-t">
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm font-medium">Top 3 Concentration:</span>
          <span className="text-3xl font-bold">{topThreeConcentration.toFixed(1)}%</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Top three services account for {topThreeConcentration.toFixed(0)}% of total revenue
        </p>
      </div>
      
      {/* Insights / Warnings */}
      {metrics.level === 'HIGH' && (
        <Alert variant="destructive" className="mt-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            High concentration in top services represents revenue risk. Consider diversification strategies to reduce dependency on few revenue streams.
          </AlertDescription>
        </Alert>
      )}
      
      {metrics.level === 'MODERATE' && (
        <Alert className="mt-4 border-chart-3 bg-chart-3/10">
          <AlertCircle className="h-4 w-4 text-chart-3" />
          <AlertDescription className="text-sm">
            Moderate concentration detected. Monitor top revenue streams and evaluate opportunities for diversification.
          </AlertDescription>
        </Alert>
      )}
      
      {metrics.level === 'LOW' && (
        <Alert className="mt-4 border-chart-1 bg-chart-1/10">
          <AlertCircle className="h-4 w-4 text-chart-1" />
          <AlertDescription className="text-sm">
            Revenue is well-diversified across services, reducing business risk from individual stream performance.
          </AlertDescription>
        </Alert>
      )}
    </Card>
  );
}
