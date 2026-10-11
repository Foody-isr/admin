import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  preparationDuration,
  preparationSummary,
  validPreparationDraft,
} from '../item-preparation';

test('preserves minute precision and explicit zero when inheriting a restaurant delay', () => {
  assert.equal(preparationDuration(90, 'en'), '1 hour 30 minutes');
  const t = (key: string) =>
    ({ itemPrepImmediate: 'No delay', itemPrepInheritedSummary: 'Default' })[
      key
    ] ?? key;
  assert.deepEqual(
    preparationSummary(
      { leadMinutes: null, schedule: null, saleMode: '' },
      90,
      'en',
      t,
    ),
    [{ preparation: 'Default (1 hour 30 minutes).' }],
  );
  assert.deepEqual(
    preparationSummary(
      { leadMinutes: 0, schedule: null, saleMode: '' },
      90,
      'en',
      t,
    ),
    [{ preparation: 'No delay' }],
  );
});

test('rejects overlapping or empty weekdays, incomplete cutoffs and fractional minutes', () => {
  const base = { leadMinutes: 240, saleMode: '' as const };
  assert.ok(
    validPreparationDraft({
      ...base,
      schedule: [
        { days: [1, 2, 3], cutoff_days_before: 0, cutoff_time: '12:00' },
        { days: [0], cutoff_days_before: 2, cutoff_time: '18:00' },
      ],
    }),
  );
  for (const schedule of [
    [],
    [{ days: [] }],
    [{ days: [1, 1] }],
    [{ days: [1] }, { days: [1] }],
    [{ days: [1], cutoff_time: '12:00' }],
    [{ days: [1], cutoff_days_before: 0, cutoff_time: '24:00' }],
  ])
    assert.equal(validPreparationDraft({ ...base, schedule }), false);
  assert.equal(
    validPreparationDraft({ ...base, leadMinutes: 1.5, schedule: null }),
    false,
  );
});

test('groups full weekday names and names the actual deadline day without implying this week', () => {
  const copy: Record<string, string> = {
    itemPrepSummaryDayRange: 'Du {first} au {last}',
    itemPrepSummaryDuration: '{duration} de préparation',
    itemPrepSummarySameDayDeadline: 'Commander avant {time} le jour même.',
    itemPrepSummaryWeekdayDeadline: 'Commander avant {day} à {time}.',
    itemPrepSummaryDaysDeadline:
      'Commander {days} jours à l’avance, avant {time}.',
  };
  const t = (key: string) => copy[key] ?? key;
  const lines = preparationSummary(
    {
      leadMinutes: 240,
      saleMode: '',
      schedule: [
        { days: [3, 1, 2], cutoff_days_before: 0, cutoff_time: '12:00' },
        { days: [0], cutoff_days_before: 2, cutoff_time: '18:00' },
        { days: [4], cutoff_days_before: 7, cutoff_time: '10:00' },
      ],
    },
    90,
    'fr',
    t,
  );
  assert.equal(lines[0].days, 'Du lundi au mercredi');
  assert.equal(
    lines[0].preparation.replace(/\u00a0/g, ' '),
    '4 heures de préparation',
  );
  assert.equal(lines[0].deadline, 'Commander avant 12:00 le jour même.');
  assert.equal(lines[1].days, 'Dimanche');
  assert.equal(lines[1].deadline, 'Commander avant vendredi à 18:00.');
  assert.equal(lines[2].deadline, 'Commander 7 jours à l’avance, avant 10:00.');
});
