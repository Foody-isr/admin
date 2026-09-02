import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isCourierDeliveryPath, isCourierRoleName } from '@/lib/courier-access';

test('recognises the built-in Courier role without depending on casing', () => {
  assert.equal(isCourierRoleName('Courier'), true);
  assert.equal(isCourierRoleName(' courier '), true);
  assert.equal(isCourierRoleName('Manager'), false);
});

test('couriers are restricted to the dedicated deliveries route', () => {
  assert.equal(isCourierDeliveryPath('/42/orders/deliveries', 42), true);
  assert.equal(isCourierDeliveryPath('/42/orders/deliveries/next', 42), true);
  assert.equal(isCourierDeliveryPath('/42/orders/all', 42), false);
  assert.equal(isCourierDeliveryPath('/42/dashboard', 42), false);
  assert.equal(isCourierDeliveryPath('/7/orders/deliveries', 42), false);
});

