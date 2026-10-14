import test from 'node:test';
import assert from 'node:assert/strict';
import { CoexistenceAttempt, coexistenceCode, parseCoexistenceEvent } from './whatsapp-coexistence';

const event = { type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING', data: { waba_id: '123' } };
test('coexistence accepts official completion without a phone ID and rejects spoofed origins or generic FINISH', () => {
  assert.deepEqual(parseCoexistenceEvent('https://www.facebook.com', event), { kind: 'finished', identity: event.data });
  assert.deepEqual(parseCoexistenceEvent('https://web.facebook.com', JSON.stringify(event)), { kind: 'finished', identity: event.data });
  for (const origin of ['https://evil.facebook.com', 'https://facebook.com.evil.test', 'https://www.facebook.com:8443', 'https://facebook.com/path', 'null']) assert.equal(parseCoexistenceEvent(origin, event), null);
  for (const value of [null, 'bad', { ...event, event: 'FINISH' }, { ...event, data: { waba_id: '../secret' } }, { ...event, data: { waba_id: '123', phone_number_id: 456 } }]) assert.equal(parseCoexistenceEvent('https://www.facebook.com', value), null);
});
test('SDK authorization accepts a bounded code and never a browser token', () => {
  assert.equal(coexistenceCode({ authResponse: { code: 'once' } }), 'once');
  for (const value of [null, {}, { authResponse: { accessToken: 'secret' } }, { authResponse: { code: '' } }, { authResponse: { code: 'x'.repeat(8193) } }]) assert.equal(coexistenceCode(value), null);
});
test('authorization is consumed once without waiting for session identity', () => {
  for (const order of ['code-first', 'identity-first']) {
    const attempt = new CoexistenceAttempt('session');
    if (order === 'code-first') attempt.acceptCode('once'); else attempt.acceptIdentity({ waba_id: '123' });
    if (order === 'identity-first') {
      assert.equal(attempt.take(), null);
      attempt.acceptCode('once');
    }
    assert.deepEqual(attempt.take(), { state: 'session', code: 'once', ...(order === 'identity-first' ? { waba_id: '123' } : {}) });
    attempt.acceptCode('late'); attempt.acceptIdentity({ waba_id: '456' }); assert.equal(attempt.take(), null);
  }
});
test('a missing session message still produces a code-only server verification request', () => {
  const attempt = new CoexistenceAttempt('session');
  attempt.acceptCode('once');
  assert.deepEqual(attempt.take(), { state: 'session', code: 'once' });
  attempt.acceptIdentity({ waba_id: '123' });
  assert.equal(attempt.take(), null);
});
test('cancellation isolates stale callbacks from a new restaurant attempt', () => {
  const old = new CoexistenceAttempt('old'); old.acceptCode('secret'); old.cancel();
  const next = new CoexistenceAttempt('new');
  old.acceptIdentity({ waba_id: '123' }); assert.equal(old.take(), null); assert.equal(next.take(), null);
});
