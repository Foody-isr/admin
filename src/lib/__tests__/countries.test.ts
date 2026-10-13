import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNTRY_CODES, countryOptions } from '../countries';

test('country choices contain current countries and localize independently of currency', () => {
  assert.equal(COUNTRY_CODES.length, 249);
  assert.equal(new Set(COUNTRY_CODES).size, 249);
  for (const invalid of ['EU', 'ZZ', 'BU', 'SU']) assert.ok(!COUNTRY_CODES.includes(invalid));
  assert.equal(countryOptions('fr').find(country => country.code === 'FR')?.name, 'France');
  assert.equal(countryOptions('en').find(country => country.code === 'IL')?.name, 'Israel');
  assert.equal(countryOptions('he').find(country => country.code === 'FR')?.name, 'צרפת');
});
