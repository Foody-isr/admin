import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Order } from '@/lib/api';
import { buildDeliveryReminder, isDeliveryReminderDue } from '@/lib/orders/delivery-reminder';

function order(patch: Partial<Order> = {}): Order {
  return {
    id: 42,
    restaurant_id: 7,
    order_type: 'delivery',
    status: 'accepted',
    payment_status: 'paid',
    customer_name: 'Noa Levi',
    customer_phone: '0501234567',
    total_amount: 100,
    created_at: '2026-09-01T08:00:00Z',
    scheduled_for: '2026-09-02T00:00:00Z',
    scheduled_pickup_window_start: '11:00',
    scheduled_pickup_window_end: '13:00',
    delivery_address: 'Rothschild 12',
    delivery_city: 'Tel Aviv',
    delivery_floor: '3',
    delivery_apt: '5',
    delivery_entry_code: '1234',
    delivery_notes: 'Appeler en arrivant',
    items: [],
    ...patch,
  };
}

test('delivery reminder is due only on the calendar day before delivery', () => {
  const candidate = order();
  assert.equal(isDeliveryReminderDue(candidate, new Date(2026, 8, 1, 12)), true);
  assert.equal(isDeliveryReminderDue(candidate, new Date(2026, 7, 31, 12)), false);
  assert.equal(isDeliveryReminderDue(candidate, new Date(2026, 8, 2, 8)), false);
  assert.equal(isDeliveryReminderDue({ ...candidate, order_type: 'pickup' }, new Date(2026, 8, 1)), false);
});

test('French reminder includes recipient, slot, address and instructions', () => {
  const message = buildDeliveryReminder({ order: order(), restaurantName: 'Mamie TLV', locale: 'fr' });
  assert.match(message, /Mamie TLV/);
  assert.match(message, /Noa Levi/);
  assert.match(message, /11:00–13:00/);
  assert.match(message, /Rothschild 12, Tel Aviv/);
  assert.match(message, /Appeler en arrivant/);
  assert.doesNotMatch(message, /\{\{/);
});

test('empty instructions remove the whole labelled line', () => {
  const message = buildDeliveryReminder({
    order: order({ delivery_notes: '' }),
    restaurantName: 'Mamie TLV',
    locale: 'fr',
  });
  assert.doesNotMatch(message, /Consignes/);
  assert.doesNotMatch(message, /ℹ️/);
});
