'use client';

import { useRef, useState, type FormEvent } from 'react';
import { selectFoodyOnboarding, type FoodyBillingOnboarding, type FoodyBillingView, type FoodyModule } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { LicenceInputs } from './SubscriptionAdditions';
import { commercialSelection, licenceTariffs } from '@/lib/commercial-catalog';
import { Badge, Button, PageHead, Section } from '@/components/ds';

/** Presents the catalogue or the configured private trial within owner billing. */
export function ModuleOnboarding({ restaurantId, view, onConfirmed }: {
  restaurantId: number;
  view: FoodyBillingView & { onboarding?: FoodyBillingOnboarding };
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
  if (!onboarding) return null;
  const { catalog, mode, trial_allowed: allowed, trial_days: days } = onboarding;
  const isPublic = mode === 'public';
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
      const next = await selectFoodyOnboarding(restaurantId, isPublic ? { modules: selectedPlan ? [] : selection, plan_id: planId, extra_pos_licences: extraPOS, extra_licences: extras } : {});
      onConfirmed(next);
    } catch {
      setError(true);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <div className="mx-auto max-w-[980px] space-y-6">
    <PageHead title={t('foodyModuleOnboarding')} desc={days > 0
      ? t('foodyModuleTrialAvailable').replace('{days}', String(days))
      : t('foodyModulePaymentAccess')} />
    <Section title={isPublic ? t('foodyModuleChoose') : t('foodyPilotOffer')}>
      <form onSubmit={submit} className="space-y-4">
        <Badge tone="warning">{t('foodyPilotSandbox')}</Badge>
        {!isPublic && view.offer && <>
          <h2 className="text-lg font-semibold" dir="auto">{view.offer.title}</h2>
          <p className="text-sm">{t('foodyModuleTrialIncludes')}</p>
        </>}
        {isPublic && !!catalog.plans?.filter(plan=>plan.published&&(days===0||plan.modules.every(id=>allowed.includes(id)))).length && <label className="block text-sm">{t('foodyUpgradePlans')}<select className="input mt-2 block w-full" value={planId} disabled={busy} onChange={e=>{setPlanId(e.target.value);setSelection([]);setExtras({});}}><option value="">{t('foodyUpgradeIndividual')}</option>{catalog.plans.filter(plan=>plan.published&&(days===0||plan.modules.every(id=>allowed.includes(id)))).map(plan=><option key={plan.id} value={plan.id}>{plan.name[locale]} · {money(plan.monthly_minor)}</option>)}</select></label>}
        <fieldset className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]" disabled={busy || !!planId}>
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
        </fieldset>
        {isPublic && !editable && hasPOS && <label className="block text-sm">
          {t('foodyModuleExtraPOS')} <bdi>{money(catalog.extra_pos_minor)}</bdi> {t('foodyModuleMonthlyHT')}
          <input className="input mt-2 block max-w-32" type="number" min={0} step={1} value={extra} onChange={event => setExtra(event.target.value)} />
        </label>}
        {isPublic && editable && selectedModules.length > 0 && <LicenceInputs catalog={catalog} limits={preview.seats} capabilities={preview.capabilities} values={extras} onChange={setExtras} disabled={busy} />}
        {isPublic && <p className="text-sm font-semibold">
          {preview.planName && <span className="block mb-1">{preview.planName[locale]}</span>}{t('foodyModuleTotal')} <bdi>{money(amount)}</bdi> {t('foodyModuleMonthlyHT')}
        </p>}
        {error && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('foodyModuleSelectionError')}</p>}
        <Button type="submit" disabled={busy || isPublic && (!selectedModules.length || !validExtra)}>
          {busy ? t('loading') : days > 0 ? t('foodyModuleStartTrial') : t('foodyModuleReviewOffer')}
        </Button>
      </form>
    </Section>
  </div>;
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
    <p>{t('foodyModuleSubscriptionIncludes')} {selected.map(product => product.name[locale]).join(', ')}</p>
    {access.status === 'trial' && <p>{t('foodyModuleTrialIncludes')} {enabled.map(product => product.name[locale]).join(', ')}</p>}
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
