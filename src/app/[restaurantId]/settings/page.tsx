'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getRestaurant, updateRestaurant, type Restaurant, type DashboardRevenueMode, type DateBasis } from '@/lib/api';
import { useI18n, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n';
import { Button, Field, Input, PageHead, Section, Select } from '@/components/ds';
import { usePermissions } from '@/lib/permissions-context';
import { currencySymbol } from '@/lib/currency';

const LOCALE_LABELS: Record<Locale, string> = { en: 'English', he: 'עברית', fr: 'Français' };

type SettingsDraft = {
  name: string;
  address: string;
  phone: string;
  timezone: string;
  currency: string;
  orders_default_date_basis: DateBasis;
  dashboard_default_date_basis: DateBasis;
  dashboard_revenue_mode: DashboardRevenueMode;
};

function fromRestaurant(r: Restaurant): SettingsDraft {
  return {
    name: r.name ?? '', address: r.address ?? '', phone: r.phone ?? '',
    timezone: r.timezone || 'Asia/Jerusalem', currency: r.currency || 'ILS',
    orders_default_date_basis: r.orders_default_date_basis ?? 'created',
    dashboard_default_date_basis: r.dashboard_default_date_basis ?? 'created',
    dashboard_revenue_mode: r.dashboard_revenue_mode ?? 'paid_only',
  };
}

/** Restaurant settings with explicit persistence, recoverable errors and local language preference. */
export default function SettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale, setLocale, setCurrency } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [baseline, setBaseline] = useState<SettingsDraft | null>(null);
  const [loadedId, setLoadedId] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dirty = loadedId === rid && JSON.stringify(draft) !== JSON.stringify(baseline);

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(false); setSaved(false); setSaveError(null);
    getRestaurant(rid).then(r => {
      if (!active) return;
      const values = fromRestaurant(r);
      setDraft(values); setBaseline(values); setLoadedId(rid);
    }).catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [rid, attempt]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.href === location.href || link.origin !== location.origin) return;
      if (!window.confirm(t('discardUnsavedChanges'))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', navigate, true); };
  }, [dirty, t]);

  function change<K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) {
    setDraft(current => current ? { ...current, [key]: value } : current);
    setSaved(false);
  }

  async function save() {
    if (!draft || !canEdit || !dirty || saving) return;
    setSaving(true); setSaveError(null); setSaved(false);
    try {
      await updateRestaurant(rid, draft);
      setBaseline(draft);
      setCurrency(draft.currency);
      setSaved(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : t('saveFailed'));
    } finally { setSaving(false); }
  }

  const head = <PageHead title={t('general')} desc={t('settingsGeneralDesc')} />;
  if (loading || (!loadError && loadedId !== rid)) return <div className="max-w-[880px]" aria-busy="true">{head}<div role="status" className="space-y-4"><span className="sr-only">{t('loading')}</span>{[0, 1, 2].map(i => <div key={i} className="h-44 animate-pulse rounded-r-lg bg-[var(--surface-2)]" />)}</div></div>;
  if (loadError || !draft) return <div className="max-w-[880px]">{head}<Section><div role="alert" className="pt-5 text-[var(--danger-500)]">{t('workspaceLoadError')}</div><Button className="mt-4" onClick={() => setAttempt(n => n + 1)}>{t('retry')}</Button></Section></div>;

  return (
    <div className="max-w-[880px]">
      {head}
      <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <fieldset disabled={!canEdit || saving} className="min-w-0">
          <Section title={t('restaurantInfo')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('name')}><Input required value={draft.name} onChange={e => change('name', e.target.value)} /></Field>
              <Field label={t('phone')}><Input type="tel" dir="ltr" value={draft.phone} onChange={e => change('phone', e.target.value)} /></Field>
              <Field className="sm:col-span-2" label={t('address')}><Input value={draft.address} onChange={e => change('address', e.target.value)} /></Field>
            </div>
          </Section>
          <Section title={t('preferences')} desc={t('settingsRegionalDesc')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('timezone')}><Select dir="ltr" value={draft.timezone} onChange={e => change('timezone', e.target.value)}>
                {Array.from(new Set([draft.timezone, 'Asia/Jerusalem', 'Europe/Paris', 'America/New_York', 'UTC'])).map(zone => <option key={zone} value={zone}>{zone}</option>)}
              </Select></Field>
              <Field label={t('currency')}><Select value={draft.currency} onChange={e => change('currency', e.target.value)}>
                {Array.from(new Set([draft.currency, 'ILS', 'EUR', 'USD'])).map(code => <option key={code} value={code}>{code} ({currencySymbol(code)})</option>)}
              </Select></Field>
            </div>
          </Section>
          <Section title={t('displayDefaults')} desc={t('displayDefaultsDesc')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('ordersDefaultDateBasis')}><Select value={draft.orders_default_date_basis} onChange={e => change('orders_default_date_basis', e.target.value as DateBasis)}>
                <option value="created">{t('dateBasisCreatedOption')}</option><option value="serie">{t('dateBasisSerieOption')}</option>
              </Select></Field>
              <Field label={t('dashboardDefaultDateBasis')}><Select value={draft.dashboard_default_date_basis} onChange={e => change('dashboard_default_date_basis', e.target.value as DateBasis)}>
                <option value="created">{t('dateBasisCreatedOption')}</option><option value="serie">{t('dateBasisSerieOption')}</option>
              </Select></Field>
            </div>
          </Section>
          <Section title={t('dashboardRevenueCalculation')} desc={t('dashboardRevenueCalculationDesc')}>
            <Field label={t('dashboardRevenueMode')} hint={t(`${draft.dashboard_revenue_mode}Desc`)}>
              <Select value={draft.dashboard_revenue_mode} onChange={e => change('dashboard_revenue_mode', e.target.value as DashboardRevenueMode)}>
                {(['paid_only', 'accepted_orders', 'completed_orders', 'all_active_orders'] as const).map(mode => <option key={mode} value={mode}>{t(`${mode}Option`)}</option>)}
              </Select>
            </Field>
          </Section>
        </fieldset>
        <div className="sticky bottom-0 z-10 mb-5 flex flex-wrap items-center gap-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4">
          <div className="min-w-0 flex-1 text-fs-sm" role="status" aria-live="polite">{saving ? t('saving') : saved ? t('saved') : dirty ? t('settingsUnsaved') : t('settingsUnchanged')}</div>
          {canEdit && <Button type="submit" variant="primary" disabled={!dirty || saving} aria-busy={saving}>{saving ? t('saving') : t('saveChanges')}</Button>}
          {saveError && <p role="alert" className="w-full text-fs-sm text-[var(--danger-500)]">{saveError}</p>}
        </div>
      </form>
      <Section title={t('language')} desc={t('settingsLanguageLocal')}>
        <Field label={t('language')}><Select value={locale} onChange={e => setLocale(e.target.value as Locale)}>
          {SUPPORTED_LOCALES.map(language => <option key={language} value={language}>{LOCALE_LABELS[language]}</option>)}
        </Select></Field>
      </Section>
      <Section title={t('settingsUnavailableTitle')} desc={t('settingsUnavailableDesc')}>
        <p className="text-fs-sm text-[var(--fg-muted)]">{[t('legalName'), t('email'), t('taxId'), t('seatingCapacity'), t('numberFormat')].join(' · ')}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button disabled>{t('exportAllData')}</Button>
          {canEdit && <Button variant="danger" disabled>{t('closeAccountAction')}</Button>}
        </div>
      </Section>
    </div>
  );
}
