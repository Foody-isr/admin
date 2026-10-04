import test from 'node:test';
import assert from 'node:assert/strict';
import { chainReportCurrency, isChainReportOverview, isChainReportSummary } from './chain-report';
import type { Restaurant } from './api';

test('chain report distinguishes legitimate zero and negative revenue from incomplete totals', () => {
  const summary = { total_revenue: -20, total_orders: 0, avg_ticket: 0, items_sold: 0 };
  assert.equal(isChainReportSummary(summary), true);
  for (const value of [null, {}, { ...summary, total_orders: undefined }, { ...summary, avg_ticket: '0' }, { ...summary, total_revenue: Infinity }]) assert.equal(isChainReportSummary(value), false);
});
test('chain report only requests unique positive branch identities in the requested chain', () => {
  const overview = { chain_id: 3, branches: [{ id: 7, name: 'Demo' }] };
  assert.equal(isChainReportOverview(overview, 3), true);
  assert.equal(isChainReportOverview({ ...overview, chain_id: null }, null), true);
  assert.equal(isChainReportOverview({ chain_id: 3, branches: [] }, 3), true);
  for (const value of [null, { ...overview, chain_id: 4 }, { ...overview, branches: null }, { ...overview, branches: [...overview.branches, ...overview.branches] }, { ...overview, branches: [{ id: -1, name: 'Demo' }] }]) assert.equal(isChainReportOverview(value, 3), false);
});
test('chain currency rejects a different restaurant or malformed metadata and respects the default contract', () => {
  const restaurant = (value: object) => value as Restaurant;
  assert.equal(chainReportCurrency(restaurant({ id: 7, currency: 'eur' }), 7), 'EUR');
  assert.equal(chainReportCurrency(restaurant({ id: 7 }), 7), 'ILS');
  assert.equal(chainReportCurrency(restaurant({ id: 8, currency: 'EUR' }), 7), null);
  assert.equal(chainReportCurrency(restaurant({ id: 7, currency: 'EURO' }), 7), null);
  assert.equal(chainReportCurrency(undefined, 7), null);
});
