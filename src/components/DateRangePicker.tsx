'use client';

import { useEffect, useRef, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  CheckCircle,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react';
import { clampWeekStartDay, type WeekStartDay } from '@/lib/weeks';
import { useI18n } from '@/lib/i18n';
import type { DateBasis } from '@/lib/api';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DateRange {
  from: Date;
  to: Date;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** First day of the week (0=Sun … 6=Sat). Drives "This/Last week" presets
   *  and the calendar-grid column order. Defaults to Sunday. */
  weekStartDay?: number;
  /** Weekday numbers (0=Sun … 6=Sat) the restaurant operates on. Cells whose
   *  day-of-week is not in this list are visually muted (still selectable).
   *  Omit to keep every cell at full opacity. */
  workdays?: number[];
  /** Reserved: previously enabled per-restaurant saved ranges. The saved-range
   *  UI is parked (backend kept dormant), so this is accepted but ignored for
   *  now — callers can keep passing it until saved ranges are re-wired. */
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
  id: string;
  label: string;
  range: DateRange;
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
function builtinPresets(weekStartDay: WeekStartDay, now: Date): { key: string; range: DateRange }[] {
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
  align = 'left',
  basis,
  onBasisChange,
}: DateRangePickerProps) {
  const { t, locale, direction } = useI18n();
  const wsd = clampWeekStartDay(weekStartDay);
  const weekdayCols = rotatedWeekdays(wsd);
  // `null` workdays (rather than a 7-day default) lets the picker skip the
  // muted-cell branch entirely when the caller doesn't care about workdays,
  // keeping the rendered output identical to the pre-workday version.
  const workdaySet = workdays && workdays.length > 0 ? new Set(workdays) : null;
  const [open, setOpen] = useState(false);
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
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync temp values when value prop changes
  useEffect(() => {
    setTempFrom(value.from);
    setTempTo(value.to);
  }, [value]);

  const now = new Date();
  const monthLabel = new Intl.DateTimeFormat(localeTag(locale), { month: 'long', year: 'numeric' })
    .format(new Date(viewYear, viewMonth, 1));

  const builtinEntries: Entry[] = builtinPresets(wsd, now).map((p) => ({ id: p.key, label: t(p.key), range: p.range }));
  const activeId = matchEntry(value, builtinEntries);
  const activeEntry = builtinEntries.find((e) => e.id === activeId) ?? null;
  const isCustomActive = activeId === null;
  const rangeLabel = activeEntry
    ? activeEntry.label
    : sameDay(value.from, value.to)
      ? fmt(value.from)
      : `${fmt(value.from)} – ${fmt(value.to)}`;
  const hasBasisControl = basis !== undefined && onBasisChange !== undefined;
  const serieMode = basis === 'serie';
  const basisLabel = serieMode ? t('dashboardServicesScheduled') : t('dashboardOrdersPlaced');
  const BasisIcon = serieMode ? CalendarClock : CalendarDays;

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
    setTempFrom(range.from);
    setTempTo(range.to);
    onChange(range);
    setOpen(false);
  };

  const handleDayClick = (day: number) => {
    const clicked = new Date(viewYear, viewMonth, day);

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
  const dropdownAlignClass = align === 'right' ? (direction === 'rtl' ? 'left-0' : 'right-0') : 'left-0';

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={hasBasisControl
          ? 'flex min-h-11 max-w-[310px] items-center gap-2 rounded-[var(--r-lg)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-left transition-colors hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:shadow-ring'
          : 'flex items-center gap-2 px-3 py-2 rounded-standard text-sm text-fg-secondary hover:text-fg-primary transition-colors'}
        style={hasBasisControl ? undefined : { border: '1px solid var(--divider)' }}
      >
        {hasBasisControl ? (
          <>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] bg-[var(--brand-50)] text-[var(--brand-600)]">
              <BasisIcon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[10px] text-[var(--fg-subtle)]">{basisLabel}</span>
              <span className="block truncate text-fs-sm font-semibold text-[var(--fg)]">{rangeLabel}</span>
            </span>
            <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 text-[var(--fg-muted)]" />
          </>
        ) : rangeLabel}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label={hasBasisControl ? t('dashboardDateFilter') : t('dateBasisAria')}
          className={`absolute top-full ${dropdownAlignClass} mt-1 z-50 flex w-[470px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-card shadow-xl`}
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          {hasBasisControl && (
            <div className="border-b border-[var(--line)] p-3">
              <div className="mb-2 text-[11px] font-medium text-[var(--fg-muted)]">{t('dashboardAnalyzeBy')}</div>
              <div role="radiogroup" aria-label={t('dashboardAnalyzeBy')} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {([
                  {
                    key: 'created' as const,
                    icon: CalendarDays,
                    label: t('dashboardOrdersPlaced'),
                    hint: t('dashboardOrdersPlacedHint'),
                  },
                  {
                    key: 'serie' as const,
                    icon: CalendarClock,
                    label: t('dashboardServicesScheduled'),
                    hint: t('dashboardServicesScheduledHint'),
                  },
                ]).map((option) => {
                  const selected = basis === option.key;
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => onBasisChange?.(option.key)}
                      className={`relative flex min-h-[68px] w-full items-start gap-2.5 rounded-[var(--r-md)] border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:shadow-ring sm:w-[218px] ${
                        selected
                          ? 'border-[var(--brand-400)] bg-[var(--brand-50)]'
                          : 'border-[var(--line)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]'
                      }`}
                    >
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? 'text-[var(--brand-600)]' : 'text-[var(--fg-muted)]'}`} />
                      <span className="min-w-0 pe-4">
                        <span className="block text-fs-sm font-semibold text-[var(--fg)]">{option.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-[var(--fg-muted)]">{option.hint}</span>
                      </span>
                      {selected && <CheckCircle className="absolute end-2 top-2 h-3.5 w-3.5 text-[var(--brand-600)]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row">
            {/* Left: presets */}
            <div className="flex w-full flex-shrink-0 gap-1 overflow-x-auto border-b border-[var(--divider)] py-3 sm:block sm:max-h-[380px] sm:w-36 sm:overflow-y-auto sm:border-b-0 sm:border-e">
              {hasBasisControl && (
                <div className="hidden px-4 pb-1 text-[11px] font-medium text-[var(--fg-muted)] sm:block">{t('dashboardDateRange')}</div>
              )}
              {builtinEntries.map((e) => {
                const isActive = activeId === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => applyRange(e.range)}
                    className={`block w-auto shrink-0 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-subtle)] sm:w-full sm:px-4 ${
                      isActive ? 'font-semibold text-fg-primary' : 'text-fg-secondary hover:text-fg-primary'
                    }`}
                    style={isActive ? { background: 'var(--surface-subtle)' } : undefined}
                  >
                    {e.label}
                  </button>
                );
              })}

              {/* Custom (fallback) — highlights when the range matches no preset.
                  Pick a custom window by clicking two days on the calendar. */}
              <button
                type="button"
                onClick={() => setPicking('idle')}
                className={`block w-auto shrink-0 whitespace-nowrap px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--surface-subtle)] sm:w-full sm:px-4 ${
                  isCustomActive ? 'font-semibold text-fg-primary' : 'font-medium text-fg-primary'
                }`}
                style={isCustomActive ? { background: 'var(--surface-subtle)' } : undefined}
              >
                {t('drCustom')}
              </button>
            </div>

            {/* Right: calendar */}
            <div className="mx-auto w-[320px] p-4">
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
                const isToday = sameDay(date, now);
                const isSelected = sameDay(date, tempFrom) || sameDay(date, tempTo);
                const isInRange = inRange(date, tempFrom, tempTo);
                const isOffDay = workdaySet !== null && !workdaySet.has(date.getDay());

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => handleDayClick(day)}
                    className={`w-10 h-10 mx-auto flex items-center justify-center text-sm rounded-full transition-colors ${
                      isSelected
                        ? 'bg-fg-primary text-[var(--surface)] font-bold'
                        : isInRange
                        ? 'bg-[var(--surface-subtle)] text-fg-primary'
                        : isToday
                        ? 'font-bold text-fg-primary'
                        : 'text-fg-secondary hover:bg-[var(--surface-subtle)]'
                    } ${isOffDay && !isSelected && !isInRange ? 'opacity-40' : ''}`}
                    style={isToday && !isSelected ? { boxShadow: 'inset 0 0 0 1.5px var(--text-primary)' } : undefined}
                  >
                    {day}
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
          </div>
        </div>
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
