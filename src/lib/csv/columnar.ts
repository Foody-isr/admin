import Papa from 'papaparse';

export type ParsedCsv = {
  categories: Array<{
    name: string;
    items: string[];
  }>;
};

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

/**
 * Parses a "columnar" CSV where the first non-empty row is category headers
 * and subsequent cells under each column are item names in that category.
 * Empty cells are dropped; columns may have different lengths.
 *
 * Deduplicates within each category (case-insensitive, first occurrence wins).
 */
export function parseColumnarCsv(text: string): ParsedCsv {
  const trimmed = text.replace(/^﻿/, '').trim();
  if (trimmed === '') {
    throw new CsvParseError('CSV is empty.');
  }

  const result = Papa.parse<string[]>(trimmed, {
    skipEmptyLines: 'greedy',
  });

  if (!result.data || result.data.length === 0) {
    throw new CsvParseError('CSV has no rows.');
  }

  const rows = result.data;
  const headerRow = rows[0].map((c) => (c ?? '').trim());
  const headers = headerRow.map((h, idx) => ({ name: h, idx })).filter((h) => h.name !== '');

  if (headers.length === 0) {
    throw new CsvParseError('CSV header row has no usable columns.');
  }
  if (rows.length < 2) {
    throw new CsvParseError('CSV has headers but no item rows.');
  }

  const buckets: Map<number, { name: string; seen: Set<string>; items: string[] }> = new Map();
  for (const h of headers) {
    buckets.set(h.idx, { name: h.name, seen: new Set(), items: [] });
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    for (const h of headers) {
      const raw = row[h.idx];
      if (raw === undefined || raw === null) continue;
      const value = String(raw).trim();
      if (value === '') continue;
      const bucket = buckets.get(h.idx)!;
      const key = value.toLowerCase();
      if (bucket.seen.has(key)) continue;
      bucket.seen.add(key);
      bucket.items.push(value);
    }
  }

  const categories: ParsedCsv['categories'] = [];
  for (const h of headers) {
    const bucket = buckets.get(h.idx)!;
    if (bucket.items.length > 0) {
      categories.push({ name: bucket.name, items: bucket.items });
    }
  }

  if (categories.length === 0) {
    throw new CsvParseError('CSV has headers but no item cells.');
  }

  return { categories };
}
