import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCheckout } from '../checkout-validation';
import { checkoutStepCopy } from '../checkout-step-copy';

type Input = Parameters<typeof validateCheckout>[0];
const valid = (): Input => ({
  fulfillment: { timing: 'scheduled', scheduledFor: '2026-11-06', windowStart: '10:00', windowEnd: '12:00' },
  orderType: 'pickup', customerName: 'Client démo', customerPhone: '0500000000', address: '',
  intent: 'later', linkEnabled: true, cardEnabled: true, holdEnabled: true,
  feeValid: true, feeTouched: false, received: false, total: 100, discountedTotal: 100,
  manualStarted: false, manualValue: 0, manualType: 'fixed', manualReason: '',
});
const event = (): NonNullable<Input['event']> => ({
  name: '', guests: 20, event_date: '2026-11-06', event_time: '12:00', venue: '', contact: '', notes: '',
  require_guests: true, require_date: true, require_time: true,
  payment_mode: 'deposit', deposit_type: 'percent', deposit_value: 30, balance_due_date: '',
});

test('an event and handover ending at the same time are valid', () => {
  assert.deepEqual(validateCheckout({ ...valid(), event: event() }), []);
});
test('an equal or reversed window identifies both controls without blaming the event', () => {
  for (const end of ['10:00', '09:00']) {
    const input = valid();
    input.fulfillment.windowEnd = end;
    assert.deepEqual(validateCheckout(input), [
      { field: 'windowStart', step: 'reception', code: 'windowOrder' },
      { field: 'windowEnd', step: 'reception', code: 'windowOrder' },
    ]);
  }
});
test('returns all missing fields together and validates actual calendar dates', () => {
  const input = { ...valid(), customerName: '', customerPhone: '', address: '', orderType: 'delivery' as const };
  input.fulfillment = { timing: 'scheduled', scheduledFor: '2026-02-30', windowStart: '10:00' };
  assert.deepEqual(validateCheckout(input).map(issue => issue.field), ['scheduledFor', 'windowEnd', 'customerName', 'customerPhone', 'address']);
});
test('private links defer required recipient answers but still reject an invalid handover', () => {
  const e = { ...event(), guests: 0, event_date: '', event_time: '' };
  const input: Input = { ...valid(), intent: 'link', customerName: '', customerPhone: '', orderType: 'delivery', event: e };
  assert.deepEqual(validateCheckout(input), []);
  input.fulfillment = { timing: 'scheduled' };
  assert.deepEqual(validateCheckout(input).map(issue => issue.field), ['scheduledFor']);
});
test('switching from a private link to later payment requires customer and event answers', () => {
  const input: Input = { ...valid(), intent: 'later', customerName: '', customerPhone: '', event: { ...event(), guests: 0, event_date: '', event_time: '' } };
  assert.deepEqual(validateCheckout(input).map(issue => issue.field), ['customerName', 'customerPhone', 'event.guests', 'event.event_date', 'event.event_time']);
});
test('deposit and authorization failures belong to their payment fields', () => {
  const e = { ...event(), payment_mode: 'deposit_hold' as const, deposit_value: 100, hold_type: 'percent' as const, hold_value: 150 };
  const issues = validateCheckout({ ...valid(), intent: 'link', event: e });
  assert.deepEqual(issues.map(issue => [issue.field, issue.step, issue.code]), [
    ['event.deposit_value', 'payment', 'deposit'], ['event.hold_value', 'payment', 'hold'],
  ]);
});
test('unavailable authorization is reported separately from missing event details', () => {
  const issues = validateCheckout({ ...valid(), intent: 'link', holdEnabled: false, event: { ...event(), payment_mode: 'hold', hold_type: 'percent', hold_value: 100 } });
  assert.deepEqual(issues, [{ field: 'event.hold_value', step: 'payment', code: 'holdUnavailable' }]);
});
test('unconfirmed delivery quotes block while explicit zero and ready free quotes are valid', () => {
  const input: Input = { ...valid(), orderType: 'delivery', address: '12 rue démo', feeStatus: 'loading' };
  assert.equal(validateCheckout(input)[0]?.code, 'feePending');
  assert.equal(validateCheckout({ ...input, feeStatus: 'error' })[0]?.code, 'feeUnavailable');
  assert.deepEqual(validateCheckout({ ...input, feeTouched: true }), []);
  assert.deepEqual(validateCheckout({ ...input, feeStatus: 'ready' }), []);
});
test('received payments and incomplete discounts identify every outstanding acknowledgement', () => {
  const input: Input = { ...valid(), intent: 'record', manualStarted: true, manualValue: NaN, manualReason: '' };
  assert.deepEqual(validateCheckout(input).map(issue => issue.field), ['received', 'manualValue', 'manualReason']);
});
test('every validation code has the same localized coverage in all three languages', () => {
  assert.deepEqual(Object.keys(checkoutStepCopy.fr.errors), Object.keys(checkoutStepCopy.en.errors));
  assert.deepEqual(Object.keys(checkoutStepCopy.fr.errors), Object.keys(checkoutStepCopy.he.errors));
});
