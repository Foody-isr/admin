import assert from 'node:assert/strict';
import test from 'node:test';
import { listTransactions } from './api';
import { requiredPermissionsForPath } from './route-permissions';

test('transaction history is restricted to payment readers', () => {
  assert.deepEqual(requiredPermissionsForPath('/23/transactions'), ['payments.view', 'payments.manage']);
  assert.deepEqual(requiredPermissionsForPath('/23/orders/42'), ['orders.view', 'orders.manage']);
});

test('Admin requests the same restaurant-scoped transaction history as the POS', async () => {
  const originalFetch = globalThis.fetch;
  let requested = '';
  let restaurantHeader = '';
  globalThis.fetch = async (input, init) => {
    requested = String(input);
    restaurantHeader = new Headers(init?.headers).get('X-Restaurant-ID') ?? '';
    return Response.json({ transactions: null, total: 2, totals_by_currency: { ILS: 10000 }, limit: 1, offset: 1 });
  };
  try {
    const result = await listTransactions(23, {
      from: '2026-10-01', to: '2026-10-19', q: 'fraisier',
      method: 'credit_card', source: 'online', limit: 1, offset: 1,
    });
    const url = new URL(requested);
    assert.equal(url.pathname, '/api/v1/transactions');
    assert.equal(url.searchParams.get('restaurant_id'), '23');
    assert.equal(url.searchParams.get('from'), '2026-10-01');
    assert.equal(url.searchParams.get('to'), '2026-10-19');
    assert.equal(url.searchParams.get('q'), 'fraisier');
    assert.equal(url.searchParams.get('method'), 'credit_card');
    assert.equal(url.searchParams.get('source'), 'online');
    assert.equal(url.searchParams.get('offset'), '1');
    assert.equal(restaurantHeader, '23');
    assert.deepEqual(result.transactions, []);
    assert.equal(result.totals_by_currency.ILS, 10000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
