import { useState, useMemo, Fragment } from "react";
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
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  // Sort rows by actual amount descending
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => b.actual - a.actual);
  }, [rows]);
  
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

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
              <Fragment key={`${row.category}-${index}`}>
                {/* Category Row */}
                <TableRow className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => toggleCategory(row.category)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {expandedCategories.has(row.category) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      {formatCategoryName(row.category)}
                    </div>
                  </TableCell>
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
                
                {/* Subcategory Rows */}
                {expandedCategories.has(row.category) && row.subcategories.map((sub, subIndex) => (
                  <TableRow key={`${row.category}-${sub.subcategory}-${subIndex}`} className="bg-muted/20">
                    <TableCell className="pl-12 text-sm text-muted-foreground">
                      {formatCategoryName(sub.subcategory)}
                    </TableCell>
                    <TableCell></TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(sub.actual)}</TableCell>
                    <TableCell className="text-right text-sm">{formatCurrency(sub.comparison)}</TableCell>
                    <TableCell className="text-right text-sm">{formatDelta(sub.delta)}</TableCell>
                    <TableCell className="text-right text-sm">
                      <Badge 
                        variant="outline"
                        style={{ 
                          backgroundColor: `${getVarianceHexColor(sub.deltaPercent, 'OpEx')}10`,
                          color: getVarianceHexColor(sub.deltaPercent, 'OpEx'),
                          borderColor: getVarianceHexColor(sub.deltaPercent, 'OpEx')
                        }}
                        className="text-xs"
                      >
                        {formatPercent(sub.deltaPercent)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
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
            <Collapsible>
              <CollapsibleTrigger className="w-full">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1 flex items-center gap-2">
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                    <div>
                      <div className="font-semibold mb-1 text-left">
                        {formatCategoryName(row.category)}
                      </div>
                      <Badge 
                        variant={row.allocationType === 'direct' ? 'default' : 'secondary'}
                        className="text-xs capitalize"
                      >
                        {row.allocationType}
                      </Badge>
                    </div>
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
              </CollapsibleTrigger>

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

              <CollapsibleContent>
                <div className="mt-3 pt-3 border-t space-y-2">
                  {row.subcategories.map((sub, subIndex) => (
                    <div key={subIndex} className="pl-4 text-sm bg-muted/20 p-2 rounded">
                      <div className="font-medium mb-1 text-muted-foreground">
                        {formatCategoryName(sub.subcategory)}
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Actual:</span>
                          <span>{formatCurrency(sub.actual)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Comparison:</span>
                          <span>{formatCurrency(sub.comparison)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Variance:</span>
                          <Badge 
                            variant="outline"
                            style={{ 
                              backgroundColor: `${getVarianceHexColor(sub.deltaPercent, 'OpEx')}10`,
                              color: getVarianceHexColor(sub.deltaPercent, 'OpEx'),
                              borderColor: getVarianceHexColor(sub.deltaPercent, 'OpEx')
                            }}
                            className="text-xs"
                          >
                            {formatPercent(sub.deltaPercent)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
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
