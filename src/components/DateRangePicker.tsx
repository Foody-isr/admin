'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SlidersHorizontalIcon,
} from 'lucide-react';
import { clampWeekStartDay, type WeekStartDay } from '@/lib/weeks';
import { useI18n } from '@/lib/i18n';
import {
  getDisplayPreferences,
  updateDisplayPreferences,
  type DateBasis,
} from '@/lib/api';
import { buttonVariants } from '@/components/ds';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DateRange {
  from: Date;
  to: Date;
}

export interface DateRangeChangeOptions {
  /** Store this as fixed dates even when it happens to match a rolling preset. */
  literal?: boolean;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange, options?: DateRangeChangeOptions) => void;
  /** First day of the week (0=Sun … 6=Sat). Drives "This/Last week" presets
   *  and the calendar-grid column order. Defaults to Sunday. */
  weekStartDay?: number;
  /** Weekday numbers (0=Sun … 6=Sat) the restaurant operates on. Cells whose
   *  day-of-week is not in this list are visually muted (still selectable).
   *  Omit to keep every cell at full opacity. */
  workdays?: number[];
  /** Enables per-member shortcut visibility preferences for this restaurant. */
  restaurantId?: number;
  /** Which edge of the trigger the dropdown aligns to. Default 'left' (opens
   *  toward the right — correct for a left-aligned filter bar). Use 'right' when
   *  the trigger sits on the right of its row (e.g. a page header) so the wide
   *  dropdown opens inward instead of overflowing the viewport. RTL-aware. */
  align?: 'left' | 'right';
  /** Optional date-field selector. When supplied, it is rendered in this same
   *  popover so callers expose one coherent date filter instead of two menus. */
  basis?: DateBasis;
  onBasisChange?: (basis: DateBasis) => void;
  /** Fulfilment dates shown when the optional "Series" calendar mode is
   *  active. Dates must be ISO YYYY-MM-DD; newest-first is preferred. */
  series?: Array<{ date: string }>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Locale-independent DD/MM/YYYY — matches the FR/HE audience (07/05 = 7 May). */
function fmt(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Prefer today's fulfillment series when it exists; otherwise keep the
 * existing newest-series fallback used for historic or future-only calendars. */
export function preferredSerieDate(
  series: Array<{ date: string }>,
  referenceDate: Date = new Date(),
): string | undefined {
  const today = isoDay(referenceDate);
  return series.find((item) => item.date === today)?.date ?? series[0]?.date;
}

function inRange(d: Date, from: Date, to: Date): boolean {
  const t = d.getTime();
  return t >= startOfDay(from).getTime() && t <= endOfDay(to).getTime();
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Calendar column for the 1st of a month, given the configured first day of the week. */
function firstColumn(year: number, month: number, weekStartDay: WeekStartDay): number {
  return (new Date(year, month, 1).getDay() - weekStartDay + 7) % 7;
}

/** i18n key for a weekday's short label (0=Sun … 6=Sat). */
const SHORT_DAY_KEYS = [
  'sundayShort', 'mondayShort', 'tuesdayShort', 'wednesdayShort',
  'thursdayShort', 'fridayShort', 'saturdayShort',
] as const;

/** Weekday numbers rotated so the configured first-of-week sits in column 0. */
function rotatedWeekdays(weekStartDay: WeekStartDay): number[] {
  const base = [0, 1, 2, 3, 4, 5, 6];
  return [...base.slice(weekStartDay), ...base.slice(0, weekStartDay)];
}

// ─── Presets ───────────────────────────────────────────────────────────────

// A selectable entry in the left rail. `id` is the preset's i18n key, used for
// active-state matching; `label` is the resolved display string.
interface Entry {
  id: DateRangePresetKey;
  label: string;
  range: DateRange;
}

export const DATE_PRESET_KEYS = [
  'series',
  'drToday',
  'drYesterday',
  'drLast7Days',
  'drLast30Days',
  'drThisWeek',
  'drLastWeek',
  'drThisMonth',
  'drLastMonth',
  'drThisYear',
  'drLastYear',
  'drAllTime',
  'custom',
] as const;

export type DatePresetKey = (typeof DATE_PRESET_KEYS)[number];
type DateRangePresetKey = Exclude<DatePresetKey, 'series' | 'custom'>;

export const DEFAULT_DATE_PRESET_KEYS: DatePresetKey[] = [...DATE_PRESET_KEYS];

/** Filters unknown server values and restores canonical shortcut ordering. */
export function normalizeDatePresetKeys(values: string[] | undefined): DatePresetKey[] {
  if (!values) return [...DEFAULT_DATE_PRESET_KEYS];
  const selected = new Set(values);
  const normalized = DATE_PRESET_KEYS.filter((key) => selected.has(key));
  return normalized.length > 0 ? normalized : [...DEFAULT_DATE_PRESET_KEYS];
}

/** Returns the id of the entry whose window equals `value`, else null. */
function matchEntry(value: DateRange, entries: Entry[]): string | null {
  for (const e of entries) {
    if (sameDay(e.range.from, value.from) && sameDay(e.range.to, value.to)) return e.id;
  }
  return null;
}

// Built-in presets, each keyed by its i18n string. Rolling windows mirror the
// dashboard's "Last 7 / 30 days" (today included) so the surfaces compare cleanly.
function builtinPresets(weekStartDay: WeekStartDay, now: Date): { key: DateRangePresetKey; range: DateRange }[] {
  const today = startOfDay(now);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const last7Start = new Date(today);
  last7Start.setDate(last7Start.getDate() - 6);

  const last30Start = new Date(today);
  last30Start.setDate(last30Start.getDate() - 29);

  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() - weekStartDay + 7) % 7));

  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(weekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);

  const yearStart = new Date(today.getFullYear(), 0, 1);

  const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31);

  // "All time": a fixed early start that predates any real data, so one click
  // spans the full history (e.g. imported past orders across several years).
  const allTimeStart = new Date(2020, 0, 1);

  return [
    { key: 'drToday', range: { from: today, to: endOfDay(now) } },
    { key: 'drYesterday', range: { from: yesterday, to: endOfDay(yesterday) } },
    { key: 'drLast7Days', range: { from: last7Start, to: endOfDay(now) } },
    { key: 'drLast30Days', range: { from: last30Start, to: endOfDay(now) } },
    { key: 'drThisWeek', range: { from: weekStart, to: endOfDay(now) } },
    { key: 'drLastWeek', range: { from: lastWeekStart, to: endOfDay(lastWeekEnd) } },
    { key: 'drThisMonth', range: { from: monthStart, to: endOfDay(now) } },
    { key: 'drLastMonth', range: { from: lastMonthStart, to: endOfDay(lastMonthEnd) } },
    { key: 'drThisYear', range: { from: yearStart, to: endOfDay(now) } },
    { key: 'drLastYear', range: { from: lastYearStart, to: endOfDay(lastYearEnd) } },
    { key: 'drAllTime', range: { from: allTimeStart, to: endOfDay(now) } },
  ];
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function DateRangePicker({
  value,
  onChange,
  weekStartDay,
  workdays,
  restaurantId,
  align = 'left',
  basis,
  onBasisChange,
  series = [],
}: DateRangePickerProps) {
  const { t, locale, direction } = useI18n();
  const wsd = clampWeekStartDay(weekStartDay);
  const weekdayCols = rotatedWeekdays(wsd);
  // `null` workdays (rather than a 7-day default) lets the picker skip the
  // muted-cell branch entirely when the caller doesn't care about workdays,
  // keeping the rendered output identical to the pre-workday version.
  const workdaySet = workdays && workdays.length > 0 ? new Set(workdays) : null;
  const [open, setOpen] = useState(false);
  const [customizingPresets, setCustomizingPresets] = useState(false);
  const [visiblePresetKeys, setVisiblePresetKeys] = useState<DatePresetKey[]>(DEFAULT_DATE_PRESET_KEYS);
  const [draftPresetKeys, setDraftPresetKeys] = useState<DatePresetKey[]>(DEFAULT_DATE_PRESET_KEYS);
  const [presetPreferenceSaving, setPresetPreferenceSaving] = useState(false);
  const [presetPreferenceFailed, setPresetPreferenceFailed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Calendar state
  const [viewMonth, setViewMonth] = useState(value.to.getMonth());
  const [viewYear, setViewYear] = useState(value.to.getFullYear());

  // Selection state (picking start then end)
  const [picking, setPicking] = useState<'idle' | 'start' | 'end'>('idle');
  const [tempFrom, setTempFrom] = useState<Date>(value.from);
  const [tempTo, setTempTo] = useState<Date>(value.to);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, []);

  // Closing after the first série click deliberately keeps that single-day
  // value, but reopening must begin a fresh selection rather than unexpectedly
  // treating the next click as the old range's second endpoint.
  useEffect(() => {
    if (!open) {
      setPicking('idle');
      setCustomizingPresets(false);
    }
  }, [open]);

  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    setPresetPreferenceFailed(false);
    getDisplayPreferences(restaurantId)
      .then((preferences) => {
        if (!active) return;
        const normalized = normalizeDatePresetKeys(preferences.date_preset_keys);
        setVisiblePresetKeys(normalized);
        setDraftPresetKeys(normalized);
      })
      .catch(() => {
        if (active) setPresetPreferenceFailed(true);
      });
    return () => { active = false; };
  }, [restaurantId]);

  // Sync temp values when value prop changes
  useEffect(() => {
    setTempFrom(value.from);
    setTempTo(value.to);
  }, [value]);

  const now = new Date();
  const monthLabel = new Intl.DateTimeFormat(localeTag(locale), { month: 'long', year: 'numeric' })
    .format(new Date(viewYear, viewMonth, 1));

  const builtinEntries: Entry[] = builtinPresets(wsd, now).map((p) => ({ id: p.key, label: t(p.key), range: p.range }));
  const hasBasisControl = basis !== undefined && onBasisChange !== undefined;
  const visiblePresetSet = new Set(visiblePresetKeys);
  const visibleEntries = builtinEntries.filter((entry) => visiblePresetSet.has(entry.id));
  const seriesShortcutVisible = hasBasisControl && visiblePresetSet.has('series');
  const customShortcutVisible = visiblePresetSet.has('custom');
  const activeId = matchEntry(value, builtinEntries);
  const activeEntry = builtinEntries.find((e) => e.id === activeId) ?? null;
  const isCustomActive = activeId === null;
  const rangeLabel = activeEntry
    ? activeEntry.label
    : sameDay(value.from, value.to)
      ? fmt(value.from)
      : `${fmt(value.from)} – ${fmt(value.to)}`;
  const serieMode = basis === 'serie';
  const triggerLabel = hasBasisControl
    ? `${t(serieMode ? 'dateBasisSerieShort' : 'dateBasisCreatedShort')} · ${rangeLabel}`
    : rangeLabel;
  const seriesDateSet = useMemo(() => new Set(series.map((item) => item.date)), [series]);

  // Migrate legacy consumers that persisted the date basis separately from the
  // old série picker. A série selection must always start and end on real série
  // dates; otherwise resolve it to the latest available one in this shared UI.
  useEffect(() => {
    if (!serieMode || series.length === 0) return;
    if (seriesDateSet.has(isoDay(value.from)) && seriesDateSet.has(isoDay(value.to))) return;
    const preferred = preferredSerieDate(series);
    if (!preferred) return;
    const date = new Date(`${preferred}T00:00:00`);
    const selected = { from: startOfDay(date), to: endOfDay(date) };
    setViewMonth(date.getMonth());
    setViewYear(date.getFullYear());
    setTempFrom(selected.from);
    setTempTo(selected.to);
    onChange(selected, { literal: true });
  }, [onChange, serieMode, series, seriesDateSet, value.from, value.to]);

  const days = daysInMonth(viewYear, viewMonth);
  const firstDay = firstColumn(viewYear, viewMonth, wsd);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const applyRange = (range: DateRange) => {
    onBasisChange?.('created');
    setTempFrom(range.from);
    setTempTo(range.to);
    onChange(range);
    setOpen(false);
  };

  const activateSeries = () => {
    const preferred = preferredSerieDate(series);
    if (!preferred) return;
    onBasisChange?.('serie');
    setPicking('idle');
    const date = new Date(`${preferred}T00:00:00`);
    setViewMonth(date.getMonth());
    setViewYear(date.getFullYear());
    setTempFrom(startOfDay(date));
    setTempTo(endOfDay(date));
    onChange({ from: startOfDay(date), to: endOfDay(date) }, { literal: true });
  };

  const activateCustom = () => {
    onBasisChange?.('created');
    setPicking('idle');
  };

  const openPresetCustomization = () => {
    setDraftPresetKeys(visiblePresetKeys);
    setPresetPreferenceFailed(false);
    setCustomizingPresets(true);
  };

  const togglePreset = (key: DatePresetKey) => {
    setDraftPresetKeys((current) => {
      if (current.includes(key)) {
        if (current.length === 1) return current;
        return current.filter((candidate) => candidate !== key);
      }
      const selected = new Set([...current, key]);
      return DATE_PRESET_KEYS.filter((candidate) => selected.has(candidate));
    });
  };

  const savePresetCustomization = async () => {
    if (!restaurantId || draftPresetKeys.length === 0) return;
    setPresetPreferenceSaving(true);
    setPresetPreferenceFailed(false);
    try {
      const preferences = await updateDisplayPreferences(restaurantId, {
        date_preset_keys: draftPresetKeys,
      });
      const normalized = normalizeDatePresetKeys(preferences.date_preset_keys);
      setVisiblePresetKeys(normalized);
      setDraftPresetKeys(normalized);
      setCustomizingPresets(false);
    } catch {
      setPresetPreferenceFailed(true);
    } finally {
      setPresetPreferenceSaving(false);
    }
  };

  const handleDayClick = (day: number) => {
    const clicked = new Date(viewYear, viewMonth, day);

    if (serieMode) {
      const clickedFrom = startOfDay(clicked);
      const clickedTo = endOfDay(clicked);

      if (picking !== 'start') {
        // Keep the first click as a valid single-série selection while leaving
        // the calendar open so a second série can define the other endpoint.
        const selected = { from: clickedFrom, to: clickedTo };
        setTempFrom(selected.from);
        setTempTo(selected.to);
        setPicking('start');
        onChange(selected, { literal: true });
        return;
      }

      const selected = clicked < tempFrom
        ? { from: clickedFrom, to: endOfDay(tempFrom) }
        : { from: startOfDay(tempFrom), to: clickedTo };
      setTempFrom(selected.from);
      setTempTo(selected.to);
      setPicking('idle');
      onChange(selected, { literal: true });
      setOpen(false);
      return;
    }

    if (picking === 'idle' || picking === 'end') {
      // Start new selection
      setTempFrom(startOfDay(clicked));
      setTempTo(endOfDay(clicked));
      setPicking('start');
    } else {
      // Finish selection
      if (clicked < tempFrom) {
        setTempFrom(startOfDay(clicked));
        setTempTo(endOfDay(tempFrom));
        onChange({ from: startOfDay(clicked), to: endOfDay(tempFrom) });
      } else {
        setTempTo(endOfDay(clicked));
        onChange({ from: tempFrom, to: endOfDay(clicked) });
      }
      setPicking('idle');
      setOpen(false);
    }
  };

  // Build calendar grid
  const calendarCells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarCells.push(null);
  for (let d = 1; d <= days; d++) calendarCells.push(d);

  // 'right' aligns the wide dropdown to the trigger's end so it opens inward
  // (used in right-aligned headers). Mirrored under RTL. Default stays left-0.
  const dropdownAlignClass = align === 'right'
    ? (direction === 'rtl' ? 'sm:left-0' : 'sm:right-0')
    : 'sm:left-0';

  const presetButton = (entry: Entry) => {
    const isActive = !serieMode && activeId === entry.id;
    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => applyRange(entry.range)}
        className={`block w-auto shrink-0 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-subtle)] sm:w-full sm:px-4 ${
          isActive ? 'font-semibold text-fg-primary' : 'text-fg-secondary hover:text-fg-primary'
        }`}
        style={isActive ? { background: 'var(--surface-subtle)' } : undefined}
      >
        {entry.label}
      </button>
    );
  };

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={hasBasisControl
          ? cn(buttonVariants({ variant: 'secondary', size: 'md' }), 'max-w-[310px]')
          : 'flex items-center gap-2 px-3 py-2 rounded-standard text-sm text-fg-secondary hover:text-fg-primary transition-colors'}
        style={hasBasisControl ? undefined : { border: '1px solid var(--divider)' }}
      >
        {hasBasisControl ? (
          <>
            <span className="min-w-0 truncate">{triggerLabel}</span>
            <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-[var(--fg-muted)]" />
          </>
        ) : triggerLabel}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <button
            type="button"
            aria-label={t('close')}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/20 sm:hidden"
          />
          <div
            role="dialog"
            aria-label={hasBasisControl ? t('dashboardDateFilter') : t('dateBasisAria')}
            className={`fixed inset-x-3 bottom-[calc(var(--safe-bottom)+0.75rem)] z-50 flex max-h-[calc(100dvh-var(--safe-top)-1.5rem)] w-auto max-w-none flex-col overflow-y-auto overscroll-contain rounded-card shadow-xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-1 sm:max-h-none sm:w-[470px] sm:max-w-[calc(100vw-2rem)] sm:overflow-hidden ${dropdownAlignClass}`}
            style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
          >
            <div className="flex flex-col sm:flex-row">
              {/* Left: presets */}
              <div className="flex w-full flex-shrink-0 border-b border-[var(--divider)] sm:block sm:max-h-[380px] sm:w-36 sm:border-b-0 sm:border-e">
              <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto py-3 sm:block sm:max-h-[330px] sm:overflow-y-auto">
              {hasBasisControl && (
                <div className="hidden px-4 pb-1 text-[11px] font-medium text-[var(--fg-muted)] sm:block">{t('dashboardDateRange')}</div>
              )}
              {seriesShortcutVisible && (
                <button
                  type="button"
                  onClick={activateSeries}
                  disabled={series.length === 0}
                  className={`block w-auto shrink-0 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors sm:w-full sm:px-4 ${
                    serieMode
                      ? 'bg-[var(--brand-50)] font-semibold text-[var(--brand-700)]'
                      : series.length === 0
                      ? 'cursor-not-allowed text-fg-secondary opacity-40'
                      : 'text-fg-secondary hover:bg-[var(--surface-subtle)] hover:text-fg-primary'
                  }`}
                >
                  {t('dashboardSeries')}
                </button>
              )}
              {visibleEntries.map(presetButton)}

              {/* Custom (fallback) — highlights when the range matches no preset.
                  Pick a custom window by clicking two days on the calendar. */}
              {customShortcutVisible && (
                <button
                  type="button"
                  onClick={activateCustom}
                  className={`block w-auto shrink-0 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-subtle)] sm:w-full sm:px-4 ${
                    !serieMode && isCustomActive ? 'font-semibold text-fg-primary' : 'font-medium text-fg-primary'
                  }`}
                  style={!serieMode && isCustomActive ? { background: 'var(--surface-subtle)' } : undefined}
                >
                  {t('drCustom')}
                </button>
              )}
              </div>
              {restaurantId && (
                <button
                  type="button"
                  onClick={openPresetCustomization}
                  className={cn(
                    'flex w-12 shrink-0 items-center justify-center gap-2 border-s border-[var(--divider)] px-3 text-left text-sm transition-colors sm:w-full sm:justify-start sm:border-s-0 sm:border-t sm:py-2 sm:px-4',
                    customizingPresets
                      ? 'bg-[var(--brand-50)] font-semibold text-[var(--brand-700)]'
                      : 'text-fg-secondary hover:bg-[var(--surface-subtle)] hover:text-fg-primary',
                  )}
                >
                  <SlidersHorizontalIcon className="size-3.5 shrink-0" />
                  <span className="sr-only sm:not-sr-only">{t('datePresetCustomize')}</span>
                </button>
              )}
              </div>

              {/* Right: calendar */}
              {customizingPresets ? (
                <div className="flex w-full flex-col p-4 sm:w-[326px]">
                  <div>
                    <h3 className="text-base font-semibold text-fg-primary">
                      {t('datePresetCustomizeTitle')}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-fg-secondary">
                      {t('datePresetCustomizeDesc')}
                    </p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {DATE_PRESET_KEYS.map((key) => {
                      const selected = draftPresetKeys.includes(key);
                      const isLastSelected = selected && draftPresetKeys.length === 1;
                      const label = key === 'series'
                        ? t('dashboardSeries')
                        : key === 'custom'
                          ? t('drCustom')
                          : t(key);
                      return (
                        <button
                          key={key}
                          type="button"
                          role="checkbox"
                          aria-checked={selected}
                          disabled={isLastSelected}
                          onClick={() => togglePreset(key)}
                          className={cn(
                            'flex min-h-11 items-center gap-2 rounded-standard border px-2.5 py-2 text-left text-xs transition-colors focus-visible:outline-none focus-visible:shadow-ring',
                            selected
                              ? 'border-[var(--brand-300)] bg-[var(--brand-50)] font-medium text-[var(--brand-800)]'
                              : 'border-[var(--divider)] text-fg-secondary hover:bg-[var(--surface-subtle)] hover:text-fg-primary',
                            isLastSelected && 'cursor-not-allowed',
                          )}
                        >
                          <span
                            className={cn(
                              'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                              selected
                                ? 'border-[var(--brand-600)] bg-[var(--brand-600)] text-white'
                                : 'border-[var(--line-strong)] bg-[var(--surface)]',
                            )}
                          >
                            {selected && <CheckIcon className="size-3" strokeWidth={3} />}
                          </span>
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {presetPreferenceFailed && (
                    <p className="mt-3 text-xs text-[var(--danger-600)]" role="status">
                      {t('displayPreferenceSaveFailed')}
                    </p>
                  )}

                  <div className="mt-4 flex justify-end gap-2 border-t border-[var(--divider)] pt-3">
                    <button
                      type="button"
                      onClick={() => setCustomizingPresets(false)}
                      disabled={presetPreferenceSaving}
                      className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                    >
                      {t('cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void savePresetCustomization()}
                      disabled={presetPreferenceSaving}
                      className={buttonVariants({ variant: 'primary', size: 'sm' })}
                    >
                      {t('save')}
                    </button>
                  </div>
                </div>
              ) : (
              <div className="mx-auto w-full max-w-[320px] p-3 sm:p-4">
            {/* Month/year nav */}
            <div className="flex items-center justify-between mb-4">
              <button
                type="button"
                onClick={prevMonth}
                className="w-8 h-8 rounded-full flex items-center justify-center text-fg-secondary hover:text-fg-primary transition-colors"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <span className="text-base font-bold text-fg-primary capitalize">
                {monthLabel}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="w-8 h-8 rounded-full flex items-center justify-center text-fg-secondary hover:text-fg-primary transition-colors"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Day labels */}
            <div className="grid grid-cols-7 mb-1">
              {weekdayCols.map((dow) => (
                <div key={dow} className="text-center text-[11px] font-medium text-fg-secondary py-1">
                  {t(SHORT_DAY_KEYS[dow])}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
              {calendarCells.map((day, i) => {
                if (day === null) return <div key={`empty-${i}`} />;

                const date = new Date(viewYear, viewMonth, day);
                const dateKey = isoDay(date);
                const isSerieDate = seriesDateSet.has(dateKey);
                const disabled = serieMode && !isSerieDate;
                const isToday = sameDay(date, now);
                const isSelected = (!serieMode || isSerieDate) && (sameDay(date, tempFrom) || sameDay(date, tempTo));
                // In série mode, highlight only actual séries inside the picked
                // interval. Calendar days without a série remain muted even
                // when they sit between the two selected endpoints.
                const isInRange = inRange(date, tempFrom, tempTo) && (!serieMode || isSerieDate);
                const isOffDay = !serieMode && workdaySet !== null && !workdaySet.has(date.getDay());

                return (
                  <button
                    key={day}
                    type="button"
                    disabled={disabled}
                    onClick={() => handleDayClick(day)}
                    className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors sm:h-10 sm:w-10 ${
                      isSelected
                        ? 'bg-fg-primary text-[var(--surface)] font-bold'
                        : disabled
                        ? 'cursor-not-allowed text-fg-secondary opacity-25'
                        : isInRange
                        ? serieMode
                          ? 'bg-[var(--brand-50)] font-semibold text-[var(--brand-700)]'
                          : 'bg-[var(--surface-subtle)] text-fg-primary'
                        : isToday
                        ? 'font-bold text-fg-primary'
                        : 'text-fg-secondary hover:bg-[var(--surface-subtle)]'
                    } ${isOffDay && !isSelected && !isInRange ? 'opacity-40' : ''}`}
                    style={isToday && !isSelected && !disabled ? { boxShadow: 'inset 0 0 0 1.5px var(--text-primary)' } : undefined}
                  >
                    {day}
                    {serieMode && isSerieDate && !isSelected && (
                      <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-[var(--brand-500)]" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Start / End date display */}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="px-3 py-2 rounded-standard" style={{ border: '1px solid var(--divider)' }}>
                <div className="text-[10px] font-medium text-fg-secondary uppercase tracking-wider">{t('drStartDate')}</div>
                <div className="text-sm text-fg-primary mt-0.5">{fmt(tempFrom)}</div>
              </div>
              <div className="px-3 py-2 rounded-standard" style={{ border: '1px solid var(--divider)' }}>
                <div className="text-[10px] font-medium text-fg-secondary uppercase tracking-wider">{t('drEndDate')}</div>
                <div className="text-sm text-fg-primary mt-0.5">{fmt(tempTo)}</div>
              </div>
            </div>
              </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Maps our app locale to a BCP-47 tag for Intl month formatting. */
function localeTag(locale: string): string {
  if (locale === 'he') return 'he';
  if (locale === 'fr') return 'fr';
  return 'en';
}
