'use client';

import { Field, Select } from '@/components/ds';
import { Checkbox } from '@/components/ui/checkbox';
import { useI18n } from '@/lib/i18n';
import { deliveryScheduleWeekdays } from '@/lib/delivery-zone-state';
import type { DeliverySchedule } from '@/lib/api';

/** Select zone weekdays while the restaurant controls delivery hours and slots. */
export function ZoneScheduleFields({ value, onChange }: { value: DeliverySchedule | null; onChange: (value: DeliverySchedule | null) => void }) {
  const { t, locale } = useI18n();
  const days = value ? deliveryScheduleWeekdays(value) : [];
  const update = (changes: Partial<DeliverySchedule>) => onChange({ mode: value!.mode, days, offer_pickup: value!.offer_pickup, ...changes });
  const label = (day: number) => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 11 + day)));
  return <section className="space-y-5 border-t border-[var(--line)] pt-5">
    <Field label={t('deliveryScheduleTitle')} grow><Select value={value?.mode ?? 'legacy'} onChange={event => onChange(event.target.value === 'legacy' ? null : { mode: event.target.value as DeliverySchedule['mode'], days, offer_pickup: value?.offer_pickup ?? false })}>
      <option value="legacy">{t('deliveryScheduleLegacy')}</option>
      <option value="customer">{t('deliveryScheduleCustomer')}</option>
      <option value="automatic">{t('deliveryScheduleAutomatic')}</option>
      <option value="restaurant">{t('deliveryScheduleRestaurant')}</option>
    </Select></Field>
    {value && <>
      <p className="text-fs-sm text-[var(--fg-muted)]">{t('zoneScheduleHint')}</p>
      <fieldset className="space-y-4">
        <legend className="mb-3 text-fs-sm font-semibold">{t('zoneDeliveryDays')}</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-3">{[1, 2, 3, 4, 5, 6, 0].map(day => <label key={day} className="flex items-center gap-2 text-fs-sm"><Checkbox checked={days.includes(day)} onCheckedChange={checked => update({ days: checked ? [...days, day] : days.filter(d => d !== day) })} /><span>{label(day)}</span></label>)}</div>
      </fieldset>
      {value.mode === 'restaurant' && <p className="text-fs-sm text-[var(--fg-muted)]">{t('deliverySchedulePendingHint')}</p>}
      <label className="flex items-center gap-3 text-fs-sm"><Checkbox checked={value.offer_pickup} onCheckedChange={checked => update({ offer_pickup: checked === true })} /><span>{t('deliveryOfferPickup')}</span></label>
    </>}
  </section>;
}
