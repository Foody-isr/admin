import { ApiError, type LoyaltyCheckoutView } from '@/lib/api';
import { formatMoney } from '@/lib/currency';

/** Use only localized, allowlisted state labels; provider error text stays private. */
export function loyaltyPaymentLabel(value: string): string {
  return ({ pending: 'loyaltyCheckoutPending', unpaid: 'loyaltyCheckoutUnpaid', paid: 'loyaltyCheckoutPaid', partially_paid: 'loyaltyCheckoutPartial', authorized: 'loyaltyCheckoutAuthorized', refunded: 'loyaltyCheckoutRefunded' } as Record<string, string>)[value] ?? 'loyaltyCheckoutReview';
}

/** Display the reservation state without promising an expired reward is usable. */
export function loyaltyRewardLabel(value: string): string {
  return ({ reserved: 'loyaltyCheckoutReserved', redeemed: 'loyaltyCheckoutRedeemed', released: 'loyaltyCheckoutReleased', restored: 'loyaltyCheckoutRestored' } as Record<string, string>)[value] ?? 'loyaltyCheckoutReview';
}

/** Never borrow the active restaurant currency for an unverified frozen amount. */
export function loyaltyAmount(view: LoyaltyCheckoutView, unknown: string): string {
  return view.expected_amount_minor != null && view.currency ? formatMoney(view.expected_amount_minor / 100, view.currency) : unknown;
}

/** Map transport failures to fixed translated guidance without exposing details. */
export function loyaltyLoadError(error: unknown): string {
  return error instanceof ApiError ? error.status === 403 ? 'loyaltyCheckoutForbidden' : error.status === 404 ? 'loyaltyCheckoutUnavailable' : 'loyaltyCheckoutLoadError' : 'loyaltyCheckoutLoadError';
}
