import { useState, useMemo, Fragment, useEffect, useRef } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getVarianceHexColor } from "@/lib/varianceColors";
import { OpexRow } from "@/lib/drilldownData";

interface OpexDrilldownTableProps {
  rows: OpexRow[];
  totalActual: number;
  totalComparison: number;
  totalDelta: number;
  totalDeltaPercent: number;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatDelta = (value: number): string => {
  const formatted = formatCurrency(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
};

const formatPercent = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

const formatBUName = (bu: string): string => {
  return bu.replace(/^BU\d+_/, '');
};

const formatCategoryName = (category: string): string => {
  return category.replace(/_/g, ' ');
};

export function OpexDrilldownTable({
  rows,
  totalActual,
  totalComparison,
  totalDelta,
  totalDeltaPercent,
}: OpexDrilldownTableProps) {
  // Sort rows by actual amount descending
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => b.actual - a.actual);
  }, [rows]);

  return (
    <div>
      {/* Desktop Table */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">Category</TableHead>
              <TableHead className="w-[12%]">Type</TableHead>
              <TableHead className="text-right w-[15%]">Actual</TableHead>
              <TableHead className="text-right w-[15%]">Comparison</TableHead>
              <TableHead className="text-right w-[12%]">Δ</TableHead>
              <TableHead className="text-right w-[11%]">Δ%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row, index) => (
              <TableRow key={`${row.category}-${index}`} className="hover:bg-muted/50 transition-colors">
                <TableCell className="font-medium">{formatCategoryName(row.category)}</TableCell>
                <TableCell>
                  <Badge 
                    variant={row.allocationType === 'direct' ? 'default' : 'secondary'}
                    className="text-xs capitalize"
                  >
                    {row.allocationType}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(row.actual)}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.comparison)}</TableCell>
                <TableCell className="text-right">{formatDelta(row.delta)}</TableCell>
                <TableCell className="text-right">
                  <Badge 
                    style={{ 
                      backgroundColor: `${getVarianceHexColor(row.deltaPercent, 'OpEx')}20`,
                      color: getVarianceHexColor(row.deltaPercent, 'OpEx'),
                      borderColor: getVarianceHexColor(row.deltaPercent, 'OpEx')
                    }}
                    className="border"
                  >
                    {formatPercent(row.deltaPercent)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            
            {/* Total Row */}
            <TableRow className="font-bold border-t-2 bg-muted/30">
              <TableCell className="font-bold">TOTAL</TableCell>
              <TableCell></TableCell>
              <TableCell className="text-right font-bold">{formatCurrency(totalActual)}</TableCell>
              <TableCell className="text-right font-bold">{formatCurrency(totalComparison)}</TableCell>
              <TableCell className="text-right font-bold">{formatDelta(totalDelta)}</TableCell>
              <TableCell className="text-right">
                <Badge 
                  style={{ 
                    backgroundColor: `${getVarianceHexColor(totalDeltaPercent, 'OpEx')}30`,
                    color: getVarianceHexColor(totalDeltaPercent, 'OpEx'),
                    borderColor: getVarianceHexColor(totalDeltaPercent, 'OpEx')
                  }}
                  className="border font-bold"
                >
                  {formatPercent(totalDeltaPercent)}
                </Badge>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card Layout */}
      <div className="md:hidden space-y-3">
        {sortedRows.map((row, index) => (
          <Card key={`${row.category}-${index}`} className="p-4">
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <div className="font-semibold mb-1">
                  {formatCategoryName(row.category)}
                </div>
                <Badge 
                  variant={row.allocationType === 'direct' ? 'default' : 'secondary'}
                  className="text-xs capitalize"
                >
                  {row.allocationType}
                </Badge>
              </div>
              <Badge 
                style={{ 
                  backgroundColor: `${getVarianceHexColor(row.deltaPercent, 'OpEx')}20`,
                  color: getVarianceHexColor(row.deltaPercent, 'OpEx'),
                  borderColor: getVarianceHexColor(row.deltaPercent, 'OpEx')
                }}
                className="border"
              >
                {formatPercent(row.deltaPercent)}
              </Badge>
            </div>

            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Actual:</span>
                <span className="font-medium">{formatCurrency(row.actual)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Comparison:</span>
                <span className="font-medium">{formatCurrency(row.comparison)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Variance:</span>
                <span 
                  className="font-medium"
                  style={{ color: getVarianceHexColor(row.deltaPercent, 'OpEx') }}
                >
                  {formatDelta(row.delta)}
                </span>
              </div>
            </div>
          </Card>
        ))}

        {/* Mobile Total Card */}
        <Card className="p-4 bg-muted/30">
          <div className="flex justify-between items-center mb-3">
            <span className="font-bold">TOTAL</span>
            <Badge 
              style={{ 
                backgroundColor: `${getVarianceHexColor(totalDeltaPercent, 'OpEx')}30`,
                color: getVarianceHexColor(totalDeltaPercent, 'OpEx'),
                borderColor: getVarianceHexColor(totalDeltaPercent, 'OpEx')
              }}
              className="border font-bold"
            >
              {formatPercent(totalDeltaPercent)}
            </Badge>
          </div>
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Actual:</span>
              <span className="font-bold">{formatCurrency(totalActual)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Comparison:</span>
              <span className="font-bold">{formatCurrency(totalComparison)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Variance:</span>
              <span 
                className="font-bold"
                style={{ color: getVarianceHexColor(totalDeltaPercent, 'OpEx') }}
              >
                {formatDelta(totalDelta)}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
