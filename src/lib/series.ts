'use client';

import { useEffect, useState } from 'react';
import { fetchOrderSeries, type AnalyticsWindow, type FulfillmentSeries } from '@/lib/api';
import type { DateRange } from '@/components/DateRangePicker';
import { isoDate } from '@/lib/weeks';

type SeriesState = { restaurantId: number; series: FulfillmentSeries[]; status: 'loading' | 'ready' | 'error' };

/** Refreshes lots so the operational selection advances when the last day ends. */
export function useOrderSeries(restaurantId: number): SeriesState & { reload: () => void } {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<SeriesState>({ restaurantId, series: [], status: 'loading' });
  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    let pending = false;
    const refresh = () => {
      if (pending || document.visibilityState === 'hidden') return;
      pending = true;
      fetchOrderSeries(restaurantId)
        .then((series) => {
          if (active) setState({ restaurantId, series, status: 'ready' });
        })
        .catch(() => {
          if (active) setState(previous => ({
            restaurantId, series: previous.restaurantId === restaurantId ? previous.series : [], status: 'error',
          }));
        })
        .finally(() => { pending = false; });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [restaurantId, revision]);
  const current: SeriesState = state.restaurantId === restaurantId ? state : { restaurantId, series: [], status: 'loading' };
  return { ...current, reload: () => setRevision(revision => revision + 1) };
}

/** Resolves the exact civil window of a lot or one of its service days. */
export function rangeForSeries(series: FulfillmentSeries, day?: string): DateRange {
  const days = [...series.days.map(entry => entry.date), ...(series.committed_days ?? [])].sort();
  const first = day ?? days[0];
  const last = day ?? days[days.length - 1];
  return {
    from: new Date(first + 'T00:00:00'),
    to: new Date(last + 'T00:00:00'),
    seriesKey: series.key,
    serviceDay: day,
  };
}

/** Builds an HTTP date scope, keeping identity in addition to visible dates. */
export function dateRangeScope(range: DateRange): AnalyticsWindow {
  return { from: isoDate(range.from), to: isoDate(range.to), seriesKey: range.seriesKey };
}

/** Finds a comparable complete lot preceding the selected whole lot. */
export function previousSeriesWindow(series: FulfillmentSeries[], range: DateRange, today: string): AnalyticsWindow | undefined {
  if (!range.seriesKey || range.serviceDay || isoDate(range.to) >= today) return undefined;
  const key = range.seriesKey;
  const previous = series.find(lot => lot.key < key && isoDate(rangeForSeries(lot).to) < isoDate(range.from));
  return previous ? dateRangeScope(rangeForSeries(previous)) : undefined;
}
