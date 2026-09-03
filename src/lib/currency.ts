/**
 * Currency is a property of the restaurant, not of the app.
 *
 * Foody started Israeli-only, so the shekel sat hard-coded in ~360 places.
 * A restaurant now carries its own ISO 4217 code and every price renders
 * through here. The active currency travels with the locale (see `i18n.tsx`):
 * both are per-restaurant presentation state, and both feed `t()`.
 */

import { formatMoney as baseFormatMoney } from '@/lib/format-money';

/** Applied when a restaurant has no currency set, and before the API answers. */
export const DEFAULT_CURRENCY = 'ILS';

const CURRENCY_SYMBOLS: Record<string, string> = {
  ILS: '₪',
  EUR: '€',
  USD: '$',
  GBP: '£',
};

/**
 * ISO 4217 code (`"EUR"`) to its display symbol (`"€"`). An unknown code
 * renders as the code itself — ugly, but never a wrong currency sign, which
 * is the failure that would actually cost someone money.
 */
export function currencySymbol(code?: string | null): string {
  if (!code) return CURRENCY_SYMBOLS[DEFAULT_CURRENCY];
  const upper = code.toUpperCase();
  return CURRENCY_SYMBOLS[upper] ?? upper;
}

/** The bound formatter `useCurrency()` hands out, for the non-component
 *  helpers that take it as a parameter rather than calling the hook. */
export type MoneyFormatter = (
  amount: number | null | undefined,
  opts?: FormatMoneyOptions,
) => string;

export interface FormatMoneyOptions {
  /** Fraction digits. Default 2. Pass 0 for the rounded figures on KPI tiles. */
  decimals?: number;
  /** Group thousands (1 234,56). Off by default so prices stay compact. */
  grouped?: boolean;
  /** Always render a sign, so a positive reads `+₪3.50`. Zero stays unsigned. */
  signed?: boolean;
}

/**
 * Format an amount for display, symbol first: `₪12.50`, `€12.50`.
 *
 * Symbol-first is what Foody has always rendered for the shekel, and it is
 * kept for every currency so the admin's price columns stay aligned and
 * visually identical whichever restaurant is open. This is deliberately not
 * `Intl.NumberFormat` currency style, which would move the symbol per locale
 * and reflow every table.
 */
export function formatMoney(
  amount: number | null | undefined,
  code?: string | null,
  opts: FormatMoneyOptions = {},
): string {
  // The number, sign and decimal handling live in one place (`format-money`),
  // which the order detail's <Money> primitive and the printed ticket also go
  // through. This function's only job is turning a restaurant's ISO code into
  // the symbol that formatter should print.
  return baseFormatMoney(amount, { ...opts, currency: currencySymbol(code) });
}
