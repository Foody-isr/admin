// Shared unit conversion helpers. Handles weight (g/kg) and volume (ml/l).
// Returns the quantity unchanged when the two units are from different families
// (e.g. "unit" vs "g") — no conversion is safely possible without extra metadata.

export const unitFactors: Record<string, number> = { g: 1, kg: 1000, ml: 1, l: 1000 };

const WEIGHT_UNITS = new Set(['g', 'kg']);
const VOLUME_UNITS = new Set(['ml', 'l']);

export function toBaseUnit(value: number, unit: string): number {
  return value * (unitFactors[unit] ?? 1);
}

export function convertQuantity(qty: number, from: string, to: string): number {
  if (from === to || !from || !to) return qty;
  const fromFactor = unitFactors[from];
  const toFactor = unitFactors[to];
  if (fromFactor != null && toFactor != null) return (qty * fromFactor) / toFactor;
  return qty;
}

/** True when `a` and `b` are the same unit or within the same conversion family
 *  (weight: g/kg, volume: ml/l). Everything else — including `unit`, `''`,
 *  `pack`, etc. — is its own family and only matches itself. */
export function sameUnitFamily(a: string, b: string): boolean {
  if (a === b) return true;
  if (WEIGHT_UNITS.has(a) && WEIGHT_UNITS.has(b)) return true;
  if (VOLUME_UNITS.has(a) && VOLUME_UNITS.has(b)) return true;
  return false;
}
