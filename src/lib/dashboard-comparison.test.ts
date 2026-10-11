import assert from 'node:assert/strict';
import test from 'node:test';
import { comparableDelta } from './dashboard-comparison';

test('missing and zero comparison baselines do not fabricate growth', () => {
  assert.equal(comparableDelta(100, undefined), null);
  assert.equal(comparableDelta(100, 0), null);
  assert.equal(comparableDelta(0, 0), null);
  assert.equal(comparableDelta(undefined, 100), null);
  assert.equal(comparableDelta(NaN, 100), null);
});
test('a real comparable period preserves increases, decreases and stability', () => {
  assert.equal(comparableDelta(120, 100), 20);
  assert.equal(comparableDelta(0, 100), -100);
  assert.equal(comparableDelta(100, 100), 0);
});
