// Date and time formatting for the order surfaces.
//
// Moved verbatim from OrderDetailDrawer.tsx lines 134-211, plus elapsedMinutes,
// which the drawer computed inline. Every helper swallows an unparseable date
// and returns the raw ISO string rather than throwing or rendering "Invalid
// Date" — an order's timestamps come off the wire and a bad one must never take
// the whole panel down.

/** Short stamp for a timeline node or an activity row: "14:32". */
export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/** Day heading for the activity timeline, used only when an order's events
 *  span more than one day: "lun. 14 août". */
export function formatEventDay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

const CALENDAR_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Parses `scheduled_for` as the restaurant's calendar day, not an instant.
 *
 * PostgreSQL stores this field as `date`, but Go serializes it as midnight UTC
 * (`2026-09-11T00:00:00Z`). Passing that value directly to `new Date()` makes
 * Israeli browsers display 03:00 and can shift the day in western timezones.
 */
export function scheduledCalendarDate(iso: string): Date | null {
  const match = CALENDAR_DATE_PREFIX.exec(iso);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  return date;
}

/** Compact scheduled calendar date: "11 sept.". */
export function formatScheduledDateShort(iso: string): string {
  const date = scheduledCalendarDate(iso);
  if (!date) return iso;
  return date.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

/** Full scheduled calendar date: "lun. 14 août". */
export function formatScheduledFor(iso: string): string {
  const date = scheduledCalendarDate(iso);
  if (!date) return iso;
  return date.toLocaleDateString([], {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

/** Long scheduled date with no time: "lundi 14 août". */
export function formatScheduledDateLong(iso: string): string {
  const date = scheduledCalendarDate(iso);
  if (!date) return iso;
  return date.toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/**
 * "Today" / "Tomorrow" / "in 3 days", or null when the date is too far out to
 * be worth a relative phrase. Gives staff an at-a-glance sense of urgency on a
 * scheduled order.
 *
 * Compares calendar days, not elapsed hours, so an order at 23:00 tonight reads
 * "Today" and one at 01:00 tomorrow reads "Tomorrow".
 */
export function relativeDayLabel(
  iso: string,
  t: (k: string) => string,
  now: Date = new Date(),
): string | null {
  const target = scheduledCalendarDate(iso);
  if (!target) return null;
  return relativeCalendarDay(target, t, now);
}

/**
 * Relative day label for a real timestamp such as `created_at`. Unlike
 * `relativeDayLabel`, this first converts the instant into the browser's local
 * calendar day.
 */
export function relativeTimestampDayLabel(
  iso: string,
  t: (k: string) => string,
  now: Date = new Date(),
): string | null {
  const target = new Date(iso);
  if (!Number.isFinite(target.getTime())) return null;
  return relativeCalendarDay(target, t, now);
}

function relativeCalendarDay(
  target: Date,
  t: (k: string) => string,
  now: Date,
): string | null {
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((targetDay.getTime() - today.getTime()) / 86400000);
  if (days === 0) return t('today') || 'Today';
  if (days === 1) return t('tomorrow') || 'Tomorrow';
  if (days > 1 && days < 14) {
    const tmpl = t('inDaysShort');
    const fallback = `in ${days} days`;
    const used = tmpl && tmpl !== 'inDaysShort' ? tmpl : fallback;
    return used.replace('{n}', String(days));
  }
  return null;
}

/**
 * Whole minutes since an ISO stamp, floored at 0 so a clock skew between the
 * server and the browser never renders a negative age.
 */
export function elapsedMinutes(iso: string, now: number = Date.now()): number {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.round((now - then) / 60000));
}
