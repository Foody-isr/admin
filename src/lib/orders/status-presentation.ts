// How an order's status, payment status, source and type are presented.
//
// These maps used to live inside OrderDetailDrawer.tsx, and the orders table
// imported them FROM the drawer — a 2400-line presentational component pulled
// into the table's module graph purely for four lookup tables. They belong
// here, where both the table and the detail view can reach them without either
// depending on the other.
//
// Moved verbatim from OrderDetailDrawer.tsx lines 39-218. Behaviour is
// deliberately unchanged, including the gaps noted below.

import type { Order } from '@/lib/api';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

/**
 * Status → Badge tone. Callers apply their own `?? 'neutral'` fallback.
 *
 * Note the server declares 15 statuses; `refunded` is deliberately absent here
 * and resolves to the caller's fallback, exactly as it did before this module.
 */
export const STATUS_TONE: Record<string, BadgeTone> = {
  pending_review: 'warning',
  accepted: 'info',
  in_kitchen: 'warning',
  ready: 'info',
  ready_for_pickup: 'info',
  ready_for_delivery: 'info',
  out_for_delivery: 'info',
  served: 'success',
  received: 'success',
  picked_up: 'success',
  delivered: 'success',
  rejected: 'danger',
  // Legacy status for abandoned-payment orders; rendered like `rejected`
  // ("Annulée") so cancellations read as one status. New abandonments use
  // `rejected` (see foodyserver abandonment sweeper).
  cancelled: 'danger',
  scheduled: 'neutral',
};

export const PAYMENT_TONE: Record<string, BadgeTone> = {
  paid: 'success',
  partially_paid: 'warning',
  pending: 'warning',
  unpaid: 'warning',
  refunded: 'neutral',
};

const PAYMENT_KEY: Record<string, string> = {
  paid: 'paid',
  partially_paid: 'partiallyPaid',
  pending: 'pending',
  unpaid: 'unpaid',
  refunded: 'refunded',
};

/**
 * Returns the truthful staff-facing payment state without mutating the server's
 * settlement status. A paid order with a post-payment balance keeps its settled
 * original payment, but is presented as partially paid until the supplement is
 * collected.
 */
export function displayedPaymentStatus(order: Order, isCancelled = false): string {
  if (isCancelled && order.payment_status === 'pending') return 'unpaid';
  if (order.payment_status === 'paid' && (order.balance_due ?? 0) > 0.01) return 'partially_paid';
  return order.payment_status;
}

/** Localizes both server payment statuses and the derived partial state. */
export function localizePaymentStatus(status: string, t: (k: string) => string): string {
  const key = PAYMENT_KEY[status] ?? status;
  const value = t(key);
  return value === key && key !== status ? status.replace(/_/g, ' ') : value;
}

const STATUS_KEY: Record<string, string> = {
  pending_review: 'statusPendingReview',
  accepted: 'statusAccepted',
  in_kitchen: 'statusInKitchen',
  ready: 'statusReady',
  ready_for_pickup: 'statusReadyForPickup',
  ready_for_delivery: 'statusReadyForDelivery',
  out_for_delivery: 'statusOutForDelivery',
  served: 'statusServed',
  received: 'statusReceived',
  picked_up: 'statusPickedUp',
  delivered: 'statusDelivered',
  rejected: 'statusRejected',
  // Legacy abandoned-payment status — same label as `rejected` ("Annulée").
  cancelled: 'statusRejected',
  scheduled: 'statusScheduled',
};

/** `t()` returns the key itself when missing — treat that as "not translated". */
export function localizeStatus(status: string, t: (k: string) => string): string {
  const key = STATUS_KEY[status];
  if (!key) return status.replace(/_/g, ' ');
  const value = t(key);
  return value === key ? status.replace(/_/g, ' ') : value;
}

const SOURCE_KEY: Record<string, string> = {
  website_order: 'sourceWebsiteOrder',
  online: 'sourceOnline',
  counter: 'sourceCounter',
  tablet_pos: 'sourceTabletPos',
};

/**
 * The server also emits `qr_dine_in`, `wolt`, `manual` and `unknown_external`,
 * which have no key here and fall through to the title-cased id.
 */
export function localizeSource(source: string | undefined, t: (k: string) => string): string {
  if (!source) return t('sourceOnline');
  const key = SOURCE_KEY[source];
  if (key) {
    const value = t(key);
    if (value !== key) return value;
  }
  return source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function localizeOrderType(type: Order['order_type'], t: (k: string) => string): string {
  if (type === 'dine_in') return t('dineIn');
  if (type === 'pickup') return t('pickup');
  if (type === 'delivery') return t('delivery');
  return String(type).replace(/_/g, ' ');
}
