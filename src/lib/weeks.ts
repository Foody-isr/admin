// Week helpers shared by the menu group editor, rotation page, and any UI
// that thinks in week-of buckets. All boundaries respect the restaurant's
// configured WeekStartDay (0 = Sunday … 6 = Saturday, matching JS
// Date.getDay() and Go's time.Weekday).
//
// Israeli restaurants typically use 0 (Sunday) — the workweek runs Sun→Thu
// with Fri/Sat off. European restaurants default to 1 (Monday).
//
// "Workdays" is a separate concept: which days inside the 7-day calendar
// window count as operating days. Owners can either pin them explicitly on
// the Restaurant or let them be derived from opening hours by leaving
// `workdays` empty (the default). Use `getEffectiveWorkdays` to resolve the
// final list — never read `restaurant.workdays` directly in display code.

/** A first-day-of-week value: 0 = Sunday … 6 = Saturday. */
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Normalises any number to a valid WeekStartDay, falling back to Monday. */
export function clampWeekStartDay(v: number | undefined | null): WeekStartDay {
  if (v == null || !Number.isInteger(v) || v < 0 || v > 6) return 1;
  return v as WeekStartDay;
}

/**
 * Returns the date `d` rewound to the start of its week, given
 * `weekStartDay`. Output is a fresh Date at local-midnight, time stripped.
 */
export function getWeekStart(d: Date, weekStartDay: WeekStartDay): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (out.getDay() - weekStartDay + 7) % 7;
  out.setDate(out.getDate() - diff);
  return out;
}

/**
 * Returns the inclusive last day of the week whose first day is `weekStart`
 * (i.e. weekStart + 6 days). Caller must already have a normalised start.
 */
export function getWeekEnd(weekStart: Date): Date {
  return addDays(weekStart, 6);
}

/** Adds N days to a date (returns a fresh Date, time stripped). */
export function addDays(d: Date, days: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() + days);
  return out;
}

/** Formats a date as YYYY-MM-DD in local time (no timezone shift). */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── Workdays ────────────────────────────────────────────────────────────────

// JS Date.getDay() puts Sunday at index 0 — match that here so the JSON
// `workdays` array uses the same convention as the rest of the codebase
// (server time.Weekday, BatchFulfillmentDay.day, SchedulingTimeSlot.days).
const DAY_INDEX_BY_KEY: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Minimal shape this module needs from a restaurant. Kept structural so it
 *  works with both the full `Restaurant` API type and partial fetches. */
export interface WorkdaysSource {
  workdays?: number[] | null;
  opening_hours_config?: {
    dine_in?: Record<string, { closed?: boolean }>;
    pickup?: Record<string, { closed?: boolean }>;
    delivery?: Record<string, { closed?: boolean }>;
  };
}

/**
 * Resolves the workdays a restaurant should display:
 *   - Explicit `workdays` if the owner pinned them (length > 0).
 *   - Otherwise the union of days marked "open" across every configured
 *     service type in opening hours.
 *   - Otherwise every day of the week (safe default — never returns []).
 *
 * The returned array is sorted ascending (Sun=0 first) and deduped.
 */
export function getEffectiveWorkdays(source: WorkdaysSource): number[] {
  if (source.workdays && source.workdays.length > 0) {
    return dedupedSorted(source.workdays);
  }
  const cfg = source.opening_hours_config;
  if (cfg) {
    const days = new Set<number>();
    for (const service of [cfg.dine_in, cfg.pickup, cfg.delivery]) {
      if (!service) continue;
      for (const [key, day] of Object.entries(service)) {
        if (day && !day.closed && key in DAY_INDEX_BY_KEY) {
          days.add(DAY_INDEX_BY_KEY[key]);
        }
      }
    }
    if (days.size > 0) return Array.from(days).sort((a, b) => a - b);
  }
  return [0, 1, 2, 3, 4, 5, 6];
}

/** True when the given JS-style weekday (0=Sun … 6=Sat) is a workday. */
export function isWorkday(weekdayIndex: number, workdays: number[]): boolean {
  return workdays.includes(weekdayIndex);
}

/**
 * Returns the first and last workday of the 7-day window starting at
 * `weekStart`. Both Date objects are at local midnight, time stripped.
 * If no day in the window is a workday (degenerate config), falls back to
 * the full window.
 */
export function workdaySpan(weekStart: Date, workdays: number[]): { first: Date; last: Date } {
  let first: Date | null = null;
  let last: Date | null = null;
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i);
    if (!workdays.includes(d.getDay())) continue;
    if (first === null) first = d;
    last = d;
  }
  if (first === null || last === null) {
    return { first: weekStart, last: addDays(weekStart, 6) };
  }
  return { first, last };
}

function dedupedSorted(arr: number[]): number[] {
  const out = Array.from(new Set(arr.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)));
  out.sort((a, b) => a - b);
  return out;
}
