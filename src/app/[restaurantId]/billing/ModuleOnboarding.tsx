'use client';

import { useRef, useState, type FormEvent } from 'react';
import { selectFoodyOnboarding, selectFoodyPublicPlan, type FoodyBillingOnboarding, type FoodyBillingView, type FoodyModule } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { LicenceInputs } from './SubscriptionAdditions';
import { commercialSelection, licenceTariffs } from '@/lib/commercial-catalog';
import styles from './billing-portal.module.css';
import { Button } from '@/components/ds';

/** Presents the catalogue or the configured private trial within owner billing. */
export function ModuleOnboarding({ restaurantId, view, onConfirmed, compare = false }: {
  restaurantId: number;
  view: FoodyBillingView & { onboarding?: FoodyBillingOnboarding };
  compare?: boolean;
  onConfirmed: (view: FoodyBillingView) => void;
}) {
  const { t, locale } = useI18n();
  const [selection, setSelection] = useState<FoodyModule[]>([]);
  const [extra, setExtra] = useState('0');
  const [planId, setPlanId] = useState('');
  const [extras, setExtras] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const submitting = useRef(false);
  const onboarding = view.onboarding;
  const catalog = compare ? view.plan_catalog : onboarding?.catalog;
  if (!catalog) return null;
  const isPublic = compare || onboarding?.mode === 'public';
  const days = compare ? 0 : onboarding?.trial_days ?? 0;
  const allowed = onboarding?.trial_allowed ?? [];
  const products = catalog.products.filter(product => isPublic ? days === 0 || allowed.includes(product.id) : allowed.includes(product.id));
  const preview = commercialSelection(catalog, selection, planId);
  const selectedPlan = catalog.plans?.find(plan => plan.id === planId);
  const selectedModules = preview.modules;
  const editable = catalog.products.some(product => product.capabilities !== undefined);
  const hasPOS = preview.capabilities.includes('pos') || !editable && selectedModules.includes('restaurant');
  const extraPOS = !editable && hasPOS ? Number(extra) : 0;
  const validExtra = Number.isSafeInteger(extraPOS) && extraPOS >= 0 && extraPOS <= 10000 && Object.values(extras).every(n => Number.isSafeInteger(n) && n >= 0 && n <= 10000);
  const amount = preview.monthlyMinor + (validExtra ? extraPOS * catalog.extra_pos_minor : 0)
    + Object.entries(extras).reduce((sum, [key, n]) => sum + n * (catalog.tariffs?.find(row => row.id === licenceTariffs[key as keyof typeof licenceTariffs])?.amount_minor ?? 0), 0);
  const money = (minor: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: catalog.currency }).format(minor / 100);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || isPublic && (!selectedModules.length || !validExtra)) return;
    submitting.current = true;
    setError(false);
    setBusy(true);
    try {
      const choice = { modules: selectedPlan ? [] : selection, plan_id: planId, extra_pos_licences: extraPOS, extra_licences: extras };
      const next = compare && view.plan_catalog
        ? await selectFoodyPublicPlan(restaurantId, { ...choice, catalog_version: view.plan_catalog.version, expected_offer_id: view.offer?.id ?? 0 })
        : await selectFoodyOnboarding(restaurantId, isPublic ? choice : {});
      onConfirmed(next);
    } catch {
      setError(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const plans = catalog.plans?.filter(plan => plan.published && (days === 0 || plan.modules.every(id => allowed.includes(id)))) ?? [];
  const trialEnd = view.lifecycle?.trial_end;
  return <section id="subscription" tabIndex={-1} className={styles.panel}>
    <h2>{t(compare ? 'foodyPlanChoose' : 'foodyModuleOnboarding')}</h2>
    <p className={styles.hint}>{compare
      ? trialEnd && (view.lifecycle?.state === 'trial' || view.lifecycle?.state === 'expired')
        ? t(view.lifecycle.state === 'trial' ? 'foodyPlanTrialUntil' : 'foodyPlanTrialEnded').replace('{date}', new Intl.DateTimeFormat(locale,{dateStyle:'long', timeZone:'Asia/Jerusalem'}).format(new Date(trialEnd)))
        : t('foodyPlanCompareHint')
      : days > 0 ? t('foodyModuleTrialAvailable').replace('{days}', String(days)) : t('foodyModulePaymentAccess')}</p>
      <form onSubmit={submit} className={styles.checkout + ' mt-5'}>
        <div className="space-y-4">
        {!isPublic && view.offer && <>
          <h2 className="text-lg font-semibold" dir="auto">{view.offer.title}</h2>
          <p className="text-sm">{t('foodyModuleTrialIncludes')}</p>
        </>}
        {isPublic && plans.length > 0 && <fieldset className={styles.choices} disabled={busy}>
          <legend>{t('foodyPlanOptions')}</legend>
          {plans.map(plan => <label key={plan.id} className={styles.option} data-selectable="true" data-selected={planId === plan.id}>
            <span className={styles.optionHead}><strong>{plan.name[locale]}</strong>
              <input type="radio" name="foody-plan" checked={planId === plan.id} onChange={() => {setPlanId(plan.id); setSelection([]); setExtras({});}} /></span>
            <span className={styles.optionPrice}><bdi>{money(plan.monthly_minor)}</bdi> <small>{t('foodyModuleMonthlyHT')}</small></span>
            <span className={styles.optionNote}>{catalog.products.filter(product => plan.modules.includes(product.id)).map(product => product.name[locale]).join(' · ')}</span>
          </label>)}
          <label className={styles.option} data-selectable="true" data-selected={!planId}>
            <span className={styles.optionHead}><strong>{t('foodyUpgradeIndividual')}</strong>
              <input type="radio" name="foody-plan" checked={!planId} onChange={() => {setPlanId(''); setExtras({});}} /></span>
          </label>
        </fieldset>}
        {!planId && <fieldset className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]" disabled={busy || !!planId}>
          {products.map(product => (
            <label key={product.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              {isPublic && <input type="checkbox" checked={selectedModules.includes(product.id)} onChange={event => {
                setSelection(current => event.target.checked ? [...current, product.id] : current.filter(id => id !== product.id));
                setExtras({});
              }} />}
              <span className="flex-1 font-semibold">{product.name[locale]}</span>
              {isPublic && <span><bdi>{money(product.monthly_minor)}</bdi> {t('foodyModuleMonthlyHT')}</span>}
            </label>
          ))}
        </fieldset>}
        {isPublic && !editable && hasPOS && <label className="block text-sm">
          {t('foodyModuleExtraPOS')} <bdi>{money(catalog.extra_pos_minor)}</bdi> {t('foodyModuleMonthlyHT')}
          <input className="input mt-2 block max-w-32" type="number" min={0} step={1} value={extra} onChange={event => setExtra(event.target.value)} />
        </label>}
        {isPublic && editable && selectedModules.length > 0 && <LicenceInputs catalog={catalog} limits={preview.seats} capabilities={preview.capabilities} values={extras} onChange={setExtras} disabled={busy} />}
        </div><div className={styles.order}>
        {isPublic && <p className="text-sm font-semibold">
          {preview.planName && <span className="block mb-1">{preview.planName[locale]}</span>}{t('foodyModuleTotal')} <bdi>{money(amount)}</bdi> {t('foodyModuleMonthlyHT')}
        </p>}
        {error && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('foodyModuleSelectionError')}</p>}
        <Button type="submit" disabled={busy || isPublic && (!selectedModules.length || !validExtra)}>
          {busy ? t('loading') : days > 0 ? t('foodyModuleStartTrial') : t('foodyModuleReviewOffer')}
        </Button></div>
      </form>
    </section>;
}

/** Displays the active sandbox scope and its date beside the payment summary. */
export function ModuleAccessSummary({ restaurantId, onboarding }: { restaurantId: number; onboarding: FoodyBillingOnboarding }) {
  const { t, locale } = useI18n();
  const { access, catalog } = onboarding;
  const selected = catalog.products.filter(product => onboarding.selection.includes(product.id));
  const enabled = catalog.products.filter(product => access.modules.includes(product.id));
  const expires = access.trial_ends_at && new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'Asia/Jerusalem' }).format(new Date(access.trial_ends_at));
  return <div className="space-y-3 rounded-lg border border-[var(--line)] p-4 text-sm">
    <p className="font-semibold">{t('foodyModuleStatus_' + access.status)}{access.status === 'trial' && expires ? ` · ${expires}` : ''}</p>
    {access.plan_name && <p className="font-semibold">{access.plan_name[locale]}</p>}
    {selected.length > 0 && <p>{t('foodyModuleSubscriptionIncludes')} {selected.map(product => product.name[locale]).join(', ')}</p>}
    {access.status === 'trial' && enabled.length > 0 && <p>{t('foodyModuleTrialIncludes')} {enabled.map(product => product.name[locale]).join(', ')}</p>}
    {(onboarding.licences.pos > 0 || onboarding.licences.chef > 0 || (onboarding.licences.pos_devices ?? 0) > 0) && <p className="text-[var(--fg-muted)]">
      {t(onboarding.licences.pos_users_unlimited ? 'foodyDeviceLicences' : 'foodyModuleLicences').replace('{pos}', String(onboarding.licences.pos_users_unlimited ? onboarding.licences.pos_devices ?? 0 : onboarding.licences.pos)).replace('{chef}', String(onboarding.licences.chef)).replace('{kds}', String(onboarding.licences.kds))}
    </p>}
    {(access.status === 'trial' || access.status === 'active') && (
      <a className="inline-flex min-h-11 items-center rounded-md font-semibold underline underline-offset-4" href={`/${restaurantId}/dashboard`}>
        {t('foodyModuleOpenWorkspace')}
      </a>
    )}
    {access.status === 'trial' && <p className="text-[var(--fg-muted)]">{t('foodyModulePaidStarts')}</p>}
  </div>;
}
