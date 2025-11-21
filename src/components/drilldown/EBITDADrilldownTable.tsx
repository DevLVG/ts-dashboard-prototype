import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EBITDAData } from "@/lib/drilldownData";
import { formatCurrency, formatPercent } from "@/lib/drilldownData";

interface EBITDADrilldownTableProps {
  data: EBITDAData;
}

export function EBITDADrilldownTable({ data }: EBITDADrilldownTableProps) {
  const getDeltaColor = (delta: number) => {
    if (delta > 0) return "text-success";
    if (delta < 0) return "text-destructive";
    return "text-muted-foreground";
  };

  const getDeltaVariant = (delta: number): "default" | "secondary" | "destructive" => {
    if (delta > 0) return "default";
    if (delta < 0) return "destructive";
    return "secondary";
  };

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Business Unit</TableHead>
              <TableHead className="text-right font-semibold">Actual</TableHead>
              <TableHead className="text-right font-semibold">Comparison</TableHead>
              <TableHead className="text-right font-semibold">Δ</TableHead>
              <TableHead className="text-right font-semibold">Δ%</TableHead>
              <TableHead className="text-right font-semibold">EBITDA% Act</TableHead>
              <TableHead className="text-right font-semibold">EBITDA% Cmp</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.map((row) => (
              <TableRow key={row.bu} className="hover:bg-muted/30 transition-colors">
                <TableCell className="font-medium">{row.buDisplay}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.actual)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.comparison)}
                </TableCell>
                <TableCell className="text-right">
                  <span className={getDeltaColor(row.delta)}>
                    {formatCurrency(row.delta)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Badge 
                    variant={getDeltaVariant(row.deltaPercent)}
                    className="tabular-nums"
                  >
                    {formatPercent(row.deltaPercent)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {row.actualMargin.toFixed(1)}%
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {row.comparisonMargin.toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
            
            {/* Total Row */}
            <TableRow className="border-t-2 border-border bg-muted/50 font-semibold hover:bg-muted/50">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(data.totalActual)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(data.totalComparison)}
              </TableCell>
              <TableCell className="text-right">
                <span className={getDeltaColor(data.totalDelta)}>
                  {formatCurrency(data.totalDelta)}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Badge 
                  variant={getDeltaVariant(data.totalDeltaPercent)}
                  className="tabular-nums font-semibold"
                >
                  {formatPercent(data.totalDeltaPercent)}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {data.totalMargin.toFixed(1)}%
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">
                {data.comparisonMargin.toFixed(1)}%
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
