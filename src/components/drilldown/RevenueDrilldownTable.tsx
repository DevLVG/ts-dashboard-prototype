import { useState, useMemo, Fragment, useEffect, useRef } from "react";
import { ChevronDown, ChevronRight, Download, ArrowUpDown, ArrowUp, ArrowDown, Search, X, RotateCcw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getVarianceTextColor } from "@/lib/varianceColors";
import { DrilldownRow, formatCurrency, formatDelta, formatPercent, formatServiceName } from "@/lib/drilldownData";
import { exportRevenueDrilldownToCSV, downloadCSV } from "@/lib/csvExport";
import { SummaryStatistics } from "./SummaryStatistics";

type SortColumn = 'bu' | 'actual' | 'comparison' | 'delta' | 'deltaPercent';
type SortDirection = 'asc' | 'desc' | null;

interface RevenueDrilldownTableProps {
  rows: DrilldownRow[];
  totalActual: number;
  totalComparison: number;
  totalDelta: number;
  totalDeltaPercent: number;
  title?: string;
}

export function RevenueDrilldownTable({ 
  rows, 
  totalActual, 
  totalComparison, 
  totalDelta, 
  totalDeltaPercent,
  title = 'Revenue'
}: RevenueDrilldownTableProps) {
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
    
    const csvContent = exportRevenueDrilldownToCSV(
      exportRows,
      exportTotals.actual,
      exportTotals.comparison,
      exportTotals.delta,
      exportTotals.deltaPercent,
      filtered ? `${title} (Filtered)` : title
    );
    const timestamp = new Date().toISOString().split('T')[0];
    const suffix = filtered ? '_filtered' : '';
    downloadCSV(csvContent, `${title.toLowerCase()}_drilldown${suffix}_${timestamp}.csv`);
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

  // Group data by BU and apply search filtering
  const groupedData = useMemo(() => {
    let filteredRows = rows;
    
    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filteredRows = rows.filter(row => {
        const buName = (row.buDisplay || row.bu).toLowerCase();
        const serviceName = row.subCategory.replace(/_/g, ' ').toLowerCase();
        return buName.includes(searchLower) || serviceName.includes(searchLower);
      });
    }
    
    const grouped = filteredRows.reduce((acc, row) => {
      if (!acc[row.bu]) {
        acc[row.bu] = [];
      }
      acc[row.bu].push(row);
      return acc;
    }, {} as Record<string, DrilldownRow[]>);

    // Auto-expand if only one BU or search is active
    if ((Object.keys(grouped).length === 1 || searchTerm.trim()) && expandedBUs.size === 0) {
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

    return entries.sort(([buA, servicesA], [buB, servicesB]) => {
      let valueA: number;
      let valueB: number;

      if (sortColumn === 'bu') {
        return sortDirection === 'asc' 
          ? buA.localeCompare(buB)
          : buB.localeCompare(buA);
      }

      // Calculate BU totals for sorting
      const totalA = servicesA.reduce((sum, s) => ({
        actual: sum.actual + s.actual,
        comparison: sum.comparison + s.comparison,
        delta: sum.delta + s.delta,
      }), { actual: 0, comparison: 0, delta: 0 });

      const totalB = servicesB.reduce((sum, s) => ({
        actual: sum.actual + s.actual,
        comparison: sum.comparison + s.comparison,
        delta: sum.delta + s.delta,
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

  const getBUTotals = (services: DrilldownRow[]) => {
    return {
      actual: services.reduce((sum, s) => sum + s.actual, 0),
      comparison: services.reduce((sum, s) => sum + s.comparison, 0),
      delta: services.reduce((sum, s) => sum + s.delta, 0)
    };
  };

  const buKeys = Object.keys(groupedData);
  
  // Calculate filtered totals for display
  const filteredTotals = useMemo(() => {
    const allFilteredServices = Object.values(groupedData).flat();
    const actual = allFilteredServices.reduce((sum, s) => sum + s.actual, 0);
    const comparison = allFilteredServices.reduce((sum, s) => sum + s.comparison, 0);
    const delta = actual - comparison;
    const deltaPercent = comparison !== 0 ? (delta / Math.abs(comparison)) * 100 : 0;
    
    return { actual, comparison, delta, deltaPercent, count: allFilteredServices.length };
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
    <div className="space-y-4" ref={tableRef} tabIndex={0}>
      <div className="flex items-center justify-between gap-3">
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
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search BUs or services..."
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
        <div className="text-sm text-muted-foreground">
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
      <div className="hidden md:block border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead 
                className="w-[40%] cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('bu')}
              >
                <div className="flex items-center">
                  BU / Service
                  {getSortIcon('bu')}
                </div>
              </TableHead>
              <TableHead 
                className="text-right cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('actual')}
              >
                <div className="flex items-center justify-end">
                  Actual
                  {getSortIcon('actual')}
                </div>
              </TableHead>
              <TableHead 
                className="text-right cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('comparison')}
              >
                <div className="flex items-center justify-end">
                  Comparison
                  {getSortIcon('comparison')}
                </div>
              </TableHead>
              <TableHead 
                className="text-right cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('delta')}
              >
                <div className="flex items-center justify-end">
                  Δ
                  {getSortIcon('delta')}
                </div>
              </TableHead>
              <TableHead 
                className="text-right w-[100px] cursor-pointer hover:bg-muted/50"
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
            {sortedBUEntries.map(([bu, services], index) => {
              const totals = getBUTotals(services);
              const buDeltaPercent = totals.comparison !== 0 
                ? (totals.delta / Math.abs(totals.comparison)) * 100 
                : 0;
              const isExpanded = expandedBUs.has(bu);
              const isSelected = index === selectedBUIndex;

              return (
                <Fragment key={bu}>
                  {/* BU Row - Collapsible */}
                  <TableRow 
                    className={cn(
                      "font-semibold cursor-pointer hover:bg-muted/50 bg-muted/20",
                      isSelected && "ring-2 ring-primary"
                    )}
                    onClick={() => toggleBU(bu)}
                  >
                    <TableCell className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      {services[0]?.buDisplay || bu}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.actual)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(totals.comparison)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn(getVarianceTextColor(buDeltaPercent, "Revenue"))}>
                        {formatDelta(totals.delta)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge 
                        variant={
                          buDeltaPercent >= 0 ? "default" : 
                          buDeltaPercent >= -5 ? "secondary" : 
                          "destructive"
                        }
                        className="font-semibold"
                      >
                        {formatPercent(buDeltaPercent)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                  
                  {/* Service Rows - Collapsible */}
                  {isExpanded && services.map((service, idx) => (
                    <TableRow key={`${bu}-${service.subCategory}-${idx}`} className="text-sm">
                      <TableCell className="pl-10">
                        {formatServiceName(service.subCategory)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(service.actual)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(service.comparison)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(getVarianceTextColor(service.deltaPercent, "Revenue"))}>
                          {formatDelta(service.delta)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn(
                          "inline-flex items-center gap-1 font-medium",
                          getVarianceTextColor(service.deltaPercent, "Revenue")
                        )}>
                          {formatPercent(service.deltaPercent)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
            
            {/* Total Row */}
            <TableRow className="font-bold border-t-2 bg-muted/30">
              <TableCell>TOTAL REVENUE</TableCell>
              <TableCell className="text-right">{formatCurrency(totalActual)}</TableCell>
              <TableCell className="text-right">{formatCurrency(totalComparison)}</TableCell>
              <TableCell className="text-right">
                <span className={cn(getVarianceTextColor(totalDeltaPercent, "Revenue"))}>
                  {formatDelta(totalDelta)}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Badge 
                  variant={
                    totalDeltaPercent >= 0 ? "default" : 
                    totalDeltaPercent >= -5 ? "secondary" : 
                    "destructive"
                  }
                  className="font-bold"
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
        {sortedBUEntries.map(([bu, services]) => {
          const totals = getBUTotals(services);
          const buDeltaPercent = totals.comparison !== 0 
            ? (totals.delta / Math.abs(totals.comparison)) * 100 
            : 0;
          const isExpanded = expandedBUs.has(bu);

          return (
            <div key={bu} className="border rounded-lg overflow-hidden">
              {/* BU Header */}
              <div 
                className="p-4 bg-muted/20 cursor-pointer"
                onClick={() => toggleBU(bu)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 font-semibold">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    {services[0]?.buDisplay || bu}
                  </div>
                  <Badge 
                    variant={
                      buDeltaPercent >= 0 ? "default" : 
                      buDeltaPercent >= -5 ? "secondary" : 
                      "destructive"
                    }
                  >
                    {formatPercent(buDeltaPercent)}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Actual:</span>
                    <div className="font-medium">{formatCurrency(totals.actual)}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Comparison:</span>
                    <div className="font-medium">{formatCurrency(totals.comparison)}</div>
                  </div>
                </div>
              </div>

              {/* Service Cards */}
              {isExpanded && (
                <div className="p-2 space-y-2 bg-background">
                  {services.map((service, idx) => (
                    <div key={`${bu}-${service.subCategory}-${idx}`} className="p-3 border rounded-md">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-sm">
                          {formatServiceName(service.subCategory)}
                        </span>
                        <span className={cn(
                          "text-sm font-medium",
                          getVarianceTextColor(service.deltaPercent, "Revenue")
                        )}>
                          {formatPercent(service.deltaPercent)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">Actual:</span>
                          <div>{formatCurrency(service.actual)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Comparison:</span>
                          <div>{formatCurrency(service.comparison)}</div>
                        </div>
                      </div>
                      <div className="mt-1 text-sm">
                        <span className="text-muted-foreground">Variance:</span>
                        <span className={cn(
                          "ml-2 font-medium",
                          getVarianceTextColor(service.deltaPercent, "Revenue")
                        )}>
                          {formatDelta(service.delta)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Total Card */}
        <div className="p-4 border-2 rounded-lg bg-muted/30">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold">TOTAL REVENUE</span>
            <Badge 
              variant={
                totalDeltaPercent >= 0 ? "default" : 
                totalDeltaPercent >= -5 ? "secondary" : 
                "destructive"
              }
              className="font-bold"
            >
              {formatPercent(totalDeltaPercent)}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Actual:</span>
              <div className="font-bold">{formatCurrency(totalActual)}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Comparison:</span>
              <div className="font-bold">{formatCurrency(totalComparison)}</div>
            </div>
          </div>
          <div className="mt-1 text-sm">
            <span className="text-muted-foreground">Variance:</span>
            <span className={cn(
              "ml-2 font-bold",
              getVarianceTextColor(totalDeltaPercent, "Revenue")
            )}>
              {formatDelta(totalDelta)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
