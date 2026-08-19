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
import { isProviderSettled } from '@/lib/orders/payment';

/** The order's single next step. The component maps this to a literal label. */
export type PrimaryAction =
  | 'accept'
  | 'sendToKitchen'
  | 'markReady'
  | 'markServed'
  | 'markOutForDelivery'
  | 'markDelivered';

/** Statuses from which there is nothing left to advance. */
const TERMINAL_STATUSES = ['served', 'received', 'picked_up', 'delivered', 'rejected'];

export interface OrderPermissions {
  /** orders.manage — may act on the order at all. */
  canManage: boolean;
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
  onToggleForceProduction?: boolean;
  onDelete?: boolean;
}

export interface OrderCapabilities {
  /** The dominant next-step action, or null when the order is terminal. */
  primary: PrimaryAction | null;
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
  const isCancelled = order.status === 'rejected';
  const isScheduled = order.status === 'scheduled';
  const isTerminal = TERMINAL_STATUSES.includes(order.status);

  // By-weight orders sit on a card hold until staff enter the measured weights.
  const isHeld = order.settlement_status === 'held';
  const canConfirmWeights = isHeld && !!handlers.onConfirmWeights && !isCancelled;

  const canTakePayment =
    !isCancelled && order.payment_status !== 'paid' && order.payment_status !== 'refunded';

  // "Close order" moves a paid in-progress order to served/delivered. Once
  // terminal there is nothing to do, and clicking it was a silent no-op that
  // read as a bug.
  const canCloseOrder = !isCancelled && !isTerminal && order.payment_status === 'paid';
  const canCancelOrder = !isCancelled && !isTerminal;

  // Manual status correction is offered on any live or completed order, so a
  // terminal order marked served/delivered by mistake can be walked back.
  // Excluded for cancelled and not-yet-started orders, which keep their flows.
  const canCorrectStatus = !!perms.canOverride && !isCancelled && !isScheduled;

  // Manual payment correction is for cash/manual orders only. Provider-settled
  // orders moved real money and must be refunded, never data-corrected. The
  // server rejects these anyway; this hides an option that would always fail.
  const providerSettled = isProviderSettled(order);
  const canCorrectPayment = !!perms.canOverride && !isCancelled && !providerSettled;

  // Relabelling HOW a settled order was paid is a separate correction from
  // moving its status. Only meaningful once something has actually settled.
  const canCorrectPaymentMethod =
    !!perms.canOverride && !isCancelled && !providerSettled && order.payment_status === 'paid';

  // Any manager can pin an order onto the production sheet. Hidden on dead
  // orders since the sheet excludes them regardless. Reversible.
  const canForceProduction =
    perms.canManage && !isCancelled && !!handlers.onToggleForceProduction;

  const canDelete = !!perms.canDelete && !!handlers.onDelete;

  // Items can be edited while the order is still in progress.
  const canEditOrder = !isCancelled && !isTerminal;

  // The ⋯ button renders only when something is inside it. Without this guard
  // the production page — which supplies none of the correction handlers —
  // would show an overflow button opening an empty menu.
  const hasOverflow =
    (canCorrectStatus && !!handlers.onOverride) ||
    (canCorrectPayment && !!handlers.onCorrectPayment) ||
    (canCorrectPaymentMethod && !!handlers.onCorrectPaymentMethod) ||
    canForceProduction ||
    canCancelOrder ||
    canDelete;

  return {
    primary: primaryFor(order),
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
    canForceProduction,
    canDelete,
    canEditOrder,
    hasOverflow,
  };
}
