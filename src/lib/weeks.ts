// Week helpers shared by the menu group editor, rotation page, and any UI
// that thinks in week-of buckets. All boundaries respect the restaurant's
// configured WeekStartDay (0 = Sunday … 6 = Saturday, matching JS
// Date.getDay() and Go's time.Weekday).
//
// Israeli restaurants typically use 0 (Sunday) — the workweek runs Sun→Thu
// with Fri/Sat off. European restaurants default to 1 (Monday).

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
