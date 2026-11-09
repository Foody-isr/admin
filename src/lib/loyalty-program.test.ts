import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkedLoyaltyProgramState, checkedProgramAck, clearProgramIntent, loyaltyMinor, loyaltyProgramDraft, loyaltyProgramPayload, readProgramIntent, storeProgramIntent } from './loyalty-program';
import { requiredPermissionsForPath } from './route-permissions';
import type { LoyaltyProgram } from './api';
import type { PendingLoyaltyProgram } from './loyalty-program';

const request = '12345678-1234-4234-8234-123456789abc';
function prepared() {
  const d = loyaltyProgramDraft(null); d.mode = 'visits'; d.threshold = '5'; d.amount = '12,50'; d.termsVersion = 'v1';
  for (const lang of ['en', 'fr', 'he'] as const) d.content[lang] = { name: 'Synthetic program', terms: 'Synthetic terms only.' };
  return d;
}
function pending(): PendingLoyaltyProgram { return { restaurant: 1, actor: 7, program_id: null, input: loyaltyProgramPayload(prepared(), 'ILS', 0, request) }; }
function program(): LoyaltyProgram { const i = pending().input; return { id: request, version_id: request, revision: 1, enabled: i.enabled, rules: i.rules, content: i.content, updated_at: '2026-11-01T08:00:00Z' }; }
function memory() { const data = new Map<string, string>(); return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } }; }

test('monetary input preserves cents and rejects excess precision or unsafe values', () => {
  assert.equal(loyaltyMinor('12,50'), 1250); assert.equal(loyaltyMinor('0.01'), 1);
  for (const s of ['1.001', '-1', 'NaN', '1e4', ' 1', '9999999999999999999']) assert.throws(() => loyaltyMinor(s));
});
test('enrollment configuration needs all translations and complete mode/reward rules', () => {
  const d = prepared(); const input = loyaltyProgramPayload(d, 'ILS', 0, request);
  assert.equal(input.rules.spend_step_minor, 0); assert.equal(input.rules.units_per_step, 1); assert.equal(input.rules.reward_amount_minor, 1250);
  d.content.he.terms = ''; assert.throws(() => loyaltyProgramPayload(d, 'ILS', 0, request));
  d.content.he.terms = 'Terms'; d.reward = 'item'; d.item = '4'; d.variant = '8';
  assert.equal(loyaltyProgramPayload(d, 'ILS', 0, request).rules.reward_variant_id, 8);
  d.mode = 'points'; d.step = '10'; d.units = '2'; assert.equal(loyaltyProgramPayload(d, 'ILS', 0, request).rules.spend_step_minor, 1000);
});
test('missing authority is read-only; unknown currency and incomplete money fail closed', () => {
  const v = { program: program(), identity_locked: true, restaurant_currency: 'ILS' };
  assert.equal(checkedLoyaltyProgramState(v).can_manage_program, false);
  assert.throws(() => checkedLoyaltyProgramState({ ...v, restaurant_currency: 'XXX' }));
  assert.throws(() => checkedLoyaltyProgramState({ ...v, program: { ...program(), rules: { ...program().rules, reward_amount_minor: -1 } } }));
});
test('an acknowledgement must match original identity, revision, content and rules', () => {
  const saved = pending(); assert.equal(checkedProgramAck({ program: program() }, saved).revision, 1);
  assert.throws(() => checkedProgramAck({ program: { ...program(), revision: 2 } }, saved));
  assert.throws(() => checkedProgramAck({ program: { ...program(), enabled: true } }, saved));
  assert.throws(() => checkedProgramAck({ program: program() }, { ...saved, program_id: 'other' }));
});
test('the original scoped input survives reload and storage failures block replacement', () => {
  const store = memory(), saved = pending(); storeProgramIntent(store, saved); assert.deepEqual(readProgramIntent(store, 1, 7), saved);
  assert.equal(readProgramIntent(store, 2, 7), null); assert.equal(readProgramIntent(store, 1, 8), null);
  assert.throws(() => storeProgramIntent(store, { ...saved, input: { ...saved.input, enabled: true } }));
  assert.throws(() => clearProgramIntent({ ...store, removeItem: () => { throw new Error('quota'); } }, saved));
  assert.deepEqual(readProgramIntent(store, 1, 7), saved);
  store.setItem(Array.from(store.data.keys())[0], '{'); assert.throws(() => readProgramIntent(store, 1, 7));
  const unavailable = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} }; assert.throws(() => storeProgramIntent(unavailable, saved));
});
test('configuration and checkout review retain distinct route permissions', () => {
  assert.deepEqual(requiredPermissionsForPath('/1/loyalty/program'), ['settings.view', 'settings.edit']);
  assert.deepEqual(requiredPermissionsForPath('/1/loyalty/checkouts'), ['payments.view', 'payments.manage']);
});

test('a stale tab cannot replace another program at the same revision', () => {
  assert.throws(() => loyaltyProgramPayload(prepared(), 'ILS', 1, request));
  const input = loyaltyProgramPayload(prepared(), 'ILS', 1, request, request);
  assert.equal(input.program_id, request);
  const store = memory();
  assert.throws(() => storeProgramIntent(store, { restaurant: 1, actor: 7, program_id: null, input }));
});
