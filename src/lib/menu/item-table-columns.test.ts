import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveItemTableVisibility } from './item-table-columns';

test('saved layouts default new or missing columns to visible', () => {
  assert.deepEqual(resolveItemTableVisibility({ price: false }), { images: true, category: true, availability: true, price: false });
});

test('malformed preferences cannot hide the table or introduce columns', () => {
  for (const saved of [null, [], 'hidden', 0, { price: 'false', category: 0, images: null, article: false, unknown: true }]) {
    assert.deepEqual(resolveItemTableVisibility(saved), { images: true, category: true, availability: true, price: true });
  }
});

test('all optional columns can be hidden without creating a hideable article column', () => {
  assert.deepEqual(resolveItemTableVisibility({ images: false, category: false, availability: false, price: false, article: false }), { images: false, category: false, availability: false, price: false });
});
