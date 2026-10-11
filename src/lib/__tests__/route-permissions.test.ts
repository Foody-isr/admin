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

test('physical device inventory follows its server read policy without opening other settings', () => {
  const inventory = requiredPermissionsForPath('/5/settings/devices');
  assert.deepEqual(inventory, ['printers.view', 'printers.manage', 'shifts.view', 'shifts.manage', 'payments.view', 'payments.manage', 'kitchen.view', 'kitchen.manage', 'settings.view', 'settings.edit', 'tables.view', 'tables.manage']);
  assert.equal(requiredPermissionsForPath('/5/settings').includes('printers.view'), false);
  assert.equal(inventory.includes('orders.view'), false);
});

test('delivery settings combines the separate zone and minimum contracts without broadening general settings', () => {
  assert.deepEqual(requiredPermissionsForPath('/2/settings/delivery'), ['orders.manage', 'settings.view', 'settings.edit']);
  assert.equal(requiredPermissionsForPath('/2/settings').includes('orders.manage'), false);
});

test('the retained website editor requires the original website editing permission', () => {
  assert.deepEqual(requiredPermissionsForPath('/2/website-v3'), ['settings.edit']);
});


test('integrated team settings follow staff permissions without opening general settings or role editing', () => {
  assert.deepEqual(requiredPermissionsForPath('/2/settings/team'), ['staff.view', 'staff.manage', 'roles.manage']);
  assert.equal(requiredPermissionsForPath('/2/settings').includes('staff.view'), false);
  assert.equal(requiredPermissionsForPath('/2/roles').includes('staff.view'), false);
});

test('Stories requires settings read or edit access, not general table access', () => {
  assert.deepEqual(requiredPermissionsForPath('/25/settings/stories'), ['settings.view', 'settings.edit']);
});
