import { test } from 'node:test';
import assert from 'node:assert/strict';
import { internalOrderPayment } from '../internal-order-payment';

test('an unselected payment action never implies money was received', () => {
  assert.equal(internalOrderPayment(null, 'cash', true), null);
  assert.deepEqual(internalOrderPayment('record', 'cash', false), { paymentMethod: 'cash', paymentCollected: false });
  assert.deepEqual(internalOrderPayment('record', 'card', true), { paymentMethod: 'card', paymentCollected: true });
});
test('later and hosted payments remain unpaid even after a previous receipt confirmation', () => {
  assert.deepEqual(internalOrderPayment('later', 'card', true), { paymentMethod: 'card', paymentCollected: false });
  assert.deepEqual(internalOrderPayment('link', 'cash', true), { paymentMethod: 'link', paymentCollected: false });
  assert.deepEqual(internalOrderPayment('charge_card', 'card', true), { paymentMethod: 'sumit_card', paymentCollected: false });
});
