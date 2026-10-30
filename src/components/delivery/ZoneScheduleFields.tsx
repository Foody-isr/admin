'use client';

import { Field, Input, Select } from '@/components/ds';
import { Checkbox } from '@/components/ui/checkbox';
import { useI18n } from '@/lib/i18n';
import { deliveryScheduleWeekdays } from '@/lib/delivery-zone-state';
import type { DeliverySchedule, DeliveryZoneSameDay } from '@/lib/api';

const WEEK = [1, 2, 3, 4, 5, 6, 0];

/** Keeps delivery days and same-day exceptions together, within restaurant hours. */
export function ZoneScheduleFields({ value, onChange, sameDaySupported = false }: { value: DeliverySchedule | null; onChange: (value: DeliverySchedule | null) => void; sameDaySupported?: boolean }) {
  const { t } = useI18n();
  const days = value ? deliveryScheduleWeekdays(value) : WEEK;
  const update = (changes: Partial<DeliverySchedule>) => onChange({ mode: value?.mode ?? 'customer', days, offer_pickup: value?.offer_pickup ?? false, ...(value?.same_day ? { same_day: value.same_day } : {}), ...changes });
  const rule = value?.same_day;
  const patchRule = (changes: Partial<DeliveryZoneSameDay>) => update({ same_day: { days: [...days], transit_minutes: 0, time_mode: 'inherit', ...rule, ...changes } });
  const changeDay = (day: number, checked: boolean) => {
    const next = checked ? [...days, day] : days.filter(d => d !== day);
    update({ days: next, ...(rule ? { same_day: { ...rule, days: rule.days.filter(d => next.includes(d)) } } : {}) });
  };
  return <section className="space-y-6 border-t border-[var(--line)] pt-5">
    <p className="text-fs-sm leading-relaxed text-[var(--fg-muted)]">{t('zoneScheduleHint')}</p>
    <fieldset className="space-y-3">
      <legend className="mb-3 text-fs-sm font-semibold">{t('zoneDeliveryDays')}</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-3">{WEEK.map(day => <label key={day} className="flex items-center gap-2 text-fs-sm"><Checkbox checked={days.includes(day)} onCheckedChange={checked => changeDay(day, checked === true)} /><span>{t(`weekday_${day}`)}</span></label>)}</div>
    </fieldset>
    <Field label={t('zoneFutureTimeChoice')} grow><Select value={value?.mode ?? 'legacy'} onChange={event => event.target.value === 'legacy' ? onChange(null) : update({ mode: event.target.value as DeliverySchedule['mode'] })}>
      {!rule && <option value="legacy">{t('deliveryScheduleLegacy')}</option>}
      <option value="customer">{t('deliveryScheduleCustomer')}</option>
      <option value="automatic">{t('deliveryScheduleAutomatic')}</option>
      <option value="restaurant">{t('deliveryScheduleRestaurant')}</option>
    </Select></Field>
    {sameDaySupported && <fieldset className="space-y-4 border-t border-[var(--line)] pt-5">
      <legend className="px-1 text-fs-md font-semibold">{t('sameDayTitle')}</legend>
      {rule ? <>
        <p className="text-fs-sm leading-relaxed text-[var(--fg-muted)]">{t('zoneSameDayDaysHint')}</p>
        <div className="flex flex-wrap gap-x-5 gap-y-3">{WEEK.map(day => <label key={day} className={`flex items-center gap-2 text-fs-sm ${!days.includes(day) ? 'text-[var(--fg-muted)]' : ''}`}><Checkbox disabled={!days.includes(day)} checked={rule.days.includes(day)} onCheckedChange={checked => patchRule({ days: checked ? [...rule.days, day] : rule.days.filter(d => d !== day) })} /><span>{t(`weekday_${day}`)}</span></label>)}</div>
        {!rule.days.length ? <p className="text-fs-sm font-medium">{t('zoneSameDayNever')}</p> : <>
          <Field label={t('sameDayTimeMode')} grow><Select value={rule.time_mode} onChange={event => patchRule({ time_mode: event.target.value as DeliveryZoneSameDay['time_mode'] })}>
            <option value="inherit">{t('zoneSameDayTimeInherit')}</option><option value="restaurant">{t('sameDayTimeRestaurant')}</option>
          </Select></Field>
          <Field label={t('zoneSameDayTransit')} grow><Input type="number" min="0" max="1440" step="1" dir="ltr" value={Number.isFinite(rule.transit_minutes) ? rule.transit_minutes : ''} onChange={event => patchRule({ transit_minutes: event.target.value === '' ? NaN : Number(event.target.value) })} /></Field>
          <p className="text-fs-sm leading-relaxed text-[var(--fg-muted)]">{t('zoneSameDayEstimateHint')}</p>
        </>}
      </> : <label className="flex items-start gap-3 text-fs-sm"><Checkbox checked={false} onCheckedChange={() => patchRule({})} /><span>{t('zoneSameDayCustomize')}<span className="mt-1 block text-[var(--fg-muted)]">{t('zoneSameDayInherited')}</span></span></label>}
    </fieldset>}
    {value && <label className="flex items-center gap-3 text-fs-sm"><Checkbox checked={value.offer_pickup} onCheckedChange={checked => update({ offer_pickup: checked === true })} /><span>{t('deliveryOfferPickup')}</span></label>}
  </section>;
}
