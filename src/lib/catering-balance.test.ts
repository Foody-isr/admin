import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cateringBalanceActions, cateringBalanceStatusKey } from './catering-balance';
import type { CateringBalanceHold } from './api';

const base: CateringBalanceHold = { enabled: true, status: 'none', total: 1000, deposit_paid: 300, balance_due: 700, held_amount: 0, captured: 0, can_create: true };

test('a collected deposit does not authorize or pay the balance', () => {
  assert.deepEqual(cateringBalanceActions(base), { create: true, settle: false });
  assert.deepEqual(cateringBalanceActions({ ...base, can_create: false }), { create: false, settle: false });
  assert.deepEqual(cateringBalanceActions({ ...base, enabled: false }), { create: false, settle: false });
});

test('only the exact authorized balance can be captured or released', () => {
  assert.equal(cateringBalanceActions({ ...base, status: 'authorized', held_amount: 700 }).settle, true);
  assert.equal(cateringBalanceActions({ ...base, status: 'authorized', held_amount: 1000 }).settle, false);
  for (const status of ['pending', 'expired', 'capture_unknown', 'release_unknown', 'capture_completed', 'released', 'new-provider-state']) {
    assert.deepEqual(cateringBalanceActions({ ...base, status, held_amount: 700 }), { create: false, settle: false });
  }
  assert.equal(cateringBalanceActions({ ...base, status: 'authorized', held_amount: 700, captured: 700 }).settle, false);
});

test('unknown statuses are displayed as unconfirmed, not approved', () => {
  assert.equal(cateringBalanceStatusKey('new-provider-state'), 'catering_balance_status_authorization_unknown');
  assert.equal(cateringBalanceStatusKey('capture_completed'), 'catering_balance_status_capture_completed');
});
