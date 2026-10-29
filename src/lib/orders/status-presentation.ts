import { readOrderLifecycleV2, lifecycleV2Allows } from './lifecycle-v2';
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
import { readOrderLifecycle } from './lifecycle';

/** Shared list/detail workflow badge palette from the Square reference. */
export const ORDER_STATUS_BADGE_TONE: Partial<Record<Order['status'], 'new' | 'progress'>> = {
  pending_review: 'new',
  scheduled: 'new',
  accepted: 'progress',
  in_kitchen: 'progress',
  out_for_delivery: 'progress',
};

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
  authorized: 'info',
  unknown: 'neutral',
  mixed: 'neutral',
};

const PAYMENT_KEY: Record<string, string> = {
  paid: 'paid',
  partially_paid: 'partiallyPaid',
  partially_refunded: 'paymentPartiallyRefunded',
  pending: 'pending',
  unpaid: 'unpaid',
  refunded: 'refunded',
  authorized: 'lifecyclePaymentAuthorized',
  unknown: 'lifecyclePaymentUnknown',
  mixed: 'lifecyclePaymentUnknown',
};

/**
 * Returns the truthful staff-facing payment state without mutating the server's
 * settlement status. A paid order with a post-payment balance keeps its settled
 * original payment, but is presented as partially paid until the supplement is
 * collected.
 */
export function displayedPaymentStatus(order: Order, isCancelled = false): string {
  const v2 = readOrderLifecycleV2(order.lifecycle_v2, order.id);
  if (v2.kind !== 'legacy') return v2.kind === 'available' ? v2.value.payment.state : 'unknown';
  const lifecycle = readOrderLifecycle(order.lifecycle, order.id);
  if (lifecycle.kind === 'unavailable') return 'unknown';
  if (lifecycle.kind === 'available') {
    const state = lifecycle.value.payment.state;
    return state === 'paid' && (order.balance_due ?? 0) > 0.01 ? 'partially_paid' : state;
  }
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
  lifecycle_unknown: 'lifecycleProgressUnknown',
  lifecycle_not_tracked: 'lifecycleHandoffNotTracked',
  lifecycle_held: 'lifecyclePreparationHeld',
  lifecycle_not_sent: 'lifecyclePreparationNotSent',
  lifecycle_partially_ready: 'lifecyclePartiallyReady',
  lifecycle_partially_handed: 'lifecycleV2HandoffPartial',
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

/** Present operational facts without treating commercial closure or payment as food progress. */
export function displayedOrderStatus(order: Order): string {
  const v2 = readOrderLifecycleV2(order.lifecycle_v2, order.id);
  if (v2.kind === 'unavailable') return 'lifecycle_unknown';
  if (v2.kind === 'available') {
    const { preparation, handoff, commercial } = v2.value;
    if (commercial.state === 'cancelled') return 'cancelled';
    if (handoff.state === 'complete') return order.order_type === 'delivery' ? 'delivered' : order.order_type === 'pickup' ? 'picked_up' : 'served';
    if (handoff.state === 'in_transit') return 'out_for_delivery';
    if (handoff.state === 'partially_complete') return 'lifecycle_partially_handed';
    if (preparation.state === 'ready') return order.order_type === 'delivery' ? 'ready_for_delivery' : order.order_type === 'pickup' ? 'ready_for_pickup' : 'ready';
    if (preparation.state === 'partially_ready') return 'lifecycle_partially_ready';
    if (preparation.state === 'in_progress') return 'in_kitchen';
    if (preparation.state === 'held') return 'lifecycle_held';
    if (preparation.state === 'not_sent') return 'lifecycle_not_sent';
    return preparation.state === 'not_tracked' && handoff.tracking === 'not_tracked' ? 'lifecycle_not_tracked' : 'lifecycle_unknown';
  }
  const lifecycle = readOrderLifecycle(order.lifecycle, order.id);
  if (lifecycle.kind === 'legacy') return order.status;
  if (lifecycle.kind === 'unavailable') return 'lifecycle_unknown';
  const { preparation, handoff, commercial } = lifecycle.value;
  if (commercial.state === 'cancelled') return 'cancelled';
  if (handoff.state === 'complete') return order.order_type === 'delivery' ? 'delivered' : order.order_type === 'pickup' ? 'picked_up' : 'served';
  if (handoff.state === 'in_transit' && order.order_type === 'delivery') return 'out_for_delivery';
  if (preparation.state === 'ready') return order.order_type === 'delivery' ? 'ready_for_delivery' : order.order_type === 'pickup' ? 'ready_for_pickup' : 'ready';
  if (preparation.state === 'partially_ready') return 'lifecycle_partially_ready';
  if (preparation.state === 'in_progress') return 'in_kitchen';
  if (preparation.state === 'held') return 'lifecycle_held';
  if (preparation.state === 'not_sent') return ['scheduled', 'pending_review', 'accepted'].includes(order.status) ? order.status : 'lifecycle_not_sent';
  return handoff.tracking === 'not_tracked' ? 'lifecycle_not_tracked' : 'lifecycle_unknown';
}

/** Missing or unsupported advertised facts cannot unlock collection or financial correction. */
export function lifecycleFinancialStateKnown(order: Order): boolean {
  const v2 = readOrderLifecycleV2(order.lifecycle_v2, order.id);
  if (v2.kind !== 'legacy') return v2.kind === 'available' && !['unknown', 'mixed'].includes(v2.value.payment.state);
  const lifecycle = readOrderLifecycle(order.lifecycle, order.id);
  return lifecycle.kind === 'legacy' || lifecycle.kind === 'available' && !['unknown', 'mixed'].includes(lifecycle.value.payment.state);
}


/** Pending is an expected payment, not proof of an active attempt; retain existing collection eligibility. */
export function lifecycleCollectionAllowed(order: Order): boolean {
  const v2 = readOrderLifecycleV2(order.lifecycle_v2, order.id);
  if (v2.kind !== 'legacy') return v2.kind === 'available' && lifecycleV2Allows(v2, 'collect_payment') && ['unpaid', 'pending', 'partially_paid', 'paid'].includes(v2.value.payment.state) && (v2.value.payment.amounts.balance_due_minor ?? 0) > 0;
  const lifecycle = readOrderLifecycle(order.lifecycle, order.id);
  if (lifecycle.kind === 'legacy') return true;
  if (lifecycle.kind === 'unavailable') return false;
  const payment = lifecycle.value.payment.state;
  return payment === 'unpaid' || payment === 'pending' || payment === 'partially_paid' || payment === 'paid' && (order.balance_due ?? 0) > 0.01;
}


/** The existing manual dialog supports two decimals in the active restaurant currency. */
export function manualCollectionAmount(order: Order, currencyCode: string): number | undefined {
  const v2 = readOrderLifecycleV2(order.lifecycle_v2, order.id);
  if (v2.kind === 'unavailable') return undefined;
  if (v2.kind === 'legacy') return order.balance_due ?? order.total_amount;
  const amounts = v2.value.payment.amounts;
  if (amounts.currency !== currencyCode || amounts.minor_unit_exponent !== 2 || amounts.balance_due_minor === null) return undefined;
  const major = amounts.balance_due_minor / 100;
  return Math.round(major * 100) === amounts.balance_due_minor ? major : undefined;
}
