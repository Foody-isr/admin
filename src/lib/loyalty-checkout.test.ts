import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canCloseLoyaltyCheckout, clearLoyaltyCommand, parseLoyaltyCheckoutDetail, parseLoyaltyCheckoutPage, parseLoyaltyCloseResult, readLoyaltyCommand, saveLoyaltyCommand, validLoyaltyCloseReason } from './loyalty-checkout';

const view = { order_id: 42, checkout_state: 'attempted', reward_state: 'reserved', payment_state: 'pending', fulfillment_state: 'pending_review', next_step: 'verify_and_close', revision: 'a'.repeat(64), expected_amount_minor: 7000, currency: 'EUR' };
const input = { request_id: '12345678-1234-4234-8234-123456789abc', expected_revision: 'a'.repeat(64), reason: 'Synthetic abandoned checkout' };
const scope = { restaurant: 1, actor: 7, order: 42 };
function memory() { const data = new Map<string, string>(); return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } }; }

test('older API stays read-only and incomplete money projections fail', () => {
  assert.equal(parseLoyaltyCheckoutDetail(view, 42).can_request_close, false);
  assert.equal(parseLoyaltyCheckoutDetail({ ...view, can_request_close: true }, 42).can_request_close, true);
  assert.throws(() => parseLoyaltyCheckoutDetail({ ...view, can_request_close: 'true' }, 42));
  assert.throws(() => parseLoyaltyCheckoutDetail(view, 43));
  assert.throws(() => parseLoyaltyCheckoutDetail({ ...view, currency: undefined }, 42));
  assert.throws(() => parseLoyaltyCheckoutDetail({ ...view, expected_amount_minor: -1 }, 42));
  assert.equal(canCloseLoyaltyCheckout({ ...view, next_step: 'new_server_action' }), false);
});

test('keyset pages cannot duplicate or reverse a cursor', () => {
  assert.equal(parseLoyaltyCheckoutPage({ items: [view], next_after: 42 }, 0).next_after, 42);
  assert.throws(() => parseLoyaltyCheckoutPage({ items: [view], next_after: 40 }, 0));
  assert.throws(() => parseLoyaltyCheckoutPage({ items: [view] }, 42));
  assert.throws(() => parseLoyaltyCheckoutPage({ items: [view, view] }, 0));
  assert.throws(() => parseLoyaltyCheckoutPage({ items: null }, 0));
});

test('a response cannot acknowledge another order or request', () => {
  assert.equal(parseLoyaltyCloseResult({ request_id: input.request_id, order_id: 42, status: 'pending' }, 42, input.request_id).status, 'pending');
  assert.throws(() => parseLoyaltyCloseResult({ request_id: input.request_id, order_id: 43, state: 'closed' }, 42, input.request_id));
  assert.throws(() => parseLoyaltyCloseResult({ request_id: 'other', order_id: 42, state: 'closed' }, 42, input.request_id));
});

test('session journal retains exactly one input across reload and isolates actor/tenant', () => {
  const storage = memory();
  saveLoyaltyCommand(storage, scope, input);
  assert.deepEqual(readLoyaltyCommand(storage, scope), input);
  assert.equal(readLoyaltyCommand(storage, { ...scope, actor: 8 }), null);
  assert.equal(readLoyaltyCommand(storage, { ...scope, restaurant: 2 }), null);
  assert.throws(() => saveLoyaltyCommand(storage, scope, { ...input, reason: 'Changed intent' }));
  assert.throws(() => clearLoyaltyCommand(storage, scope, 'other'));
  assert.deepEqual(readLoyaltyCommand(storage, scope), input);
  clearLoyaltyCommand(storage, scope, input.request_id);
  assert.equal(readLoyaltyCommand(storage, scope), null);
});

test('corrupt or unavailable storage blocks replacement before network work', () => {
  const storage = memory(); saveLoyaltyCommand(storage, scope, input);
  const key = Array.from(storage.data.keys())[0]; storage.setItem(key, '{');
  assert.throws(() => readLoyaltyCommand(storage, scope));
  assert.throws(() => saveLoyaltyCommand(storage, scope, input));
  const unavailable = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
  assert.throws(() => saveLoyaltyCommand(unavailable, scope, input));
  const retained = memory(); saveLoyaltyCommand(retained, scope, input);
  assert.throws(() => clearLoyaltyCommand({ ...retained, removeItem: () => { throw new Error('quota'); } }, scope, input.request_id), /loyalty_journal_unavailable/);
  assert.deepEqual(readLoyaltyCommand(retained, scope), input);
});

test('reason validation measures UTF-8 bytes and never trims the original intent', () => {
  assert.equal(validLoyaltyCloseReason('ab'), false);
  assert.equal(validLoyaltyCloseReason(' synthetic '), false);
  assert.equal(validLoyaltyCloseReason('one\ntwo'), false);
  assert.equal(validLoyaltyCloseReason('א'.repeat(151)), false);
  assert.equal(validLoyaltyCloseReason('Motif vérifié'), true);
});
