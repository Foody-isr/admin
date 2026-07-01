'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { clampWeekStartDay, type WeekStartDay } from '@/lib/weeks';

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
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmt(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
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

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const BASE_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Day labels rotated so the configured first-of-week sits in column 0. */
function rotatedDayLabels(weekStartDay: WeekStartDay): string[] {
  return [...BASE_DAY_LABELS.slice(weekStartDay), ...BASE_DAY_LABELS.slice(0, weekStartDay)];
}

// ─── Presets ───────────────────────────────────────────────────────────────

interface Preset {
  label: string;
  range: () => DateRange;
}

function matchPreset(value: DateRange, presets: Preset[]): string | null {
  for (const p of presets) {
    const r = p.range();
    if (sameDay(r.from, value.from) && sameDay(r.to, value.to)) return p.label;
  }
  return null;
}

function getPresets(weekStartDay: WeekStartDay): Preset[] {
  const now = new Date();
  const today = startOfDay(now);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Rolling windows that mirror the dashboard's "Last 7 / 30 days" presets
  // (today included), so the two surfaces can be compared on an identical range.
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

  return [
    { label: 'Today', range: () => ({ from: today, to: endOfDay(now) }) },
    { label: 'Yesterday', range: () => ({ from: yesterday, to: endOfDay(yesterday) }) },
    { label: 'Last 7 days', range: () => ({ from: last7Start, to: endOfDay(now) }) },
    { label: 'Last 30 days', range: () => ({ from: last30Start, to: endOfDay(now) }) },
    { label: 'This week', range: () => ({ from: weekStart, to: endOfDay(now) }) },
    { label: 'Last week', range: () => ({ from: lastWeekStart, to: endOfDay(lastWeekEnd) }) },
    { label: 'This month', range: () => ({ from: monthStart, to: endOfDay(now) }) },
    { label: 'Last month', range: () => ({ from: lastMonthStart, to: endOfDay(lastMonthEnd) }) },
    { label: 'This year', range: () => ({ from: yearStart, to: endOfDay(now) }) },
    { label: 'Last year', range: () => ({ from: lastYearStart, to: endOfDay(lastYearEnd) }) },
  ];
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function DateRangePicker({ value, onChange, weekStartDay, workdays }: DateRangePickerProps) {
  const wsd = clampWeekStartDay(weekStartDay);
  const dayLabels = rotatedDayLabels(wsd);
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

  const presets = getPresets(wsd);
  const activePresetLabel = matchPreset(value, presets);
  const today = new Date();
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

  const applyPreset = (preset: Preset) => {
    const range = preset.range();
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

  return (
    <div className="relative" ref={ref}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-standard text-sm text-fg-secondary hover:text-fg-primary transition-colors"
        style={{ border: '1px solid var(--divider)' }}
      >
        {activePresetLabel
          ? activePresetLabel
          : sameDay(value.from, value.to)
          ? fmt(value.from)
          : `${fmt(value.from)} - ${fmt(value.to)}`}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 shadow-xl rounded-card flex overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          {/* Left: presets */}
          <div className="w-36 py-3 flex-shrink-0" style={{ borderRight: '1px solid var(--divider)' }}>
            {presets.map((p) => {
              const isActive = activePresetLabel === p.label;
              return (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className={`block w-full text-left px-4 py-2 text-sm transition-colors hover:bg-[var(--surface-subtle)] ${
                    isActive ? 'font-semibold text-fg-primary' : 'text-fg-secondary hover:text-fg-primary'
                  }`}
                  style={isActive ? { background: 'var(--surface-subtle)' } : undefined}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              onClick={() => setPicking('idle')}
              className="block w-full text-left px-4 py-2 text-sm font-medium text-fg-primary hover:bg-[var(--surface-subtle)] transition-colors"
            >
              Custom
            </button>
          </div>

          {/* Right: calendar */}
          <div className="p-4 w-[320px]">
            {/* Month/year nav */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prevMonth}
                className="w-8 h-8 rounded-full flex items-center justify-center text-fg-secondary hover:text-fg-primary transition-colors"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <span className="text-base font-bold text-fg-primary">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <button
                onClick={nextMonth}
                className="w-8 h-8 rounded-full flex items-center justify-center text-fg-secondary hover:text-fg-primary transition-colors"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Day labels */}
            <div className="grid grid-cols-7 mb-1">
              {dayLabels.map((d) => (
                <div key={d} className="text-center text-[11px] font-medium text-fg-secondary py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
              {calendarCells.map((day, i) => {
                if (day === null) return <div key={`empty-${i}`} />;

                const date = new Date(viewYear, viewMonth, day);
                const isToday = sameDay(date, today);
                const isSelected = sameDay(date, tempFrom) || sameDay(date, tempTo);
                const isInRange = inRange(date, tempFrom, tempTo);
                const isOffDay = workdaySet !== null && !workdaySet.has(date.getDay());

                return (
                  <button
                    key={day}
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
                <div className="text-[10px] font-medium text-fg-secondary uppercase tracking-wider">Start Date</div>
                <div className="text-sm text-fg-primary mt-0.5">{fmt(tempFrom)}</div>
              </div>
              <div className="px-3 py-2 rounded-standard" style={{ border: '1px solid var(--divider)' }}>
                <div className="text-[10px] font-medium text-fg-secondary uppercase tracking-wider">End Date</div>
                <div className="text-sm text-fg-primary mt-0.5">{fmt(tempTo)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
