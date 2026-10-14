'use client';

import { Button, Field, Input, Select } from '@/components/ds';
import { Checkbox } from '@/components/ui/checkbox';
import { useI18n } from '@/lib/i18n';
import type { DeliverySchedule } from '@/lib/api';

/** Edit the route calendar without changing the restaurant's pickup calendar. */
export function ZoneScheduleFields({ value, onChange }: { value: DeliverySchedule | null; onChange: (value: DeliverySchedule | null) => void }) {
  const { t, locale } = useI18n();
  const label = (day: number) => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 11 + day)));
  return <section className="space-y-5 border-t border-[var(--line)] pt-5">
    <Field label={t('deliveryScheduleTitle')} grow><Select value={value?.mode ?? 'legacy'} onChange={event => onChange(event.target.value === 'legacy' ? null : { mode: event.target.value as DeliverySchedule['mode'], windows: value?.windows ?? [{ days: [], start: '14:00', end: '18:00' }], offer_pickup: value?.offer_pickup ?? false })}>
      <option value="legacy">{t('deliveryScheduleLegacy')}</option>
      <option value="customer">{t('deliveryScheduleCustomer')}</option>
      <option value="automatic">{t('deliveryScheduleAutomatic')}</option>
      <option value="restaurant">{t('deliveryScheduleRestaurant')}</option>
    </Select></Field>
    {value && <>
      <p className="text-fs-sm text-[var(--fg-muted)]">{t(value.mode === 'restaurant' ? 'deliverySchedulePendingHint' : 'zoneScheduleHint')}</p>
      {value.windows.map((window, index) => <fieldset key={index} className="space-y-4 rounded-r-lg border border-[var(--line)] p-4">
        <legend className="px-1 text-fs-sm font-semibold">{t('deliveryWindow')} {index + 1}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-3">{[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day} className="flex items-center gap-2 text-fs-sm"><Checkbox checked={window.days.includes(day)} onCheckedChange={checked => onChange({ ...value, windows: value.windows.map((row, i) => i === index ? { ...row, days: checked ? [...row.days, day] : row.days.filter(d => d !== day) } : row) })} /><span>{label(day)}</span></label>)}</div>
        <div className="grid grid-cols-2 gap-3">{(['start', 'end'] as const).map(key => <Field key={key} label={t(key === 'start' ? 'zoneWindowStart' : 'zoneWindowEnd')} grow><Input type="time" dir="ltr" value={window[key]} onChange={event => onChange({ ...value, windows: value.windows.map((row, i) => i === index ? { ...row, [key]: event.target.value } : row) })} /></Field>)}</div>
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...value, windows: value.windows.filter((_, i) => i !== index) })}>{t('remove')}</Button>
      </fieldset>)}
      <Button variant="secondary" size="sm" disabled={value.windows.length >= 28} onClick={() => onChange({ ...value, windows: [...value.windows, { days: [], start: '14:00', end: '18:00' }] })}>{t('deliveryAddWindow')}</Button>
      <label className="flex items-center gap-3 text-fs-sm"><Checkbox checked={value.offer_pickup} onCheckedChange={checked => onChange({ ...value, offer_pickup: checked === true })} /><span>{t('deliveryOfferPickup')}</span></label>
    </>}
  </section>;
}
