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

// ─── Custom units ─────────────────────────────────────────────────────────
// Minimal shape of a stock item's per-item custom-unit conversion. Declared
// here (rather than imported from api.ts) to keep this module dependency-free.
export interface UnitConversionLike {
  base_quantity: number;
  custom_unit?: { name: string } | null;
}

/** Returns the base-unit amount that one `unit` represents for an item, given
 *  its conversions — e.g. 0.15 for a "piece" defined as 0.15 kg. Returns null
 *  when `unit` is not a configured custom unit (caller should fall back to the
 *  standard family conversion). */
export function customUnitFactor(unit: string, conversions?: UnitConversionLike[] | null): number | null {
  if (!unit || !conversions) return null;
  for (const c of conversions) {
    if (c.base_quantity > 0 && c.custom_unit?.name === unit) return c.base_quantity;
  }
  return null;
}

/** Converts qty from `from` into the item's base unit `to`, honouring custom
 *  units first (1 piece = N base) then the standard weight/volume families.
 *  Returns null when no conversion is possible (incompatible families and no
 *  custom mapping), so callers can flag a mismatch instead of showing a wrong
 *  number. */
export function convertToBaseUnit(
  qty: number,
  from: string,
  to: string,
  conversions?: UnitConversionLike[] | null,
): number | null {
  const factor = customUnitFactor(from, conversions);
  if (factor != null) return qty * factor; // factor already expresses `to`
  if (sameUnitFamily(from, to)) return convertQuantity(qty, from, to);
  return null;
}
