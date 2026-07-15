// Shared parsing for the price-like fields used across delivery zones and
// delivery tours (delivery fee, minimum order). Both editors bind these to a
// plain text/number input, so both need the same rules for what counts as a
// valid value.

/**
 * Parses a price-like form field.
 *
 * - Blank -> `null`: "unset", meaning the caller should fall back to the
 *   zone/global default (or free, for a fee field).
 * - A valid non-negative number -> that number.
 * - Anything else (negative, NaN, garbage text) -> `undefined`. A negative or
 *   invalid price must NOT be silently treated as "unset" — on a fee field
 *   that would mean free delivery. Callers must reject the save instead.
 */
export function parsePrice(v: string): number | null | undefined {
  const s = v.trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}
