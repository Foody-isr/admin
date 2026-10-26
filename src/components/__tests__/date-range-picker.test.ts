import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_DATE_PRESET_KEYS,
  normalizeDatePresetKeys,
  preferredSerieDate,
} from '@/components/DateRangePicker';

test('series selection prefers today over a newer future series', () => {
  const selected = preferredSerieDate(
    [{ date: '2026-09-11' }, { date: '2026-09-04' }, { date: '2026-08-28' }],
    new Date('2026-09-04T12:00:00'),
  );

  assert.equal(selected, '2026-09-04');
});

test('series selection falls back to the newest available series', () => {
  const selected = preferredSerieDate(
    [{ date: '2026-09-11' }, { date: '2026-09-04' }],
    new Date('2026-09-06T12:00:00'),
  );

  assert.equal(selected, '2026-09-11');
});

test('empty current batch wins over old orders and later preorders', () => {
  assert.equal(preferredSerieDate([
    { date: '2026-11-06' }, { date: '2026-10-30', is_current: true }, { date: '2026-10-23' },
  ], new Date('2026-10-25T12:00:00')), '2026-10-30');
});

test('restaurant current batch takes precedence over browser-local today', () => {
  assert.equal(preferredSerieDate([
    { date: '2026-10-30', is_current: true }, { date: '2026-10-23' },
  ], new Date('2026-10-23T23:30:00')), '2026-10-30');
});

test('date shortcut preferences keep canonical order and discard unknown values', () => {
  assert.deepEqual(
    normalizeDatePresetKeys(['drThisMonth', 'not-a-preset', 'series']),
    ['series', 'drThisMonth'],
  );
});

test('date shortcut preferences support a series-and-month-only menu', () => {
  assert.deepEqual(
    normalizeDatePresetKeys(['series', 'drThisMonth']),
    ['series', 'drThisMonth'],
  );
});

test('date shortcut preferences preserve the complete menu by default', () => {
  assert.deepEqual(normalizeDatePresetKeys(undefined), DEFAULT_DATE_PRESET_KEYS);
  assert.deepEqual(normalizeDatePresetKeys([]), DEFAULT_DATE_PRESET_KEYS);
});
