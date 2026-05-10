/**
 * Unit compatibility helpers for recipe ↔ stock reconciliation.
 *
 * Mirrors the server's `convertQuantity` (foodyserver/internal/stock/service.go):
 * conversion is only safe within the same physical dimension (mass, volume, count).
 * Cross-dimension pairs (g↔ml, unit↔g) need density and must be surfaced to the user.
 */

export type UnitCompat = 'same' | 'convertible' | 'incompatible';

type Dim = 'mass' | 'volume' | 'count';

const UNIT_FACTORS: Record<string, { dim: Dim; toBase: number }> = {
  g: { dim: 'mass', toBase: 1 },
  kg: { dim: 'mass', toBase: 1000 },
  ml: { dim: 'volume', toBase: 1 },
  l: { dim: 'volume', toBase: 1000 },
  unit: { dim: 'count', toBase: 1 },
};

export function classifyUnits(from: string, to: string): UnitCompat {
  if (!from || !to || from === to) return 'same';
  const a = UNIT_FACTORS[from];
  const b = UNIT_FACTORS[to];
  if (!a || !b) return 'incompatible';
  if (a.dim !== b.dim) return 'incompatible';
  return 'convertible';
}

/** Converts a quantity across units. Returns null for incompatible pairs. */
export function convertUnit(qty: number, from: string, to: string): number | null {
  if (from === to) return qty;
  const a = UNIT_FACTORS[from];
  const b = UNIT_FACTORS[to];
  if (!a || !b || a.dim !== b.dim) return null;
  return (qty * a.toBase) / b.toBase;
}

/** Formats a converted amount with up to 4 significant digits (trailing zeros stripped). */
export function formatConverted(qty: number, unit: string): string {
  if (!Number.isFinite(qty)) return `— ${unit}`;
  const abs = Math.abs(qty);
  let s: string;
  if (abs === 0) s = '0';
  else if (abs >= 100) s = qty.toFixed(2);
  else if (abs >= 1) s = qty.toFixed(3);
  else s = qty.toFixed(4);
  s = s.replace(/\.?0+$/, '');
  return `${s} ${unit}`;
}
