import assert from 'node:assert/strict';
import test from 'node:test';
import { initialOrdersTab } from '@/lib/orders/orders-list-preferences';

test('regular order browsing includes every status', () => {
  assert.equal(initialOrdersTab(false), 'all');
});

test('opening a payments-to-process link selects the active queue', () => {
  assert.equal(initialOrdersTab(true), 'active');
});
