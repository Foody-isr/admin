import assert from 'node:assert/strict';
import test from 'node:test';

import { priceForVatMode, priceFromVatMode } from './StockQuantityForm';

test('converts an ex-VAT price to an inc-VAT price', () => {
  assert.equal(priceForVatMode(100, 18, 'inc'), 118);
  assert.equal(priceForVatMode(100, 18, 'ex'), 100);
});

test('converts an entered inc-VAT price back to the canonical ex-VAT price', () => {
  assert.equal(priceFromVatMode(118, 18, 'inc'), 100);
  assert.equal(priceFromVatMode(100, 18, 'ex'), 100);
});

test('round-trips prices for custom and exempt VAT rates', () => {
  for (const vatRate of [0, 12, 17.5, 18]) {
    const incVat = priceForVatMode(37.42, vatRate, 'inc');
    assert.ok(Math.abs(priceFromVatMode(incVat, vatRate, 'inc') - 37.42) < 1e-10);
  }
});
