import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeliveryEtaMessage, deliveryEtaWindow } from '@/lib/delivery-planning';

test('deliveryEtaWindow anchors cumulative ETA to the planned departure', () => {
  const window = deliveryEtaWindow(
    { planned_departure_at: '2026-08-27T18:00:00.000Z' },
    { eta_seconds: 3600 },
    'en',
  );
  assert.ok(window);
  assert.equal(window.startAt.toISOString(), '2026-08-27T18:55:00.000Z');
  assert.equal(window.endAt.toISOString(), '2026-08-27T19:10:00.000Z');
});

test('deliveryEtaWindow prefers the actual start and rejects missing anchors', () => {
  const active = deliveryEtaWindow(
    {
      planned_departure_at: '2026-08-27T18:00:00.000Z',
      started_at: '2026-08-27T18:20:00.000Z',
    },
    { eta_seconds: 600 },
    'fr',
  );
  assert.ok(active);
  assert.equal(active.startAt.toISOString(), '2026-08-27T18:25:00.000Z');
  assert.equal(deliveryEtaWindow({}, { eta_seconds: 600 }, 'fr'), null);
});

test('buildDeliveryEtaMessage fills customer, order and ETA window', () => {
  const window = deliveryEtaWindow(
    { planned_departure_at: '2026-08-27T18:00:00.000Z' },
    { eta_seconds: 600 },
    'en',
  );
  const message = buildDeliveryEtaMessage(
    'Hi {name}, order #{order}: {start}–{end}',
    { customer_name: 'Naomi', order_id: 1583 },
    window,
  );
  assert.match(message, /^Hi Naomi, order #1583: /);
  assert.doesNotMatch(message, /\{(?:name|order|start|end)\}/);
});
