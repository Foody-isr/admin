import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderTwilioTemplate } from '../twilio-templates';

for (const locale of ['fr', 'he', 'en'] as const) test(`order templates preserve the server variable contracts in ${locale}`, () => {
  for (const [kind, count] of [['order_recap', 8], ['delivery_reminder', 5]] as const) {
    const text = orderTwilioTemplate(kind, locale);
    const variables = Array.from(new Set(Array.from(text.matchAll(/\{\{(\d+)\}\}/g), match => Number(match[1])))).sort((a, b) => a - b);
    assert.deepEqual(variables, Array.from({ length: count }, (_, i) => i + 1));
    assert.ok(!/^\{\{/.test(text) && !/\}\}$/.test(text));
    assert.ok(!text.includes('demain'), 'delivery date must come from the order rather than a hardcoded tomorrow');
  }
});
