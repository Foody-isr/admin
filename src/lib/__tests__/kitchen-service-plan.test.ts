import assert from 'node:assert/strict';
import test from 'node:test';
import { serviceProductionNeed } from '@/lib/kitchen-service-plan';
import type { PrepItem } from '@/lib/api';

const prep = { id: 3, name: 'Sauce', unit: 'kg', quantity: 2, yield_per_batch: 1.5, shelf_life_hours: 24, category: 'Sauces' } as PrepItem;
test('remaining service targets use available preparation stock, rounded to whole batches', () => {
  const need = serviceProductionNeed(prep, 4);
  assert.equal(need.shortfall_qty, 2);
  assert.equal(need.batches_needed, 2);
  assert.equal(need.current_qty, 2);
});
test('sufficient stock requires no production', () => {
  assert.equal(serviceProductionNeed(prep, 1).batches_needed, 0);
  assert.equal(serviceProductionNeed(prep, 1).shortfall_qty, 0);
});
test('missing yield never creates an invalid production quantity', () => {
  const need = serviceProductionNeed({ ...prep, yield_per_batch: 0 }, 4);
  assert.equal(need.shortfall_qty, 2);
  assert.equal(need.batches_needed, 0);
});
