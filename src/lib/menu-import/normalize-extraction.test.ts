import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeRichExtraction } from './normalize-extraction';

test('rejects the legacy Wolt retail response with null items', () => {
  assert.throws(
    () => normalizeRichExtraction({ categories: [{ name: 'Cheese', items: null }] }),
    /category without items/,
  );
});

test('preserves valid by-weight pricing', () => {
  const result = normalizeRichExtraction({
    categories: [{
      name: 'Cheese',
      items: [{
        name: 'Gouda', description: '', price: 0, pricing_mode: 'by_weight',
        price_per_kg: 112, estimated_weight_grams: 200,
      }],
    }],
  });
  assert.equal(result.categories[0].items[0].pricing_mode, 'by_weight');
  assert.equal(result.categories[0].items[0].price_per_kg, 112);
  assert.equal(result.categories[0].items[0].estimated_weight_grams, 200);
});
