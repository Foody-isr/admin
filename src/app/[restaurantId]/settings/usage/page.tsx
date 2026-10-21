'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { Button, PageHead, Section } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { getExternalApiUsage, type ExternalApiUsage } from '@/lib/api';

/** Read-only restaurant usage, with independent service units and explicit recovery. */
export default function ApiUsagePage() {
 const { restaurantId } = useParams();
 return <ApiUsageWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function ApiUsageWorkspace({ rid }: { rid: number }) {
 const { t, locale } = useI18n();
 const { hasAnyPermission } = usePermissions();
 const canView = hasAnyPermission('settings.view', 'settings.edit');
 const [value, setValue] = useState<ExternalApiUsage | null>(null);
 const [attempt, setAttempt] = useState(0), [busy, setBusy] = useState(true), [error, setError] = useState(false);
 useEffect(() => {
  let active = true;
  if (!canView) { setBusy(false); return; }
  setBusy(true); setError(false);
  getExternalApiUsage(rid).then(result => { if (active) setValue(result); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setBusy(false); });
  return () => { active = false; };
 }, [rid, attempt, canView]);
 const number = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });
 const date = (s: string) => new Date(s).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' });
 return <div className="mx-auto max-w-[1080px] pb-10">
  <PageHead title={t('apiQuotaTitle')} desc={t('apiQuotaDescription')} actions={<Button variant="secondary" disabled={busy || !canView} onClick={() => setAttempt(n => n + 1)}><RefreshCw className="size-4" aria-hidden />{t('refresh')}</Button>} />
  {!canView ? <p role="status">{t('mapsNoPermission')}</p> : <>
   {error && <p role="alert" className="mb-5 text-[var(--danger-500)]">{t('apiQuotaLoadError')} <button className="underline" disabled={busy} onClick={() => setAttempt(n => n + 1)}>{t('retry')}</button></p>}
   {busy && !value && <p role="status">{t('loading')}</p>}
   {value && <>
    <div className="mb-8 flex flex-wrap justify-between gap-4 border-y border-[var(--line)] py-5"><p className="font-semibold" dir="ltr">{value.month}</p><p className="text-sm text-[var(--fg-muted)]">{t('apiQuotaRenewal').replace('{date}', date(value.resets_at))}</p></div>
    {['google', 'geoapify'].map(provider => <Section key={provider} title={provider === 'google' ? 'Google Maps' : 'Geoapify'} className="mb-8">
     <div className="divide-y divide-[var(--line)]">
      {value.counters.filter(counter => counter.provider === provider).map(counter => <div key={counter.id} className="grid gap-3 py-5 sm:grid-cols-[1fr_240px]">
       <div><h3 className="font-medium">{t(`apiQuota_${counter.id}`)}</h3><p className="mt-1 text-sm text-[var(--fg-muted)]">{t(`apiQuotaUnit_${counter.unit}`)}</p>{counter.unit !== 'requests' && <p className="mt-1 text-xs text-[var(--fg-muted)]">{t('apiQuotaRequests').replace('{n}', number(counter.requests))}</p>}</div>
       <div><p className="text-start font-semibold tabular-nums sm:text-end">{number(counter.used)} <span className="font-normal text-[var(--fg-muted)]">/ {number(counter.limit)}</span></p>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={counter.limit || 1} aria-valuenow={counter.limit === 0 ? 1 : Math.min(counter.used, counter.limit)} aria-label={t(`apiQuota_${counter.id}`)} aria-valuetext={`${number(counter.used)} / ${number(counter.limit)}`} className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
         <div className={`h-full ${counter.status === 'exhausted' ? 'bg-[var(--danger-500)]' : counter.status === 'warning' ? 'bg-[#865800]' : 'bg-black'}`} style={{ width: `${counter.limit === 0 ? 100 : Math.min(100, counter.used / counter.limit * 100)}%` }} />
        </div>
        <p className={`mt-2 text-start text-sm sm:text-end ${counter.status === 'exhausted' ? 'text-[var(--danger-500)]' : counter.status === 'warning' ? 'text-[#865800]' : 'text-[var(--fg-muted)]'}`}>{t(`apiQuotaStatus_${counter.status}`)}</p>
       </div>
      </div>)}
     </div>
    </Section>)}
    <div className="space-y-3 border-t border-[var(--line)] pt-6 text-sm text-[var(--fg-muted)]"><p>{t('apiQuotaTracking').replace('{date}', date(value.tracked_since))}</p><p>{t('apiQuotaAttempts')}</p><p>{t('apiQuotaProviderNote')}</p><p>{t('apiQuotaContact')}</p></div>
   </>}
  </>}
 </div>;
}
