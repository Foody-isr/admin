import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustmentMinor } from './payment-adjustments';

test('refund input uses exact positive agorot, including French decimals', () => {
  for (const [text, minor] of [['1',100],['12.3',1230],['12,34',1234],['0.01',1],[' 85.20 ',8520]] as const) assert.equal(adjustmentMinor(text),minor);
  for (const text of ['', '0', '-1', '1.001', '1e2', 'NaN', 'Infinity', '12,34.5', '.5','1234567890','1 000']) assert.equal(adjustmentMinor(text),null,text);
});
