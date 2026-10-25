import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeCustomerPhone } from '../customer-phone';

test('normalizes valid international and Israeli contacts without losing significant zeros', () => {
  for (const [input, expected] of [
    ['050-234-5678', '+972502345678'], ['50 234 5678', '+972502345678'],
    ['972502345678', '+972502345678'], ['00972 50 234 5678', '+972502345678'],
    ['+33 (0)6 12 34 56 78', '+33612345678'], ['+1 202 555 0123', '+12025550123'],
    ['+39 02 3661 8300', '+390236618300'], ['03-123-4567', '+97231234567'],
  ]) assert.equal(normalizeCustomerPhone(input), expected);
  assert.equal(normalizeCustomerPhone('06 12 34 56 78', '+33'), '+33612345678');
});

test('rejects incomplete numbers, invalid numbering plans, extensions and embedded text', () => {
  for (const input of ['', '050', '1234567890', '0501234567', '+999123456789',
    '++972502345678', 'call 0502345678', '0502345678 ext 1',
    '0502345678/0522345678', '+97250234abc5678']) {
    assert.equal(normalizeCustomerPhone(input), null, input);
  }
});
