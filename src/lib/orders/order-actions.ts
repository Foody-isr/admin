import { readOrderLifecycleV2, lifecycleV2Allows } from './lifecycle-v2';
// Which actions an order currently allows.
//
// These predicates were a run of ~14 inline `const can…` expressions inside the
// order detail component, interleaved with the rendering that consumed them.
// Pulling them out makes the guard matrix testable without a DOM — and the
// matrix matters: several of these guards are the client half of a server-side
// rule, and getting one wrong either hides a legitimate action or offers one
// that will always 403.
//
// Pure. No React, no i18n, no side effects.

import type { Order } from '@/lib/api';
import { readOrderLifecycle } from './lifecycle';
import { lifecycleCollectionAllowed, lifecycleFinancialStateKnown, manualCollectionAmount } from './status-presentation';
import { isProviderSettled } from '@/lib/orders/payment';

/** The order's single next step. The component maps this to a literal label. */
export type PrimaryAction =
  | 'accept'
  | 'sendToKitchen'
  | 'markReady'
  | 'markServed'
  | 'markOutForDelivery'
  | 'markDelivered';

/** Physical handoff confirmed by the existing order endpoint, never a check closure. */
export function orderHandoffKind(orderType: Order['order_type']): 'service' | 'pickup' | 'delivery' {
  return orderType === 'delivery' ? 'delivery' : orderType === 'pickup' ? 'pickup' : 'service';
}

/** Statuses from which there is nothing left to advance. */
const TERMINAL_STATUSES = ['served', 'received', 'picked_up', 'delivered', 'rejected', 'cancelled', 'refunded'];

export interface OrderPermissions {
  /** orders.manage — may act on the order at all. */
  canManage: boolean;
  /** Currency supported by the existing manual-payment dialog. */
  currencyCode?: string;
  /** Owner or manager — may correct status and payment after the fact. */
  canOverride?: boolean;
  /** Owner only — may hard-delete. */
  canDelete?: boolean;
}

/**
 * Which optional handlers the host actually supplied. The production page
 * passes a reduced set, and an action with no handler must not render.
 */
export interface OrderHandlerAvailability {
  onConfirmWeights?: boolean;
  onOverride?: boolean;
  onCorrectPayment?: boolean;
  onCorrectPaymentMethod?: boolean;
  onReactivate?: boolean;
  onToggleForceProduction?: boolean;
  onDelete?: boolean;
}

export interface OrderCapabilities {
  /** The dominant next-step action, or null when the order is terminal. */
  primary: PrimaryAction | null;
  /** A card hold must be settled by confirming weights before advancing. */
  awaitingWeights: boolean;
  isCancelled: boolean;
  isScheduled: boolean;
  isTerminal: boolean;
  /** Real money moved through a provider: correct by refund, never by edit. */
  providerSettled: boolean;
  canConfirmWeights: boolean;
  canTakePayment: boolean;
  canCloseOrder: boolean;
  canCancelOrder: boolean;
  canCorrectStatus: boolean;
  canCorrectPayment: boolean;
  canCorrectPaymentMethod: boolean;
  canReactivate: boolean;
  canForceProduction: boolean;
  canDelete: boolean;
  canEditOrder: boolean;
  /** True when at least one overflow item survives, so the ⋯ button renders. */
  hasOverflow: boolean;
}

function primaryFor(order: Order): PrimaryAction | null {
  const isDelivery = order.order_type === 'delivery';
  switch (order.status) {
    case 'scheduled':
    case 'pending_review':
      return 'accept';
    case 'accepted':
      return 'sendToKitchen';
    case 'in_kitchen':
      return 'markReady';
    case 'ready':
    case 'ready_for_pickup':
      return 'markServed';
    case 'ready_for_delivery':
      return isDelivery ? 'markOutForDelivery' : 'markServed';
    case 'out_for_delivery':
      return 'markDelivered';
    default:
      return null;
  }
}

/**
 * Derive every capability for one order.
 *
 * `perms.canManage` gates the actions themselves at the call site (the command
 * bar renders nothing actionable without it); the flags here describe the
 * ORDER's state, with permission folded in only where the original code folded
 * it in, so behaviour is unchanged.
 */
export function deriveOrderCapabilities(
  order: Order,
  perms: OrderPermissions,
  handlers: OrderHandlerAvailability = {},
): OrderCapabilities {
  const v2 = readOrderLifecycleV2(order.lifecycle_v2, order.id);
  const lifecycle = readOrderLifecycle(order.lifecycle, order.id);
  const financialKnown = lifecycleFinancialStateKnown(order);
  const financialPayment = v2.kind === 'available' ? v2.value.payment.state : lifecycle.kind === 'available' ? lifecycle.value.payment.state : order.payment_status;
  const isCancelled = v2.kind === 'available' ? v2.value.commercial.state === 'cancelled' : order.status === 'rejected' || order.status === 'cancelled';
  const isScheduled = order.status === 'scheduled';
  const isTerminal = TERMINAL_STATUSES.includes(order.status);

  // By-weight orders sit on a card hold until staff enter the measured weights.
  const isHeld = order.settlement_status === 'held';
  const canConfirmWeights = isHeld && !!handlers.onConfirmWeights && !isCancelled && (v2.kind === 'legacy' || lifecycleV2Allows(v2, 'adjust_weight'));

  // A paid order can become collectible again after staff add items: the raw
  // status remains `paid`, while `balance_due` exposes the supplement still
  // owed. Treat that state like `partially_paid` so the manual cash/card/
  // transfer dialog remains available alongside the hosted payment link.
  const internalCheckout = order.external_metadata?.internal_checkout as { mode?: string } | undefined;
  const prepared = internalCheckout?.mode === 'link' || internalCheckout?.mode === 'card';
  const preparedPending = prepared && order.payment_status === 'pending';
  const canTakePayment =
    !preparedPending && financialKnown && lifecycleCollectionAllowed(order) && (v2.kind === 'legacy' || !!perms.currencyCode && manualCollectionAmount(order, perms.currencyCode) !== undefined) &&
    !isCancelled &&
    financialPayment !== 'refunded' &&
    (financialPayment !== 'paid' || (v2.kind === 'available' ? (v2.value.payment.amounts.balance_due_minor ?? 0) > 0 : (order.balance_due ?? 0) > 0.01));

  // The legacy capability name gates a physical handoff confirmation. It does
  // not close a FinancialCheck or settle a payment. Preserve its paid/balance
  // guards until the server advertises a separate commercial-close capability.
  const canCloseOrder =
    v2.kind === 'legacy' && financialKnown &&
    !isCancelled &&
    !isHeld &&
    !isTerminal &&
    order.payment_status === 'paid' && financialPayment === 'paid' &&
    (order.balance_due ?? 0) <= 0.01;
  const canCancelOrder = v2.kind === 'legacy' ? !isCancelled && !isTerminal : lifecycleV2Allows(v2, 'cancel');

  // Manual status correction is offered on any live or completed order, so a
  // terminal order marked served/delivered by mistake can be walked back.
  // Excluded for cancelled and not-yet-started orders, which keep their flows.
  const canCorrectStatus = !!perms.canOverride && !isCancelled && !isScheduled && !isHeld;

  // Manual payment correction is for cash/manual orders only. Provider-settled
  // orders moved real money and must be refunded, never data-corrected. The
  // server rejects these anyway; this hides an option that would always fail.
  const providerSettled = isProviderSettled(order);
  const canCorrectPayment = !prepared && financialKnown && !!perms.canOverride && !isCancelled && !providerSettled;

  // Relabelling HOW a settled order was paid is a separate correction from
  // moving its status. Only meaningful once something has actually settled.
  const canCorrectPaymentMethod =
    financialKnown && !!perms.canOverride && !isCancelled && !providerSettled && order.payment_status === 'paid' && financialPayment === 'paid';

  // Any manager can pin an order onto the production sheet, including a dead
  // order. The server restores a dead order when it is pinned.
  const canForceProduction =
    perms.canManage && !preparedPending && !(prepared && isCancelled) && !!handlers.onToggleForceProduction;

  const canDelete = !!perms.canDelete && !!handlers.onDelete;
  const canReactivate = !prepared && perms.canManage && isCancelled && !!handlers.onReactivate;

  // Items can be edited while the order is still in progress.
  const canEditOrder = !preparedPending && (v2.kind === 'legacy' ? !isCancelled && !isTerminal : v2.kind === 'available' && v2.value.commercial.editable && lifecycleV2Allows(v2, 'edit'));

  // The ⋯ button renders only when something is inside it. Without this guard
  // the production page — which supplies none of the correction handlers —
  // would show an overflow button opening an empty menu.
  const hasOverflow =
    (canCorrectStatus && !!handlers.onOverride) ||
    (canCorrectPayment && !!handlers.onCorrectPayment) ||
    (canCorrectPaymentMethod && !!handlers.onCorrectPaymentMethod) ||
    canReactivate ||
    canForceProduction ||
    canCancelOrder ||
    canDelete;

  return {
    primary: v2.kind !== 'legacy' ? v2.kind === 'available' ? lifecycleV2Allows(v2, 'accept') ? 'accept' : lifecycleV2Allows(v2, 'send_to_kitchen') ? 'sendToKitchen' : lifecycleV2Allows(v2, 'mark_ready') ? 'markReady' : null : null : lifecycle.kind === 'unavailable' ? null : primaryFor(order),
    awaitingWeights: isHeld,
    isCancelled,
    isScheduled,
    isTerminal,
    providerSettled,
    canConfirmWeights,
    canTakePayment,
    canCloseOrder,
    canCancelOrder,
    canCorrectStatus,
    canCorrectPayment,
    canCorrectPaymentMethod,
    canReactivate,
    canForceProduction,
    canDelete,
    canEditOrder,
    hasOverflow,
  };
}
