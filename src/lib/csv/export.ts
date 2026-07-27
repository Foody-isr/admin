// Small client-side CSV export helper. Reports build a rows matrix (header row
// first) and hand it here; we quote every cell, join, and trigger a download.
// Mirrors the ad-hoc exporter in components/production/ProductionShoppingList.tsx,
// extracted so analytics reports can reuse it.

type Cell = string | number | null | undefined;

/** Quotes a single CSV cell: wraps in double-quotes and doubles inner quotes,
 *  so commas, newlines, and quotes in labels never break the columns. */
function quote(cell: Cell): string {
  const s = cell == null ? '' : String(cell);
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Builds a CSV from a rows matrix and triggers a browser download.
 * @param filename  suggested file name (".csv" appended if missing)
 * @param rows      matrix of cells; the first row is treated as the header
 */
export function downloadCsv(filename: string, rows: Cell[][]): void {
  if (typeof window === 'undefined') return;
  // Prepend a UTF-8 BOM so Excel opens Hebrew/French labels in the right encoding.
  const csv = '﻿' + rows.map((r) => r.map(quote).join(',')).join('\r\n');
  const name = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
