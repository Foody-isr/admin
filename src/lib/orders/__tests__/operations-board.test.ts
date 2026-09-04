import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order } from '@/lib/api';
import { getOperationsQueue, getOrderTiming, isOperationalOrder } from '@/lib/orders/operations-board';

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    restaurant_id: 1,
    order_type: 'pickup',
    status: 'pending_review',
    payment_status: 'paid',
    customer_name: 'Maya Cohen',
    customer_phone: '0500000000',
    total_amount: 80,
    items: [],
    created_at: '2026-09-03T10:00:00.000Z',
    ...overrides,
  };
}

test('uses the timestamp of the current workflow stage', () => {
  const timing = getOrderTiming(
    order({
      status: 'in_kitchen',
      in_kitchen_at: '2026-09-03T10:20:00.000Z',
    }),
    new Date('2026-09-03T10:45:00.000Z').getTime(),
  );

  assert.equal(timing.minutes, 25);
  assert.equal(timing.overdue, false);
  assert.equal(timing.approaching, true);
});

test('marks a stage overdue at its threshold', () => {
  const timing = getOrderTiming(
    order({ status: 'ready', ready_at: '2026-09-03T10:00:00.000Z' }),
    new Date('2026-09-03T10:15:00.000Z').getTime(),
  );

  assert.equal(timing.overdue, true);
  assert.equal(timing.threshold, 15);
});

test('does not age a future scheduled order as overdue', () => {
  const timing = getOrderTiming(
    order({
      is_scheduled: true,
      status: 'pending_review',
      scheduled_for: '2026-09-04T12:00:00.000Z',
    }),
    new Date('2026-09-03T10:30:00.000Z').getTime(),
  );

  assert.equal(timing.scheduledForFuture, true);
  assert.equal(timing.threshold, null);
  assert.equal(timing.overdue, false);
});

test('maps live and terminal orders correctly', () => {
  assert.equal(isOperationalOrder(order({ status: 'out_for_delivery' })), true);
  assert.equal(isOperationalOrder(order({ status: 'delivered' })), false);
  assert.equal(getOperationsQueue('ready').statuses, 'ready,ready_for_pickup,ready_for_delivery');
});
