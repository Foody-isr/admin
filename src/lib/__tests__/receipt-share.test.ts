import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWhatsAppUrl } from '@/lib/receipt-share';

test('WhatsApp handoff bypasses the short-link redirect that corrupts emoji', () => {
  const message = '*Restaurant démo*\nCommande #42 confirmée ✅\n📅 Vendredi · 📍 תל אביב\n🚚 👩🏽‍🍳 ❤️ 😊\n50% + frais & reçu : https://example.test/receipt?a=1&b=2';
  const url = new URL(buildWhatsAppUrl('+972 (50) 000-0000', message));
  assert.equal(url.origin, 'https://api.whatsapp.com');
  assert.equal(url.pathname, '/send');
  assert.equal(url.searchParams.get('phone'), '972500000000');
  assert.equal(url.searchParams.get('text'), message);
  assert.deepEqual(Array.from(url.searchParams.keys()), ['phone', 'text']);
  assert.ok(!url.searchParams.get('text')!.includes('\uFFFD'));
});

test('WhatsApp handoff encodes literal percent escapes only once and keeps empty messages', () => {
  for (const message of ['', 'Texte littéral %F0%9F%98%8A + & # ? =\r\nשלום']) {
    const url = new URL(buildWhatsAppUrl('+33 6 00 00 00 00', message));
    assert.equal(url.searchParams.get('phone'), '33600000000');
    assert.equal(url.searchParams.get('text'), message);
  }
});

test('WhatsApp handoff stays unavailable without a usable phone', () => {
  for (const phone of [undefined, '', ' +()- ', 'no number']) {
    assert.equal(buildWhatsAppUrl(phone, 'Bonjour ✅'), '');
  }
});
