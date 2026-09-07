import assert from 'node:assert/strict';
import test from 'node:test';

import { getDailySeries } from '@/lib/api';

test('série dashboard requests filter fulfillment dates while charting creation days', async (t) => {
  const originalFetch = globalThis.fetch;
  let requestedURL = '';
  globalThis.fetch = async (input) => {
    requestedURL = String(input);
    return new Response(JSON.stringify({ days: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await getDailySeries(
    42,
    1,
    '2026-09-11',
    'serie',
    { from: '2026-09-11', to: '2026-09-11' },
  );

  const url = new URL(requestedURL);
  assert.equal(url.pathname, '/api/v1/analytics/daily');
  assert.equal(url.searchParams.get('basis'), 'serie');
  assert.equal(url.searchParams.get('from'), '2026-09-11');
  assert.equal(url.searchParams.get('to'), '2026-09-11');
});
