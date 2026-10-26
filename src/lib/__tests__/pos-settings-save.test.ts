import assert from 'node:assert/strict';
import test from 'node:test';
import type { FullServiceSettings, POSMode } from '../api';
import { isCompletePOSSettings, posSettingsSaveConfirmed } from '../pos-settings-save';

const mode = (id: string): POSMode => ({ id, name: id, device_ids: [], seating_mode: 'optionalSeats', send_and_stay: false, coursing_enabled: false, auto_progression: false, tile_size: 'tall', sort_cart: 'course' });
const base: FullServiceSettings = { seating_mode: 'optionalSeats', send_and_stay: false, coursing_enabled: false, courses: ['Starter'], show_held_on_kds: false, sort_cart: 'course', comp_reasons: ['Gift'], void_reasons: ['Mistake'], modes: [mode('a'), mode('b')] };

test('mode saves confirm only edited leaves while retaining concurrent flags, names and added modes', () => {
  const next = { ...base, modes: [ { ...mode('a'), coursing_enabled: true }, mode('b') ] };
  const saved = { ...next, send_and_stay: true, modes: [{ ...mode('a'), coursing_enabled: true, name: 'Renamed on POS' }, { ...mode('b'), auto_progression: true }, mode('c')] };
  assert.equal(posSettingsSaveConfirmed(base, next, saved), true);
  assert.equal(posSettingsSaveConfirmed(base, next, { ...saved, modes: [mode('a'), mode('b')] }), false);
  assert.equal(posSettingsSaveConfirmed(base, next, { ...saved, modes: [mode('b')] }), false);
  assert.equal(posSettingsSaveConfirmed(base, next, undefined), false);
});

test('an unchanged concurrently deleted mode stays deleted but an edited or newly created mode must exist', () => {
  const next = { ...base, modes: [ { ...mode('a'), coursing_enabled: true }, mode('b') ] };
  assert.equal(posSettingsSaveConfirmed(base, next, { ...next, modes: [next.modes[0]] }), true);
  const added = { ...base, modes: [...base.modes!, mode('c')] };
  assert.equal(posSettingsSaveConfirmed(base, added, base), false);
  const deleted = { ...base, modes: [mode('a')] };
  assert.equal(posSettingsSaveConfirmed(base, deleted, base), false);
  assert.equal(posSettingsSaveConfirmed(base, deleted, deleted), true);
});

test('edited lists preserve complete ordered values, explicit false and additive fulfillment fields', () => {
  const next = { ...base, fulfillment: { prompt: 'never' as const, default: 'pickup', enabled: ['pickup'], methods: [{ id: 'pickup', name: 'Counter', order_type: 'pickup' as const, show_customer_information: false, future_rule: { enabled: true } }] } };
  assert.equal(posSettingsSaveConfirmed(base, next, structuredClone(next)), true);
  assert.equal(posSettingsSaveConfirmed(base, next, { ...next, fulfillment: { ...next.fulfillment, methods: next.fulfillment.methods.map(({ show_customer_information, ...row }) => row) } }), false);
  assert.equal(posSettingsSaveConfirmed(base, next, { ...next, fulfillment: { ...next.fulfillment, methods: [] } }), false);
  const courses = { ...base, courses: ['Starter', 'Main'] };
  assert.equal(posSettingsSaveConfirmed(base, courses, { ...courses, courses: ['Main', 'Starter'] }), false);
});

test('malformed or duplicate saved mode identities never confirm an edit', () => {
  const next = { ...base, modes: [{ ...mode('a'), coursing_enabled: true }, mode('b')] };
  assert.equal(posSettingsSaveConfirmed(base, next, { ...next, modes: [next.modes[0], next.modes[0]] }), false);
  assert.equal(posSettingsSaveConfirmed(base, next, { ...next, modes: [{ ...next.modes[0], id: '' }, mode('b')] }), false);
});

test('complete policy validation preserves raw inheritance and rejects truncated unchanged fields', () => {
  const inherited = structuredClone(base);
  assert.equal(isCompletePOSSettings(inherited), true);
  assert.equal(Object.hasOwn(inherited, 'check_behavior'), false);
  assert.equal(Object.hasOwn(inherited.modes![0], 'check_behavior'), false);
  const next = { ...base, send_and_stay: true };
  for (const key of ['courses', 'seating_mode', 'show_held_on_kds', 'comp_reasons', 'void_reasons']) {
    const truncated = { ...next } as unknown as Record<string, unknown>;
    delete truncated[key];
    assert.equal(isCompletePOSSettings(truncated), false, key);
    assert.equal(posSettingsSaveConfirmed(base, next, truncated as unknown as FullServiceSettings), false, key);
  }
  assert.equal(isCompletePOSSettings({ ...base, check_behavior: { allow_hold_fire: false } }), false);
  assert.equal(isCompletePOSSettings({ ...base, modes: [{ ...mode('a'), device_ids: undefined }] }), false);
  assert.equal(isCompletePOSSettings({ ...base, modes: [{ ...mode('a'), check_behavior: { collapse_sent: false } }] }), false);
  assert.equal(isCompletePOSSettings({ ...base, check_behavior: null, modes: [{ ...mode('a'), check_behavior: null }] }), true);
  assert.deepEqual(inherited, base);
});

test('shared-mode confirmation preserves 576 seating, fulfillment and check-policy combinations', () => {
  let combinations = 0;
  for (const seating_mode of ['disabled', 'coversOnly', 'optionalSeats', 'requiredSeats'] as const)
    for (const prompt of ['never', 'start', 'checkout'] as const)
      for (const order_type of ['dine_in', 'pickup', 'delivery'] as const)
        for (const coursing_enabled of [false, true])
          for (const open_checks_enabled of [false, true])
            for (const send_and_stay of [false, true])
              for (const allow_hold_fire of [false, true]) {
                const check_behavior = { allow_hold_fire, collapse_sent: !allow_hold_fire, open_checks_enabled, open_checks_home: true, predefined_tickets: false };
                const original: FullServiceSettings = {
                  ...base, fulfillment: { prompt, default: 'pickup', enabled: ['pickup'], methods: [{ id: 'pickup', name: 'Custom service', order_type, show_customer_information: false }] },
                  modes: [{ ...mode('a'), seating_mode, coursing_enabled, send_and_stay, check_behavior }, mode('b')],
                };
                const next = { ...original, modes: [{ ...original.modes![0], auto_progression: true }, mode('b')] };
                const actual = { ...next, modes: [next.modes[0], { ...mode('b'), name: 'Concurrent rename' }] };
                const context = JSON.stringify({ seating_mode, prompt, order_type, coursing_enabled, open_checks_enabled, send_and_stay, allow_hold_fire });
                assert.equal(posSettingsSaveConfirmed(original, next, actual), true, context);
                assert.equal(posSettingsSaveConfirmed(original, next, { ...actual, modes: [{ ...actual.modes[0], auto_progression: false }, actual.modes[1]] }), false, context);
                assert.deepEqual(original.modes![0].check_behavior, check_behavior, context);
                assert.equal(original.fulfillment!.methods![0].order_type, order_type, context);
                combinations++;
              }
  assert.equal(combinations, 576);
});
