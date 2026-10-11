'use client';

import { useId } from 'react';
import type { MenuAvailabilityHour } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** Missing rows mean unavailable days; no schedule is manufactured on render. */
export function MenuHoursEditor({ hours, onChange, disabled = false, menuId = 0, emptyMessage }: {
  hours: MenuAvailabilityHour[];
  onChange: (hours: MenuAvailabilityHour[]) => void;
  disabled?: boolean;
  menuId?: number;
  emptyMessage?: string;
}) {
  const { t, locale } = useI18n();
  const id = useId();
  const update = (day: number, patch: Partial<MenuAvailabilityHour>) => {
    const current = hours.find(hour => hour.day_of_week === day);
    onChange(current ? hours.map(hour => hour === current ? { ...hour, ...patch } : hour)
      : [...hours, { id: 0, menu_id: menuId, day_of_week: day, open_time: '09:00', close_time: '21:00', is_closed: false, ...patch }]);
  };
  return <fieldset disabled={disabled} className="space-y-3">
    <legend className="sr-only">{t('hoursLabel')}</legend>
    {!hours.some(hour => !hour.is_closed) && <p className="rounded-r-md bg-[var(--summary-bg)] p-3 text-sm text-[var(--summary-fg)]">{emptyMessage ?? t('menuNoCustomHours')}</p>}
    {Array.from({ length: 7 }, (_, day) => {
      const hour = hours.find(value => value.day_of_week === day);
      const closed = !hour || hour.is_closed;
      const name = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + day)));
      const overnight = !closed && hour.close_time < hour.open_time;
      return <div key={day} className="rounded-r-md border border-[var(--line)] p-3">
        <div className="flex min-h-11 items-center justify-between gap-3"><span className="text-sm font-semibold">{name}</span><label className="flex min-h-11 items-center gap-2 text-sm selection-row"><input type="checkbox" aria-label={`${t('closed')} · ${name}`} checked={closed} onChange={event => update(day, { is_closed: event.target.checked })} className="size-4" />{t('closed')}</label></div>
        {!closed && <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0"><label htmlFor={`${id}-${day}-open`} className="mb-1 block text-xs text-fg-secondary">{t('startTime')}</label><input id={`${id}-${day}-open`} aria-label={`${t('startTime')} · ${name}`} type="time" required dir="ltr" value={hour.open_time} onChange={event => update(day, { open_time: event.target.value })} className="input min-w-0 w-full px-2 text-sm" /></div>
          <div className="min-w-0"><label htmlFor={`${id}-${day}-close`} className="mb-1 block text-xs text-fg-secondary">{t('endTime')}</label><input id={`${id}-${day}-close`} aria-label={`${t('endTime')} · ${name}`} type="time" required dir="ltr" value={hour.close_time} onChange={event => update(day, { close_time: event.target.value })} className="input min-w-0 w-full px-2 text-sm" /></div>
          {overnight && <p className="col-span-2 text-xs text-fg-secondary">{t('menuOvernightHours')}</p>}
        </div>}
      </div>;
    })}
  </fieldset>;
}

/** Open days require complete times; an overnight range is valid. */
export function menuHoursAreComplete(hours: MenuAvailabilityHour[]): boolean {
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  return hours.every(hour => hour.is_closed || (time.test(hour.open_time) && time.test(hour.close_time)));
}
