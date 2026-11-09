import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySelection, daysInclusive, resolvePreset, resolveStored } from '@/lib/analytics-range';
import { isoDate, type WeekStartDay } from '@/lib/weeks';

for (const scenario of [
  { now: '2026-11-02T12:00:00', start: 0, from: '2026-11-01', to: '2026-11-07' },
  { now: '2026-11-02T12:00:00', start: 1, from: '2026-11-02', to: '2026-11-08' },
  { now: '2026-11-07T12:00:00', start: 0, from: '2026-11-01', to: '2026-11-07' },
  { now: '2027-01-01T12:00:00', start: 1, from: '2026-12-28', to: '2027-01-03' },
]) {
  test(`this week covers seven calendar days from weekday ${scenario.start} on ${scenario.now}`, context => {
    context.mock.timers.enable({ apis: ['Date'], now: new Date(scenario.now).getTime() });
    const range = resolvePreset('thisWeek', scenario.start as WeekStartDay);
    assert.equal(isoDate(range.from), scenario.from);
    assert.equal(isoDate(range.to), scenario.to);
    assert.equal(daysInclusive(range), 7);
  });
}

test('a saved current week retains future days when reloaded and moves to the next full week', context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-02T12:00:00').getTime() });
  const selected = classifySelection(resolvePreset('thisWeek', 0), 0);
  assert.deepEqual(selected, { preset: 'thisWeek' });
  context.mock.timers.setTime(new Date('2026-11-04T12:00:00').getTime());
  assert.equal(isoDate(resolveStored(selected, 0).to), '2026-11-07');
  context.mock.timers.setTime(new Date('2026-11-09T12:00:00').getTime());
  assert.equal(isoDate(resolveStored(selected, 0).from), '2026-11-08');
  assert.equal(isoDate(resolveStored(selected, 0).to), '2026-11-14');
});

test('last seven days remains a rolling window ending today', context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-02T12:00:00').getTime() });
  const range = resolvePreset('last7', 0);
  assert.equal(isoDate(range.from), '2026-10-27');
  assert.equal(isoDate(range.to), '2026-11-02');
});
