import assert from 'node:assert/strict';
import test from 'node:test';

import { dashboardLiveOrderScope } from '@/lib/dashboard-live-order-scope';

test('dashboard live counts use the selected created-at window', () => {
  assert.deepEqual(
    dashboardLiveOrderScope({ from: '2026-09-16', to: '2026-09-16' }, 'created'),
    { from: '2026-09-16', to: '2026-09-16' },
  );
});

test('dashboard live counts use the selected fulfillment series', () => {
  assert.deepEqual(
    dashboardLiveOrderScope({ from: '2026-09-18', to: '2026-09-18' }, 'serie'),
    { from: '2026-09-18', to: '2026-09-18', date_field: 'serie' },
  );
});
