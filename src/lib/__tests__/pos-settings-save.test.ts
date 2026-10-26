import assert from 'node:assert/strict';
import test from 'node:test';
import type { FullServiceSettings, POSMode } from '../api';
import { posSettingsSaveConfirmed } from '../pos-settings-save';

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
