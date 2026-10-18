import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCustomerWindowMinutes } from '../CustomerWindowField';

test('customer duration accepts hours and minutes with bounded validation', () => {
  for (const value of ['1:30', '1h30', '90']) assert.equal(parseCustomerWindowMinutes(value), 90);
  assert.equal(parseCustomerWindowMinutes('12h'), 720);
  for (const value of ['', '0', '-1', '1:60', '90.5', '721', '13h']) assert.equal(parseCustomerWindowMinutes(value), null);
});
