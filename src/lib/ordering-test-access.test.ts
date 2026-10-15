import assert from 'node:assert/strict';
import test from 'node:test';
import { localTestDeadline, orderingTestDraft, orderingTestDraftWithCurrentIP, orderingTestPayload } from './ordering-test-access';
import { requiredPermissionsForPath } from './route-permissions';

test('test access has a bounded mandatory deadline, and disabling clears the policy', () => {
  const now = Date.now(), until = localTestDeadline(new Date(now + 3600000).toISOString());
  const draft = { enabled: true, ips: '203.0.113.10\n2001:db8::1, 203.0.113.10', until };
  assert.deepEqual(orderingTestPayload(draft, now).allowed_ips, ['203.0.113.10', '2001:db8::1']);
  assert.deepEqual(orderingTestPayload({ ...draft, enabled: false, until: '' }), { enabled: false, allowed_ips: [], expires_at: null });
  for (const value of ['', localTestDeadline(new Date(now - 3600000).toISOString()), localTestDeadline(new Date(now + 8 * 86400000).toISOString())]) assert.throws(() => orderingTestPayload({ ...draft, until: value }, now), /orderingTestAccessExpiryError/);
  assert.throws(() => orderingTestPayload({ ...draft, ips: '203.0.113.0/24' }, now), /orderingTestAccessIPsError/);
  assert.throws(() => orderingTestPayload({ ...draft, ips: '' }, now), /orderingTestAccessIPsError/);
  assert.deepEqual(orderingTestDraft(), { enabled: false, ips: '', until: '' });
  assert.deepEqual(requiredPermissionsForPath('/2/settings/orders/test-access'), ['settings.view', 'settings.edit']);
});

test('current IP activation preserves other IPs and future deadlines, renewing expired access for one hour', () => {
  const now = Date.now(), until = localTestDeadline(new Date(now + 7200000).toISOString());
  const draft = { enabled: false, ips: '203.0.113.10, 2001:db8::1', until };
  assert.deepEqual(orderingTestDraftWithCurrentIP(draft, '2001:db8::1', now), { enabled: true, ips: '203.0.113.10\n2001:db8::1', until });
  for (const value of ['', localTestDeadline(new Date(now - 60000).toISOString())]) {
    const next = orderingTestDraftWithCurrentIP({ ...draft, until: value }, '203.0.113.20', now);
    assert.deepEqual(orderingTestPayload(next, now).allowed_ips, ['203.0.113.10', '2001:db8::1', '203.0.113.20']);
    assert.equal(next.until, localTestDeadline(new Date(now + 3600000).toISOString()));
  }
  const full = { ...draft, ips: Array.from({ length: 32 }, (_, i) => `203.0.113.${i + 1}`).join('\n') };
  assert.equal(orderingTestPayload(orderingTestDraftWithCurrentIP(full, '203.0.113.1', now), now).allowed_ips.length, 32);
  assert.throws(() => orderingTestPayload(orderingTestDraftWithCurrentIP(full, '203.0.113.99', now), now), /orderingTestAccessIPsError/);
});
