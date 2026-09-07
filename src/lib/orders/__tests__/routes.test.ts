import assert from 'node:assert/strict';
import { test } from 'node:test';
import { orderDetailPath, orderDetailUrl, ordersListPath, parseOrderIdParam } from '@/lib/orders/routes';

test('builds canonical restaurant-scoped order URLs', () => {
  assert.equal(ordersListPath(42), '/42/orders/all');
  assert.equal(orderDetailPath(42, 731), '/42/orders/731');
  assert.equal(
    orderDetailUrl('https://admin.foody-pos.co.il', 42, 731),
    'https://admin.foody-pos.co.il/42/orders/731',
  );
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
