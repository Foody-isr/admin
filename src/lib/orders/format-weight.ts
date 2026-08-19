// Weight formatting for by-weight order lines.
//
// An OrderItem priced by weight carries `estimated_weight_grams`,
// `actual_weight_grams` and `price_per_kg`. None of it was rendered on the
// order detail before this work — the numbers were only visible inside the
// confirm-weights modal — so these helpers are new rather than moved.
//
// Decimal separator is a plain dot, deliberately, even in French. A weight sits
// on the same ticket line as its price, and every price in that column is built
// by formatMoney with a dot. Consistency down the column beats locale
// correctness on a secondary figure.

import { formatMoney } from '@/lib/format-money';

/** Below this, show grams; at or above it, show kilograms. */
const KG = 1000;

/** Trim trailing zeros so 2000 g reads "2 kg", not "2.00 kg". */
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/**
 * Format a gram figure for display: `620 g`, `1.24 kg`, `2 kg`.
 * Returns null for null, undefined and non-finite input, so callers can decide
 * whether to render the row at all.
 */
export function formatGrams(grams: number | null | undefined): string | null {
  if (typeof grams !== 'number' || !Number.isFinite(grams)) return null;
  const abs = Math.abs(grams);
  if (abs < KG) return `${Math.round(grams)} g`;
  return `${trimZeros((grams / KG).toFixed(2))} kg`;
}

/** Format a per-kilo price: `₪89.00/kg`. Null when there is no price. */
export function formatPricePerKg(pricePerKg: number | null | undefined): string | null {
  if (typeof pricePerKg !== 'number' || !Number.isFinite(pricePerKg) || pricePerKg <= 0) return null;
  return `${formatMoney(pricePerKg)}/kg`;
}

export interface WeightDrift {
  /** Actual minus estimated, in grams. Positive means heavier than quoted. */
  grams: number;
  /** Absolute drift as a fraction of the estimate (0.08 = 8% off). */
  ratio: number;
  /** True once the drift is worth showing to staff. */
  significant: boolean;
}

/** How far a weighed item landed from its estimate. Null when either figure is
 *  missing, or when the estimate is zero and a ratio would be meaningless. */
export function weightDrift(
  estimatedGrams: number | null | undefined,
  actualGrams: number | null | undefined,
  threshold = 0.05,
): WeightDrift | null {
  if (typeof estimatedGrams !== 'number' || !Number.isFinite(estimatedGrams) || estimatedGrams <= 0) {
    return null;
  }
  if (typeof actualGrams !== 'number' || !Number.isFinite(actualGrams)) return null;
  const grams = actualGrams - estimatedGrams;
  const ratio = Math.abs(grams) / estimatedGrams;
  return { grams, ratio, significant: ratio > threshold };
}
