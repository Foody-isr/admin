import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDeliveryEtaLabel, buildDeliveryEtaMessage, deliveryEtaWindow, deliveryRoutingError, isOpenDeliveryRoute } from '@/lib/delivery-planning';
import type { DeliveryRoute } from '@/lib/delivery';

test('completed, skipped and empty routes do not remain operational plans', () => {
  const route = (status: DeliveryRoute['status'], statuses: string[]) => ({ status, stops: statuses.map(status => ({ status })) }) as DeliveryRoute;
  assert.equal(isOpenDeliveryRoute(route('draft', [])), false);
  assert.equal(isOpenDeliveryRoute(route('draft', ['delivered', 'skipped'])), false);
  assert.equal(isOpenDeliveryRoute(route('active', ['delivered'])), false);
  assert.equal(isOpenDeliveryRoute(route('draft', ['delivered', 'pending'])), true);
  assert.equal(isOpenDeliveryRoute(route('active', ['arrived'])), true);
  assert.equal(isOpenDeliveryRoute(route('completed', ['pending'])), false);
  assert.equal(isOpenDeliveryRoute(route('cancelled', ['pending'])), false);
});

test('deliveryEtaWindow anchors cumulative ETA to the planned departure', () => {
  const window = deliveryEtaWindow(
    { planned_departure_at: '2026-08-27T18:00:00.000Z' },
    { eta_seconds: 3600 },
    'en',
  );
  assert.ok(window);
  assert.equal(window.startAt.toISOString(), '2026-08-27T18:55:00.000Z');
  assert.equal(window.endAt.toISOString(), '2026-08-27T19:10:00.000Z');
  assert.ok(window.day);
});

test('arrival estimates stay hidden until a changed route is recalculated', () => {
  assert.equal(deliveryEtaWindow(
    { planned_departure_at: '2026-08-27T18:00:00.000Z', needs_recalculation: true },
    { eta_seconds: 3600 },
    'fr',
  ), null);
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

test('buildDeliveryEtaLabel includes the localized day and time range', () => {
  const window = deliveryEtaWindow(
    { planned_departure_at: '2026-08-27T18:00:00.000Z' },
    { eta_seconds: 600 },
    'fr',
  );
  assert.ok(window);
  const label = buildDeliveryEtaLabel(
    'Arrivée prévue : {day}, entre {start} et {end}',
    window,
  );
  assert.match(label, /^Arrivée prévue : .+, entre .+ et .+$/);
  assert.doesNotMatch(label, /\{(?:day|start|end)\}/);
});

test('remaining ETA uses the recalculation reference after an active route starts', () => {
  const window = deliveryEtaWindow({ started_at: '2026-10-12T05:00:00Z', eta_reference_at: '2026-10-12T06:00:00Z' }, { eta_seconds: 600 }, 'en');
  assert.equal(window?.startAt.toISOString(), '2026-10-12T06:05:00.000Z');
});

test('routing failures have localized, bounded feedback', () => {
  assert.equal(deliveryRoutingError(new Error('location service quota exceeded'), key => key), 'deliveryRoutingQuota');
  assert.equal(deliveryRoutingError(new Error('routing service unavailable'), key => key), 'deliveryRoutingUnavailable');
  assert.equal(deliveryRoutingError(new Error('some deliveries could not be routed'), key => key), 'deliveryRoutingInfeasible');
  assert.equal(deliveryRoutingError(new Error('unknown error'), key => key), null);
});
