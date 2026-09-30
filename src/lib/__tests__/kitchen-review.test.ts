import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { kitchenStockPriority, priorityKitchenStocks, priorityKitchenPreparations } from '../kitchen-review';
import type { KitchenStockSummary, KitchenPrepSummary } from '../api';

const stock: KitchenStockSummary = { stock_item_id: 1, name: 'Cod', unit: 'kg', opening_qty: 2, received_qty: 8, production_usage: 6.25, order_usage: 0, pending_usage: 0, waste_qty: 0, adjustment_qty: 0, recorded_remaining: 3.75, expected_remaining: 3.75, counted_remaining: null, unexplained_qty: null, recipes: [] };

test('a recipe-derived balance is not an unexplained physical shortage', () => {
  assert.equal(kitchenStockPriority(stock), 0);
});

test('independent discrepancies come before recorded shortages and declared waste', () => {
  const shortage = { ...stock, stock_item_id: 2, expected_remaining: -1 };
  const measured = { ...stock, stock_item_id: 3, counted_remaining: 2, unexplained_qty: 1.75 };
  const rows = [stock, shortage, measured];
  assert.deepEqual(priorityKitchenStocks(rows).map((row) => row.stock_item_id), [3, 2, 1]);
  assert.deepEqual(rows.map((row) => row.stock_item_id), [1, 2, 3]);
});

test('urgent preparations remain visible before routine production', () => {
  const prep: KitchenPrepSummary = { prep_item_id: 1, name: 'Fish', unit: 'unit', produced_qty: 50, target_qty: null, remaining_qty: 2, waste_qty: 0 };
  const rows = [prep, { ...prep, prep_item_id: 2, target_qty: 80 }, { ...prep, prep_item_id: 3, remaining_qty: -76 }];
  assert.deepEqual(priorityKitchenPreparations(rows).map((row) => row.prep_item_id), [3, 2, 1]);
  assert.deepEqual(rows.map((row) => row.prep_item_id), [1, 2, 3]);
});
