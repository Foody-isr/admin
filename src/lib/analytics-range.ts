// Shared date-range persistence for analytics screens. A picked window is stored
// as either a re-resolvable rolling preset ("today"/"last30"…) — so it re-anchors
// to the current day on the next visit — or as literal frozen dates (custom /
// saved windows). Extracted so the dashboard and the reports overview persist and
// re-resolve ranges the same way instead of each re-implementing it.

import { addDays, getWeekStart, isoDate, type WeekStartDay } from '@/lib/weeks';
import type { DateRange } from '@/components/DateRangePicker';
import type { DateBasis } from '@/lib/api';

export type RollingPreset =
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'last90'
  | 'thisWeek'
  | 'thisMonth'
  | 'thisYear';
export type StoredSel = { preset: RollingPreset } | { from: string; to: string };

const ROLLING_PRESETS: RollingPreset[] = [
  'today',
  'yesterday',
  'last7',
  'last30',
  'last90',
  'thisWeek',
  'thisMonth',
  'thisYear',
];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameYMD(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Resolves a rolling preset to a concrete [from, to] window for "now". */
export function resolvePreset(preset: RollingPreset, wsd: WeekStartDay): DateRange {
  const today = startOfToday();
  switch (preset) {
    case 'yesterday': {
      const d = addDays(today, -1);
      return { from: d, to: d };
    }
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'last30':
      return { from: addDays(today, -29), to: today };
    case 'last90':
      return { from: addDays(today, -89), to: today };
    case 'thisWeek':
      return { from: getWeekStart(today, wsd), to: today };
    case 'thisMonth':
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
    case 'thisYear':
      return { from: new Date(today.getFullYear(), 0, 1), to: today };
    default:
      return { from: today, to: today };
  }
}

/** Classifies a picked window as a re-resolvable preset when it matches one for
 *  today, else as literal (frozen) dates. */
export function classifySelection(range: DateRange, wsd: WeekStartDay): StoredSel {
  for (const p of ROLLING_PRESETS) {
    const r = resolvePreset(p, wsd);
    if (sameYMD(r.from, range.from) && sameYMD(r.to, range.to)) return { preset: p };
  }
  return { from: isoDate(range.from), to: isoDate(range.to) };
}

export function resolveStored(sel: StoredSel, wsd: WeekStartDay): DateRange {
  if ('preset' in sel) return resolvePreset(sel.preset, wsd);
  return { from: new Date(`${sel.from}T00:00:00`), to: new Date(`${sel.to}T00:00:00`) };
}

export function readStoredSel(key: string): StoredSel | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (v && (typeof v.preset === 'string' || (typeof v.from === 'string' && typeof v.to === 'string'))) {
      return v as StoredSel;
    }
  } catch {
    /* malformed — ignore */
  }
  return null;
}

export function writeStoredSel(key: string, sel: StoredSel): void {
  try {
    localStorage.setItem(key, JSON.stringify(sel));
  } catch {
    /* quota / private mode */
  }
}

export function readStoredBasis(key: string): DateBasis {
  if (typeof window === 'undefined') return 'created';
  return localStorage.getItem(key) === 'serie' ? 'serie' : 'created';
}

export function writeStoredBasis(key: string, basis: DateBasis): void {
  try {
    localStorage.setItem(key, basis);
  } catch {
    /* quota / private mode */
  }
}

/** Inclusive day span of a range (1 = single day). */
export function daysInclusive(range: DateRange): number {
  const strip = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((strip(range.to) - strip(range.from)) / 86_400_000) + 1;
}
