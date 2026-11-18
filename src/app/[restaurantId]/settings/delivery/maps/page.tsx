'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from '@/components/delivery/MapsUsage.module.css';
import { Map, RefreshCw } from 'lucide-react';
import { Button, PageHead, Section, Drawer, ConfirmDialog, Tabs, TabsList, Tab, TabsContent } from '@/components/ds';
import { GeoapifyUsage, MapsPricing, MapsServiceComparison } from '@/components/delivery/MapsProviderDetails';
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
  const { t, locale, direction } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canView = hasAnyPermission('settings.view', 'settings.edit', 'orders.manage');
  const canEdit = hasAnyPermission('settings.edit');
  const [status, setStatus] = useState<DeliveryProviderStatus | null>(null);
  const [choice, setChoice] = useState<DeliveryProviderPreference>('auto');
  const [section, setSection] = useState('usage');
  const [providerOpen, setProviderOpen] = useState(false);
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
    try { const value = await updateDeliveryProviderPreference(rid, choice); if (alive.current) { setStatus(value); setChoice(value.preference); setNotice('mapsSaved'); setProviderOpen(false); window.dispatchEvent(new Event('foody-map-provider-change')); } }
    catch { if (alive.current) { setError('mapsSaveError'); const value = await getDeliveryProviderStatus(rid).catch(() => null); if (value && alive.current) { setStatus(value); setChoice(value.preference); } } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const reset = status?.google.resets_at && !Number.isNaN(Date.parse(status.google.resets_at)) ? new Date(status.google.resets_at).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' }) : null;
  return <div className="mx-auto max-w-[1100px] pb-8">
    <PageHead title={t('mapsTitle')} desc={t('mapsDescription')} actions={<><Button variant="secondary" asChild><Link href={`/${rid}/settings/usage`}>{t("apiQuotaTitle")}</Link></Button><Button variant="secondary" icon aria-label={t('refresh')} disabled={busy || !canView} onClick={() => void load()}><RefreshCw className="size-4" /></Button></>} />
    {!canView ? <p role="status">{t('mapsNoPermission')}</p> : <>
      {error && !providerOpen && <p role="alert" className="mb-5 text-[var(--danger-500)]">{t(error)}</p>}
      {notice && <p role="status" className="mb-5">{t(notice)}</p>}
      {!status && busy && <p role="status">{t('loading')}</p>}
      {status && <>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-r-xl border border-[var(--line)] border-s-4 border-s-[var(--info-500)] bg-[var(--surface)] p-4 sm:p-5">
          <div className="flex items-center gap-3"><Map className="size-8 text-[var(--info-500)]" aria-hidden /><div><p className="text-fs-sm text-[var(--fg-muted)]">{t('mapsActiveProvider')}</p><p className="mt-1 text-fs-xl font-semibold">{status.active_provider === 'google' ? 'Google Maps' : 'Geoapify'}</p></div></div>
          <p className="max-w-md text-fs-sm text-[var(--fg-muted)]">{t(`mapsReason_${status.reason || 'ready'}`)}</p>
          <Button variant="secondary" onClick={() => setProviderOpen(true)}>{t('mapsChangeProvider')}</Button>
        </div>
        <Tabs value={section} onValueChange={setSection} variant="underline" dir={direction}>
          <TabsList aria-label={t('mapsSections')}><Tab value="usage">{t('mapsUsageTab')}</Tab><Tab value="overview">{t('mapsOverviewTab')}</Tab><Tab value="pricing">{t('mapsPricingTab')}</Tab></TabsList>
          <TabsContent value="overview" className="space-y-7">
        <MapsServiceComparison restaurantId={rid} canPlan={hasAnyPermission('orders.manage')} />
          </TabsContent>
          <TabsContent value="usage">
        <Tabs defaultValue="google" dir={direction}>
          <TabsList aria-label={t('mapsProviderTabs')} className="w-fit max-w-full"><Tab value="google">Google</Tab><Tab value="geoapify">Geoapify</Tab></TabsList>
          <TabsContent value="google">
        <Section title={t('mapsUsage')} desc={t('mapsUsageHint')} aside={<span className="text-fs-sm" dir="ltr">{status.google.month || '—'}</span>}>
          {status.google.counters.length === 0 ? <p className="text-fs-sm text-[var(--fg-muted)]">{t('mapsCountersUnavailable')}</p> : <div className={styles.tableScroll}><table className={styles.usageTable}>
            <thead><tr><th scope="col">{t('mapsService')}</th><th scope="col">{t('mapsUsed')}</th><th scope="col">{t('mapsMonthlyLimit')}</th><th scope="col">{t('status')}</th></tr></thead>
            <tbody>{status.google.counters.map(counter => <tr key={counter.sku}>
              <th scope="row">{t(`mapsSKU_${counter.sku}`)}
                {counter.limit > 0 && <meter className={styles.meter} data-available={counter.available} aria-label={t(`mapsSKU_${counter.sku}`)} min={0} max={counter.limit} value={Math.min(counter.used, counter.limit)} />}
              </th>
              <td>{counter.used.toLocaleString(locale)}</td><td>{counter.limit.toLocaleString(locale)}</td>
              <td><span className={styles.status} data-available={counter.available}>{t(counter.available ? 'mapsAvailable' : 'mapsReached')}</span></td>
            </tr>)}</tbody>
          </table></div>}
          {reset && <p className="mt-4 border-t border-[var(--line)] pt-4 text-fs-sm text-[var(--fg-muted)]">{t('mapsReset').replace('{date}', reset)}</p>}
        </Section>
          </TabsContent>
          <TabsContent value="geoapify"><GeoapifyUsage status={status.geoapify} /></TabsContent>
        </Tabs>
        <div className="mt-5 flex justify-end"><Button variant="secondary" onClick={() => setSection('pricing')}>{t('mapsSeePricing')}</Button></div>
          </TabsContent>
          <TabsContent value="pricing"><MapsPricing offer={status.foody_offer} onContact={() => setUpgrade(true)} /></TabsContent>
        </Tabs>
      </>}
    </>}
    <Drawer open={providerOpen && !!status} onOpenChange={open => { if (!lock.current) { setProviderOpen(open); if (status) setChoice(status.preference); } }}
      title={t('mapsProvider')} closeDisabled={lock.current} onSave={canEdit ? save : undefined} saveLabel={t('save')} saveDisabled={busy || choice === status?.preference}>
      <p className="mb-4 text-fs-sm text-[var(--fg-muted)]">{t('mapsProviderHint')}</p>
      {error === 'mapsSaveError' && <p role="alert">{t(error)}</p>}
      <fieldset disabled={!canEdit || busy} aria-label={t('mapsProvider')}>
        {(['auto', 'google', 'geoapify'] as const).map(value => <ChoiceRow key={value} type="radio" name="maps-provider" checked={choice === value} onChange={() => setChoice(value)} label={t(`mapsChoice_${value}`)} description={t(`mapsChoiceHint_${value}`)} />)}
      </fieldset>
    </Drawer>
    <ConfirmDialog open={upgrade} onOpenChange={setUpgrade} title={t('mapsContactTitle')} description={t('mapsContactHint')} confirmLabel={t('close')} cancelLabel={t('cancel')} onConfirm={() => setUpgrade(false)} />
  </div>;
}
