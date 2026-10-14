import type { CateringEvent, RestaurantCalendarEvent } from './api';

export interface CalendarEntry extends RestaurantCalendarEvent { catering_id?: number }

/** Produces a date key without converting a restaurant date to a browser date. */
export function calendarDate(value: Date): string { return value.toISOString().slice(0, 10); }

/** Creates six complete weeks using the restaurant’s configured first weekday. */
export function calendarMonthDays(month: string, weekStartDay: number): string[] {
  const first = new Date(`${month}-01T12:00:00Z`);
  const offset = (first.getUTCDay() - (weekStartDay >= 0 && weekStartDay <= 6 ? weekStartDay : 1) + 7) % 7;
  first.setUTCDate(first.getUTCDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first); date.setUTCDate(date.getUTCDate() + index); return calendarDate(date);
  });
}

/** Changes months independently of DST and the viewer's timezone. */
export function calendarMoveMonth(month: string, offset: number): string {
  const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + offset); return calendarDate(date).slice(0, 7);
}

/** New entries are informational unless the operator explicitly chooses closure. */
export function newCalendarEvent(date: string): RestaurantCalendarEvent {
  return { id: '', title: '', kind: 'other', start_date: date, end_date: date, all_day: true, start_time: '', end_time: '', location: '', notes: '', closed_services: [] };
}

/** Checks wall-clock ranges, including events ending on a subsequent day. */
export function calendarEventValid(event: RestaurantCalendarEvent): boolean {
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T12:00:00Z`)) && calendarDate(new Date(`${date}T12:00:00Z`)) === date;
  if (!event.title.trim() || !validDate(event.start_date) || !validDate(event.end_date) || event.end_date < event.start_date) return false;
  if (event.kind === 'closure' && (!event.all_day || !event.closed_services.length)) return false;
  if (event.all_day) return true;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(event.start_time) && /^([01]\d|2[0-3]):[0-5]\d$/.test(event.end_time) && (event.end_date > event.start_date || event.end_time > event.start_time);
}

/** Projects confirmed catering entries into the agenda without creating copies. */
export function cateringCalendarEntries(events: CateringEvent[], fallbackTitle: string): CalendarEntry[] {
  return events.filter(event => event.event_date && !['cancelled', 'refunded'].includes(event.status)).map(event => {
    const date = event.event_date!.slice(0, 10);
    return { ...newCalendarEvent(date), id: `catering-${event.id}`, catering_id: event.id, title: event.service_name || event.event_type || fallbackTitle, kind: 'catering', location: event.event_city || '', notes: '', updated_at: event.created_at };
  });
}

/** Lists entries spanning a local date, including both endpoints of a closure. */
export function calendarEntriesOnDate(entries: CalendarEntry[], date: string): CalendarEntry[] {
  return entries.filter(event => event.start_date <= date && event.end_date >= date).sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.start_time.localeCompare(b.start_time) || a.title.localeCompare(b.title));
}
