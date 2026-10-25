import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supportTopicForPath, boundedSupportHistory } from './context';

test('help context exposes a topic, never a restaurant or record identifier', () => {
  assert.equal(supportTopicForPath('/387/website-v3/private-page'), 'website-qr');
  assert.equal(supportTopicForPath('/999/orders/123'), 'orders');
  assert.equal(supportTopicForPath('/999/kitchen/stock'), 'kitchen');
  assert.equal(supportTopicForPath('/999/unrecognized/customer-name'), '');
  assert.equal(supportTopicForPath('/999/catering/quotes/private-token'), 'catering');
  assert.equal(supportTopicForPath('/999/clients/123'), 'customers');
  assert.equal(supportTopicForPath('/999/billing'), 'account');
  assert.equal(supportTopicForPath('/999/settings/delivery/maps'), 'delivery');
  assert.equal(supportTopicForPath('/999/settings/delivery'), 'delivery');
  assert.equal(supportTopicForPath('/999/delivery/tours/private-token'), 'delivery');
  assert.equal(supportTopicForPath('/999/settings/security'), 'settings');
});

test('long Hebrew conversations drop oldest pairs instead of exceeding the transport limit', () => {
  const turns = Array.from({ length: 8 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: 'ש'.repeat(i % 2 ? 6000 : 1500) }));
  const bounded = boundedSupportHistory(turns);
  assert.equal(bounded.length % 2, 0);
  assert.ok(new TextEncoder().encode(JSON.stringify(bounded)).length <= 24000);
  assert.equal(bounded[0].role, 'user');
});


test('promotion selects canonical public guides while dev can use its reviewed preview', async () => {
  const { runtimeHelpBase } = await import('./registry');
  assert.equal(runtimeHelpBase('admin.foody-pos.co.il', 'https://reviewed-preview.example'), 'https://foody-pos.co.il');
  assert.equal(runtimeHelpBase('dev-admin.foody-pos.co.il', 'https://reviewed-preview.example/'), 'https://reviewed-preview.example');
});
