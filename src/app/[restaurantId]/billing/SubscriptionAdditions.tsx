'use client';

import { useEffect, useState } from 'react';
import { ApiError, getFoodyCommercialCatalog, prepareFoodyUpgrade, type FoodyBillingView, type FoodyCommercialCatalog, type FoodyModule, type FoodySeatLimits } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, Section } from '@/components/ds';
import { commercialSelection, combineLicenceLimits, licenceTariffs } from '@/lib/commercial-catalog';
import { LicenceCapacity } from '@/components/billing/Entitlements';

const extras = Object.entries(licenceTariffs) as [keyof typeof licenceTariffs, string][];

/** Edits separately priced user and physical-device additions. Quotation-only items cannot be purchased online. */
export function LicenceInputs({ catalog, limits, capabilities, values, onChange, disabled }: {
  catalog: FoodyCommercialCatalog; limits: FoodySeatLimits; capabilities: string[]; values: Record<string, number>; onChange: (next: Record<string, number>) => void; disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  return <div className="space-y-3">{extras.map(([key, rateID]) => {
    const tariff = catalog.tariffs?.find(row => row.id === rateID);
    const rate = tariff ? tariff.amount_minor : (key === 'pos' ? catalog.extra_pos_minor : null);
    if ((key === 'pos' || key === 'pos_devices') && !['pos', 'cash_management', 'payment_terminals'].some(feature => capabilities.includes(feature))) return null;
    if (key === 'chef' && !catalog.capabilities?.some(feature => feature.category === 'kitchen' && feature.key !== 'kds' && capabilities.includes(feature.key))) return null;
    if (key === 'kds' && !capabilities.includes('kds')) return null;
    if ((key === 'employees' || key === 'pos_devices') && limits[key] == null) return null;
    return <label key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] p-3 text-sm">
      <span><span className="block font-medium">{t('foodyLicence_' + key)}</span><span className="text-[var(--fg-muted)]">{rate === null ? t('foodyUpgradeQuote') : `${new Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS' }).format(rate / 100)} ${t('foodyModuleMonthlyHT')}`}</span></span>
      <input className="input w-24" aria-label={t('foodyLicence_' + key)} type="number" min={0} max={10000} step={1} disabled={disabled || rate === null} value={values[key] ?? 0} onChange={e => onChange({ ...values, [key]: Number(e.target.value) })} />
    </label>;
  })}</div>;
}

/** Prepares a priced addition; the existing checkout asks for consent before any new access is granted. */
export function SubscriptionAdditions({ rid, view, onPrepared }: { rid: number; view: FoodyBillingView; onPrepared: (view: FoodyBillingView) => void }) {
  const { t, locale } = useI18n();
  const [catalog, setCatalog] = useState<FoodyCommercialCatalog | null>(null);
  const [planId, setPlanId] = useState('');
  const [modules, setModules] = useState<FoodyModule[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const request = new AbortController();
    getFoodyCommercialCatalog(rid, request.signal).then(value => { if (!request.signal.aborted) setCatalog(value); }, () => { if (!request.signal.aborted) setError('billingLoadError'); });
    return () => request.abort();
  }, [rid]);
  const access = view.onboarding?.access;
  if (!access?.enforced || access.status !== 'active') return null;
  const locked = !!view.payment && ['creating', 'pending', 'review'].includes(view.payment.status);
  const addition = catalog ? commercialSelection(catalog, modules, planId) : null;
  const availablePlans = catalog?.plans?.filter(plan => plan.published && plan.modules.every(id => !access.modules.includes(id))) ?? [];
  const hasAddition = !!planId || modules.length > 0 || Object.values(quantities).some(n => Number.isSafeInteger(n) && n > 0);
  async function review() {
    if (!catalog || busy || !hasAddition) return;
    setBusy(true); setError('');
    try {
      const next = await prepareFoodyUpgrade(rid, { catalog_version: catalog.version, modules: planId ? [] : modules, plan_id: planId, extra_licences: Object.fromEntries(Object.entries(quantities).filter(([, n]) => n > 0)) });
      onPrepared(next); setPlanId(''); setModules([]); setQuantities({}); document.getElementById('foody-offer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setError(error instanceof ApiError && error.licence ? 'foodyLicenceExceeded' : 'foodyModuleSelectionError'); }
    finally { setBusy(false); }
  }
  return <div id="add-licences" className="space-y-4">
    <LicenceCapacity rid={rid} refreshKey={view.agreement?.offer_id} />
    <Section title={t('foodyUpgradeAdd')}>
      <p className="mb-4 text-sm text-[var(--fg-muted)]">{t('foodyUpgradeReviewHint')}</p>
      {catalog && <fieldset disabled={busy || locked} className="space-y-4">
        {availablePlans.length > 0 && <label className="block text-sm">{t('foodyUpgradePlans')}<select className="input mt-2 w-full" value={planId} onChange={event => { setPlanId(event.target.value); setModules([]); setQuantities({}); }}><option value="">{t('foodyUpgradeIndividual')}</option>{availablePlans.map(plan => <option key={plan.id} value={plan.id}>{plan.name[locale]} · {new Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS' }).format(plan.monthly_minor / 100)}</option>)}</select></label>}
        {!planId && catalog.products.filter(product => !access.modules.includes(product.id)).map(product => <label key={product.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--line)] p-3 text-sm"><input type="checkbox" checked={modules.includes(product.id)} onChange={e => { setModules(current => e.target.checked ? [...current, product.id] : current.filter(id => id !== product.id)); setQuantities({}); }} /><span className="flex-1 font-semibold">{product.name[locale]}</span><span>{new Intl.NumberFormat(locale, { style: 'currency', currency: 'ILS' }).format(product.monthly_minor / 100)} {t('foodyModuleMonthlyHT')}</span></label>)}
        <LicenceInputs catalog={catalog} limits={addition && addition.modules.length ? combineLicenceLimits(access.seats, addition.seats) : access.seats} capabilities={[...(access.capabilities ?? []), ...(addition?.capabilities ?? [])]} values={quantities} onChange={setQuantities} disabled={busy || locked} />
        <Button disabled={busy || locked || !hasAddition} onClick={() => void review()}>{busy ? t('loading') : t('foodyUpgradeReview')}</Button>
      </fieldset>}
      {error && <p role="alert" className="mt-3 text-sm text-[var(--danger-500)]">{t(error)}</p>}
    </Section>
  </div>;
}
