'use client';

import Link from 'next/link';
import { Map, Route, Users } from 'lucide-react';
import { Button, Section } from '@/components/ds';
import type { FoodyMapsOffer, GeoapifyUsageStatus } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** Explain Foody's actual provider capabilities without promising live traffic. */
export function MapsServiceComparison({ restaurantId, canPlan }: { restaurantId: number; canPlan: boolean }) {
  const { t } = useI18n();
  return <div className="space-y-6">
    <div><h2 className="text-fs-xl font-semibold">{t('mapsCompareTitle')}</h2><p className="mt-2 max-w-3xl text-fs-sm leading-relaxed text-[var(--fg-muted)]">{t('mapsCompareIntro')}</p></div>
    <div className="grid gap-5 md:grid-cols-2">
      {(['google', 'geoapify'] as const).map(provider => <article key={provider} className="border-t border-[var(--line)] pt-5">
        <h3 className="text-fs-lg font-semibold">{provider === 'google' ? 'Google Maps' : 'Geoapify'}</h3>
        <p className="mt-2 text-fs-sm leading-relaxed">{t(`mapsOverview_${provider}`)}</p>
        <dl className="mt-5 space-y-4 text-fs-sm">
          <div><dt className="font-medium">{t('mapsCompareAllowance')}</dt><dd className="mt-1 text-[var(--fg-muted)]">{t(`mapsAllowance_${provider}`)}</dd></div>
          <div><dt className="font-medium">{t('mapsCompareTimes')}</dt><dd className="mt-1 text-[var(--fg-muted)]">{t(`mapsTimes_${provider}`)}</dd></div>
        </dl>
      </article>)}
    </div>
    <Section title={t('mapsFeaturesTitle')}>
      <div className="flex flex-wrap gap-x-7 gap-y-4 text-fs-sm">{[{ icon: Map, label: 'mapsFeatureMap' }, { icon: Route, label: 'mapsFeatureStops' }, { icon: Users, label: 'mapsFeatureCouriers' }].map(({ icon: Icon, label }) => <p key={label} className="flex items-center gap-2"><Icon aria-hidden className="size-4 shrink-0" />{t(label)}</p>)}</div>
      <p className="mt-4 max-w-3xl text-fs-sm text-[var(--fg-muted)]">{t('mapsAddressPrecision')}</p>
      {canPlan && <Button variant="secondary" className="mt-5" asChild><Link href={`/${restaurantId}/orders/deliveries`}>{t('mapsViewDeliveries')}</Link></Button>}
    </Section>
  </div>;
}

/** Show tenant estimates separately from the Geoapify project's shared allowance. */
export function GeoapifyUsage({ status }: { status?: GeoapifyUsageStatus }) {
  const { t, locale } = useI18n();
  const number = (value: number) => value.toLocaleString(locale, { maximumFractionDigits: 2 });
  const date = (value?: string) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString(locale, { dateStyle: 'long', timeStyle: 'short' }) : null;
  const since = date(status?.tracked_since), next = date(status?.next_period_at);
  return <Section title={t('mapsGeoUsage')} desc={t('mapsGeoPlan').replace('{credits}', number(status?.daily_limit ?? 3000)).replace('{rate}', number(status?.requests_per_second ?? 5))}>
    {!status || !status.tracking_available && status.configured ? <p role="status" className="text-fs-sm text-[var(--fg-muted)]">{t('mapsGeoUnavailable')}</p> : !status.configured ? <p role="status" className="text-fs-sm text-[var(--fg-muted)]">{t('mapsGeoNotConfigured')}</p> : <>
      <div className="mb-5 grid gap-5 border-b border-[var(--line)] pb-5 sm:grid-cols-2">
        <div><p className="text-fs-sm text-[var(--fg-muted)]">{t('mapsGeoToday')}</p><p className="mt-1 text-fs-2xl font-semibold tabular-nums">{number(status.credits_today)}</p><p className="mt-1 text-fs-xs text-[var(--fg-muted)]"><bdi>{status.day}</bdi> · UTC</p></div>
        <div><p className="text-fs-sm text-[var(--fg-muted)]">{t('mapsGeoMonth')}</p><p className="mt-1 text-fs-2xl font-semibold tabular-nums">{number(status.credits_month)}</p><p className="mt-1 text-fs-xs text-[var(--fg-muted)]"><bdi>{status.month}</bdi></p></div>
      </div>
      <p className="mb-3 max-w-3xl text-fs-sm leading-relaxed text-[var(--fg-muted)]">{t('mapsGeoScope')}</p>
      <div className="divide-y divide-[var(--line)]">{status.counters.map(counter => <div key={counter.sku} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto]">
        <div><h3 className="font-medium">{t(counter.sku === 'optimization' ? 'mapsGeoOptimization' : `mapsSKU_${counter.sku}`)}</h3><p className="mt-1 max-w-xl text-fs-sm text-[var(--fg-muted)]">{t(`mapsGeoCost_${counter.sku}`)}</p></div>
        <div className="text-start sm:text-end"><p className="font-semibold tabular-nums">{t(counter.credits === 1 ? 'mapsGeoCreditSingular' : 'mapsGeoCredits').replace('{n}', number(counter.credits))}</p><p className="mt-1 text-fs-sm text-[var(--fg-muted)]">{t(counter.requests === 1 ? 'mapsGeoRequestSingular' : 'mapsGeoRequests').replace('{n}', number(counter.requests))}</p></div>
      </div>)}</div>
      <div className="mt-4 space-y-2 border-t border-[var(--line)] pt-4 text-fs-sm text-[var(--fg-muted)]">{since && <p>{t('mapsGeoTrackedSince').replace('{date}', since)}</p>}{next && <p>{t('mapsGeoNextPeriod').replace('{date}', next)}</p>}</div>
    </>}
  </Section>;
}

/** Present future Foody pricing without enabling purchases or supplier overages. */
export function MapsPricing({ offer, onContact }: { offer?: FoodyMapsOffer; onContact: () => void }) {
  const { t, locale } = useI18n();
  if (!offer) return <p role="status" className="py-5 text-fs-sm text-[var(--fg-muted)]">{t('mapsPricingUnavailable')}</p>;
  const number = (value: number) => value.toLocaleString(locale);
  return <div className="space-y-6">
    <Section title={t('mapsIncludedTitle')} desc={t('mapsIncludedHint')} aside={<p className="text-fs-lg font-semibold"><bdi>0 ₪</bdi></p>} />
    <Section title={t('mapsPlusTitle')} desc={t('mapsPlanned')} aside={<div className="text-start sm:text-end"><p className="text-fs-2xl font-semibold"><bdi>{number(offer.monthly_price)} ₪</bdi></p><p className="mt-1 text-fs-xs text-[var(--fg-muted)]">{t('mapsMonthlyPrice')}</p></div>}>
      <ul className="space-y-3 text-fs-sm">
        <li>{t('mapsPriceOptimization').replace('{n}', number(offer.optimization_credits))}</li>
        <li>{t('mapsPriceTiles').replace('{n}', number(offer.map_tiles))}</li>
        <li>{t('mapsPriceGeocoding').replace('{n}', number(offer.geocoding_requests))}</li>
        <li>{t('mapsPriceRoutes').replace('{n}', number(offer.route_requests))}</li>
      </ul>
      <p className="mt-5 border-t border-[var(--line)] pt-4 text-fs-sm leading-relaxed text-[var(--fg-muted)]">{t('mapsCreditRules').replace('{single}', number(offer.single_stop_credits)).replace('{fleet}', number(offer.fleet_stop_credits))}</p>
      <p className="mt-3 text-fs-sm leading-relaxed text-[var(--fg-muted)]">{t('mapsPlannedHint')}</p>
      <Button className="mt-5" variant="primary" onClick={onContact}>{t('mapsContactTitle')}</Button>
    </Section>
    <div className="border-t border-[var(--line)] pt-5"><h2 className="text-fs-lg font-semibold">{t('mapsLargeTitle')}</h2><p className="mt-2 max-w-3xl text-fs-sm leading-relaxed text-[var(--fg-muted)]">{t('mapsLargeHint')}</p><p className="mt-3 text-fs-sm font-medium">{t('mapsNoOverage')}</p></div>
  </div>;
}
