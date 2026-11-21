import assert from 'node:assert/strict';
import test from 'node:test';
import { addressFieldObservation, type AddressFieldEvent } from './address-field-observation';

test('counts first choices and in-field recovery across repeated errors', () => {
  const events: AddressFieldEvent[] = [];
  const field = addressFieldObservation(new Date(Date.now() + 60000).toISOString(), e => events.push(e));
  field.available(false);
  field.available(false);
  field.available(true);
  field.choose();
  field.available(false);
  field.choose();
  assert.equal(field.accept(), 'later');
  field.choose();
  assert.equal(field.accept(), 'first');
  assert.equal(field.accept(true), 'manual');
  assert.deepEqual(events, ['search_blocked','search_recovered','first_choice','search_blocked','search_recovered','selection_ok','first_choice','first_choice_ok','selection_ok','manual_ok']);
});

test('disabled and expired fields never emit or attach an order outcome', () => {
  for (const until of [undefined, 'invalid', new Date(0).toISOString()]) {
    const field = addressFieldObservation(until, () => assert.fail('outside observation window'));
    field.choose(); field.available(false); assert.equal(field.accept(), undefined);
  }
});
