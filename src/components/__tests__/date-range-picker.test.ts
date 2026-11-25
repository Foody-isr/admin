import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_DATE_PRESET_KEYS,
  normalizeDatePresetKeys,
} from '@/components/DateRangePicker';
import type { FulfillmentSeries } from '@/lib/api';
import { dateRangeScope, previousSeriesWindow, rangeForSeries } from '@/lib/series';
import { isoDate, restaurantCalendarDay } from '@/lib/weeks';

function series(key: string, days: string[], committed: string[] = []): FulfillmentSeries {
  return {
    key, timezone: 'Asia/Jerusalem', revision: 1, is_current: false,
    days: days.map(date => ({ date, day_name: '' })), committed_days: committed,
  };
}

test('a whole series preserves its identity and includes previously promised days', () => {
  const lot = series('2026-11-26', ['2026-11-27', '2026-11-28'], ['2026-11-26']);
  assert.deepEqual(dateRangeScope(rangeForSeries(lot)), {
    from: '2026-11-26', to: '2026-11-28', seriesKey: '2026-11-26',
  });
  assert.deepEqual(dateRangeScope(rangeForSeries(lot, '2026-11-28')), {
    from: '2026-11-28', to: '2026-11-28', seriesKey: '2026-11-26',
  });
});

test('only completed whole series compare with a prior completed series', () => {
  const first = series('2026-10-22', ['2026-10-22', '2026-10-23']);
  const second = series('2026-10-29', ['2026-10-29', '2026-10-30']);
  const lots = [second, first];
  assert.deepEqual(previousSeriesWindow(lots, rangeForSeries(second), '2026-11-01'), dateRangeScope(rangeForSeries(first)));
  assert.equal(previousSeriesWindow(lots, rangeForSeries(second), '2026-10-30'), undefined);
  assert.equal(previousSeriesWindow(lots, rangeForSeries(second, '2026-10-29'), '2026-11-01'), undefined);
});

test('the restaurant calendar can be a day ahead of UTC', () => {
  const today = restaurantCalendarDay('Asia/Jerusalem', new Date('2026-11-21T22:30:00Z'));
  assert.equal(isoDate(today), '2026-11-22');
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
