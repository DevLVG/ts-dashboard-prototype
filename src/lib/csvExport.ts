/**
 * CSV export utilities for drill-down tables
 */

import { DrilldownRow, OpexRow } from './drilldownData';

/**
 * Format value for CSV (remove currency symbols, format numbers)
 */
const formatValueForCSV = (value: number): string => {
  return value.toFixed(2);
};

/**
 * Format percentage for CSV
 */
const formatPercentForCSV = (value: number): string => {
  return `${value.toFixed(2)}%`;
};

/**
 * Escape CSV field (handle commas, quotes, newlines)
 */
const escapeCSVField = (field: string | number): string => {
  const str = String(field);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Export Revenue/COGS/GM drill-down data to CSV
 */
export function exportRevenueDrilldownToCSV(
  rows: DrilldownRow[],
  totalActual: number,
  totalComparison: number,
  totalDelta: number,
  totalDeltaPercent: number,
  title: string
) {
  // Group by BU
  const grouped = rows.reduce((acc, row) => {
    if (!acc[row.bu]) {
      acc[row.bu] = [];
    }
    acc[row.bu].push(row);
    return acc;
  }, {} as Record<string, DrilldownRow[]>);

  // Build CSV content
  const csvRows: string[] = [];
  
  // Header
  csvRows.push(`${title} Drill-down Report`);
  csvRows.push(`Generated: ${new Date().toLocaleString('en-SA', { timeZone: 'Asia/Riyadh' })}`);
  csvRows.push(''); // Empty line
  
  // Column headers
  csvRows.push('BU,Service/Category,Actual (SAR),Comparison (SAR),Variance (SAR),Variance (%)');
  
  // Data rows
  Object.entries(grouped).forEach(([bu, services]) => {
    // BU subtotal
    const buActual = services.reduce((sum, s) => sum + s.actual, 0);
    const buComparison = services.reduce((sum, s) => sum + s.comparison, 0);
    const buDelta = buActual - buComparison;
    const buDeltaPercent = buComparison !== 0 ? (buDelta / Math.abs(buComparison)) * 100 : 0;
    
    csvRows.push(
      `${escapeCSVField(services[0]?.buDisplay || bu)},TOTAL,${formatValueForCSV(buActual)},${formatValueForCSV(buComparison)},${formatValueForCSV(buDelta)},${formatPercentForCSV(buDeltaPercent)}`
    );
    
    // Services
    services.forEach(service => {
      const serviceName = service.subCategory.replace(/_/g, ' ');
      csvRows.push(
        `${escapeCSVField(services[0]?.buDisplay || bu)},${escapeCSVField(serviceName)},${formatValueForCSV(service.actual)},${formatValueForCSV(service.comparison)},${formatValueForCSV(service.delta)},${formatPercentForCSV(service.deltaPercent)}`
      );
    });
    
    csvRows.push(''); // Empty line between BUs
  });
  
  // Grand total
  csvRows.push(`TOTAL,ALL,${formatValueForCSV(totalActual)},${formatValueForCSV(totalComparison)},${formatValueForCSV(totalDelta)},${formatPercentForCSV(totalDeltaPercent)}`);
  
  return csvRows.join('\n');
}

/**
 * Export OPEX drill-down data to CSV
 */
export function exportOpexDrilldownToCSV(
  rows: OpexRow[],
  totalActual: number,
  totalComparison: number,
  totalDelta: number,
  totalDeltaPercent: number,
  title: string
) {
  // Group by BU
  const grouped = rows.reduce((acc, row) => {
    if (!acc[row.bu]) {
      acc[row.bu] = [];
    }
    acc[row.bu].push(row);
    return acc;
  }, {} as Record<string, OpexRow[]>);

  // Build CSV content
  const csvRows: string[] = [];
  
  // Header
  csvRows.push(`${title} Drill-down Report`);
  csvRows.push(`Generated: ${new Date().toLocaleString('en-SA', { timeZone: 'Asia/Riyadh' })}`);
  csvRows.push(''); // Empty line
  
  // Column headers
  csvRows.push('BU,Category,Allocation Type,Actual (SAR),Comparison (SAR),Variance (SAR),Variance (%)');
  
  // Data rows
  Object.entries(grouped).forEach(([bu, categories]) => {
    // BU subtotal
    const buActual = categories.reduce((sum, c) => sum + c.actual, 0);
    const buComparison = categories.reduce((sum, c) => sum + c.comparison, 0);
    const buDelta = buActual - buComparison;
    const buDeltaPercent = buComparison !== 0 ? (buDelta / Math.abs(buComparison)) * 100 : 0;
    
    csvRows.push(
      `${escapeCSVField(categories[0]?.buDisplay || bu)},TOTAL,Mixed,${formatValueForCSV(buActual)},${formatValueForCSV(buComparison)},${formatValueForCSV(buDelta)},${formatPercentForCSV(buDeltaPercent)}`
    );
    
    // Categories
    categories.forEach(category => {
      const categoryName = category.subCategory.replace(/_/g, ' ');
      csvRows.push(
        `${escapeCSVField(categories[0]?.buDisplay || bu)},${escapeCSVField(categoryName)},${category.allocationType || 'N/A'},${formatValueForCSV(category.actual)},${formatValueForCSV(category.comparison)},${formatValueForCSV(category.delta)},${formatPercentForCSV(category.deltaPercent)}`
      );
    });
    
    csvRows.push(''); // Empty line between BUs
  });
  
  // Grand total
  csvRows.push(`TOTAL,ALL,Mixed,${formatValueForCSV(totalActual)},${formatValueForCSV(totalComparison)},${formatValueForCSV(totalDelta)},${formatPercentForCSV(totalDeltaPercent)}`);
  
  return csvRows.join('\n');
}

/**
 * Trigger CSV download in browser
 */
export function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
