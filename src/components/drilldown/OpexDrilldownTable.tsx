import { useState, useMemo, Fragment, useEffect, useRef } from "react";
import { Download, ArrowUpDown, ArrowUp, ArrowDown, Search, X, RotateCcw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getVarianceHexColor } from "@/lib/varianceColors";
import { OpexRow } from "@/lib/drilldownData";
import { exportOpexDrilldownToCSV, downloadCSV } from "@/lib/csvExport";
import { SummaryStatistics } from "./SummaryStatistics";

type SortColumn = 'bu' | 'actual' | 'comparison' | 'delta' | 'deltaPercent';
type SortDirection = 'asc' | 'desc' | null;

interface OpexDrilldownTableProps {
  rows: OpexRow[];
  totalActual: number;
  totalComparison: number;
  totalDelta: number;
  totalDeltaPercent: number;
  title?: string;
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatPercent = (value: number): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

const formatDelta = (value: number): string => {
  const formatted = formatCurrency(Math.abs(value));
  return value >= 0 ? `+${formatted}` : `-${formatted}`;
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
  title = 'Operating Expenses'
}: OpexDrilldownTableProps) {
  const [expandedBUs, setExpandedBUs] = useState<Set<string>>(new Set());
  const [selectedBUIndex, setSelectedBUIndex] = useState<number>(0);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const tableRef = useRef<HTMLDivElement>(null);

  const handleExportCSV = (filtered: boolean = false) => {
    const exportRows = filtered ? Object.values(groupedData).flat() : rows;
    const exportTotals = filtered ? filteredTotals : {
      actual: totalActual,
      comparison: totalComparison,
      delta: totalDelta,
      deltaPercent: totalDeltaPercent
    };
    
    const csvContent = exportOpexDrilldownToCSV(
      exportRows,
      exportTotals.actual,
      exportTotals.comparison,
      exportTotals.delta,
      exportTotals.deltaPercent,
      filtered ? `${title} (Filtered)` : title
    );
    const timestamp = new Date().toISOString().split('T')[0];
    const suffix = filtered ? '_filtered' : '';
    downloadCSV(csvContent, `${title.toLowerCase().replace(/\s+/g, '_')}_drilldown${suffix}_${timestamp}.csv`);
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn(null);
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleReset = () => {
    setSearchTerm("");
    setSortColumn(null);
    setSortDirection(null);
  };

  const hasActiveFilters = searchTerm !== "" || sortColumn !== null;

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp className="h-3 w-3 ml-1" />;
    }
    return <ArrowDown className="h-3 w-3 ml-1" />;
  };

  // Group data by BU, then by Category with search filtering
  const groupedData = useMemo(() => {
    let filteredRows = rows;
    
    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filteredRows = rows.filter(row => {
        const buName = (row.buDisplay || row.bu).toLowerCase();
        const categoryName = row.subCategory.replace(/_/g, ' ').toLowerCase();
        return buName.includes(searchLower) || categoryName.includes(searchLower);
      });
    }
    
    const grouped: Record<string, OpexRow[]> = {};
    filteredRows.forEach(row => {
      if (!grouped[row.bu]) {
        grouped[row.bu] = [];
      }
      grouped[row.bu].push(row);
    });
    
    // Auto-expand if search is active
    if (searchTerm.trim() && expandedBUs.size === 0) {
      setExpandedBUs(new Set(Object.keys(grouped)));
    }
    
    return grouped;
  }, [rows, searchTerm]);

  // Sort grouped data
  const sortedBUEntries = useMemo(() => {
    const entries = Object.entries(groupedData);
    
    if (!sortColumn || !sortDirection) {
      return entries;
    }

    return entries.sort(([buA, categoriesA], [buB, categoriesB]) => {
      let valueA: number;
      let valueB: number;

      if (sortColumn === 'bu') {
        return sortDirection === 'asc' 
          ? buA.localeCompare(buB)
          : buB.localeCompare(buA);
      }

      // Calculate BU totals for sorting
      const totalA = categoriesA.reduce((sum, c) => ({
        actual: sum.actual + c.actual,
        comparison: sum.comparison + c.comparison,
        delta: sum.delta + c.delta,
      }), { actual: 0, comparison: 0, delta: 0 });

      const totalB = categoriesB.reduce((sum, c) => ({
        actual: sum.actual + c.actual,
        comparison: sum.comparison + c.comparison,
        delta: sum.delta + c.delta,
      }), { actual: 0, comparison: 0, delta: 0 });

      switch (sortColumn) {
        case 'actual':
          valueA = totalA.actual;
          valueB = totalB.actual;
          break;
        case 'comparison':
          valueA = totalA.comparison;
          valueB = totalB.comparison;
          break;
        case 'delta':
          valueA = totalA.delta;
          valueB = totalB.delta;
          break;
        case 'deltaPercent':
          valueA = totalA.comparison !== 0 ? (totalA.delta / Math.abs(totalA.comparison)) * 100 : 0;
          valueB = totalB.comparison !== 0 ? (totalB.delta / Math.abs(totalB.comparison)) * 100 : 0;
          break;
        default:
          return 0;
      }

      return sortDirection === 'asc' ? valueA - valueB : valueB - valueA;
    });
  }, [groupedData, sortColumn, sortDirection]);

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
  
  // Calculate filtered totals for display
  const filteredTotals = useMemo(() => {
    const allFilteredCategories = Object.values(groupedData).flat();
    const actual = allFilteredCategories.reduce((sum, c) => sum + c.actual, 0);
    const comparison = allFilteredCategories.reduce((sum, c) => sum + c.comparison, 0);
    const delta = actual - comparison;
    const deltaPercent = comparison !== 0 ? (delta / Math.abs(comparison)) * 100 : 0;
    
    return { actual, comparison, delta, deltaPercent, count: allFilteredCategories.length };
  }, [groupedData]);

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
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-xs text-muted-foreground">
          <kbd className="px-2 py-1 bg-muted rounded">↑↓</kbd> Navigate • 
          <kbd className="px-2 py-1 bg-muted rounded ml-1">→</kbd> Expand • 
          <kbd className="px-2 py-1 bg-muted rounded ml-1">←</kbd> Collapse • 
          <kbd className="px-2 py-1 bg-muted rounded ml-1">ESC</kbd> Close
        </div>
        <div className="flex gap-2">
          {hasActiveFilters && (
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => handleExportCSV(true)}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export Filtered
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => handleExportCSV(false)}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export All
          </Button>
        </div>
      </div>

      {/* Search Bar and Reset */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search BUs or categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchTerm && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => setSearchTerm('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {hasActiveFilters && (
          <Button
            variant="outline"
            size="icon"
            onClick={handleReset}
            title="Reset all filters and sorting"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Search Results Info */}
      {searchTerm && (
        <div className="text-sm text-muted-foreground mb-4">
          Found {filteredTotals.count} {filteredTotals.count === 1 ? 'item' : 'items'} matching "{searchTerm}"
          {filteredTotals.count > 0 && (
            <span className="ml-2">
              • Total: {formatCurrency(filteredTotals.actual)} 
              ({formatPercent(filteredTotals.deltaPercent)})
            </span>
          )}
        </div>
      )}

      {/* Summary Statistics */}
      <SummaryStatistics rows={rows} metricLabel={title} />

      {/* Desktop Table */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead 
                className="w-[35%] cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('bu')}
              >
                <div className="flex items-center">
                  BU / Category
                  {getSortIcon('bu')}
                </div>
              </TableHead>
              <TableHead className="w-[12%]">Type</TableHead>
              <TableHead 
                className="text-right w-[15%] cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('actual')}
              >
                <div className="flex items-center justify-end">
                  Actual
                  {getSortIcon('actual')}
                </div>
              </TableHead>
              <TableHead 
                className="text-right w-[15%] cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('comparison')}
              >
                <div className="flex items-center justify-end">
                  Comparison
                  {getSortIcon('comparison')}
                </div>
              </TableHead>
              <TableHead 
                className="text-right w-[12%] cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('delta')}
              >
                <div className="flex items-center justify-end">
                  Δ
                  {getSortIcon('delta')}
                </div>
              </TableHead>
              <TableHead 
                className="text-right w-[11%] cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('deltaPercent')}
              >
                <div className="flex items-center justify-end">
                  Δ%
                  {getSortIcon('deltaPercent')}
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedBUEntries.map(([bu, categories], index) => {
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
        {sortedBUEntries.map(([bu, categories]) => {
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
