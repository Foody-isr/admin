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

/** Full scheduled stamp: "lun. 14 août, 14:00". */
export function formatScheduledFor(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Long scheduled date with no time: "lundi 14 août". */
export function formatScheduledDateLong(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

/** Just the clock part of a scheduled stamp: "14:00". */
export function formatScheduledTimeOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/**
 * "Today" / "Tomorrow" / "in 3 days", or null when the date is too far out to
 * be worth a relative phrase. Gives staff an at-a-glance sense of urgency on a
 * scheduled order.
 *
 * Compares calendar days, not elapsed hours, so an order at 23:00 tonight reads
 * "Today" and one at 01:00 tomorrow reads "Tomorrow".
 */
export function relativeDayLabel(iso: string, t: (k: string) => string): string | null {
  try {
    const target = new Date(iso);
    const t0 = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((t0.getTime() - today.getTime()) / 86400000);
    if (days === 0) return t('today') || 'Today';
    if (days === 1) return t('tomorrow') || 'Tomorrow';
    if (days > 1 && days < 14) {
      const tmpl = t('inDaysShort');
      const fallback = `in ${days} days`;
      const used = tmpl && tmpl !== 'inDaysShort' ? tmpl : fallback;
      return used.replace('{n}', String(days));
    }
    return null;
  } catch {
    return null;
  }
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
