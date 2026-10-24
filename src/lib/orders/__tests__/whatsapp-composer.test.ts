import assert from 'node:assert/strict';
import test from 'node:test';
import type { Order, OrderWhatsAppPreview } from '@/lib/api';
import { canSendWhatsApp, receiptWhatsAppMessage, scopeWhatsAppOrders, whatsappPhone, type WhatsAppRecipient } from '../whatsapp-composer';

test('selection keeps one message per order and rejects another restaurant', () => {
  const first = { id: 1, restaurant_id: 7 } as Order;
  const second = { id: 2, restaurant_id: 7 } as Order;
  assert.deepEqual(scopeWhatsAppOrders([first, first, { id: 1, restaurant_id: 8 } as Order, second], 7), [first, second]);
});

test('only an unblocked unclaimed preview is sendable', () => {
  const row: WhatsAppRecipient = { order: { id: 1, restaurant_id: 7 } as Order, state: 'ready', preview: { status: 'ready' } as OrderWhatsAppPreview };
  assert.equal(canSendWhatsApp(row), true);
  for (const status of ['unknown', 'accepted', 'sent', 'delivered', 'read', 'failed', 'sending'] as const) {
    assert.equal(canSendWhatsApp({ ...row, preview: { ...row.preview!, status } }), false, status);
  }
  for (const state of ['loading', 'unavailable', 'stale', 'sending'] as const) assert.equal(canSendWhatsApp({ ...row, state }), false, state);
  for (const send_blocked_reason of ['not_due', 'already_attempted'] as const) assert.equal(canSendWhatsApp({ ...row, preview: { ...row.preview!, send_blocked_reason } }), false);
});

test('app handoff normalizes supported international phones and rejects malformed values', () => {
  for (const phone of ['050-123-4567', '972501234567', '00972501234567', 'whatsapp:+972 (50) 123-4567']) assert.equal(whatsappPhone(phone), '+972501234567');
  assert.equal(whatsappPhone('+33 6 12 34 56 78'), '+33612345678');
  for (const phone of ['', '12', '+012345678', 'customer501234567', '0501234567 ext 2', '+972+501234567', undefined]) assert.equal(whatsappPhone(phone), '');
});


test('receipt introductions follow the recipient language', () => {
  const order = { id: 4, customer_name: 'Demo' } as Order;
  assert.equal(receiptWhatsAppMessage(order, 'fr', 'https://example.test'), 'Bonjour Demo, voici le reçu de votre commande n°4.\nhttps://example.test');
  assert.match(receiptWhatsAppMessage(order, 'he', 'https://example.test'), /^שלום Demo/);
  assert.match(receiptWhatsAppMessage(order, 'en', 'https://example.test'), /^Hello Demo/);
});
