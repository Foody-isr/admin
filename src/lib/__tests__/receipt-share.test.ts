import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWhatsAppUrl } from '@/lib/receipt-share';

test('manual order messages accept international numbers with + or 00 prefixes', () => {
  for (const phone of ['+33 6 12 34 56 78', '0033 6 12 34 56 78', '33 6 12 34 56 78']) {
    const url = new URL(buildWhatsAppUrl(phone, 'Bonjour & merci'));
    assert.equal(url.origin, 'https://wa.me');
    assert.equal(url.pathname, '/33612345678');
    assert.equal(url.searchParams.get('text'), 'Bonjour & merci');
  }
});

test('normalization preserves zeros within an international phone number', () => {
  assert.equal(
    new URL(buildWhatsAppUrl('00 972 (50) 100-2000', '')).pathname,
    '/972501002000',
  );
});

test('manual messages preserve accents, Hebrew, line breaks and receipt link parameters', () => {
  const message = 'Reçu de démonstration\nשלום\nhttps://example.test/receipt/demo?lang=fr&view=full';
  const url = new URL(buildWhatsAppUrl('+972 50 123 4567', message));
  assert.equal(url.pathname, '/972501234567');
  assert.equal(url.searchParams.get('text'), message);
});

test('missing numbers and an international prefix alone do not create a WhatsApp link', () => {
  for (const phone of [undefined, '', '  ', '+', '00', '00 () -']) {
    assert.equal(buildWhatsAppUrl(phone, 'Test'), '');
  }
});
