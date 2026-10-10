'use client';

import { BooleanInput } from '@/components/ds/Selection';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Bell, BellOff, CreditCard, Monitor, PackageX, ShoppingCart, Smartphone, Trash2, XCircle } from 'lucide-react';
import { Badge, Button, ConfirmDialog, PageHead, Section } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  getCurrentSubscription, getEnvironment, getNotificationPreferences, listDevices,
  removeDevice, sendTestPush, subscribe, unsubscribe, unsubscribeLocally,
  updateNotificationPreferences, PushClientError, PushUnsubscribeError,
  type NotificationPreferences, type PushDevice, type PushEnvironment,
} from '@/lib/push';

type Resource = 'browser' | 'preferences' | 'devices';
type PrefKey = 'new_order_enabled' | 'order_canceled_enabled' | 'payment_failure_enabled' | 'low_stock_enabled';
// big_order_enabled has no separate Web Push trigger; do not advertise it here.
const EVENTS = [
  { key: 'new_order_enabled', title: 'prefNewOrderTitle', desc: 'prefNewOrderDesc', icon: ShoppingCart },
  { key: 'order_canceled_enabled', title: 'prefOrderCanceledTitle', desc: 'prefOrderCanceledDesc', icon: XCircle },
  { key: 'payment_failure_enabled', title: 'prefPaymentFailureTitle', desc: 'prefPaymentFailureDesc', icon: CreditCard },
  { key: 'low_stock_enabled', title: 'prefLowStockTitle', desc: 'prefLowStockDesc', icon: PackageX },
] as const;

/** Manage browser delivery and the user's notification preferences for this restaurant. */
export default function NotificationsSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  return <NotificationsWorkspace key={rid} rid={rid} />;
}

function NotificationsWorkspace({ rid }: { rid: number }) {
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');
  const [env, setEnv] = useState<PushEnvironment | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [devices, setDevices] = useState<PushDevice[]>([]);
  const [loading, setLoading] = useState<Record<Resource, boolean>>({ browser: true, preferences: true, devices: true });
  const [loadErrors, setLoadErrors] = useState<Record<Resource, boolean>>({ browser: false, preferences: false, devices: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cleanupPending, setCleanupPending] = useState(false);
  const [removing, setRemoving] = useState<PushDevice | null>(null);
  const lifetime = useRef({ generation: 0 });
  const sequences = useRef({ browser: 0, preferences: 0, devices: 0 });
  const lock = useRef(false);

  const load = useCallback(async (resource: Resource) => {
    const generation = lifetime.current.generation;
    const sequence = ++sequences.current[resource];
    const current = () => generation === lifetime.current.generation && sequence === sequences.current[resource];
    setLoading(value => ({ ...value, [resource]: true }));
    setLoadErrors(value => ({ ...value, [resource]: false }));
    try {
      if (resource === 'browser') {
        const environment = getEnvironment();
        const subscription = await getCurrentSubscription();
        if (current()) { setEnv(environment); setEndpoint(subscription?.endpoint ?? null); }
      } else if (resource === 'preferences') {
        const value = await getNotificationPreferences(rid);
        if (current()) setPrefs(value);
      } else {
        const value = await listDevices(rid);
        if (current()) setDevices(value);
      }
    } catch {
      if (current()) setLoadErrors(value => ({ ...value, [resource]: true }));
    } finally {
      if (current()) setLoading(value => ({ ...value, [resource]: false }));
    }
  }, [rid]);
  const refresh = useCallback(() => Promise.all([load('browser'), load('preferences'), load('devices')]), [load]);
  useEffect(() => {
    const current = lifetime.current;
    void refresh();
    return () => { current.generation += 1; };
  }, [refresh]);
  useEffect(() => {
    if (!busy && !cleanupPending) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [busy, cleanupPending]);

  const activeLoad = Object.values(loading).some(Boolean);
  const blocked = !!busy || activeLoad;
  const isCurrent = (device: PushDevice) => !!endpoint && !!device.endpoint_tail && endpoint.endsWith(device.endpoint_tail);
  const linked = !!endpoint && devices.some(isCurrent);
  const run = async (name: string, work: (current: () => boolean) => Promise<void>) => {
    if (lock.current || activeLoad) return;
    lock.current = true;
    const generation = lifetime.current.generation;
    const current = () => generation === lifetime.current.generation;
    setBusy(name); setError(''); setNotice('');
    try { await work(current); }
    catch (cause) {
      if (!current()) return;
      if (cause instanceof PushUnsubscribeError) {
        setCleanupPending(cause.serverRemoved && !cause.browserRemoved);
        setError(t(cause.serverRemoved ? 'pushLocalStopPending' : cause.browserRemoved ? 'pushServerStopPending' : 'pushStopFailed'));
      } else if (cause instanceof PushClientError) {
        const key = { unsupported: 'pushUnsupported', permissionDenied: 'notificationsBlockedDesc', workerUnavailable: 'pushWorkerUnavailable', noSubscription: 'testPushNoneSent', localStopFailed: 'pushBrowserStopFailed' }[cause.code];
        setError(t(key));
      } else setError(t('pushActionFailed'));
      if (name !== 'preference') await refresh();
    } finally {
      if (current()) { lock.current = false; setBusy(null); }
    }
  };
  const enable = () => {
    if (!canEdit || cleanupPending || loadErrors.browser || loadErrors.devices) return;
    void run('enable', async current => {
      await subscribe(rid);
      if (!current()) return;
      setNotice(t('notificationsEnabled'));
      await refresh();
    });
  };
  const disable = () => {
    if (!canEdit || cleanupPending || !endpoint) return;
    void run('disable', async current => {
      await unsubscribe(rid);
      if (!current()) return;
      setEndpoint(null); setNotice(t('pushDisabledHere'));
      await refresh();
    });
  };
  const finishLocalStop = () => {
    if (!canEdit || !cleanupPending) return;
    void run('cleanup', async current => {
      await unsubscribeLocally();
      if (!current()) return;
      setCleanupPending(false); setEndpoint(null); setNotice(t('pushDisabledHere'));
      await refresh();
    });
  };
  const togglePreference = (key: PrefKey, value: boolean) => {
    if (!canEdit || !prefs || loadErrors.preferences) return;
    void run('preference', async current => {
      const next = await updateNotificationPreferences(rid, { [key]: value });
      if (current()) { setPrefs(next); setNotice(t('saved')); }
    });
  };
  const test = () => {
    if (!linked || cleanupPending || loadErrors.devices || loadErrors.browser) return;
    void run('test', async current => {
      const result = await sendTestPush(rid);
      if (!current()) return;
      setNotice(t(result.sent > 0 ? 'testPushSent' : !result.current_device_known ? 'testPushNoneSent' : 'testPushFailed'));
      await Promise.all([load('browser'), load('devices')]);
    });
  };
  const remove = (device: PushDevice) => {
    if (!canEdit || cleanupPending || loadErrors.devices || loadErrors.browser) return;
    void run('remove', async current => {
      const currentDevice = isCurrent(device);
      try { await removeDevice(rid, device.id, currentDevice); }
      catch (cause) {
        if (current() && cause instanceof PushUnsubscribeError && cause.serverRemoved) setDevices(rows => rows.filter(row => row.id !== device.id));
        throw cause;
      }
      if (!current()) return;
      setDevices(rows => rows.filter(row => row.id !== device.id));
      if (currentDevice) setEndpoint(null);
      setNotice(t('pushDeviceRemoved'));
      await refresh();
    });
  };
  const resourceState = (resource: Resource) => loading[resource]
    ? <p role="status" className="py-5 text-sm text-[var(--fg-muted)]">{t('loading')}</p>
    : loadErrors[resource] ? <div role="alert" className="space-y-3 py-3"><p className="text-sm text-[var(--danger-500)]">{t('pushLoadFailed')}</p><Button variant="secondary" disabled={!!busy} onClick={() => void load(resource)}>{t('retry')}</Button></div> : null;
  const showInstallHint = env?.isIOS && !env.isStandalone;
  const date = (value: string) => {
    const parsed = value ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  };

  return <div className="max-w-5xl space-y-6">
    <PageHead title={t('notifications')} desc={t('pushSettingsIntro')} actions={<Button variant="secondary" disabled={blocked} onClick={() => void refresh()}>{t('refresh')}</Button>} />
    {!canEdit && <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('pushPreferencesReadOnly')}</p>}
    {(error || notice || cleanupPending) && <div className="space-y-3 rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-4">
      {error && <p role="alert" className="text-sm leading-6 text-[var(--danger-500)]">{error}</p>}
      {notice && <p role="status" className="text-sm leading-6 text-[var(--fg)]">{notice}</p>}
      {cleanupPending && canEdit && <Button variant="secondary" disabled={blocked} onClick={finishLocalStop}>{t('pushFinishLocalStop')}</Button>}
    </div>}
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Section role="region" aria-label={t('pushThisBrowser')} className="mb-0" title={<span className="flex items-center gap-2"><Bell aria-hidden="true" className="size-5" />{t('pushThisBrowser')}</span>} desc={t('pushBrowserDesc')}>
        {resourceState('browser') || (env && <div className="space-y-4">
          {!env.supported ? <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('pushUnsupported')}</p>
            : showInstallHint ? <div className="space-y-2"><h3 className="font-semibold">{t('addToHomeScreenTitle')}</h3><p className="text-sm leading-6 text-[var(--fg-muted)]">{t('addToHomeScreenDesc')}</p></div>
            : env.permission === 'denied' ? <div className="space-y-2"><h3 className="font-semibold">{t('notificationsBlocked')}</h3><p className="text-sm leading-6 text-[var(--fg-muted)]">{t('notificationsBlockedDesc')}</p></div>
            : <>
              {loading.devices || loadErrors.devices ? <p className="text-sm text-[var(--fg-muted)]">{t('pushRegistrationUnknown')}</p>
                : <><Badge tone={linked && !cleanupPending ? 'success' : 'neutral'}>{t(linked && !cleanupPending ? 'notificationsEnabled' : 'pushNotActiveHere')}</Badge>{endpoint && !linked && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('pushDeviceUnlinked')}</p>}</>}
              <div className="flex flex-wrap gap-2 pt-2">
                {canEdit && !linked && <Button onClick={enable} disabled={blocked || cleanupPending || loadErrors.devices}><Bell aria-hidden="true" />{t(busy === 'enable' ? 'enabling' : 'enableNotifications')}</Button>}
                {linked && <Button variant="secondary" onClick={test} disabled={blocked || cleanupPending || loadErrors.devices}>{t(busy === 'test' ? 'sendingTestPush' : 'sendTestPush')}</Button>}
                {canEdit && endpoint && <Button variant="ghost" onClick={disable} disabled={blocked || cleanupPending}><BellOff aria-hidden="true" />{t(busy === 'disable' ? 'disabling' : 'disable')}</Button>}
              </div>
            </>}
        </div>)}
      </Section>
      <Section role="region" aria-label={t('prefEventsHeading')} className="mb-0" title={t('prefEventsHeading')} desc={t('pushPreferencesScope')}>
        {resourceState('preferences') || (prefs && <ul className="divide-y divide-[var(--line)]">
          {EVENTS.map(({ key, title, desc, icon: Icon }) => <li key={key} className="py-4 first:pt-1 last:pb-0">
            <label className="flex items-start gap-3" htmlFor={`push-${key}`}>
              <Icon aria-hidden="true" className="mt-1 size-4 shrink-0 text-[var(--fg-muted)]" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t(title)}</span><span id={`push-${key}-hint`} className="mt-1 block text-sm leading-6 text-[var(--fg-muted)]">{t(desc)}</span></span>
              <BooleanInput id={`push-${key}`} aria-label={t(title)} aria-describedby={`push-${key}-hint`} checked={prefs[key]} disabled={!canEdit || blocked} onChange={event => togglePreference(key, event.target.checked)} />
            </label>
          </li>)}
        </ul>)}
      </Section>
    </div>
    <Section role="region" aria-label={t('yourDevices')} title={t('yourDevices')} desc={t('yourDevicesDesc')}>
      {resourceState('devices') || (devices.length === 0 ? <p className="py-5 text-sm text-[var(--fg-muted)]">{t('pushDevicesEmpty')}</p> : <ul className="divide-y divide-[var(--line)]">
        {devices.map(device => {
          const current = !loadErrors.browser && !loading.browser && isCurrent(device);
          const Icon = /iPhone|iPad|Android/.test(device.label) ? Smartphone : Monitor;
          return <li key={device.id} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 py-5 sm:grid-cols-[40px_minmax(0,1fr)_auto]">
            <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-r-md bg-[var(--surface-2)] text-[var(--fg-muted)]"><Icon className="size-5" /></span>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="break-words text-sm font-semibold" dir="auto">{device.label || t('pushThisBrowser')}</h3>{current && <Badge tone="neutral">{t('thisDevice')}</Badge>}</div>
              <dl className="mt-2 space-y-1 text-xs text-[var(--fg-muted)]"><div><dt className="inline">{t('pushDeviceAdded')} </dt><dd className="inline"><bdi>{date(device.created_at)}</bdi></dd></div><div><dt className="inline">{t('lastUsed')} </dt><dd className="inline"><bdi>{date(device.last_used_at)}</bdi></dd></div></dl>
            </div>
            {canEdit && <Button variant="ghost" className="col-start-2 justify-self-start sm:col-start-auto sm:self-center" disabled={blocked || cleanupPending || loadErrors.browser} aria-label={`${t('deviceRemove')} · ${device.label}`} onClick={() => setRemoving(device)}><Trash2 aria-hidden="true" />{t('deviceRemove')}</Button>}
          </li>;
        })}
      </ul>)}
    </Section>
    <ConfirmDialog open={!!removing} onOpenChange={open => { if (!open) setRemoving(null); }} title={t('deviceRemove')} description={t('pushRemoveHint').replace('{name}', removing?.label ?? '')} danger confirmLabel={t('deviceRemove')} cancelLabel={t('cancel')} onConfirm={() => { const device = removing; setRemoving(null); if (device) remove(device); }} />
  </div>;
}
