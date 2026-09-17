import assert from 'node:assert/strict';
import test from 'node:test';
import { requiredPermissionsForPath } from '../route-permissions';

test('courier mode requires order management permission', () => {
  assert.deepEqual(
    requiredPermissionsForPath('/5/orders/courier-mode'),
    ['orders.manage'],
  );
});

test('the regular delivery page remains available to order viewers', () => {
  assert.deepEqual(
    requiredPermissionsForPath('/5/orders/deliveries'),
    ['orders.view', 'orders.manage'],
  );
});
