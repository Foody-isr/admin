'use client';

import { useState } from 'react';
import Link from 'next/link';
import { type Restaurant, type OpeningHoursConfig, type DayHours, type WeeklyHours } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, Field, Input, Section } from '@/components/ds';
import { ServiceToggle } from './_components';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const CHANNELS = ['pickup', 'delivery', 'dine_in'] as const;
type Channel = typeof CHANNELS[number];
export type OrderingServicesDraft = Pick<Restaurant, 'pickup_enabled' | 'delivery_enabled' | 'dine_in_enabled' | 'opening_hours_config'>;
const DEFAULT_DAY: DayHours = { open: '09:00', close: '22:00', closed: false };

/** Reads the service settings without initializing absent weekly hours. */
export function orderingServicesFrom(value: OrderingServicesDraft): OrderingServicesDraft {
  if (CHANNELS.some(channel => typeof value[`${channel}_enabled`] !== 'boolean')) throw new Error('Incomplete ordering services');
  return { pickup_enabled: value.pickup_enabled, delivery_enabled: value.delivery_enabled, dine_in_enabled: value.dine_in_enabled, opening_hours_config: value.opening_hours_config };
}

/** Returns the first changed invalid time, leaving historical untouched data alone. */
export function invalidOrderingHours(current?: OpeningHoursConfig, baseline?: OpeningHoursConfig): string | null {
  for (const channel of CHANNELS) for (const day of DAYS) {
    const value = current?.[channel]?.[day];
    if (!value || value.closed || JSON.stringify(value) === JSON.stringify(baseline?.[channel]?.[day])) continue;
    for (const field of ['open', 'close'] as const) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value[field])) return `intake-${channel}-${day}-${field}`;
  }
  return null;
}

/** Shows only the services and weekly hours used by the selected ordering policy. */
export default function OrderingServices({ rid, draft, patch, strict, batch, customSlots, timezone, disabled, invalid }: {
  rid: number; draft: OrderingServicesDraft; patch: (value: Partial<OrderingServicesDraft>) => void;
  strict: boolean; batch: boolean; customSlots?: boolean; timezone: string; disabled: boolean; invalid?: string;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Channel>('pickup');
  const channels = CHANNELS.filter(channel => !strict || channel !== 'dine_in');
  const invalidChannel = invalid?.split('-')[1] as Channel | undefined;
  const active = channels.filter(channel => draft[`${channel}_enabled`] || channel === invalidChannel);
  const effectiveTab = invalidChannel && active.includes(invalidChannel) ? invalidChannel : active.includes(tab) ? tab : active[0] ?? 'pickup';
  const weekly = Object.fromEntries(DAYS.map(day => [day, draft.opening_hours_config?.[effectiveTab]?.[day] ?? { ...DEFAULT_DAY }])) as WeeklyHours;
  const label = (channel: Channel) => t(channel === 'dine_in' ? 'dineIn' : channel);
  const editDay = (day: typeof DAYS[number], value: Partial<DayHours>) => patch({ opening_hours_config: {
    ...draft.opening_hours_config, [effectiveTab]: { ...weekly, [day]: { ...weekly[day], ...value } },
  } });
  return <>
    <Section title={t('orderModesTitle')} desc={t('intakeServicesDesc')}>
      <div className="choice-group">{channels.map(channel => <ServiceToggle key={channel} label={label(channel)}
        sub={t(channel === 'dine_in' ? 'dineInServiceDesc' : channel === 'pickup' ? 'pickupServiceDesc' : 'deliveryServiceDesc')}
        checked={draft[`${channel}_enabled`]} disabled={disabled} onChange={value => patch({ [`${channel}_enabled`]: value })} />)}</div>
      {strict && <p className="mt-4 text-sm leading-6 text-[var(--fg-muted)]">{t('intakeDineInIndependent')} <Link href={`/${rid}/settings/orders/availability`} className="underline">{t('intakeDineInSettings')}</Link></p>}
      {!active.length && <p className="mt-4 text-sm text-[var(--fg-muted)]">{t('availabilityNoClassicModes')}</p>}
    </Section>
    {strict && batch ? <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{t('intakeBatchHoursOnly')}</p> : <Section title={t(strict ? 'intakeReceivingHours' : 'openingHours')} desc={t(customSlots ? 'intakeCustomSlotDays' : strict ? 'intakeReceivingHoursDesc' : batch ? 'intakeMixedHoursDesc' : 'openingHoursDesc')}>
      <p className="mb-4 text-sm text-[var(--fg-muted)]">{t('availabilityTimezoneHint')} <bdi>{timezone || t('availabilityTimezoneUnknown')}</bdi></p>
      {!active.length ? <p className="text-sm text-[var(--fg-muted)]">{t('noServiceEnabledHoursBanner')}</p> : <>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('openingHours')}>{active.map(channel => <Button key={channel} type="button" variant={channel === effectiveTab ? 'primary' : 'secondary'} aria-pressed={channel === effectiveTab} onClick={() => setTab(channel)}>{label(channel)}</Button>)}</div>
        {DAYS.some(day => !draft.opening_hours_config?.[effectiveTab]?.[day]) && <p className="mb-4 text-sm text-[var(--fg-muted)]">{t('availabilityProposedHours')}</p>}
        <div className="divide-y divide-[var(--line)]">{DAYS.map(day => {
          const value = weekly[day];
          return <fieldset key={day} disabled={disabled} className="grid gap-3 py-3 sm:grid-cols-[minmax(8rem,1fr)_2fr]" aria-label={`${label(effectiveTab)} · ${t(day)}`}>
            <legend className="sr-only">{label(effectiveTab)} · {t(day)}</legend>
            <div><p className="text-sm font-semibold">{t(day)}</p><label className="mt-2 flex min-h-9 items-center gap-2 text-sm selection-row"><input type="checkbox" className="size-4 accent-[var(--action)]" checked={value.closed} onChange={event => editDay(day, { closed: event.target.checked })} />{t('closedLabel')}</label></div>
            {!value.closed && (!customSlots || effectiveTab === 'dine_in') && <div className="grid grid-cols-2 gap-3">{(['open', 'close'] as const).map(field => {
              const id = `intake-${effectiveTab}-${day}-${field}`;
              return <Field key={field} label={t(field === 'open' ? 'availabilityFrom' : 'availabilityUntil')}><Input id={id} type="time" dir="ltr" value={value[field]} aria-invalid={invalid === id || undefined} aria-describedby={invalid === id ? 'preorder-validation' : undefined} onChange={event => editDay(day, { [field]: event.target.value })} className="min-w-0" /></Field>;
            })}</div>}
          </fieldset>;
        })}</div>
      </>}
    </Section>}
  </>;
}
