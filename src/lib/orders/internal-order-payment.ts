/** The staff action to take, kept separate from a recorded cash/card method. */
export type InternalPaymentIntent = 'link' | 'charge_card' | 'record' | 'later';

/** Existing API choices; only Sumit choices initiate a hosted payment. */
export type InternalPaymentMethod = 'cash' | 'card' | 'link' | 'sumit_card';

/** Maps an explicit intent to the existing order contract without assuming receipt of money. */
export function internalOrderPayment(intent: InternalPaymentIntent | null, method: 'cash' | 'card', received: boolean): { paymentMethod: InternalPaymentMethod; paymentCollected: boolean } | null {
  if (!intent) return null;
  if (intent === 'link') return { paymentMethod: 'link', paymentCollected: false };
  if (intent === 'charge_card') return { paymentMethod: 'sumit_card', paymentCollected: false };
  return { paymentMethod: method, paymentCollected: intent === 'record' && received };
}
