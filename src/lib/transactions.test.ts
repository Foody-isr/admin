import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeTransactionHistory } from './transactions';

function history() {
  return { transactions: [{ id: 'provider:1', kind: 'sale' as const, status: 'completed', method: 'credit_card', source: 'online', payment_rail: 'stancer',
    amount_minor: 1099, currency: 'EUR', occurred_at: '2026-11-04T10:00:00Z', allocations: [], items: [], allocation_details_unavailable: true }],
  total: 1, limit: 30, offset: 0, totals_by_currency: { EUR: 1099 }, recorded_returns_by_currency: { EUR: 100 } };
}

test('keeps provider, exact cents, unavailable links and returns separate', () => {
  const result = decodeTransactionHistory(history());
  assert.equal(result.transactions[0].payment_rail, 'stancer');
  assert.equal(result.transactions[0].allocation_details_unavailable, true);
  assert.equal(result.totals_by_currency.EUR, 1099);
  assert.equal(result.recorded_returns_by_currency.EUR, 100);
});

test('rejects malformed money, dates and totals instead of displaying zero', () => {
  for (const amount of [NaN, 12.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
    const value = history(); value.transactions[0].amount_minor = amount;
    assert.throws(() => decodeTransactionHistory(value));
  }
  const value = history(); value.transactions[0].occurred_at = 'unknown';
  assert.throws(() => decodeTransactionHistory(value));
  const totals = history(); totals.totals_by_currency.EUR = 0.1;
  assert.throws(() => decodeTransactionHistory(totals));
});
