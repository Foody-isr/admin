/** Parse staff-entered decimals without rounding or accepting exponent notation. */
export function adjustmentMinor(value: string): number | null {
  const clean = value.trim().replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, cents = ''] = clean.split('.');
  const minor = Number(whole) * 100 + Number(cents.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
