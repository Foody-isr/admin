import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DeliveryDuration } from '../DeliveryDuration';
import type { DeliveryRoute } from '@/lib/delivery';

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const t = (key: string) => key === 'unitHour' ? 'h' : key === 'unitMin' ? 'min' : key;
const render = (metrics: Partial<DeliveryRoute>) => renderToStaticMarkup(<DeliveryDuration route={{ est_duration_s: 3900, ...metrics } as DeliveryRoute} t={t} />);

test('unknown historic breakdowns are not displayed as zero waiting', () => {
  assert.match(render({}), /1h 5min/);
  assert.doesNotMatch(render({}), /deliveryPlanWaiting/);
  assert.match(render({ est_travel_s: 3720, est_waiting_s: 0, est_service_s: 180 }), /deliveryPlanWaiting.*0 min/);
});

test('invalidated metrics hide the total and every duration component', () => {
  const markup = render({ needs_recalculation: true, est_travel_s: 180, est_waiting_s: 3540, est_service_s: 180 });
  assert.doesNotMatch(markup, /1h 5min|59 min|deliveryPlanWaiting/);
  assert.match(markup, /—/);
});
