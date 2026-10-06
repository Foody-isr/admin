import assert from 'node:assert/strict';
import test from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import HourlyChart from '@/app/[restaurantId]/dashboard/HourlyChart';

Object.assign(globalThis, { React });
const base = { ariaLabel: 'Order volume', emptyLabel: 'No activity' };

test('a zero current period still renders a nonzero comparison rather than an empty chart', () => {
  const html = renderToStaticMarkup(React.createElement(HourlyChart, {
    ...base, data: [{ label: '12:00', current: 0, previous: 12 }],
  }));
  assert.ok(!html.includes('No activity'));
  assert.ok(html.includes('12:00: 0 / 12'));
  assert.ok(html.includes('height:100%'));
});

test('empty activity retains its time axis and never draws positive bars', () => {
  const html = renderToStaticMarkup(React.createElement(HourlyChart, {
    ...base, data: [{ label: '11:00', current: 0, previous: 0 }, { label: '19:00', current: 0, previous: 0 }],
  }));
  assert.ok(html.includes('No activity'));
  assert.ok(html.includes('11:00') && html.includes('19:00'));
  assert.ok(!html.includes('dashboard-chart-bar"'));
});

test('unavailable data is explicitly represented instead of showing stale totals', () => {
  const html = renderToStaticMarkup(React.createElement(HourlyChart, {
    ...base, emptyLabel: 'Unable to load', unavailable: true, data: [{ label: '12:00', current: 10, previous: 12 }],
  }));
  assert.ok(html.includes('Unable to load'));
  assert.ok(!html.includes('12:00: 10'));
});
