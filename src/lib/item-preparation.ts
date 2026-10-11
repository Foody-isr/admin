import type { ImmediateSaleMode, PreparationRule } from '@/lib/api';

/** The preparation modal edits one draft, applied together with the item. */
export interface ItemPreparationDraft {
  leadMinutes: number | null;
  schedule: PreparationRule[] | null;
  saleMode: ImmediateSaleMode;
}

/** Formats stored minutes without rounding away sub-hour notices. */
export function preparationDuration(minutes: number, locale: string): string {
  const format = (value: number, unit: 'day' | 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, {
      style: 'unit',
      unit,
      unitDisplay: 'long',
    }).format(value);
  if (minutes > 0 && minutes % 1440 === 0) return format(minutes / 1440, 'day');
  const hours = Math.floor(minutes / 60),
    remainder = minutes % 60;
  return [
    hours ? format(hours, 'hour') : '',
    remainder || !hours ? format(remainder, 'minute') : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** Validates the same finite weekly calendar accepted by the API. */
export function validPreparationDraft(draft: ItemPreparationDraft): boolean {
  const validNotice = (value: number) =>
    Number.isSafeInteger(value) && value >= 0 && value <= 525600;
  if (draft.leadMinutes !== null && !validNotice(draft.leadMinutes))
    return false;
  if (draft.schedule === null) return true;
  if (!draft.schedule.length || draft.schedule.length > 7) return false;
  const days = new Set<number>();
  return draft.schedule.every((rule) => {
    if (
      !rule.days.length ||
      rule.days.some(
        (day) => !Number.isInteger(day) || day < 0 || day > 6 || days.has(day),
      )
    )
      return false;
    rule.days.forEach((day) => days.add(day));
    if (new Set(rule.days).size !== rule.days.length) return false;
    if (rule.lead_time_minutes != null && !validNotice(rule.lead_time_minutes))
      return false;
    if ((rule.cutoff_days_before == null) !== !rule.cutoff_time) return false;
    return (
      rule.cutoff_days_before == null ||
      (Number.isInteger(rule.cutoff_days_before) &&
        rule.cutoff_days_before >= 0 &&
        rule.cutoff_days_before <= 365 &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(rule.cutoff_time ?? ''))
    );
  });
}

/** One readable condition, with a separate deadline only when configured. */
export interface PreparationSummaryLine {
  days?: string;
  preparation: string;
  deadline?: string;
}

/** Builds a compact summary, separating conditions that apply on different days. */
export function preparationSummary(
  draft: ItemPreparationDraft,
  fallback: number,
  locale: string,
  t: (key: string) => string,
): PreparationSummaryLine[] {
  const duration = (minutes: number) =>
    minutes === 0
      ? t('itemPrepImmediate')
      : t('itemPrepSummaryDuration').replace(
          '{duration}',
          preparationDuration(minutes, locale),
        );
  const base = draft.leadMinutes ?? fallback;
  const weekday = (day: number) =>
    new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(2026, 0, 4 + day)));
  const week = locale === 'he' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0];
  const label = (days: number[]) => {
    const sorted = week.filter((day) => days.includes(day));
    if (sorted.length === 7) return t('itemPrepSummaryEveryDay');
    const consecutive =
      sorted.length >= 3 &&
      sorted.every(
        (day, index) =>
          index === 0 ||
          week.indexOf(day) === week.indexOf(sorted[index - 1]) + 1,
      );
    if (consecutive)
      return t('itemPrepSummaryDayRange')
        .replace('{first}', weekday(sorted[0]))
        .replace('{last}', weekday(sorted[sorted.length - 1]));
    const list = new Intl.ListFormat(locale, {
      style: 'long',
      type: 'conjunction',
    }).format(sorted.map(weekday));
    return list.charAt(0).toLocaleUpperCase(locale) + list.slice(1);
  };
  const lines: PreparationSummaryLine[] = draft.schedule
    ? draft.schedule.map((rule) => {
        const line: PreparationSummaryLine = {
          days: label(rule.days),
          preparation: duration(rule.lead_time_minutes ?? base),
        };
        if (rule.cutoff_time && rule.cutoff_days_before != null) {
          const daysBefore = rule.cutoff_days_before;
          const key =
            daysBefore === 0
              ? 'itemPrepSummarySameDayDeadline'
              : rule.days.length === 1 && daysBefore < 7
                ? 'itemPrepSummaryWeekdayDeadline'
                : daysBefore === 1
                  ? 'itemPrepSummaryPreviousDayDeadline'
                  : 'itemPrepSummaryDaysDeadline';
          line.deadline = t(key)
            .replace('{time}', rule.cutoff_time)
            .replace('{day}', weekday((rule.days[0] - daysBefore + 7) % 7))
            .replace('{days}', String(daysBefore));
        }
        return line;
      })
    : [
        {
          preparation:
            draft.leadMinutes == null
              ? `${t('itemPrepInheritedSummary')} (${base === 0 ? t('itemPrepImmediate') : preparationDuration(base, locale)}).`
              : duration(base),
        },
      ];
  if (draft.saleMode)
    lines.push({
      preparation: t(
        draft.saleMode === 'surplus'
          ? 'itemPrepSurplusSummary'
          : 'itemPrepReadyOnlySummary',
      ),
    });
  return lines;
}
