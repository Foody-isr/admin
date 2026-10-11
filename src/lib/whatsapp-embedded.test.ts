import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWhatsAppPhone, parseWhatsAppSignupEvent } from './whatsapp-embedded';
const payload = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '123', phone_number_id: '456' } };
test('Embedded Signup accepts only exact HTTPS Facebook origins', () => {
  for (const origin of ['https://facebook.com', 'https://www.facebook.com', 'https://business.facebook.com']) assert.deepEqual(parseWhatsAppSignupEvent(origin, payload), { kind: 'finished', identity: payload.data });
  for (const origin of ['https://notfacebook.com', 'https://facebook.com.attacker.test', 'http://facebook.com', 'https://facebook.com:8443', 'https://facebook.com/path', 'https://facebook.com@attacker.test', 'null', '']) assert.equal(parseWhatsAppSignupEvent(origin, payload), null);
});
test('Embedded Signup ignores malformed, incomplete and unrelated data', () => {
  for (const value of [null, 4, '{bad json', {}, { ...payload, type: 'OTHER' }, { ...payload, event: 'START' }, { ...payload, data: { waba_id: '', phone_number_id: '1' } }, { ...payload, data: { waba_id: 12, phone_number_id: '1' } }]) assert.equal(parseWhatsAppSignupEvent('https://facebook.com', value), null);
  assert.deepEqual(parseWhatsAppSignupEvent('https://facebook.com', JSON.stringify(payload)), { kind: 'finished', identity: payload.data });
  assert.deepEqual(parseWhatsAppSignupEvent('https://facebook.com', { type: payload.type, event: 'CANCEL' }), { kind: 'cancelled' });
  assert.deepEqual(parseWhatsAppSignupEvent('https://facebook.com', { type: payload.type, event: 'ERROR', error_message: 'ignored untrusted details' }), { kind: 'failed' });
});
test('WhatsApp numbers retain the explicit international code and reject ambiguous input', () => {
  assert.equal(normalizeWhatsAppPhone('+972 (50) 000-0000'), '+972500000000');
  assert.equal(normalizeWhatsAppPhone('+33 6 00 00 00 00'), '+33600000000');
  for (const value of ['0500000000', '972500000000', '+0001234567', '+123', '+1234567890123456', '+972<script>']) assert.equal(normalizeWhatsAppPhone(value), null);
});
