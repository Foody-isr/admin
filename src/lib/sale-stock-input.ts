import type { SaleStockLimit } from './api';
import { toBaseUnit } from './units';

type Size = { id: number; name: string };
const MAX_STOCK = 2147483647;
const SIZE_LABEL = /^\s*([0-9]+(?:[.,][0-9]+)?)\s*(kg|g|ml|l)?\s*$/i;

/** Resolves compatible input units from numeric size labels, including bare grams. */
export function stockInputUnits(sizes: Size[]): string[] {
  if (!sizes.length) return [];
  const families = sizes.map(({ name }) => {
    const match = SIZE_LABEL.exec(name);
    const value = Number(match?.[1].replace(',', '.'));
    if (!match || !Number.isFinite(value) || value <= 0) return null;
    return /^(ml|l)$/i.test(match[2] ?? '') ? 'volume' : 'weight';
  });
  if (families.some((family) => family == null || family !== families[0])) return [];
  return families[0] === 'volume' ? ['ml', 'l'] : ['g', 'kg'];
}

/** Returns a numeric size in g/ml, matching the API's measured reservation draw. */
function stockSizeMeasure(size: Size): number {
  const match = SIZE_LABEL.exec(size.name);
  return match
    ? Math.round(toBaseUnit(Number(match[1].replace(',', '.')), (match[2] ?? 'g').toLowerCase()))
    : 0;
}

/** Converts a displayed quantity to an exact API integer; blank size counts remain unlimited. */
export function stockInputValue(
  value: string,
  mode: SaleStockLimit['mode'],
  unit: string,
  size?: Size,
): number | null | undefined {
  if (value === '') return mode === 'per_variant' ? null : undefined;
  if (!/^\d+(?:\.\d+)?$/.test(value)) return undefined;
  if (mode === 'per_variant' && unit && (!size || stockSizeMeasure(size) <= 0)) return undefined;
  const amount = Number(value);
  const converted = mode === 'measure'
    ? toBaseUnit(amount, unit)
    : mode === 'per_variant' && unit
      ? toBaseUnit(amount, unit) / stockSizeMeasure(size!)
      : amount;
  const integer = Math.round(converted);
  return Number.isFinite(converted) && Math.abs(integer - converted) < 1e-7 &&
    integer >= 0 && integer <= MAX_STOCK ? integer : undefined;
}

/** Re-expresses stock input without changing its portion count or measured budget. */
export function convertStockInput(value: string, from: string, to: string, size?: Size): string {
  if (value === '' || from === to) return value;
  const measure = size ? stockSizeMeasure(size) : 1;
  const base = from ? toBaseUnit(Number(value), from) : Number(value) * measure;
  const converted = to ? base / toBaseUnit(1, to) : base / measure;
  return Number.isFinite(converted) ? String(Number(converted.toFixed(9))) : value;
}
