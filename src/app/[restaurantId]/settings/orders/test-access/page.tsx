'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, ConfirmDialog, Field, Input, Section, Textarea } from '@/components/ds';
import { SettingsWorkspace } from '@/components/settings/SettingsWorkspace';
import { ApiError, getRestaurantSettings, updateRestaurantSettings, type RestaurantSettings } from '@/lib/api';
import { localTestDeadline, orderingTestDraft, orderingTestPayload, type OrderingTestDraft } from '@/lib/ordering-test-access';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Switch } from '../_components';

/** Restaurant-scoped configuration of temporary IP ordering exceptions. */
export default function OrderingTestAccessPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  return <TestAccessEditor key={rid} rid={rid} />;
}

function TestAccessEditor({ rid }: { rid: number }) {
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const router = useRouter();
  const canEdit = hasAnyPermission('settings.edit');
  const [settings, setSettings] = useState<RestaurantSettings>();
  const [draft, setDraft] = useState<OrderingTestDraft>(orderingTestDraft());
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState('');
  const [leaving, setLeaving] = useState<string | null>(null), [now, setNow] = useState(Date.now);
  const lifetime = useRef({ generation: 0 }), busy = useRef(false);
  const dirty = !!settings && JSON.stringify(draft) !== JSON.stringify(orderingTestDraft(settings.ordering_test_access));
  const available = settings?.ordering_test_access_available === true;
  const load = useCallback(async () => {
    const generation = lifetime.current.generation;
    setLoading(true); setLoadError(false);
    try {
      if (!Number.isSafeInteger(rid) || rid <= 0) throw new Error('Invalid restaurant');
      const value = await getRestaurantSettings(rid);
      if (generation === lifetime.current.generation) { setSettings(value); setDraft(orderingTestDraft(value.ordering_test_access)); setSaved(false); setError(''); }
    } catch { if (generation === lifetime.current.generation) setLoadError(true); }
    finally { if (generation === lifetime.current.generation) setLoading(false); }
  }, [rid]);
  useEffect(() => { const current = lifetime.current; void load(); return () => { current.generation += 1; }; }, [load]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (dirty || busy.current) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: MouseEvent) => {
      if ((!dirty && !busy.current) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || link.origin !== location.origin || link.href === location.href) return;
      event.preventDefault(); event.stopPropagation(); if (!busy.current) setLeaving(link.pathname + link.search + link.hash);
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  const patch = (value: Partial<OrderingTestDraft>) => { setDraft(current => ({ ...current, ...value })); setSaved(false); setError(''); };
  const save = async (value: OrderingTestDraft) => {
    if (!canEdit || busy.current || !settings) return;
    let payload;
    try { payload = orderingTestPayload(value); } catch (error) { setError((error as Error).message); return; }
    const generation = lifetime.current.generation;
    busy.current = true; setSaving(true); setSaved(false); setError('');
    try {
      const response = await updateRestaurantSettings(rid, { ordering_test_access: payload });
      if (generation === lifetime.current.generation) {
        if (!response.ordering_test_access || response.ordering_test_access.enabled !== payload.enabled) throw new Error('Incomplete response');
        setSettings(response); setDraft(orderingTestDraft(response.ordering_test_access)); setSaved(true); setNow(Date.now());
      }
    } catch (error) {
      if (generation === lifetime.current.generation) setError(error instanceof ApiError && error.details === 'ordering_test_access_ips_invalid' ? 'orderingTestAccessIPsError' : error instanceof ApiError && error.details === 'ordering_test_access_expiry_invalid' ? 'orderingTestAccessExpiryError' : 'ordersPauseSaveError');
    } finally { if (generation === lifetime.current.generation) { busy.current = false; setSaving(false); } }
  };
  const policy = settings?.ordering_test_access;
  const active = !!policy?.enabled && !!policy.expires_at && Date.parse(policy.expires_at) > now;
  return <SettingsWorkspace title={t('orderingTestAccessTitle')} description={t('orderingTestAccessDescription')}>
    <Link href={`/${rid}/settings/orders`} className="mb-5 inline-block text-sm text-[var(--brand-ink)]">{t('ordersAndAvailability')}</Link>
    {loading ? <p role="status">{t('loading')}</p> : loadError ? <Section><p role="alert">{t('ordersLoadError')}</p><Button className="mt-4" onClick={() => void load()}>{t('retry')}</Button></Section> : settings && <Section title={t('orderingTestAccessTitle')}>
      <p role="status" className="rounded-r-md bg-[var(--summary-bg)] p-4 font-medium">{t(active ? 'orderingTestAccessActive' : policy?.enabled ? 'orderingTestAccessExpired' : 'orderingTestAccessInactive')}{active && policy?.expires_at && <> · <bdi>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(policy.expires_at))}</bdi></>}</p>
      <p className="my-4 text-sm leading-6 text-[var(--fg-muted)]">{t('orderingTestAccessPublicPause')}</p>
      {!available && <p role="alert" className="mb-4 text-sm text-[var(--danger-500)]">{t('orderingTestAccessUnavailable')}</p>}
      {!canEdit && <p className="mb-4 text-sm text-[var(--fg-muted)]">{t('pushPreferencesReadOnly')}</p>}
      <form className="max-w-2xl space-y-5" onSubmit={event => { event.preventDefault(); void save(draft); }} noValidate>
        <div className="flex items-center justify-between gap-4"><span className="text-sm font-medium">{t('orderingTestAccessEnable')}</span><Switch label={t('orderingTestAccessEnable')} checked={draft.enabled} disabled={!canEdit || saving || (!available && !draft.enabled)} onChange={enabled => patch({ enabled, until: enabled && !draft.until ? localTestDeadline(new Date(Date.now() + 3600000).toISOString()) : draft.until })} /></div>
        <Field label={t('orderingTestAccessIPs')} hint={t('orderingTestAccessIPsHint')}><Textarea id="ordering-test-ips" dir="ltr" rows={4} maxLength={1536} value={draft.ips} disabled={!canEdit || saving || !draft.enabled} onChange={event => patch({ ips: event.target.value })} /></Field>
        <Field label={t('orderingTestAccessExpiry')} hint={`${t('orderingTestAccessExpiryHint')} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}><Input id="ordering-test-expiry" dir="ltr" type="datetime-local" value={draft.until} disabled={!canEdit || saving || !draft.enabled} onChange={event => patch({ until: event.target.value })} /></Field>
        <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('orderingTestAccessRealOrders')}</p>
        {error && <p role="alert" className="text-sm text-[var(--danger-500)]">{t(error)}</p>}
        <div className="flex flex-wrap items-center gap-3">{canEdit && <Button type="submit" disabled={saving || !dirty || (draft.enabled && !available)}>{t(saving ? 'saving' : 'orderingTestAccessSave')}</Button>}{canEdit && policy?.enabled && <Button type="button" variant="secondary" disabled={saving} onClick={() => void save({ ...draft, enabled: false })}>{t('orderingTestAccessDisable')}</Button>}<span role="status" className="text-sm text-[var(--fg-muted)]">{t(saved ? 'saved' : dirty ? 'settingsUnsaved' : 'settingsUnchanged')}</span></div>
      </form>
    </Section>}
    <ConfirmDialog open={leaving !== null} onOpenChange={open => { if (!open) setLeaving(null); }} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { const target = leaving; setLeaving(null); if (settings) setDraft(orderingTestDraft(settings.ordering_test_access)); if (target) router.push(target); }} />
  </SettingsWorkspace>;
}
