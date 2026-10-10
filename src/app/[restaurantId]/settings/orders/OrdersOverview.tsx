'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ListChecks, PauseCircle, Settings2 } from 'lucide-react';
import { getRestaurant, getRestaurantSettings, getBatchFulfillmentConfig, type BatchFulfillmentConfigResponse, updateRestaurantSettings, type Restaurant, type RestaurantSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, ConfirmDialog, Field, Input, Section, Select } from '@/components/ds';
import { SettingsWorkspace } from '@/components/settings/SettingsWorkspace';
import { Switch } from './_components';

const CHANNELS = ['pickup','dine_in','delivery'] as const;
const DAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
type PauseDraft = { mode: 'manual' | 'time'; until: string };
function localInput(raw?: string | null): string {
  if (!raw) return '';
  const date = new Date(raw), pad = (n: number) => String(n).padStart(2,'0');
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}` : '';
}
function pauseDraft(settings: RestaurantSettings): PauseDraft { return { mode: settings.orders_paused_until ? 'time' : 'manual', until: localInput(settings.orders_paused_until) }; }
function timezoneOf(restaurant: Restaurant): string {
  // Mirrors the documented platform fallback in foodyserver/internal/common/timezone.go.
  try { const timezone = restaurant.timezone?.trim() || 'Asia/Jerusalem'; new Intl.DateTimeFormat('en', { timeZone: timezone }); return timezone; }
  catch { return 'Asia/Jerusalem'; }
}
function openBySchedule(restaurant: Restaurant, channel: typeof CHANNELS[number], now: number): boolean | null {
  if (!restaurant[`${channel}_enabled`]) return false;
  if (!restaurant.opening_hours_config) return true;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: timezoneOf(restaurant), weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(part => [part.type,part.value]));
  const day = parts.weekday.toLowerCase() as typeof DAYS[number], hours = restaurant.opening_hours_config[channel]?.[day];
  if (hours?.closed) return false;
  const open = hours?.open ?? '', close = hours?.close ?? '';
  if (open === close) return true;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(open) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(close)) return null;
  const time = `${parts.hour}:${parts.minute}`;
  // The backend compares the current day's row, with an exclusive closing time.
  return close < open ? time >= open || time < close : time >= open && time < close;
}
function checkSettings(settings: RestaurantSettings): RestaurantSettings {
  if (typeof settings.orders_paused !== 'boolean' || typeof settings.rush_mode !== 'boolean' || typeof settings.scheduling_enabled !== 'boolean' || typeof settings.batch_fulfillment_enabled !== 'boolean' || (settings.orders_paused_until != null && settings.orders_paused_until !== '' && !Number.isFinite(Date.parse(settings.orders_paused_until)))) throw new Error('Incomplete ordering status');
  return settings;
}

/** Review ordering availability and explicitly apply pause or reopening changes. */
export default function OrdersOverview({ embedded = false, latestOrdering = null }: { embedded?: boolean; latestOrdering?: RestaurantSettings | null }) {
  const { restaurantId } = useParams();
  return <OverviewWorkspace key={String(restaurantId)} rid={Number(restaurantId)} embedded={embedded} latestOrdering={latestOrdering} />;
}
function OverviewWorkspace({ rid, embedded, latestOrdering }: { rid: number; embedded: boolean; latestOrdering: RestaurantSettings | null }) {
  const { t, locale } = useI18n(); const router = useRouter(); const { hasAnyPermission } = usePermissions(); const canEdit = hasAnyPermission('settings.edit');
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null), [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [draft, setDraft] = useState<PauseDraft>({ mode: 'manual', until: '' });
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false), [saveError, setSaveError] = useState(false);
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false), [invalid, setInvalid] = useState(false), [leaving, setLeaving] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const [batch, setBatch] = useState<BatchFulfillmentConfigResponse | null>(null);
  const [batchError, setBatchError] = useState(false);
  useEffect(() => {
    if (!latestOrdering) return;
    // Refresh ordering facts without discarding an unfinished pause/reopening draft.
    setSettings(current => current ? { ...current, preorders_only: latestOrdering.preorders_only, scheduling_enabled: latestOrdering.scheduling_enabled, batch_fulfillment_enabled: latestOrdering.batch_fulfillment_enabled } : current);
    setRestaurant(current => current ? { ...current, pickup_enabled: latestOrdering.pickup_enabled ?? current.pickup_enabled, delivery_enabled: latestOrdering.delivery_enabled ?? current.delivery_enabled, dine_in_enabled: latestOrdering.dine_in_enabled ?? current.dine_in_enabled, opening_hours_config: latestOrdering.opening_hours_config } : current);
  }, [latestOrdering]);
  const lock = useRef(false), lifetime = useRef({ generation: 0, sequence: 0 });
  const dirty = !!settings && JSON.stringify(draft) !== JSON.stringify(pauseDraft(settings));
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try { const [restaurant, response] = await Promise.all([getRestaurant(rid), getRestaurantSettings(rid)]), settings = checkSettings(response); if (CHANNELS.some(channel => typeof restaurant[`${channel}_enabled`] !== 'boolean')) throw new Error('Incomplete channels'); if (current()) { setRestaurant(restaurant); setSettings(settings); setDraft(pauseDraft(settings)); setSaveError(false); setInvalid(false); setSaved(false); setNow(Date.now()); } }
    catch { if (current()) setLoadError(true); }
    finally { if (current()) setLoading(false); }
  }, [rid]);
  useEffect(() => { const current = lifetime.current; void load(); return () => { current.generation += 1; }; }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!settings?.batch_fulfillment_enabled) { setBatch(null); return; }
    let current = true;
    const refresh = () => { void getBatchFulfillmentConfig(rid).then(value => {
      if (typeof value.enabled !== 'boolean' || (value.enabled && (!Number.isFinite(Date.parse(value.current_batch_open_at)) || !Number.isFinite(Date.parse(value.current_batch_cutoff))))) throw new Error('Incomplete batch status');
      if (current) { setBatch(value); setBatchError(false); }
    }).catch(() => { if (current) { setBatch(null); setBatchError(true); } }); };
    refresh(); const timer = window.setInterval(refresh, 60000);
    return () => { current = false; clearInterval(timer); };
  }, [rid, settings?.batch_fulfillment_enabled, latestOrdering]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || lock.current) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: MouseEvent) => {
      if ((!dirty && !lock.current) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || link.origin !== location.origin || link.href === location.href) return;
      event.preventDefault(); event.stopPropagation(); if (!lock.current) setLeaving(link.pathname + link.search + link.hash);
    };
    window.addEventListener('beforeunload',guard); document.addEventListener('click',navigate,true); return () => { window.removeEventListener('beforeunload',guard); document.removeEventListener('click',navigate,true); };
  }, [dirty]);
  const paused = !!settings && (settings.rush_mode || (!!settings.orders_paused && (!settings.orders_paused_until || Date.parse(settings.orders_paused_until) > now)));
  const patch = (value: Partial<PauseDraft>) => { if (!canEdit || lock.current) return; setDraft(current => ({ ...current, ...value })); setInvalid(false); setSaved(false); setSaveError(false); };
  const apply = async (paused: boolean, schedule: PauseDraft) => {
    if (!canEdit || !settings || lock.current) return;
    const time = new Date(schedule.until).getTime();
    if (paused && schedule.mode === 'time' && (!schedule.until || !Number.isFinite(time) || time <= Date.now() || localInput(new Date(time).toISOString()) !== schedule.until)) { setInvalid(true); document.getElementById('orders-reopen')?.focus(); return; }
    lock.current = true; setSaving(true); setSaveError(false); setSaved(false);
    const generation = lifetime.current.generation, current = () => generation === lifetime.current.generation;
    try { const response = checkSettings(await updateRestaurantSettings(rid, { orders_paused: paused, orders_paused_until: paused && schedule.mode === 'time' ? new Date(time).toISOString() : '', rush_mode: false })); if (current()) { setSettings(response); setDraft(pauseDraft(response)); setSaved(true); setNow(Date.now()); setInvalid(false); } }
    catch { if (current()) setSaveError(true); }
    finally { if (current()) { lock.current = false; setSaving(false); } }
  };
  const destinations = [
    { id: 'processing', title: 'ordersProcessingTitle', desc: 'ordersProcessingDesc', icon: Settings2 },
    { id: 'workflow', title: 'orderWorkflow', desc: 'ordersWorkflowDesc', icon: ListChecks },
  ];
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const batchOpen = !!batch?.enabled && Date.parse(batch.current_batch_open_at) <= now && now < Date.parse(batch.current_batch_cutoff);
  const batchDate = (value: string) => new Intl.DateTimeFormat(locale, { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: restaurant ? timezoneOf(restaurant) : 'Asia/Jerusalem' }).format(new Date(value));
  const content = <>
    {loading ? <p role="status" className="py-10 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('ordersLoadError')}</p><Button onClick={() => void load()}>{t('retry')}</Button></div> : restaurant && settings && <div className="space-y-6">
      <Section role="region" aria-label={t('ordersCurrentStatus')} title={t('ordersCurrentStatus')}>
        <div className="rounded-r-lg bg-[var(--summary-bg)] p-5 text-[var(--summary-fg)]"><p className="text-xl font-semibold">{t(paused ? 'ordersPausedBadge' : 'ordersPauseInactive')}</p><p className="mt-2 text-sm leading-6">{t(paused ? 'ordersPausedBannerDesc' : 'ordersStatusScopeHint')}</p>{paused && settings.orders_paused_until && !settings.rush_mode && <p className="mt-3 text-sm font-medium">{t('pauseUntilWhen')} : <bdi>{new Intl.DateTimeFormat(locale,{ dateStyle: 'medium',timeStyle: 'short',timeZone: timezoneOf(restaurant) }).format(new Date(settings.orders_paused_until))}</bdi> · <bdi>{timezoneOf(restaurant)}</bdi></p>}</div>
        {settings.batch_fulfillment_enabled && <div className="mt-4 rounded-r-md bg-[var(--summary-bg)] p-4"><p className="font-semibold">{t(paused ? 'ordersPausedBadge' : batchError ? 'intakeBatchStatusError' : !batch ? 'loading' : !batch.enabled ? 'intakeBatchIncomplete' : batchOpen ? 'intakeBatchOpen' : 'intakeBatchClosed')}</p>{batch?.enabled && <p className="mt-2 text-sm">{t(batchOpen ? 'intakeClosesAt' : 'intakeOpensAt')} <bdi>{batchDate(batchOpen ? batch.current_batch_cutoff : now < Date.parse(batch.current_batch_open_at) ? batch.current_batch_open_at : batch.next_batch_open_at)}</bdi></p>}</div>}
        <p className="my-4 text-sm leading-6 text-[var(--fg-muted)]">{t(settings.preorders_only ? 'intakeStatusScope' : 'ordersHoursScopeHint')} · <bdi>{timezoneOf(restaurant)}</bdi></p>
        <dl className="grid gap-3 sm:grid-cols-3">{CHANNELS.filter(channel => !settings.preorders_only || channel !== 'dine_in').map(channel => { const open = openBySchedule(restaurant,channel,now); return <div key={channel} className="min-w-0 rounded-r-md border border-[var(--line)] p-4"><dt className="text-sm text-[var(--fg-muted)]">{t(channel === 'dine_in' ? 'dineIn' : channel)}</dt><dd className="mt-2 text-base font-semibold">{t(!restaurant[`${channel}_enabled`] ? 'ordersProcessingInactive' : paused ? 'ordersPausedBadge' : settings.preorders_only ? settings.batch_fulfillment_enabled ? 'intakeBatchCalendar' : 'intakeReservation' : open === null ? 'ordersHoursUnknown' : open ? 'openNow' : 'closedNow')}</dd></div>; })}</dl>
        <p className="mt-4 text-sm text-[var(--fg-muted)]">{t('preorderTitle')} : {t(settings.batch_fulfillment_enabled ? 'preorderModeBatch' : settings.scheduling_enabled ? 'preorderModeSlots' : 'preorderModeOff')}</p>
      </Section>
      <Section title={t('pauseSectionTitle')}>
        {!canEdit && <p className="mb-4 text-sm text-[var(--fg-muted)]">{t('pushPreferencesReadOnly')}</p>}
        <div className="flex items-start justify-between gap-4"><div><p className="flex items-center gap-2 text-sm font-semibold"><PauseCircle className="size-4 shrink-0" aria-hidden="true" />{t('pauseOnlineOrders')}</p><p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">{t('ordersPauseActionHint')}</p></div><Switch checked={paused} disabled={!canEdit || saving} label={t('pauseOnlineOrders')} onChange={value => void apply(value, { mode: 'manual', until: '' })} /></div>
        {(settings.orders_paused || settings.rush_mode || dirty) && <form className="mt-5 space-y-4 border-t border-[var(--line)] pt-5" onSubmit={event => { event.preventDefault(); void apply(true,draft); }} noValidate>
          {!paused && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('ordersExpiredPauseDraft')}</p>}
          <Field label={t('pauseUntilLabel')}><Select value={draft.mode} disabled={!canEdit || saving} onChange={event => patch({ mode: event.target.value as PauseDraft['mode'] })}><option value="manual">{t('pauseUntilManual')}</option><option value="time">{t('pauseUntilTime')}</option></Select></Field>
          {draft.mode === 'time' && <><Field label={t('pauseUntilWhen')}><Input id="orders-reopen" type="datetime-local" dir="ltr" value={draft.until} readOnly={!canEdit || saving} aria-invalid={invalid || undefined} aria-describedby="orders-reopen-hint" onChange={event => patch({ until: event.target.value })} /></Field><p id="orders-reopen-hint" className="text-sm leading-6 text-[var(--fg-muted)]">{t('ordersReopenDeviceZone')} <bdi>{browserZone}</bdi></p></>}
          {invalid && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('ordersReopenInvalid')}</p>}
          <p className="text-sm text-[var(--fg-muted)]">{t('ordersReopenExplicit')}</p>
          {canEdit && <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => setLeaving('reset')}>{t('reset')}</Button><Button type="submit" disabled={!dirty || saving}>{t('ordersApplyReopening')}</Button></div>}
        </form>}
        {saveError && <div role="alert" className="mt-4 space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('ordersPauseUnconfirmed')}</p><Button variant="secondary" onClick={() => { if (dirty) setLeaving('reload'); else void load(); }}>{t('ordersRefreshStatus')}</Button></div>}
        <p role="status" className="mt-4 text-sm text-[var(--fg-muted)]">{t(saving ? 'saving' : dirty ? 'settingsUnsaved' : saved ? 'saved' : 'settingsUnchanged')}</p>
      </Section>
      <div className="grid gap-4 md:grid-cols-2">{destinations.map(({id,title,desc,icon:Icon}) => <Link key={id} href={`/${rid}/settings/orders/${id}`} className="group rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5 transition-colors hover:border-[var(--brand-ink)]"><Icon className="mb-3 size-5 text-[var(--brand-ink)]" aria-hidden="true" /><h2 className="text-base font-semibold">{t(title)}</h2><p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">{t(desc)}</p></Link>)}</div>
    </div>}
    <ConfirmDialog open={leaving !== null} onOpenChange={open => { if (!open) setLeaving(null); }} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { const target = leaving; setLeaving(null); if (settings) setDraft(pauseDraft(settings)); setInvalid(false); if (target === 'reload') void load(); else if (target && target !== 'reset') router.push(target); }} />
  </>;
  return embedded ? content : <SettingsWorkspace title={t('ordersAndAvailability')} description={t('ordersHubDesc')}>{content}</SettingsWorkspace>;
}
