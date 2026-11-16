'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { LockKeyhole } from 'lucide-react';
import { ApiError, getFoodyLicences, type FoodyModuleAccess, type FoodyLicenceUsage, type FoodySeatLimits } from '@/lib/api';
import { requiredCapability } from '@/lib/module-navigation';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

/** Shows the precise product needed for a locked destination. */
export function FeatureUpgrade({ rid, access, path, featureKey, compact = false }: { rid: number; access: FoodyModuleAccess; path: string; featureKey?: string; compact?: boolean }) {
  const { t, locale } = useI18n();
  const { isOwner, loading } = usePermissions();
  const feature = featureKey ?? requiredCapability(access, path);
  const offers = access.available_offers?.filter(offer => feature && offer.capabilities.includes(feature)) ?? [];
  return <div className={compact ? "space-y-4" : "mx-auto max-w-2xl space-y-5 px-4 py-10"}>
    <LockKeyhole className="size-7 text-[var(--fg-muted)]" aria-hidden="true" />
    {!compact && <h1 className="text-2xl font-semibold">{t('foodyUpgradeTitle')}</h1>}
    {feature && <p className="text-lg">{access.feature_names?.[feature]?.[locale]}</p>}
    {offers.length ? <div><p className="mb-2 text-sm text-[var(--fg-muted)]">{t('foodyUpgradeAvailable')}</p><ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)] px-4">{offers.map(offer => <li key={offer.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-semibold">{offer.name[locale]}</span><span>{new Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS' }).format(offer.monthly_minor / 100)} {t('foodyModuleMonthlyHT')}</span></li>)}</ul></div> : <p>{t('foodyUpgradeContact')}</p>}
    {!loading && (isOwner ? <Link className="btn-primary" href={`/${rid}/billing?feature=${encodeURIComponent(feature ?? '')}`}>{t('foodyUpgradeAction')}</Link> : <p className="text-sm text-[var(--fg-muted)]">{t('foodyUpgradeOwner')}</p>)}
    <Link className="block text-sm underline underline-offset-4" href={`/${rid}/dashboard`}>{t('foodyModuleOpenWorkspace')}</Link>
  </div>;
}

/** Presents current server-enforced capacity without inferring it from the visible staff list. */
export function LicenceCapacity({ rid, refreshKey }: { rid: number; refreshKey?: number }) {
  const { t } = useI18n();
  const { isOwner } = usePermissions();
  const [state, setState] = useState<{ used: FoodyLicenceUsage; limits: FoodySeatLimits } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const request = new AbortController(); setState(null); setFailed(false);
    getFoodyLicences(rid, request.signal).then(value => { if (!request.signal.aborted) setState(value); }, error => {
      if (!request.signal.aborted && !(error instanceof ApiError && [403, 404].includes(error.status))) setFailed(true);
    });
    return () => request.abort();
  }, [rid, refreshKey]);
  if (failed) return <p role="alert" className="text-sm text-[var(--danger-500)]">{t('billingLoadError')}</p>;
  if (!state) return null;
  return <section aria-label={t('foodyLicenceTitle')} className="space-y-3 rounded-lg border border-[var(--line)] p-4">
    <div className="flex flex-wrap justify-between gap-2"><h2 className="text-sm font-semibold">{t('foodyLicenceTitle')}</h2>{isOwner && <Link className="text-sm font-semibold underline" href={`/${rid}/billing#add-licences`}>{t('foodyUpgradeAdd')}</Link>}</div>
    <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">{(Object.keys(state.used) as (keyof FoodyLicenceUsage)[]).map(key => <div key={key}><dt className="text-[var(--fg-muted)]">{t('foodyLicence_' + key)}</dt><dd className="font-medium">{(key === 'pos' && state.limits.pos_users_unlimited) || state.limits[key] == null ? `${state.used[key]} · ${t('foodyLicenceUnlimited')}` : t('foodyLicenceUsed').replace('{used}', String(state.used[key])).replace('{limit}', String(state.limits[key]))}</dd></div>)}</dl>
    <p className="text-xs text-[var(--fg-muted)]">{t('foodyLicenceHint')}</p>
  </section>;
}

/** Explains a server quota denial and preserves the user's pending form. */
export function LicenceDenied({ rid }: { rid: number }) {
  const { t } = useI18n(); const { isOwner } = usePermissions();
  return <div role="alert" className="space-y-2 rounded-lg border border-[var(--line)] p-4 text-sm"><p>{t('foodyLicenceExceeded')}</p>{isOwner ? <Link className="font-semibold underline" href={`/${rid}/billing#add-licences`}>{t('foodyUpgradeAdd')}</Link> : <p>{t('foodyUpgradeOwner')}</p>}</div>;
}

/** Explains a denied action without discarding the unfinished screen or opening on background requests. */
export function FeatureDeniedNotice({ rid, access }: { rid: number; access?: FoodyModuleAccess }) {
  const { t } = useI18n();
  const [feature, setFeature] = useState<string | null>(null);
  useEffect(() => {
    setFeature(null);
    const denied = (event: Event) => {
      const detail = (event as CustomEvent<{ restaurantId: number; feature: string }>).detail;
      if (detail?.restaurantId === rid && typeof detail.feature === 'string') setFeature(detail.feature);
    };
    window.addEventListener('foody-feature-denied', denied);
    return () => window.removeEventListener('foody-feature-denied', denied);
  }, [rid]);
  if (!feature || !access?.enforced) return null;
  return <Modal title={t('foodyUpgradeTitle')} onClose={() => setFeature(null)} size="lg"><FeatureUpgrade rid={rid} access={access} path="" featureKey={feature} compact /></Modal>;
}
