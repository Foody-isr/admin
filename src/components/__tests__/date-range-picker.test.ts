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
