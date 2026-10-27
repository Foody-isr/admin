import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertStockInput, stockInputUnits, stockInputValue } from './sale-stock-input';

const small = { id: 20, name: '250 g' };
const large = { id: 21, name: '500 g' };

test('a common measured budget stays in base units across display-unit changes', () => {
  assert.deepEqual(stockInputUnits([small, large]), ['g', 'kg']);
  assert.equal(convertStockInput('2000', 'g', 'kg'), '2');
  assert.equal(stockInputValue('2', 'measure', 'kg'), 2000);
  assert.equal(stockInputValue('0.001', 'measure', 'kg'), 1);
  assert.equal(stockInputValue('0.0001', 'measure', 'kg'), undefined);
});

test('each size can have 1000 g without sharing its portion allowance', () => {
  assert.equal(stockInputValue('1000', 'per_variant', 'g', small), 4);
  assert.equal(stockInputValue('1000', 'per_variant', 'g', large), 2);
  assert.equal(convertStockInput('4', '', 'g', small), '1000');
  assert.equal(convertStockInput('1000', 'g', 'kg', large), '1');
  assert.equal(convertStockInput('1', 'kg', '', large), '2');
  assert.equal(stockInputValue('1100', 'per_variant', 'g', small), undefined);
  assert.equal(stockInputValue('', 'per_variant', 'g', large), null);
});

test('volume, nonnumeric and incompatible sizes offer only compatible units', () => {
  const bottle = { id: 22, name: '0,5 L' };
  assert.deepEqual(stockInputUnits([bottle, { id: 23, name: '250 ml' }]), ['ml', 'l']);
  assert.equal(stockInputValue('1', 'per_variant', 'l', bottle), 2);
  assert.deepEqual(stockInputUnits([small, bottle]), []);
  assert.deepEqual(stockInputUnits([{ id: 23, name: 'Grande' }]), []);
  assert.deepEqual(stockInputUnits([]), []);
});

test('invalid, fractional and overflowing counts cannot be submitted', () => {
  for (const value of ['-1', 'NaN', 'Infinity', '1.5', '2147483648']) {
    assert.equal(stockInputValue(value, 'count', ''), undefined);
  }
  assert.equal(stockInputValue('2147483647', 'count', ''), 2147483647);
  assert.equal(stockInputValue('2147483.648', 'measure', 'kg'), undefined);
  assert.equal(stockInputValue('', 'measure', 'g'), undefined);
});
