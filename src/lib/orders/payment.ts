import type { Order } from '@/lib/api';

/** Provider names the server writes into `external_metadata.payment_method`
 *  when it settles a payment itself. Each restaurant brings its own account,
 *  so this list grows with the providers Foody can be handed keys for — it is
 *  not a choice Foody makes per market. */
const PROVIDER_METHODS = ['payplus', 'sumit', 'cibus', 'stancer'];

/**
 * How an order was ACTUALLY settled.
 *
 * An order carries two payment methods and they routinely disagree. The
 * `payment_method` column is written once, at creation, from what the customer
 * said they would pay with; `external_metadata.payment_method` is written when
 * the money is actually taken. An order created as cash and then collected by
 * card kept reading "cash" on every screen — that is the bug this exists to
 * close. Always read the settlement through here, never the raw column.
 */
export function settledPaymentMethod(order: Order): string {
  const settled = String(order.external_metadata?.payment_method ?? '').trim();
  return settled || (order.payment_method ?? '');
}

/**
 * True when the payment went through a payment provider, so the money really
 * moved and the record must not be hand-edited: those are reversed with a
 * refund. Mirrors the server guard `isManuallySettledPayment` (inverted), which
 * is the one that actually enforces it.
 */
export function isProviderSettled(order: Order): boolean {
  return (
    (order.hold_amount ?? 0) > 0 ||
    (order.captured_amount ?? 0) > 0 ||
    !!order.settlement_status ||
    PROVIDER_METHODS.includes(settledPaymentMethod(order).toLowerCase())
  );
}

/** The staff-entered reference for a payment taken outside Foody (card slip,
 *  provider invoice number), or '' when there is none. */
export function paymentReference(order: Order): string {
  return String(order.external_metadata?.payment_reference ?? '').trim();
}

/**
 * Human label for a settled payment method. Falls back to the raw value so a
 * provider name, or a method recorded before this vocabulary existed, still
 * reads as something rather than vanishing from an audit line.
 */
export function localizePaymentMethod(method: string, t: (k: string) => string): string {
  switch (method.toLowerCase()) {
    case 'cash':
      return t('cash');
    case 'credit_card':
      return t('creditCard');
    default:
      return method;
  }
}
