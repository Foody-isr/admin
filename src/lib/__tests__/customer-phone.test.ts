import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeCustomerPhone, validateCustomerPhones } from '../customer-phone';

test('normalizes valid international and Israeli contacts without losing significant zeros', () => {
  for (const [input, expected] of [
    ['050-234-5678', '+972502345678'], ['50 234 5678', '+972502345678'],
    ['972502345678', '+972502345678'], ['00972 50 234 5678', '+972502345678'],
    ['+33 (0)6 12 34 56 78', '+33612345678'], ['+1 202 555 0123', '+12025550123'],
    ['\u202a+33\u00a06\u00a012\u00a034\u00a056\u00a078\u202c', '+33612345678'],
    ['\u2066+1\u202f202\u200b555\u20600123\u2069', '+12025550123'],
    ['\ufeff\u061c050\u200e-234-5678\u200f', '+972502345678'],
    ['+39 02 3661 8300', '+390236618300'], ['03-123-4567', '+97231234567'],
  ]) assert.equal(normalizeCustomerPhone(input), expected);
  assert.equal(normalizeCustomerPhone('06 12 34 56 78', '+33'), '+33612345678');
});

test('rejects incomplete numbers, invalid numbering plans, extensions and embedded text', () => {
  for (const input of ['', '050', '1234567890', '0501234567', '+999123456789',
    '++972502345678', 'call 0502345678', '0502345678 ext 1',
    '0502345678/0522345678', '+97250234abc5678', '\u202acall +33612345678\u202c', '\u200b\u202a\u202c']) {
    assert.equal(normalizeCustomerPhone(input), null, input);
  }
});

test('clipboard formatting does not make a valid profile invalid or hide duplicate contacts', () => {
  const pasted = '\u202a+33\u00a06\u00a012\u00a034\u00a056\u00a078\u202c';
  const result = validateCustomerPhones([{ phone: pasted }, { phone: '+33612345678' }]);
  assert.deepEqual(result.normalized, ['+33612345678', '+33612345678']);
  assert.deepEqual(result.issues, [null, 'customerPhoneDuplicateHelp']);
});

test('identifies required, invalid and normalized duplicate contacts in display order', () => {
  const result = validateCustomerPhones(['', '  ', '+9725012', '050-234-5678', '+972502345678'].map(phone => ({ phone })));
  assert.deepEqual(result.issues, ['customerPrimaryPhoneRequired', 'customerAdditionalPhoneRequired', 'customerPhoneInvalidHelp', null, 'customerPhoneDuplicateHelp']);
  assert.equal(result.firstIssue, 0);
  assert.equal(result.normalized[3], result.normalized[4]);
  const corrected = validateCustomerPhones([{ phone: '050-234-5678' }, { phone: '+33 6 12 34 56 78' }]);
  assert.deepEqual(corrected.issues, [null, null]);
  assert.equal(corrected.firstIssue, -1);
});
