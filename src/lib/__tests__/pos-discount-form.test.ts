import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validPOSDiscount } from '../pos-discount-form';
import type { POSDiscountDefinition } from '../api';
const base: POSDiscountDefinition = { id: 'definition', name: 'Reduction', type: 'fixed', value: 20, variable: false, active: true, version: 0 };
test('all four staff reduction types are valid without coupon codes', () => {
  for (const value of [base, { ...base, type: 'percent' as const }, { ...base, variable: true, value: 0 }, { ...base, variable: true, value: 0, type: 'percent' as const }]) assert.equal(validPOSDiscount(value), true);
});
test('rejects negative, excessive, non-finite or fractional-cent values', () => {
  for (const value of [-1, 0, NaN, Infinity, 20.111, 1000001]) assert.equal(validPOSDiscount({ ...base, value }), false);
  assert.equal(validPOSDiscount({ ...base, type: 'percent', value: 101 }), false);
  assert.equal(validPOSDiscount({ ...base, variable: true, value: 5 }), false);
});
test('names and revisions cannot bypass transport validation', () => {
  for (const name of ['', '  ', 'Bad\nname', '\0', 'é'.repeat(81)]) assert.equal(validPOSDiscount({ ...base, name }), false);
  for (const version of [-1, 0.5, Infinity]) assert.equal(validPOSDiscount({ ...base, version }), false);
});
