import Papa from 'papaparse';

export type ParsedCsv = {
  categories: Array<{
    name: string;
    items: ParsedCsvItem[];
  }>;
};

export type ParsedCsvItem = {
  name: string;
  price?: number;
  image_url?: string;
};

export class CsvParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvParseError';
  }
}

/**
 * Parses either:
 * - the legacy columnar CSV where category names are headers and cells below
 *   are item names; or
 * - a structured CSV with category,name and optional price,image_url columns.
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
  const structured = parseStructuredCsv(rows, headerRow);
  if (structured) return structured;

  const headers = headerRow.map((h, idx) => ({ name: h, idx })).filter((h) => h.name !== '');

  if (headers.length === 0) {
    throw new CsvParseError('CSV header row has no usable columns.');
  }
  if (rows.length < 2) {
    throw new CsvParseError('CSV has headers but no item rows.');
  }

  const buckets: Map<number, { name: string; seen: Set<string>; items: ParsedCsvItem[] }> = new Map();
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
      bucket.items.push({ name: value });
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

const STRUCTURED_HEADER_ALIASES = {
  category: new Set(['category', 'categorie', 'category_name', 'categorie_name', 'קטגוריה']),
  name: new Set(['name', 'item', 'item_name', 'article', 'nom', 'שם']),
  price: new Set(['price', 'prix', 'מחיר']),
  image_url: new Set(['image', 'image_url', 'photo', 'photo_url', 'url_image', 'תמונה']),
} as const;

type StructuredField = keyof typeof STRUCTURED_HEADER_ALIASES;

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

function parseStructuredCsv(rows: string[][], headerRow: string[]): ParsedCsv | null {
  const indexes = new Map<StructuredField, number>();
  headerRow.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(STRUCTURED_HEADER_ALIASES) as Array<
      [StructuredField, ReadonlySet<string>]
    >) {
      if (!indexes.has(field) && aliases.has(normalized)) indexes.set(field, index);
    }
  });

  if (indexes.size === 0) return null;
  if (!indexes.has('category') || !indexes.has('name')) {
    throw new CsvParseError('Structured CSV requires category and name columns.');
  }
  if (rows.length < 2) {
    throw new CsvParseError('CSV has headers but no item rows.');
  }

  const categoryIndex = indexes.get('category')!;
  const nameIndex = indexes.get('name')!;
  const priceIndex = indexes.get('price');
  const imageIndex = indexes.get('image_url');
  const categories = new Map<string, { name: string; seen: Set<string>; items: ParsedCsvItem[] }>();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    const category = String(row[categoryIndex] ?? '').trim();
    const name = String(row[nameIndex] ?? '').trim();
    const rawPrice = priceIndex === undefined ? '' : String(row[priceIndex] ?? '').trim();
    const imageUrl = imageIndex === undefined ? '' : String(row[imageIndex] ?? '').trim();

    if (!category && !name && !rawPrice && !imageUrl) continue;
    if (!category || !name) {
      throw new CsvParseError(`CSV row ${rowIndex + 1} requires both category and name.`);
    }

    const item: ParsedCsvItem = { name };
    if (rawPrice) item.price = parsePrice(rawPrice, rowIndex + 1);
    if (imageUrl) item.image_url = parseImageUrl(imageUrl, rowIndex + 1);

    const categoryKey = category.toLowerCase();
    let bucket = categories.get(categoryKey);
    if (!bucket) {
      bucket = { name: category, seen: new Set(), items: [] };
      categories.set(categoryKey, bucket);
    }
    const itemKey = name.toLowerCase();
    if (bucket.seen.has(itemKey)) continue;
    bucket.seen.add(itemKey);
    bucket.items.push(item);
  }

  const parsedCategories = Array.from(categories.values()).map(({ name, items }) => ({ name, items }));
  if (parsedCategories.length === 0) {
    throw new CsvParseError('CSV has headers but no item rows.');
  }
  return { categories: parsedCategories };
}

function parsePrice(raw: string, rowNumber: number): number {
  const normalized = raw.replace(/[₪$€£\s]/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new CsvParseError(`CSV row ${rowNumber} has an invalid price.`);
  }
  const price = Number(normalized);
  if (!Number.isFinite(price) || price < 0) {
    throw new CsvParseError(`CSV row ${rowNumber} has an invalid price.`);
  }
  return price;
}

function parseImageUrl(raw: string, rowNumber: number): string {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol');
    return url.toString();
  } catch {
    throw new CsvParseError(`CSV row ${rowNumber} has an invalid image URL.`);
  }
}
