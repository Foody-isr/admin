import assert from 'node:assert/strict';
import { test } from 'node:test';
import { askSupportAssistant } from '../api';

test('public support never forwards staff credentials or tenant scope', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).endsWith('/api/v1/public/support/chat'));
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.referrerPolicy, 'no-referrer');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('Authorization'), null);
    assert.equal(headers.get('X-Restaurant-ID'), null);
    assert.equal(headers.get('Cookie'), null);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(body).sort(), ['history', 'lang', 'message', 'topic']);
    assert.deepEqual(body.history, [{ role: 'user', content: 'Menu' }, { role: 'assistant', content: 'Check groups' }]);
    return Response.json({ answer: 'Check groups', sources: [{ id: 'menu/menus-and-groups', title: 'Groups', url: '/en/help/menu/menus-and-groups', lang: 'en', updatedAt: '2026-10-18' }] });
  };
  const answer = await askSupportAssistant('Menu?', 'en', [{ role: 'user', content: 'Menu' }, { role: 'assistant', content: 'Check groups' }], 'menu', new AbortController().signal);
  assert.equal(answer.sources.length, 1);
});

test('public support rejects unsafe source links and exposes a localized quota code', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => Response.json({ answer: 'Unsafe', sources: [{ id: 'x', title: 'x', url: 'javascript:alert(1)' }] });
  await assert.rejects(askSupportAssistant('Menu?', 'en', [], 'menu', new AbortController().signal), /supportUnavailable/);
  globalThis.fetch = async () => new Response('', { status: 429 });
  await assert.rejects(askSupportAssistant('Menu?', 'en', [], 'menu', new AbortController().signal), /supportLimit/);
});
