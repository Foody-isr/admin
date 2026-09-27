import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultRestaurantPath, requiredPermissionsForPath } from '../route-permissions';

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

test('dashboard requires analytics permission', () => {
  assert.deepEqual(requiredPermissionsForPath('/5/dashboard'), ['analytics.view']);
});

test('website variants cannot bypass the website permission by URL', () => {
  assert.deepEqual(requiredPermissionsForPath('/5/website-v3'), ['settings.edit']);
  assert.deepEqual(requiredPermissionsForPath('/5/website-v2'), ['settings.edit']);
});

test('managed devices use the same permission union as the API', () => {
  const required = requiredPermissionsForPath('/5/settings/devices');
  assert.ok(required.includes('printers.view'));
  assert.ok(required.includes('kitchen.manage'));
  assert.ok(required.includes('settings.edit'));
});

test('personal security and notification pages stay available', () => {
  assert.deepEqual(requiredPermissionsForPath('/5/settings/security'), []);
  assert.deepEqual(requiredPermissionsForPath('/5/settings/notifications'), []);
});

test('restaurant layout pages use table permissions', () => {
  assert.deepEqual(requiredPermissionsForPath('/5/restaurant/floor-plans'), [
    'tables.view',
    'tables.manage',
  ]);
  assert.deepEqual(requiredPermissionsForPath('/5/restaurant/table-qr'), [
    'tables.view',
    'tables.manage',
  ]);
});

test('recipe lab requires kitchen management on direct links', () => {
  assert.deepEqual(requiredPermissionsForPath('/5/kitchen/lab'), [
    'kitchen.manage',
  ]);
});

test('production and creation routes use their mutation domains', () => {
  assert.deepEqual(requiredPermissionsForPath('/5/orders/production'), [
    'kitchen.view',
    'kitchen.manage',
  ]);
  assert.deepEqual(requiredPermissionsForPath('/5/orders/new'), ['orders.manage']);
  assert.deepEqual(requiredPermissionsForPath('/5/menu/items/new'), ['menu.edit']);
  assert.deepEqual(requiredPermissionsForPath('/5/menu/options/new'), ['menu.edit']);
  assert.deepEqual(requiredPermissionsForPath('/5/menu/import'), ['menu.edit']);
  assert.deepEqual(requiredPermissionsForPath('/5/menu/menus/7/edit'), ['menu.edit']);
  assert.deepEqual(requiredPermissionsForPath('/5/restaurant/floor-plans/new'), [
    'tables.manage',
  ]);
  assert.deepEqual(requiredPermissionsForPath('/5/restaurant/table-qr/customize'), [
    'tables.manage',
  ]);
});

test('a user with no business permissions falls back to personal security', () => {
  assert.equal(defaultRestaurantPath(5, []), '/5/settings/security');
});
