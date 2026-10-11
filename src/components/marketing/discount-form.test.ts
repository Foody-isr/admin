import test from 'node:test';
import assert from 'node:assert/strict';
import type { Discount } from '@/lib/api';
import { discountDraft, discountInput, discountSignature, validDiscountDay, checkedDiscount } from './discount-form';
import { discountDay, discountStatus } from '@/lib/discounts';

const record: Discount = { id: 1, restaurant_id: 1, code: 'TEST', name: '', description: 'Original', type: 'percent', value: 10, scope: 'category', scope_ids: [2], min_purchase: 0, starts_at: null, ends_at: null, total_cap: 0, per_customer_cap: null, is_active: true, redemption_count: 0, created_at: '2026-01-01T00:00:00Z' };
test('editing another field retains null dates and a historical zero cap', () => {
  const draft = discountDraft(record, '2026-10-04'); draft.name = 'Updated';
  const result = discountInput(draft, record); assert.equal(result.input?.starts_at, null); assert.equal(result.input?.total_cap, 0); assert.deepEqual(result.input?.scope_ids, [2]);
});
test('invalid numeric input is never truncated or converted to unlimited', () => {
  const draft = discountDraft({ ...record, total_cap: 8 }, '2026-10-04');
  for (const value of ['2.5', '0', '-1', 'bad']) { draft.totalCap = value; assert.equal(discountInput(draft, { ...record, total_cap: 8 }).issue?.field, 'totalCap'); }
  draft.totalCap = ''; draft.value = '101'; assert.equal(discountInput(draft, record).issue?.field, 'value');
});
test('free-delivery switching retains the local item selection but posts the existing global contract', () => {
  const draft = discountDraft(record, '2026-10-04'); draft.type = 'free_delivery';
  assert.equal(discountInput(draft, record).input?.scope, 'whole_sale'); assert.deepEqual(draft.selections.category, [2]); draft.type = 'percent'; assert.deepEqual(discountInput(draft, record).input?.scope_ids, [2]);
});
test('optional dates can be cleared and impossible calendar days are rejected', () => {
  const draft = discountDraft({ ...record, ends_at: '2026-10-09' }, '2026-10-04'); draft.hasEnd = false;
  assert.equal(discountInput(draft, record).input?.ends_at, null); assert.equal(draft.end, '2026-10-09');
  assert.equal(validDiscountDay('2026-02-29'), false); assert.equal(validDiscountDay('2028-02-29'), true);
});
test('readback comparison ignores scope order but detects changed conditions', () => {
  assert.equal(discountSignature({ ...record, scope_ids: [2, 3] }), discountSignature({ ...record, scope_ids: [3, 2] }));
  assert.notEqual(discountSignature(record), discountSignature({ ...record, total_cap: null }));
});
test('discount end dates remain active all day in the restaurant timezone', () => {
  const discount = { ...record, total_cap: null, starts_at: '2026-10-04', ends_at: '2026-10-04' };
  assert.equal(discountStatus(discount, new Date('2026-10-04T20:59:59Z'), 'Asia/Jerusalem'), 'active');
  assert.equal(discountStatus(discount, new Date('2026-10-04T21:00:00Z'), 'Asia/Jerusalem'), 'expired');
  assert.equal(discountStatus(discount, new Date('2026-10-03T21:00:00Z'), 'Asia/Jerusalem'), 'active');
});
test('restaurant day uses configured timezone and documented fallback', () => {
  const now = new Date('2026-10-04T22:00:00Z');
  assert.equal(discountDay(now, 'Asia/Jerusalem'), '2026-10-05'); assert.equal(discountDay(now, 'Pacific/Honolulu'), '2026-10-04'); assert.equal(discountDay(now, 'invalid'), '2026-10-05');
});
test('status priority and legacy timestamp bounds remain compatible', () => {
  const now = new Date('2026-10-04T12:00:00Z'); assert.equal(discountStatus(record, now), 'exhausted'); assert.equal(discountStatus({ ...record, is_active: false }, now), 'inactive'); assert.equal(discountStatus({ ...record, total_cap: null, ends_at: '2026-10-04T11:00:00Z' }, now), 'expired');
});

test('response verification rejects cross-restaurant, incomplete and different-record data', () => {
  assert.deepEqual(checkedDiscount(record, 1, 1), record);
  assert.throws(() => checkedDiscount(record, 2));
  assert.throws(() => checkedDiscount(record, 1, 2));
  assert.throws(() => checkedDiscount({ ...record, ends_at: '2026-02-29' }, 1));
  assert.throws(() => checkedDiscount({ ...record, total_cap: undefined } as any, 1));
  assert.deepEqual(checkedDiscount({ ...record, scope_ids: null } as any, 1).scope_ids, []);
});
