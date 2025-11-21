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
  const [expandedBUs, setExpandedBUs] = useState<Set<string>>(new Set());
  const [selectedBUIndex, setSelectedBUIndex] = useState<number>(0);
  const tableRef = useRef<HTMLDivElement>(null);

  // Group data by BU, then by Category
  const groupedData = useMemo(() => {
    const grouped: Record<string, OpexRow[]> = {};
    rows.forEach(row => {
      if (!grouped[row.bu]) {
        grouped[row.bu] = [];
      }
      grouped[row.bu].push(row);
    });
    return grouped;
  }, [rows]);

  const toggleBU = (bu: string) => {
    setExpandedBUs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(bu)) {
        newSet.delete(bu);
      } else {
        newSet.add(bu);
      }
      return newSet;
    });
  };

  const getBUTotals = (buRows: OpexRow[]) => {
    return {
      actual: buRows.reduce((sum, r) => sum + r.actual, 0),
      comparison: buRows.reduce((sum, r) => sum + r.comparison, 0),
      delta: buRows.reduce((sum, r) => sum + r.delta, 0),
    };
  };

  const buKeys = Object.keys(groupedData);

  // Keyboard shortcuts: Arrow keys to navigate and expand/collapse BUs
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (buKeys.length === 0) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setSelectedBUIndex(prev => Math.min(prev + 1, buKeys.length - 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          setSelectedBUIndex(prev => Math.max(prev - 1, 0));
          break;
        case 'ArrowRight':
        case 'Enter':
          event.preventDefault();
          const buToExpand = buKeys[selectedBUIndex];
          if (buToExpand && !expandedBUs.has(buToExpand)) {
            toggleBU(buToExpand);
          }
          break;
        case 'ArrowLeft':
          event.preventDefault();
          const buToCollapse = buKeys[selectedBUIndex];
          if (buToCollapse && expandedBUs.has(buToCollapse)) {
            toggleBU(buToCollapse);
          }
          break;
      }
    };

    if (tableRef.current) {
      tableRef.current.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      if (tableRef.current) {
        tableRef.current.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [selectedBUIndex, buKeys, expandedBUs]);

  return (
    <div ref={tableRef} tabIndex={0}>
      <div className="text-xs text-muted-foreground mb-2">
        <kbd className="px-2 py-1 bg-muted rounded">↑↓</kbd> Navigate • 
        <kbd className="px-2 py-1 bg-muted rounded ml-1">→</kbd> Expand • 
        <kbd className="px-2 py-1 bg-muted rounded ml-1">←</kbd> Collapse • 
        <kbd className="px-2 py-1 bg-muted rounded ml-1">ESC</kbd> Close
      </div>
      {/* Desktop Table */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[35%]">BU / Category</TableHead>
              <TableHead className="w-[12%]">Type</TableHead>
              <TableHead className="text-right w-[15%]">Actual</TableHead>
              <TableHead className="text-right w-[15%]">Comparison</TableHead>
              <TableHead className="text-right w-[12%]">Δ</TableHead>
              <TableHead className="text-right w-[11%]">Δ%</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Object.entries(groupedData).map(([bu, categories], index) => {
              const buTotals = getBUTotals(categories);
              const buDeltaPercent = buTotals.comparison !== 0 
                ? (buTotals.delta / Math.abs(buTotals.comparison)) * 100 
                : 0;
              const isExpanded = expandedBUs.has(bu);
              const isSelected = index === selectedBUIndex;

              return (
                <Fragment key={bu}>
                  {/* BU Row - Collapsible */}
                  <TableRow 
                    className={cn(
                      "font-semibold cursor-pointer hover:bg-muted/50 transition-colors",
                      isSelected && "ring-2 ring-primary"
                    )}
                    onClick={() => toggleBU(bu)}
                  >
                    <TableCell className="font-semibold">
                      <span className="inline-flex items-center gap-2">
                        <span className="text-muted-foreground">{isExpanded ? '▼' : '▶'}</span>
                        {formatBUName(bu)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        Mixed
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(buTotals.actual)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(buTotals.comparison)}</TableCell>
                    <TableCell className="text-right">{formatDelta(buTotals.delta)}</TableCell>
                    <TableCell className="text-right">
                      <Badge 
                        style={{ 
                          backgroundColor: `${getVarianceHexColor(buDeltaPercent, 'OpEx')}20`,
                          color: getVarianceHexColor(buDeltaPercent, 'OpEx'),
                          borderColor: getVarianceHexColor(buDeltaPercent, 'OpEx')
                        }}
                        className="border"
                      >
                        {formatPercent(buDeltaPercent)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  
                  {/* Category Rows - Collapsible */}
                  {isExpanded && categories.map((category, idx) => (
                    <TableRow key={`${bu}-${category.subCategory}-${idx}`} className="text-sm">
                      <TableCell className="pl-10">{formatCategoryName(category.subCategory)}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={category.allocationType === 'direct' ? 'default' : 'secondary'}
                          className="text-xs capitalize"
                        >
                          {category.allocationType}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{formatCurrency(category.actual)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(category.comparison)}</TableCell>
                      <TableCell className="text-right">{formatDelta(category.delta)}</TableCell>
                      <TableCell className="text-right">
                        <span 
                          className="inline-flex items-center gap-1 font-medium"
                          style={{ color: getVarianceHexColor(category.deltaPercent, 'OpEx') }}
                        >
                          {formatPercent(category.deltaPercent)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
            
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
        {Object.entries(groupedData).map(([bu, categories]) => {
          const buTotals = getBUTotals(categories);
          const buDeltaPercent = buTotals.comparison !== 0 
            ? (buTotals.delta / Math.abs(buTotals.comparison)) * 100 
            : 0;
          const isExpanded = expandedBUs.has(bu);

          return (
            <Card key={bu} className="p-4">
              {/* BU Header */}
              <div 
                className="flex justify-between items-start mb-3 cursor-pointer"
                onClick={() => toggleBU(bu)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-semibold mb-1">
                    <span className="text-muted-foreground text-sm">{isExpanded ? '▼' : '▶'}</span>
                    <span>{formatBUName(bu)}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {categories.length} {categories.length === 1 ? 'category' : 'categories'}
                  </div>
                </div>
                <Badge 
                  style={{ 
                    backgroundColor: `${getVarianceHexColor(buDeltaPercent, 'OpEx')}20`,
                    color: getVarianceHexColor(buDeltaPercent, 'OpEx'),
                    borderColor: getVarianceHexColor(buDeltaPercent, 'OpEx')
                  }}
                  className="border"
                >
                  {formatPercent(buDeltaPercent)}
                </Badge>
              </div>

              {/* BU Totals */}
              <div className="text-sm space-y-1 mb-3 pb-3 border-b">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Actual:</span>
                  <span className="font-medium">{formatCurrency(buTotals.actual)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Comparison:</span>
                  <span className="font-medium">{formatCurrency(buTotals.comparison)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Variance:</span>
                  <span 
                    className="font-medium"
                    style={{ color: getVarianceHexColor(buDeltaPercent, 'OpEx') }}
                  >
                    {formatDelta(buTotals.delta)}
                  </span>
                </div>
              </div>

              {/* Category Details */}
              {isExpanded && (
                <div className="space-y-3">
                  {categories.map((category, idx) => (
                    <div key={`${bu}-${category.subCategory}-${idx}`} className="pl-4 border-l-2 border-muted">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="font-medium text-sm mb-1">
                            {formatCategoryName(category.subCategory)}
                          </div>
                          <Badge 
                            variant={category.allocationType === 'direct' ? 'default' : 'secondary'}
                            className="text-xs capitalize"
                          >
                            {category.allocationType}
                          </Badge>
                        </div>
                        <Badge 
                          style={{ 
                            backgroundColor: `${getVarianceHexColor(category.deltaPercent, 'OpEx')}20`,
                            color: getVarianceHexColor(category.deltaPercent, 'OpEx'),
                            borderColor: getVarianceHexColor(category.deltaPercent, 'OpEx')
                          }}
                          className="border text-xs"
                        >
                          {formatPercent(category.deltaPercent)}
                        </Badge>
                      </div>
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Actual:</span>
                          <span>{formatCurrency(category.actual)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Comparison:</span>
                          <span>{formatCurrency(category.comparison)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Variance:</span>
                          <span style={{ color: getVarianceHexColor(category.deltaPercent, 'OpEx') }}>
                            {formatDelta(category.delta)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}

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
