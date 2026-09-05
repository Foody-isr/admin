import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatScheduledFor,
  relativeDayLabel,
  relativeTimestampDayLabel,
  scheduledCalendarDate,
} from '@/lib/orders/order-time';

const t = (key: string) => ({
  today: 'Today',
  tomorrow: 'Tomorrow',
  inDaysShort: 'in {n} days',
}[key] ?? key);

test('treats a serialized scheduled_for timestamp as a local calendar date', () => {
  const date = scheduledCalendarDate('2026-09-11T00:00:00Z');

  assert.ok(date);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 8);
  assert.equal(date.getDate(), 11);
  assert.equal(date.getHours(), 0);
});

test('scheduled labels never expose the serialized midnight as a fulfillment time', () => {
  const label = formatScheduledFor('2026-09-11T00:00:00Z');

  assert.doesNotMatch(label, /00:00|03:00/);
});

test('relative labels compare restaurant calendar days', () => {
  const label = relativeDayLabel(
    '2026-09-11T00:00:00Z',
    t,
    new Date(2026, 8, 5, 22, 0),
  );

  assert.equal(label, 'in 6 days');
});

test('timestamp relative labels still use the instant in the local timezone', () => {
  const label = relativeTimestampDayLabel(
    '2026-09-10T22:30:00Z',
    t,
    new Date('2026-09-11T00:15:00+03:00'),
  );

  assert.equal(label, 'Today');
});
