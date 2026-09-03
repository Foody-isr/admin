// Single formatter for every money figure in the admin.
//
// Before this module, prices were rendered ~18 different ways: `₪${n.toFixed(2)}`
// inline at ~15 call sites in the order detail drawer, a private `money()` in
// print-ticket.ts, another in discounts.ts, and a `.toFixed(0)` in the orders
// table — so the board and the detail view disagreed about the same order's
// total. Route every price through here instead.
//
// The order detail's money column depends on this: a fixed-width column of
// tabular figures only reads as one column if every figure is built the same
// way. Pair it with the `.num` utility (globals.css) for the mono + tabular-nums
// treatment.

export interface FormatMoneyOptions {
  /** Decimal places. Defaults to 2. Pass 0 for dense table cells. */
  decimals?: number;
  /** Always render a sign, so a positive reads "+₪3.50". Zero stays unsigned. */
  signed?: boolean;
  /** Group thousands (`₪1,234.50`). Off by default so prices stay compact. */
  grouped?: boolean;
  /** Currency SYMBOL, not an ISO code. Callers that hold a restaurant's
   *  currency should go through `@/lib/currency`, which maps the code to its
   *  symbol and forwards here — this stays symbol-level so the formatter has
   *  no opinion about where the currency came from. */
  currency?: string;
}

/** U+2212 MINUS SIGN. Never a hyphen-minus: at tabular figure widths a hyphen
 *  is visibly too short and sits at the wrong height. */
const MINUS = '−';

/**
 * Format a monetary amount: `₪120.00`, `−₪12.00`, `+₪3.50`, `₪505` at 0 decimals.
 *
 * The sign is placed BEFORE the currency symbol and the figure is rendered as
 * an absolute value, which is the correct typographic form and matches how the
 * drawer already hand-wrote its discount line.
 *
 * Null, undefined and non-finite inputs render as zero rather than "₪NaN".
 */
export function formatMoney(value: number | null | undefined, opts: FormatMoneyOptions = {}): string {
  const { decimals = 2, signed = false, grouped = false, currency = '₪' } = opts;
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const body = grouped
    ? Math.abs(n).toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : Math.abs(n).toFixed(decimals);
  // Decide the sign from the ROUNDED figure, so -0.004 renders "₪0.00" and
  // never the nonsensical "−₪0.00".
  const isZero = Number(body) === 0;
  const sign = isZero ? '' : n < 0 ? MINUS : signed ? '+' : '';
  return `${sign}${currency}${body}`;
}
