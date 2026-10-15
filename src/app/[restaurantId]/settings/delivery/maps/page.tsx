'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button, PageHead, Section, ConfirmDialog } from '@/components/ds';
import { ChoiceRow } from '@/components/ds/Selection';
import { usePermissions } from '@/lib/permissions-context';
import { useI18n } from '@/lib/i18n';
import { getDeliveryProviderStatus, updateDeliveryProviderPreference, type DeliveryProviderStatus, type DeliveryProviderPreference } from '@/lib/api';

/** Restaurant map settings, isolated from the delivery-zone editor. */
export default function DeliveryMapsPage() {
  const { restaurantId } = useParams();
  return <DeliveryMapsWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function DeliveryMapsWorkspace({ rid }: { rid: number }) {
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canView = hasAnyPermission('settings.view', 'settings.edit', 'orders.manage');
  const canEdit = hasAnyPermission('settings.edit');
  const [status, setStatus] = useState<DeliveryProviderStatus | null>(null);
  const [choice, setChoice] = useState<DeliveryProviderPreference>('auto');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [upgrade, setUpgrade] = useState(false);
  const alive = useRef(true), lock = useRef(false), sequence = useRef(0);
  const load = useCallback(async () => {
    if (!canView || lock.current) return;
    const current = ++sequence.current; setBusy(true); setError('');
    try { const value = await getDeliveryProviderStatus(rid); if (alive.current && current === sequence.current) { setStatus(value); setChoice(value.preference); } }
    catch { if (alive.current && current === sequence.current) setError('mapsLoadError'); }
    finally { if (alive.current && current === sequence.current) setBusy(false); }
  }, [rid, canView]);
  useEffect(() => { const lifetime = sequence; alive.current = true; void load(); return () => { alive.current = false; lifetime.current++; }; }, [load]);
  const save = async () => {
    if (!canEdit || !status || lock.current || choice === status.preference) return;
    lock.current = true; sequence.current++; setBusy(true); setError(''); setNotice('');
    try { const value = await updateDeliveryProviderPreference(rid, choice); if (alive.current) { setStatus(value); setChoice(value.preference); setNotice('mapsSaved'); window.dispatchEvent(new Event('foody-map-provider-change')); } }
    catch { if (alive.current) { setError('mapsSaveError'); const value = await getDeliveryProviderStatus(rid).catch(() => null); if (value && alive.current) { setStatus(value); setChoice(value.preference); } } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const reset = status?.google.resets_at && !Number.isNaN(Date.parse(status.google.resets_at)) ? new Date(status.google.resets_at).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' }) : null;
  return <div className="mx-auto max-w-[980px] pb-8">
    <Link href={`/${rid}/settings/delivery`} className="mb-5 inline-flex items-center gap-2 text-fs-sm underline"><ArrowLeft className="size-4 rtl:rotate-180" />{t('deliveryZones')}</Link>
    <PageHead title={t('mapsTitle')} desc={t('mapsDescription')} actions={<Button variant="secondary" disabled={busy || !canView} onClick={() => void load()}><RefreshCw className="size-4" />{t('refresh')}</Button>} />
    {!canView ? <p role="status">{t('mapsNoPermission')}</p> : <>
      {error && <p role="alert" className="mb-5 text-[var(--danger-500)]">{t(error)}</p>}
      {notice && <p role="status" className="mb-5">{t(notice)}</p>}
      {!status && busy && <p role="status">{t('loading')}</p>}
      {status && <>
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4 border-y border-[var(--line)] py-5">
          <div><p className="text-fs-sm text-[var(--fg-muted)]">{t('mapsActiveProvider')}</p><p className="mt-1 text-fs-xl font-semibold">{status.active_provider === 'google' ? 'Google Maps' : 'Geoapify'}</p></div>
          <p className="max-w-lg text-fs-sm text-[var(--fg-muted)]">{t(`mapsReason_${status.reason || 'ready'}`)}</p>
        </div>
        <Section title={t('mapsProvider')} desc={t('mapsProviderHint')}>
          <fieldset disabled={!canEdit || busy} aria-label={t('mapsProvider')}>
            {(['auto', 'google', 'geoapify'] as const).map(value => <ChoiceRow key={value} type="radio" name="maps-provider" checked={choice === value} onChange={() => setChoice(value)} label={t(`mapsChoice_${value}`)} description={t(`mapsChoiceHint_${value}`)} />)}
          </fieldset>
          {canEdit && <div className="mt-5 flex justify-end"><Button variant="primary" disabled={busy || choice === status.preference} onClick={() => void save()}>{t('save')}</Button></div>}
        </Section>
        <Section title={t('mapsUsage')} desc={t('mapsUsageHint')} aside={<span className="text-fs-sm" dir="ltr">{status.google.month || '—'}</span>}>
          {status.google.counters.length === 0 ? <p className="text-fs-sm text-[var(--fg-muted)]">{t('mapsCountersUnavailable')}</p> : <div className="divide-y divide-[var(--line)]">
            {status.google.counters.map(counter => <div key={counter.sku} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto]">
              <div><h3 className="font-medium">{t(`mapsSKU_${counter.sku}`)}</h3><p className="mt-1 text-fs-sm text-[var(--fg-muted)]">{t('mapsPlatformCap').replace('{n}', counter.limit.toLocaleString(locale))}</p></div>
              <div className="text-start sm:text-end"><p className="font-semibold tabular-nums">{counter.used.toLocaleString(locale)} <span className="font-normal text-[var(--fg-muted)]">{t('mapsUnits')}</span></p><p className={`mt-1 text-fs-sm ${counter.available ? 'text-[var(--fg-muted)]' : 'text-[#865800]'}`}>{t(counter.available ? 'mapsAvailable' : 'mapsReached')}</p></div>
            </div>)}
          </div>}
          {reset && <p className="mt-4 border-t border-[var(--line)] pt-4 text-fs-sm text-[var(--fg-muted)]">{t('mapsReset').replace('{date}', reset)}</p>}
        </Section>
        <div className="flex flex-col items-start justify-between gap-4 py-5 sm:flex-row sm:items-center"><div><h2 className="text-fs-lg font-semibold">{t('mapsUpgradeTitle')}</h2><p className="mt-2 max-w-xl text-fs-sm text-[var(--fg-muted)]">{t('mapsUpgradeHint')}</p></div><Button variant="primary" onClick={() => setUpgrade(true)}>{t('mapsUpgrade')}</Button></div>
      </>}
    </>}
    <ConfirmDialog open={upgrade} onOpenChange={setUpgrade} title={t('mapsContactTitle')} description={t('mapsContactHint')} confirmLabel={t('close')} cancelLabel={t('cancel')} onConfirm={() => setUpgrade(false)} />
  </div>;
}
