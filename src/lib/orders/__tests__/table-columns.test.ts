import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { Order } from '@/lib/api';
import { ORDER_COLUMNS } from '@/lib/orders/table-columns';

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
