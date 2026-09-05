import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultOrdersTabForBasis } from '@/lib/orders/orders-list-preferences';

test('série mode opens all orders so scheduled orders are not hidden', () => {
  assert.equal(defaultOrdersTabForBasis('serie'), 'all');
});

test('creation-date mode keeps the live operational queue as its default', () => {
  assert.equal(defaultOrdersTabForBasis('created'), 'active');
});
