'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getRestaurant, getRestaurantSettings, updateRestaurant, type Restaurant, type OpeningHoursConfig, type DayHours, type WeeklyHours } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { clampWeekStartDay, getEffectiveWorkdays } from '@/lib/weeks';
import { Button, ConfirmDialog, Field, Input, Section, Select } from '@/components/ds';
import { SettingsWorkspace } from '@/components/settings/SettingsWorkspace';
import { ServiceToggle } from './_components';

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const CHANNELS = ['pickup', 'dine_in', 'delivery'] as const;
type Channel = typeof CHANNELS[number];
type Day = typeof DAYS[number];
type Draft = Pick<Restaurant, 'pickup_enabled' | 'dine_in_enabled' | 'delivery_enabled' | 'catering_only' | 'opening_hours_config' | 'week_start_day' | 'workdays'>;
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const DEFAULT_DAY: DayHours = { open: '09:00', close: '22:00', closed: false };
function draftFrom(restaurant: Restaurant): Draft {
  if (CHANNELS.some(channel => typeof restaurant[`${channel}_enabled`] !== 'boolean')) throw new Error('Incomplete availability settings');
  return { pickup_enabled: restaurant.pickup_enabled, dine_in_enabled: restaurant.dine_in_enabled, delivery_enabled: restaurant.delivery_enabled, catering_only: restaurant.catering_only, opening_hours_config: restaurant.opening_hours_config, week_start_day: restaurant.week_start_day, workdays: restaurant.workdays };
}
function editableHours(config?: OpeningHoursConfig): OpeningHoursConfig {
  const next = { ...config };
  for (const channel of CHANNELS) next[channel] = Object.fromEntries(DAYS.map(day => [day, config?.[channel]?.[day] ?? { ...DEFAULT_DAY }])) as WeeklyHours;
  return next;
}

/** Edit channel availability while preserving unrelated and unset restaurant values. */
export default function AvailabilitySettings() {
  const { restaurantId } = useParams();
  return <AvailabilityWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function AvailabilityWorkspace({ rid }: { rid: number }) {
  const { t } = useI18n(); const router = useRouter();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit'), canCatering = hasAnyPermission('catering.manage');
  const [draft, setDraft] = useState<Draft | null>(null), [baseline, setBaseline] = useState<Draft | null>(null);
  const [timezone, setTimezone] = useState('');
  const [strictBatch, setStrictBatch] = useState(false);
  const [tab, setTab] = useState<Channel>('pickup');
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(false), [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null), [leaving, setLeaving] = useState<string | null>(null);
  const lifetime = useRef({ generation: 0, sequence: 0 }); const lock = useRef(false);
  const dirty = !!draft && !equal(draft, baseline);
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try { const [restaurant, settings] = await Promise.all([getRestaurant(rid), getRestaurantSettings(rid)]), next = draftFrom(restaurant); if (current()) { setDraft(next); setBaseline(next); setTimezone(restaurant.timezone || ''); setStrictBatch(!!settings.preorders_only && !!settings.batch_fulfillment_enabled); } }
    catch { if (current()) setLoadError(true); }
    finally { if (current()) setLoading(false); }
  }, [rid]);
  useEffect(() => { const current = lifetime.current; void load(); return () => { current.generation += 1; }; }, [load]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || lock.current) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: MouseEvent) => {
      if ((!dirty && !lock.current) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || link.origin !== location.origin || link.href === location.href) return;
      event.preventDefault(); event.stopPropagation(); if (!lock.current) setLeaving(link.pathname + link.search + link.hash);
    };
    window.addEventListener('beforeunload', guard); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', guard); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  const patch = (values: Partial<Draft>) => { if (!canEdit || lock.current) return; setDraft(current => current ? { ...current, ...values } : current); setSaved(false); setSaveError(false); setInvalid(null); };
  const channelLabel = (channel: Channel) => t(channel === 'dine_in' ? 'dineIn' : channel);
  const visibleChannels = CHANNELS.filter(channel => !strictBatch || channel === 'dine_in');
  const active = draft ? visibleChannels.filter(channel => draft[`${channel}_enabled`]) : [];
  const effectiveTab = active.includes(tab) ? tab : active[0] ?? tab;
  const hours = editableHours(draft?.opening_hours_config);
  const orderedDays = DAYS.map((_, index) => DAYS[(clampWeekStartDay(draft?.week_start_day) + index) % 7]);
  const proposedHours = CHANNELS.some(channel => DAYS.some(day => !baseline?.opening_hours_config?.[channel]?.[day]));
  const editDay = (day: Day, value: Partial<DayHours>) => patch({ opening_hours_config: { ...hours, [effectiveTab]: { ...hours[effectiveTab], [day]: { ...hours[effectiveTab]![day], ...value } } } });
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!canEdit || !draft || !baseline || !dirty || lock.current || loading || loadError) return;
    if (!equal(draft.opening_hours_config, baseline.opening_hours_config)) {
      for (const channel of CHANNELS) for (const day of DAYS) {
        const value = draft.opening_hours_config?.[channel]?.[day];
        if (!value || value.closed || equal(value, baseline.opening_hours_config?.[channel]?.[day])) continue;
        const field = !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.open) ? 'open' : !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.close) ? 'close' : null;
        if (field) { setTab(channel); const id = `availability-${channel}-${day}-${field}`; setInvalid(id); requestAnimationFrame(() => document.getElementById(id)?.focus()); return; }
      }
    }
    lock.current = true; setSaving(true); setSaveError(false); setSaved(false);
    const generation = lifetime.current.generation, current = () => generation === lifetime.current.generation;
    const input = Object.fromEntries(Object.entries(draft).filter(([key, value]) => !equal(value, baseline[key as keyof Draft]))) as Partial<Restaurant>;
    // A channel-only save must not initialise unconfigured hours or pin automatic workdays.
    if (!canCatering) delete input.catering_only;
    try { const response = await updateRestaurant(rid, input); const next = draftFrom(response); if (current()) { setDraft(next); setBaseline(next); setSaved(true); } }
    catch { if (current()) setSaveError(true); }
    finally { if (current()) { lock.current = false; setSaving(false); } }
  };
  return <SettingsWorkspace title={t('ordersAvailabilityTitle')} description={t('ordersAvailabilityDesc')}>
    {loading ? <p role="status" className="py-10 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('availabilityLoadFailed')}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div> : draft && <form onSubmit={save} noValidate className="space-y-6">
      {!canEdit && <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('pushPreferencesReadOnly')}</p>}
      {strictBatch && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('intakeBatchHoursOnly')} <Link href={`/${rid}/settings/orders`} className="underline">{t('intakeManageOnline')}</Link></p>}
      <Section title={t('orderModesTitle')} desc={t('orderModesDesc')}><div className="grid gap-3 md:grid-cols-2">{visibleChannels.map(channel => <ServiceToggle key={channel} label={channelLabel(channel)} sub={t(channel === 'dine_in' ? 'dineInServiceDesc' : channel === 'pickup' ? 'pickupServiceDesc' : 'deliveryServiceDesc')} checked={draft[`${channel}_enabled`]} disabled={!canEdit || saving} onChange={value => patch({ [`${channel}_enabled`]: value })} />)}{canCatering && <ServiceToggle label={t('cateringOnlyMode')} sub={t('cateringOnlyModeDesc')} checked={draft.catering_only ?? false} disabled={!canEdit || saving} onChange={catering_only => patch({ catering_only })} />}</div>{active.length === 0 && <p className="mt-4 text-sm text-[var(--fg-muted)]">{t('availabilityNoClassicModes')}</p>}</Section>
      <Section title={t('openingHours')} desc={t('openingHoursDesc')}>
        <p className="mb-4 rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{t('availabilityTimezoneHint')} {timezone ? <bdi>{timezone}</bdi> : t('availabilityTimezoneUnknown')}</p>
        {active.length === 0 ? <p className="text-sm text-[var(--fg-muted)]">{t('noServiceEnabledHoursBanner')}</p> : <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('orderModesTitle')}>{active.map(channel => <Button key={channel} type="button" variant={channel === effectiveTab ? 'primary' : 'secondary'} aria-pressed={channel === effectiveTab} disabled={saving} onClick={() => setTab(channel)}>{channelLabel(channel)}</Button>)}</div>
          {proposedHours && <p className="mb-4 text-sm leading-6 text-[var(--fg-muted)]">{t('availabilityProposedHours')}</p>}
          <p className="mb-4 text-sm leading-6 text-[var(--fg-muted)]">{t('availabilityHoursMeaning')}</p>
          <div className="divide-y divide-[var(--line)] rounded-r-md border border-[var(--line)]">{orderedDays.map(day => { const value = hours[effectiveTab]![day]; return <fieldset key={`${effectiveTab}-${day}`} disabled={saving} className="p-4" aria-label={`${channelLabel(effectiveTab)} · ${t(day)}`}><legend className="sr-only">{channelLabel(effectiveTab)} · {t(day)}</legend><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold">{t(day)}</p><label className="flex min-h-9 items-center gap-2 text-sm selection-row"><input type="checkbox" checked={value.closed} disabled={!canEdit || saving} aria-label={`${t('closedLabel')} · ${t(day)}`} onChange={event => editDay(day, { closed: event.target.checked })} className="size-4 accent-[var(--action)]" />{t('closedLabel')}</label></div>{!value.closed && <div className="mt-2 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">{(['open','close'] as const).map(field => { const id = `availability-${effectiveTab}-${day}-${field}`; return <Field key={field} label={t(field === 'open' ? 'availabilityFrom' : 'availabilityUntil')}><Input id={id} type="time" dir="ltr" value={value[field] ?? ''} readOnly={!canEdit || saving} aria-label={`${t(day)} · ${t(field === 'open' ? 'availabilityFrom' : 'availabilityUntil')}`} aria-invalid={invalid === id || undefined} aria-describedby={invalid === id ? 'availability-hours-error' : undefined} onChange={event => editDay(day, { [field]: event.target.value })} className="min-w-0 text-start" /></Field>; })}</div>}</fieldset>; })}</div>
        </>}
      </Section>
      <Section title={t('weekSectionTitle')} desc={t('availabilityWorkdaysHint')}>
        <div className="grid gap-5 sm:grid-cols-2"><Field label={t('weekStartFieldLabel')}><Select value={clampWeekStartDay(draft.week_start_day)} disabled={!canEdit || saving} onChange={event => patch({ week_start_day: Number(event.target.value) })}>{DAYS.map((day,index) => <option key={day} value={index}>{t(day)}</option>)}</Select></Field><Field label={t('workdaysFieldLabel')}><Select value={draft.workdays?.length ? 'custom' : 'auto'} disabled={!canEdit || saving} onChange={event => patch({ workdays: event.target.value === 'auto' ? [] : getEffectiveWorkdays({ ...draft, workdays: [] }) })}><option value="auto">{t('workdaysModeAuto')}</option><option value="custom">{t('workdaysModeCustom')}</option></Select></Field></div>
        {draft.workdays?.length ? <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label={t('workdaysFieldLabel')}>{DAYS.map((day,index) => <Button key={day} type="button" aria-pressed={draft.workdays!.includes(index)} disabled={!canEdit || saving} variant={draft.workdays!.includes(index) ? 'primary' : 'secondary'} onClick={() => patch({ workdays: draft.workdays!.includes(index) ? draft.workdays!.filter(value => value !== index) : [...draft.workdays!,index].sort((a,b) => a-b) })}>{t(day)}</Button>)}</div> : <p className="mt-4 text-sm leading-6 text-[var(--fg-muted)]">{t('workdaysAutoPreview').replace('{days}', getEffectiveWorkdays(draft).map(index => t(DAYS[index])).join(' · '))}</p>}
      </Section>
      {invalid && <p id="availability-hours-error" role="alert" className="text-sm text-[var(--danger-500)]">{channelLabel(invalid.split('-')[1] as Channel)} · {t(invalid.split('-')[2])} : {t('availabilityInvalidTime')}</p>}
      {saveError && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('availabilitySaveFailed')}</p>}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-2"><p role="status" className="text-sm text-[var(--fg-muted)]">{t(saving ? 'saving' : dirty ? 'settingsUnsaved' : saved ? 'saved' : 'settingsUnchanged')}</p>{canEdit && <div className="flex gap-2"><Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => setLeaving('reset')}>{t('reset')}</Button><Button type="submit" disabled={!dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button></div>}</div>
    </form>}
    <ConfirmDialog open={leaving !== null} onOpenChange={open => { if (!open) setLeaving(null); }} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { const target = leaving; setLeaving(null); setDraft(baseline); setInvalid(null); setSaveError(false); setSaved(false); if (target && target !== 'reset') router.push(target); }} />
  </SettingsWorkspace>;
}
