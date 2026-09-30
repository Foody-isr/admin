import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeIngredientBreakdown } from '@/lib/api';

test('normalizes a legacy null contribution list to an empty array', () => {
  const breakdown = normalizeIngredientBreakdown({
    stock_item_id: 7,
    item_name: 'Cod',
    unit: 'kg',
    contributions: null,
  });

  assert.deepEqual(breakdown.contributions, []);
});
