import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { LocaleProvider } from '@/lib/i18n';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Order } from '@/lib/api';
import { ORDER_COLUMNS } from '@/lib/orders/table-columns';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const t = (key: string) => key;
const money = () => '';

function orderWithDates(createdAt: string): Order {
  return {
    id: 1,
    created_at: createdAt,
    is_scheduled: true,
    scheduled_for: '2026-09-11T00:00:00Z',
  } as Order;
}

test('orders table exposes distinct visible columns for order and serie dates', () => {
  const orderDate = ORDER_COLUMNS.find((column) => column.key === 'created_at');
  const serieDate = ORDER_COLUMNS.find((column) => column.key === 'date');

  assert.ok(orderDate);
  assert.ok(serieDate);
  assert.equal(orderDate.labelKey, 'orderDate');
  assert.equal(serieDate.labelKey, 'dateBasisSerieOption');
  assert.equal(orderDate.defaultVisible, true);
  assert.equal(serieDate.defaultVisible, true);
});

test('order-date column always follows created_at, independently of the serie date', () => {
  const orderDate = ORDER_COLUMNS.find((column) => column.key === 'created_at')!;
  const serieDate = ORDER_COLUMNS.find((column) => column.key === 'date')!;
  const monday = orderWithDates('2026-09-07T08:15:00Z');
  const wednesday = orderWithDates('2026-09-09T12:45:00Z');

  const mondayOrderDate = renderToStaticMarkup(orderDate.render(monday, t, money));
  const wednesdayOrderDate = renderToStaticMarkup(orderDate.render(wednesday, t, money));
  const mondaySerieDate = renderToStaticMarkup(serieDate.render(monday, t, money));
  const wednesdaySerieDate = renderToStaticMarkup(serieDate.render(wednesday, t, money));

  assert.notEqual(mondayOrderDate, wednesdayOrderDate);
  assert.equal(mondaySerieDate, wednesdaySerieDate);
});

test('item previews expose full quantities and names and summarize additional lines', () => {
  const items = ORDER_COLUMNS.find(column => column.key === 'items')!;
  const order = { items: [
    { id: 1, name: 'Sandwich', quantity: 2 },
    { id: 2, name: 'Salade', quantity: 1 },
    { id: 3, name: 'Dessert', quantity: 3 },
    { id: 4, name: 'Boisson', quantity: 1 },
  ] } as Order;
  const markup = renderToStaticMarkup(items.render(order, t, money));
  assert.match(markup, /aria-label="2 × Sandwich, 1 × Salade, 3 × Dessert, 1 × Boisson"/);
  assert.match(markup, />\+2<\/span>/);
  assert.doesNotThrow(() => items.render({} as Order, t, money));
});


test('default layout starts with the customer and keeps order numbers optional', () => {
  assert.equal(ORDER_COLUMNS.filter(column => column.defaultVisible)[0].key, 'customer');
  assert.equal(ORDER_COLUMNS.find(column => column.key === 'order_no')!.defaultVisible, false);
});

test('dates use the selected locale and retain scheduled pickup windows on one line', () => {
  const date = ORDER_COLUMNS.find(column => column.key === 'date')!;
  const order = { ...orderWithDates('2026-09-07T08:15:00Z'), scheduled_pickup_window_start: '08:00', scheduled_pickup_window_end: '15:00' } as Order;
  const markup = renderToStaticMarkup(date.render(order, t, money, 'fr'));
  assert.match(markup, /11 sept. 2026, 08:00–15:00/);
  assert.match(markup, /whitespace-nowrap/);
});

test('workflow badges group new, in-progress, ready and completed states', () => {
  const status = ORDER_COLUMNS.find(column => column.key === 'status')!;
  for (const [value, tone] of Object.entries({ pending_review: 'new', scheduled: 'new', accepted: 'progress', in_kitchen: 'progress', out_for_delivery: 'progress', ready: 'neutral', ready_for_pickup: 'neutral', ready_for_delivery: 'neutral', served: 'neutral', received: 'neutral', delivered: 'neutral', picked_up: 'neutral', cancelled: 'neutral', rejected: 'neutral' })) {
    const markup = renderToStaticMarkup(status.render({ status: value } as Order, t, money));
    assert.match(markup, new RegExp(`data-status-tone="${tone}"`));
  }
});

test('payment cells show the total above the truthful derived state and retain the balance due', () => {
  const payment = ORDER_COLUMNS.find(column => column.key === 'payment')!;
  const markup = renderToStaticMarkup(React.createElement(LocaleProvider, null, payment.render({ total_amount: 120, payment_status: 'paid', balance_due: 20 } as Order, key => key === 'balanceRemainingShort' ? 'Remaining {amount}' : key, amount => `₪${amount}.00`)));
  assert.match(markup, /orders-payment-amount">₪120.00/);
  assert.match(markup, /partially paid/);
  assert.match(markup, /title="Remaining ₪20.00"/);
  assert.match(markup, /class="sr-only">Remaining ₪20.00/);
});
