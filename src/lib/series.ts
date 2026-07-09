'use client';

import { useEffect, useState } from 'react';
import { fetchOrderSeries, type OrderSerie } from '@/lib/api';

/** A contiguous série selection by fulfillment date (ISO YYYY-MM-DD, from <= to).
 *  from === to is a single série. Dates compare correctly as strings (ISO). */
export interface SerieRange {
  from: string;
  to: string;
}

export type SeriePreset = 'last' | 'last3' | 'month' | 'all';

/** Loads a restaurant's séries (newest first) once per restaurant. */
export function useOrderSeries(restaurantId: number): OrderSerie[] {
  const [series, setSeries] = useState<OrderSerie[]>([]);
  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    fetchOrderSeries(restaurantId)
      .then((list) => {
        if (active) setSeries(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [restaurantId]);
  return series;
}

/** Resolves a preset to a série range against the série list (newest first).
 *  Null when there are no séries. */
export function presetRange(series: OrderSerie[], preset: SeriePreset, today: Date): SerieRange | null {
  if (series.length === 0) return null;
  const newest = series[0].date;
  switch (preset) {
    case 'last':
      return { from: newest, to: newest };
    case 'last3':
      return { from: series[Math.min(2, series.length - 1)].date, to: newest };
    case 'all':
      return { from: series[series.length - 1].date, to: newest };
    case 'month': {
      const y = today.getFullYear();
      const m = today.getMonth();
      const inMonth = series.filter((s) => {
        const d = new Date(`${s.date}T00:00:00`);
        return d.getFullYear() === y && d.getMonth() === m;
      });
      if (inMonth.length === 0) return { from: newest, to: newest };
      // inMonth stays newest-first.
      return { from: inMonth[inMonth.length - 1].date, to: inMonth[0].date };
    }
  }
}

/** The séries (newest first) a range covers, inclusive. */
export function seriesInRange(series: OrderSerie[], sel: SerieRange): OrderSerie[] {
  return series.filter((s) => s.date >= sel.from && s.date <= sel.to);
}

/** The previous equal-count block of séries immediately before the selection,
 *  as a range. Null when there aren't enough earlier séries to compare against. */
export function previousBlock(series: OrderSerie[], sel: SerieRange): SerieRange | null {
  const dates = series.map((s) => s.date);
  const startI = dates.indexOf(sel.to); // newest selected -> smallest index
  const endI = dates.indexOf(sel.from); // oldest selected -> largest index
  if (startI < 0 || endI < 0) return null;
  const n = endI - startI + 1;
  const prevNewest = endI + 1; // first série older than the selection
  if (prevNewest >= series.length) return null;
  const prevOldest = Math.min(endI + n, series.length - 1);
  return { from: series[prevOldest].date, to: series[prevNewest].date };
}
