import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supportTopicForPath, boundedSupportHistory } from './context';

test('help context exposes a topic, never a restaurant or record identifier', () => {
  assert.equal(supportTopicForPath('/387/website-v3/private-page'), 'website-qr');
  assert.equal(supportTopicForPath('/999/orders/123'), 'orders');
  assert.equal(supportTopicForPath('/999/kitchen/stock'), 'kitchen');
  assert.equal(supportTopicForPath('/999/unrecognized/customer-name'), '');
});

test('long Hebrew conversations drop oldest pairs instead of exceeding the transport limit', () => {
  const turns = Array.from({ length: 8 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', content: 'ש'.repeat(i % 2 ? 6000 : 1500) }));
  const bounded = boundedSupportHistory(turns);
  assert.equal(bounded.length % 2, 0);
  assert.ok(new TextEncoder().encode(JSON.stringify(bounded)).length <= 24000);
  assert.equal(bounded[0].role, 'user');
});
