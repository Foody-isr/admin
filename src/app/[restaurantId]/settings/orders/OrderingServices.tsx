'use client';

import { useState } from 'react';
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
export default function OrderingServices({ draft, patch, strict, batch, customSlots, timezone, disabled, invalid }: {
  draft: OrderingServicesDraft; patch: (value: Partial<OrderingServicesDraft>) => void;
  strict: boolean; batch: boolean; customSlots?: boolean; timezone: string; disabled: boolean; invalid?: string;
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Channel>('pickup');
  const channels = ['pickup', 'delivery'] as const;
  const invalidChannel = invalid?.split('-')[1] as Channel | undefined;
  const active: Channel[] = channels.filter(channel => draft[`${channel}_enabled`] || channel === invalidChannel);
  const effectiveTab = invalidChannel && active.includes(invalidChannel) ? invalidChannel : active.includes(tab) ? tab : active[0] ?? 'pickup';
  const label = (channel: Channel) => t(channel === 'dine_in' ? 'dineIn' : channel);
  return <>
    <Section title={t('orderModesTitle')} desc={t('intakeServicesDesc')}>
      <div className="choice-group">{channels.map(channel => <ServiceToggle key={channel} label={label(channel)}
        sub={t(channel === 'pickup' ? 'pickupServiceDesc' : 'deliveryServiceDesc')}
        checked={draft[`${channel}_enabled`]} disabled={disabled} onChange={value => patch({ [`${channel}_enabled`]: value })} />)}</div>
      {!active.length && <p className="mt-4 text-sm text-[var(--fg-muted)]">{t('availabilityNoClassicModes')}</p>}
    </Section>
    {strict && batch ? <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{t('intakeBatchHoursOnly')}</p> : <Section title={t(strict ? 'intakeReceivingHours' : 'openingHours')} desc={t(customSlots ? 'intakeCustomSlotDays' : strict ? 'intakeReceivingHoursDesc' : batch ? 'intakeMixedHoursDesc' : 'openingHoursDesc')}>
      <p className="mb-4 text-sm text-[var(--fg-muted)]">{t('availabilityTimezoneHint')} <bdi>{timezone || t('availabilityTimezoneUnknown')}</bdi></p>
      {!active.length ? <p className="text-sm text-[var(--fg-muted)]">{t('noServiceEnabledHoursBanner')}</p> : <>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('openingHours')}>{active.map(channel => <Button key={channel} type="button" variant={channel === effectiveTab ? 'primary' : 'secondary'} aria-pressed={channel === effectiveTab} disabled={disabled} onClick={() => setTab(channel)}>{label(channel)}</Button>)}</div>
        <WeeklyServiceHours channel={effectiveTab} draft={draft} patch={patch} customSlots={customSlots} disabled={disabled} invalid={invalid} />
      </>}
    </Section>}
  </>;
}

/** Keeps table-service settings separate from the online preorder calendar. */
export function DineInSettings({ draft, patch, timezone, disabled, invalid }: {
  draft: OrderingServicesDraft; patch: (value: Partial<OrderingServicesDraft>) => void;
  timezone: string; disabled: boolean; invalid?: string;
}) {
  const { t } = useI18n();
  return <div id="intake-dine-in"><Section title={t('intakeDineInSettings')} desc={t('intakeDineInIndependent')}>
      <ServiceToggle label={t('dineIn')} sub={t('dineInServiceDesc')} checked={draft.dine_in_enabled} disabled={disabled} onChange={dine_in_enabled => patch({ dine_in_enabled })} />
      {(draft.dine_in_enabled || invalid?.startsWith('intake-dine_in-')) && <div className="mt-4">
        <p className="mb-4 text-sm text-[var(--fg-muted)]">{t('availabilityTimezoneHint')} <bdi>{timezone || t('availabilityTimezoneUnknown')}</bdi></p>
        <WeeklyServiceHours channel="dine_in" draft={draft} patch={patch} disabled={disabled} invalid={invalid} />
      </div>}
    </Section></div>;
}

function WeeklyServiceHours({ channel, draft, patch, customSlots, disabled, invalid }: {
  channel: Channel; draft: OrderingServicesDraft; patch: (value: Partial<OrderingServicesDraft>) => void;
  customSlots?: boolean; disabled: boolean; invalid?: string;
}) {
  const { t } = useI18n();
  const label = t(channel === 'dine_in' ? 'dineIn' : channel);
  const weekly = Object.fromEntries(DAYS.map(day => [day, draft.opening_hours_config?.[channel]?.[day] ?? { ...DEFAULT_DAY }])) as WeeklyHours;
  const editDay = (day: typeof DAYS[number], value: Partial<DayHours>) => patch({ opening_hours_config: {
    ...draft.opening_hours_config, [channel]: { ...weekly, [day]: { ...weekly[day], ...value } },
  } });
  return <>
    {DAYS.some(day => !draft.opening_hours_config?.[channel]?.[day]) && <p className="mb-4 text-sm text-[var(--fg-muted)]">{t('availabilityProposedHours')}</p>}
    <div className="divide-y divide-[var(--line)]">{DAYS.map(day => {
          const value = weekly[day];
          return <fieldset key={day} disabled={disabled} className="grid gap-3 py-3 sm:grid-cols-[minmax(8rem,1fr)_2fr]" aria-label={`${label} · ${t(day)}`}>
            <legend className="sr-only">{label} · {t(day)}</legend>
            <div><p className="text-sm font-semibold">{t(day)}</p><label className="mt-2 flex min-h-9 items-center gap-2 text-sm selection-row"><input type="checkbox" className="size-4 accent-[var(--action)]" checked={value.closed} onChange={event => editDay(day, { closed: event.target.checked })} />{t('closedLabel')}</label></div>
            {!value.closed && !customSlots && <div className="grid grid-cols-2 gap-3">{(['open', 'close'] as const).map(field => {
              const id = `intake-${channel}-${day}-${field}`;
              return <Field key={field} label={t(field === 'open' ? 'availabilityFrom' : 'availabilityUntil')}><Input id={id} type="time" dir="ltr" value={value[field]} aria-label={`${label} · ${t(day)} · ${t(field === 'open' ? 'availabilityFrom' : 'availabilityUntil')}`} aria-invalid={invalid === id || undefined} aria-describedby={invalid === id ? 'preorder-validation' : undefined} onChange={event => editDay(day, { [field]: event.target.value })} className="min-w-0" /></Field>;
            })}</div>}
          </fieldset>;
    })}</div>
  </>;
}
