import assert from 'node:assert/strict';
import test from 'node:test';
import { readOrderLifecycle } from '../lifecycle';

function summary() {
  const axis = (state: string) => ({ state, evidence: [] });
  return {
    schema_version: 1, scope: { kind: 'order', id: '7' }, identities: { order_ids: [7] },
    commercial: axis('open'), payment: axis('paid'),
    preparation: { ...axis('in_progress'), quantities: { total: 2, not_sent: 0, held: 0, in_progress: 2, ready: 0, unknown: 0 } },
    handoff: { ...axis('unknown'), tracking: 'unknown' },
  };
}

test('only an absent lifecycle uses the explicit legacy path', () => {
  assert.equal(readOrderLifecycle(undefined, 7).kind, 'legacy');
  for (const value of [null, {}, { schema_version: 2 }, { ...summary(), payment: null }]) {
    assert.equal(readOrderLifecycle(value, 7).kind, 'unavailable');
  }
  assert.equal(readOrderLifecycle(summary(), 7).kind, 'available');
});

test('order scopes never silently become a check, visit or sibling QR order', () => {
  for (const scope of [{ kind: 'financial_check', id: '7' }, { kind: 'check', id: '7' }, { kind: 'table_session', id: '7' }, { kind: 'order', id: '8' }]) {
    assert.equal(readOrderLifecycle({ ...summary(), scope }, 7).kind, 'unavailable');
  }
  assert.equal(readOrderLifecycle({ ...summary(), identities: { order_ids: [7, 8] } }, 7).kind, 'unavailable');
  assert.equal(readOrderLifecycle({ ...summary(), identities: { order_ids: [8] } }, 7).kind, 'unavailable');
  assert.equal(readOrderLifecycle({ ...summary(), identities: { order_ids: [7], check_id: 'parent' } }, 7, true).kind, 'unavailable');
});

test('unknown and not-tracked are distinct valid states; invalid quantities/evidence are unavailable', () => {
  const value = summary();
  assert.equal(readOrderLifecycle(value, 7).kind, 'available');
  assert.equal(readOrderLifecycle({ ...value, handoff: { ...value.handoff, tracking: 'not_tracked' } }, 7).kind, 'available');
  for (const preparation of [
    { ...value.preparation, quantities: { ...value.preparation.quantities, ready: -1 } },
    { ...value.preparation, quantities: { ...value.preparation.quantities, total: 0.5 } },
    { ...value.preparation, evidence: null },
    { ...value.preparation, evidence: [{ source: 'order_status', state: 'in_progress', at: 'tomorrow' }] },
  ]) assert.equal(readOrderLifecycle({ ...value, preparation }, 7).kind, 'unavailable');
});
