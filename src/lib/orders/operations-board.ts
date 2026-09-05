import type { Order } from '@/lib/api';
import { scheduledCalendarDate } from '@/lib/orders/order-time';

export type OperationsQueueKey = 'active' | 'review' | 'kitchen' | 'ready' | 'delivery';

export interface OperationsQueueDefinition {
  key: OperationsQueueKey;
  labelKey: string;
  statuses: string;
  tone: 'brand' | 'danger' | 'warning' | 'success' | 'info';
}

/** The live queues shown in the orders command rail, in workflow order. */
export const OPERATIONS_QUEUES: OperationsQueueDefinition[] = [
  {
    key: 'active',
    labelKey: 'ordersQueueActive',
    statuses: 'pending_review,accepted,in_kitchen,ready,ready_for_pickup,ready_for_delivery,out_for_delivery',
    tone: 'brand',
  },
  {
    key: 'review',
    labelKey: 'ordersQueueReview',
    statuses: 'pending_review',
    tone: 'danger',
  },
  {
    key: 'kitchen',
    labelKey: 'ordersQueueKitchen',
    statuses: 'accepted,in_kitchen',
    tone: 'warning',
  },
  {
    key: 'ready',
    labelKey: 'ordersQueueReady',
    statuses: 'ready,ready_for_pickup,ready_for_delivery',
    tone: 'success',
  },
  {
    key: 'delivery',
    labelKey: 'ordersQueueDelivery',
    statuses: 'out_for_delivery',
    tone: 'info',
  },
];

const OPERATIONAL_STATUSES = new Set(OPERATIONS_QUEUES[0].statuses.split(','));

export interface OrderTiming {
  minutes: number;
  threshold: number | null;
  overdue: boolean;
  approaching: boolean;
  scheduledForFuture: boolean;
}

const STATUS_THRESHOLDS: Partial<Record<Order['status'], number>> = {
  pending_review: 10,
  accepted: 10,
  in_kitchen: 30,
  ready: 15,
  ready_for_pickup: 15,
  ready_for_delivery: 15,
  out_for_delivery: 45,
};

function timingAnchor(order: Order): string {
  switch (order.status) {
    case 'accepted':
      return order.accepted_at || order.created_at;
    case 'in_kitchen':
      return order.in_kitchen_at || order.accepted_at || order.created_at;
    case 'ready':
    case 'ready_for_pickup':
    case 'ready_for_delivery':
      return order.ready_at || order.in_kitchen_at || order.accepted_at || order.created_at;
    case 'out_for_delivery':
      return order.courier_assigned_at || order.ready_at || order.created_at;
    default:
      return order.created_at;
  }
}

/**
 * Returns the age of the order's current workflow stage and its attention state.
 * Thresholds are deliberately centralized so they can later come from restaurant
 * settings without changing any presentation component.
 */
export function getOrderTiming(order: Order, now: number = Date.now()): OrderTiming {
  const scheduledAt = order.scheduled_for
    ? scheduledCalendarDate(order.scheduled_for)?.getTime() ?? NaN
    : NaN;
  const scheduledForFuture =
    !!order.is_scheduled &&
    Number.isFinite(scheduledAt) &&
    scheduledAt > now &&
    (order.status === 'scheduled' || order.status === 'pending_review');

  const threshold = scheduledForFuture ? null : STATUS_THRESHOLDS[order.status] ?? null;
  const anchor = new Date(timingAnchor(order)).getTime();
  const minutes = Number.isFinite(anchor) ? Math.max(0, Math.floor((now - anchor) / 60_000)) : 0;

  return {
    minutes,
    threshold,
    overdue: threshold !== null && minutes >= threshold,
    approaching: threshold !== null && minutes >= Math.ceil(threshold * 0.75) && minutes < threshold,
    scheduledForFuture,
  };
}

/** Returns true when the order belongs to one of the live workflow queues. */
export function isOperationalOrder(order: Order): boolean {
  return OPERATIONAL_STATUSES.has(order.status);
}

/** Returns the queue definition for a live-board key. */
export function getOperationsQueue(key: OperationsQueueKey): OperationsQueueDefinition {
  return OPERATIONS_QUEUES.find((queue) => queue.key === key) ?? OPERATIONS_QUEUES[0];
}
