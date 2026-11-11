import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeTransactionHistory } from './transactions';
import { ashraitReceiptFields, decodeAshraitCardReceipt } from './ashrait-card-receipt';

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

test('renders only the selected masked Ashrait copy with exact identifiers and zero values', () => {
  const reference = 'SYNTHETIC_RECEIPT_UID';
  const raw = {
    transaction: { uid: reference, transId: 'SYNTHETIC_TRANS' },
    customer: {
      pan: '**** 0000',
      currency: '376',
      transactionAmount: '0',
      isSignatureRequired: 'false',
      emvApplicationIdentifier: 'A0000000000001',
    },
    merchant: { issuerApprovalNumber: '001' },
  };
  const receipt = decodeAshraitCardReceipt(raw, reference);
  const values = Object.fromEntries(ashraitReceiptFields(receipt, 'customer', 'fr')
    .map(({ key, value }) => [key, value]));
  assert.equal(values.pan, '**** 0000');
  assert.equal(values.transactionAmount, '0.00 ILS');
  assert.equal(values.isSignatureRequired, 'false');
  assert.equal(values.emvApplicationIdentifier, 'A0000000000001');
  assert.equal(values.transId, 'SYNTHETIC_TRANS');
  assert.equal(values.issuerApprovalNumber, undefined);
  assert.throws(() => decodeAshraitCardReceipt(raw, 'SYNTHETIC_OTHER_UID'));
  assert.throws(() => decodeAshraitCardReceipt({
    ...raw,
    customer: { ...raw.customer, pan: '1234567890123456' },
  }, reference));
  assert.throws(() => decodeAshraitCardReceipt({
    ...raw,
    customer: { ...raw.customer, cvv: '000' },
  }, reference));
});
