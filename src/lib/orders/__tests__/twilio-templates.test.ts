import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderTwilioTemplate } from '../twilio-templates';

for (const locale of ['fr', 'he', 'en'] as const) test(`order templates preserve the server variable contracts in ${locale}`, () => {
  for (const [kind, count] of [['order_recap', 8], ['delivery_reminder', 4]] as const) {
    const text = orderTwilioTemplate(kind, locale);
    const variables = Array.from(new Set(Array.from(text.matchAll(/\{\{(\d+)\}\}/g), match => Number(match[1])))).sort((a, b) => a - b);
    assert.deepEqual(variables, Array.from({ length: count }, (_, i) => i + 1));
    assert.ok(!/^\{\{/.test(text) && !/\}\}$/.test(text));
    if (kind === 'order_recap') assert.ok(!text.includes('demain'));
  }
});

test('French delivery template uses the requested four-variable wording', () => {
  const text = orderTwilioTemplate('delivery_reminder', 'fr');
  assert.ok(text.startsWith('Boker tov {{1}} 🧡'));
  assert.ok(text.includes('livraison de demain, prévue entre {{2}}'));
  assert.ok(text.includes('le livreur ({{3}})'));
  assert.ok(text.endsWith('choisi {{4}} pour votre Shabbat ✨'));
});
