import assert from 'node:assert/strict';
import test from 'node:test';
import type { StockItem } from './api';
import { prepIngredientBaseQuantity, prepIngredientUnitOptions } from './prep-ingredient-units';

const item = (fields: Partial<StockItem>): StockItem => ({
  id: 1, unit: 'kg', unit_content: 0, unit_content_unit: '', pack_size: 0,
  container_type: '', unit_type: '', unit_conversions: [], ...fields,
} as StockItem);

test('offers item-specific pieces and converts four cucumbers to the stock unit', () => {
  const cucumber = item({ unit_conversions: [{ id: 1, stock_item_id: 1, custom_unit_id: 1, base_quantity: 0.125,
    custom_unit: { id: 1, restaurant_id: 1, name: 'concombre', abbreviation: '', created_at: '', updated_at: '' } }] });
  assert.ok(prepIngredientUnitOptions(cucumber).some((option) => option.unit === 'concombre'));
  assert.equal(prepIngredientBaseQuantity(cucumber, 4, 'concombre'), 0.5);
  assert.equal(prepIngredientBaseQuantity(cucumber, 500, 'g'), 0.5);
});

test('offers a purchased packet and handles half a packet', () => {
  const chives = item({ unit: 'g', unit_content: 80, unit_content_unit: 'g', container_type: 'packet' });
  assert.equal(prepIngredientBaseQuantity(chives, 0.5, 'packet'), 40);
  assert.equal(prepIngredientBaseQuantity(chives, 1, 'concombre'), null);
});
