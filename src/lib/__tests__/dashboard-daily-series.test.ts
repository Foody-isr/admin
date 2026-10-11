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

test('home volume requests explicit days and restaurant without inheriting performance filters', async (t) => {
  const { getDayComparison } = await import('@/lib/api');
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    requests.push(String(input));
    return new Response(JSON.stringify({ current: {}, previous: {}, hourly: [] }), { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  await getDayComparison(42, '2026-10-06', '2026-09-29');
  const url = new URL(requests[0]);
  assert.equal(url.pathname, '/api/v1/analytics/comparison');
  assert.deepEqual(Object.fromEntries(url.searchParams), { restaurant_id: '42', date: '2026-10-06', compare: '2026-09-29' });
});
