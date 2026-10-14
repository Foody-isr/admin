import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarMonthDays, calendarMoveMonth, newCalendarEvent, calendarEntriesOnDate, calendarEventValid, cateringCalendarEntries } from '../restaurant-calendar';
import { requiredPermissionsForPath } from '../route-permissions';

test('month grid retains local dates across DST, month and leap-year boundaries', () => {
  assert.equal(calendarMonthDays('2026-10', 1)[0], '2026-09-28');
  assert.equal(calendarMonthDays('2026-10', 0)[0], '2026-09-27');
  assert.equal(calendarMonthDays('2024-02', 1).length, 42);
  assert.ok(calendarMonthDays('2024-02', 1).includes('2024-02-29'));
  assert.equal(calendarMoveMonth('2026-12', 1), '2027-01');
  assert.equal(calendarMoveMonth('2026-01', -1), '2025-12');
});

test('closures include both endpoints; ordinary events do not close service', () => {
  const event = { ...newCalendarEvent('2026-10-20'), title: 'Vacances', kind: 'closure' as const, end_date: '2026-10-25', closed_services: ['pickup' as const] };
  assert.equal(calendarEventValid(event), true);
  assert.equal(calendarEntriesOnDate([event], '2026-10-25').length, 1);
  assert.equal(calendarEntriesOnDate([event], '2026-10-26').length, 0);
  assert.equal(calendarEventValid({ ...event, closed_services: [] }), false);
  assert.equal(calendarEventValid({ ...event, start_date: '2026-02-30' }), false);
  assert.equal(calendarEventValid({ ...event, kind: 'other', all_day: false, start_time: '22:00', end_time: '02:00', end_date: event.start_date }), false);
  assert.equal(calendarEventValid({ ...event, kind: 'other', all_day: false, start_time: '22:00', end_time: '02:00' }), true);
});

test('confirmed catering entries retain date-only identity and are read-only references', () => {
  const events = [{ id: 42, event_date: '2026-10-20T00:00:00Z', service_name: 'Buffet', event_type: '', event_city: 'Test', status: 'deposit_paid', created_at: '' }] as any;
  const [entry] = cateringCalendarEntries(events, 'Traiteur');
  assert.equal(entry.catering_id, 42);
  assert.equal(entry.start_date, '2026-10-20');
  assert.deepEqual(entry.closed_services, []);
  assert.equal(cateringCalendarEntries([{ ...events[0], status: 'cancelled' }], '').length, 0);
  assert.deepEqual(requiredPermissionsForPath('/1/calendar'), ['settings.view', 'settings.edit']);
});
