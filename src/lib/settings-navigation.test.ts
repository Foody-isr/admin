import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSettingsDestinationActive, settingsNavigation, visibleSettingsNavigation } from './settings-navigation';

test('each settings destination has one group, scoped to the active restaurant', () => {
  const groups = settingsNavigation(42);
  const destinations = groups.flatMap(group => group.items);
  assert.equal(new Set(destinations.map(item => item.href)).size, destinations.length);
  assert.ok(destinations.every(item => item.href.startsWith('/42/')));
  for (const leaf of destinations) {
    assert.equal(destinations.filter(item => isSettingsDestinationActive(leaf.href,item)).length,1);
  }
});

test('restaurant-wide hours, processing and workflow are separate from ordering settings', () => {
  const groups = settingsNavigation(2);
  const restaurant = groups.find(group => group.labelKey === 'settingsGroupRestaurant')!;
  const ordering = groups.find(group => group.labelKey === 'settingsGroupOrdering')!;
  for (const section of ['availability','processing','workflow']) {
    assert.ok(restaurant.items.some(item => item.href.endsWith(`/orders/${section}`)));
    assert.ok(!ordering.items.some(item => item.href.endsWith(`/orders/${section}`)));
  }
  assert.ok(!groups.flatMap(group => group.items).some(item => item.href.includes('/tours')));
});

test('a printer reader only sees printer and physical-device destinations', () => {
  const nav = visibleSettingsNavigation(7, (...permissions) => permissions.includes('printers.view'));
  assert.deepEqual(nav.flatMap(group => group.items.map(item => item.href)), ['/7/settings/devices','/7/settings/printers']);
});

test('a settings reader cannot follow staff-management destinations without their page permission', () => {
  const nav = visibleSettingsNavigation(7, (...permissions) => permissions.includes('settings.view'));
  assert.ok(!nav.flatMap(group => group.items).some(item => item.href.endsWith('/team')));
  assert.ok(nav.flatMap(group => group.items).some(item => item.href.endsWith('/orders/availability')));
});

test('preorder configuration has one entry under order intake', () => {
  const ordering = settingsNavigation(19).find(group => group.labelKey === 'settingsGroupOrdering')!;
  assert.equal(ordering.items.filter(item => item.href.endsWith('/settings/orders')).length, 1);
  assert.equal(ordering.items.some(item => item.href.endsWith('/orders/preorders')), false);
});
