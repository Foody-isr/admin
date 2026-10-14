import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarMonthDays, calendarMoveMonth, calendarShiftDate, calendarWeekDays, calendarDayEventLanes, newCalendarEvent, calendarEntriesOnDate, calendarEventValid, cateringCalendarEntries } from '../restaurant-calendar';
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

test('week and day navigation follow the restaurant week and retain dates across DST', () => {
  assert.deepEqual(calendarWeekDays('2026-10-14', 1), ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  assert.equal(calendarWeekDays('2026-10-14', 0)[0], '2026-10-11');
  assert.equal(calendarShiftDate('2026-10-25', -1), '2026-10-24');
  assert.equal(calendarShiftDate('2026-12-31', 1), '2027-01-01');
});

test('day timeline stacks overlapping events and clips overnight ranges without midnight ghosts', () => {
  const base = { ...newCalendarEvent('2026-10-20'), title: 'Test', all_day: false };
  const events = [
    { ...base, id: 'a', start_time: '03:00', end_time: '04:00' },
    { ...base, id: 'b', start_time: '03:30', end_time: '04:30' },
    { ...base, id: 'c', start_time: '04:00', end_time: '05:00' },
    { ...base, id: 'night', start_time: '23:00', end_time: '00:00', end_date: '2026-10-21' },
  ];
  assert.deepEqual(calendarDayEventLanes(events, '2026-10-20').map(({ event, start, end, lane }) => [event.id, start, end, lane]), [['a', 180, 240, 0], ['b', 210, 270, 1], ['c', 240, 300, 0], ['night', 1380, 1440, 0]]);
  assert.deepEqual(calendarDayEventLanes(events, '2026-10-21'), []);
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
