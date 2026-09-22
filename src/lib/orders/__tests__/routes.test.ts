import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  orderDetailPath,
  orderDetailUrl,
  ordersListPath,
  ordersPaymentAttentionPath,
  PAYMENT_ATTENTION_FILTER,
  parseOrderIdParam,
  parseOrdersPaymentAttentionQuery,
} from '@/lib/orders/routes';

test('builds canonical restaurant-scoped order URLs', () => {
  assert.equal(ordersListPath(42), '/42/orders/all');
  assert.equal(orderDetailPath(42, 731), '/42/orders/731');
  assert.equal(
    orderDetailUrl('https://admin.foody-pos.co.il', 42, 731),
    'https://admin.foody-pos.co.il/42/orders/731',
  );
});

test('round-trips the dashboard payment-attention scope', () => {
  const path = ordersPaymentAttentionPath(42, {
    from: '2026-09-18',
    to: '2026-09-18',
    dateField: 'serie',
  });
  const url = new URL(path, 'https://admin.foody-pos.co.il');

  assert.equal(url.pathname, '/42/orders/all');
  assert.deepEqual(parseOrdersPaymentAttentionQuery(url.searchParams), {
    from: '2026-09-18',
    to: '2026-09-18',
    dateField: 'serie',
  });
});

test('payment-attention filter includes every collectible incomplete status', () => {
  assert.deepEqual(
    new Set(PAYMENT_ATTENTION_FILTER.split(',')),
    new Set(['unpaid', 'pending', 'partially_paid']),
  );
});

test('rejects malformed payment-attention links', () => {
  assert.equal(parseOrdersPaymentAttentionQuery(new URLSearchParams()), null);
  assert.equal(parseOrdersPaymentAttentionQuery(new URLSearchParams({
    view: 'payment_attention',
    from: '2026-02-30',
    to: '2026-03-01',
  })), null);
  assert.equal(parseOrdersPaymentAttentionQuery(new URLSearchParams({
    view: 'payment_attention',
    from: '2026-09-19',
    to: '2026-09-18',
  })), null);
});

test('accepts only positive safe integer order route params', () => {
  assert.equal(parseOrderIdParam('731'), 731);
  assert.equal(parseOrderIdParam('0'), null);
  assert.equal(parseOrderIdParam('-1'), null);
  assert.equal(parseOrderIdParam('12.5'), null);
  assert.equal(parseOrderIdParam('order-12'), null);
  assert.equal(parseOrderIdParam(['12']), null);
  assert.equal(parseOrderIdParam(undefined), null);
});
