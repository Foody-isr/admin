'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getRestaurantSettings, updateRestaurantSettings, type RestaurantSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { RestaurantRequestGuard } from '@/lib/restaurant-request-state';
import { Button, ConfirmDialog, Field, PageHead, Section, Select } from '@/components/ds';
import StockSettingsNav from '@/components/settings/StockSettingsNav';

type StockDraft = Pick<RestaurantSettings, 'default_stock_unit' | 'auto_disable_soldout'>;
function stockDraft(settings:RestaurantSettings):StockDraft {
  return {default_stock_unit:settings.default_stock_unit ?? '',auto_disable_soldout:settings.auto_disable_soldout ?? false};
}

/** Default units and retained legacy stock configuration with explicit save state. */
export default function StockSettingsPage() {
  const {restaurantId} = useParams();
  return <StockSettingsWorkspace key={String(restaurantId)} rid={Number(restaurantId)}/>;
}

function StockSettingsWorkspace({rid}: {rid:number}) {
  const {t} = useI18n();
  const router = useRouter();
  const {hasAnyPermission} = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');
  const [draft,setDraft] = useState<StockDraft | null>(null);
  const [baseline,setBaseline] = useState<StockDraft | null>(null);
  const [loading,setLoading] = useState(true);
  const [loadError,setLoadError] = useState('');
  const [saving,setSaving] = useState(false);
  const [saveError,setSaveError] = useState('');
  const [saved,setSaved] = useState(false);
  const [pending,setPending] = useState<string | null>(null);
  const lock = useRef(false);
  const guard = useRef(new RestaurantRequestGuard());
  guard.current.enterRestaurant(rid);
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(baseline);
  const reload = useCallback(async () => {
    const request = guard.current.begin(rid);
    setLoading(true);setLoadError('');
    try {
      const result = stockDraft(await getRestaurantSettings(rid));
      if (guard.current.isCurrent(request)) {setDraft(result);setBaseline(result);}
    } catch (cause) {if (guard.current.isCurrent(request)) setLoadError(cause instanceof Error ? cause.message : t('workspaceLoadError'));}
    finally {if (guard.current.isCurrent(request)) setLoading(false);}
  },[rid,t]);
  useEffect(() => {const current = guard.current;void reload();return () => current.invalidate();},[reload]);
  useEffect(() => {
    const warn = (event:BeforeUnloadEvent) => {if (dirty || lock.current) {event.preventDefault();event.returnValue='';}};
    const navigate = (event:MouseEvent) => {
      if ((!dirty && !lock.current) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || link.href === location.href || link.origin !== location.origin) return;
      event.preventDefault();event.stopPropagation();
      if (!lock.current) setPending(link.pathname+link.search+link.hash);
    };
    window.addEventListener('beforeunload',warn);document.addEventListener('click',navigate,true);
    return () => {window.removeEventListener('beforeunload',warn);document.removeEventListener('click',navigate,true);};
  },[dirty]);
  const save = async (event:React.FormEvent) => {
    event.preventDefault();if (!canEdit || !draft || !dirty || lock.current) return;
    lock.current = true;setSaving(true);setSaveError('');setSaved(false);
    try {
      const result = stockDraft(await updateRestaurantSettings(rid,draft));
      setDraft(result);setBaseline(result);setSaved(true);
    } catch (cause) {setSaveError(cause instanceof Error ? cause.message : t('saveFailed'));}
    finally {lock.current = false;setSaving(false);}
  };
  return <div className="max-w-4xl space-y-5">
    <PageHead title={t('stockSettings')} desc={t('stockSettingsDesc')}/>
    <StockSettingsNav/>
    {loading ? <p role="status" className="py-12 text-center text-fg-secondary">{t('loading')}</p>
      : loadError ? <div role="alert" className="space-y-4 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-[var(--danger-500)]">{loadError}</p><Button size="lg" variant="secondary" onClick={() => void reload()}>{t('retry')}</Button></div>
      : draft && <form onSubmit={save} className="space-y-5">
        <fieldset disabled={saving || !canEdit} className="min-w-0">
          <Section title={t('defaultStockUnitTitle')} desc={t('defaultStockUnitHint')}>
            <Field className="max-w-sm" label={t('defaultStockUnitLabel')}><Select className="min-h-11" value={draft.default_stock_unit} onChange={event => {setDraft({...draft,default_stock_unit:event.target.value as StockDraft['default_stock_unit']});setSaved(false);}}>
              <option value="">{t('manualStockUnitPortions')}</option><option value="g">{t('defaultStockUnitGrams')}</option><option value="kg">{t('defaultStockUnitKilograms')}</option>
              {draft.default_stock_unit && !['g','kg'].includes(draft.default_stock_unit) && <option value={draft.default_stock_unit}>{draft.default_stock_unit}</option>}
            </Select></Field>
          </Section>
        </fieldset>
        <Section title={t('autoDisableSoldoutTitle')} desc={t('stockAvailabilityCurrentHint')}>
          <Link className="inline-flex min-h-11 items-center font-medium text-[var(--brand-ink)] underline underline-offset-4" href={`/${rid}/settings/stock/availability`}>{t('availabilityManageRules')}</Link>
          <details className="mt-4 border-t border-[var(--line)] pt-2">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">{t('stockLegacySettings')}</summary>
            <p id="stock-legacy-hint" className="mb-3 text-sm text-fg-secondary">{t('stockLegacyHint')}</p>
            <label className="flex min-h-11 items-center gap-3 text-sm selection-row"><input aria-label={t('autoDisableSoldoutLabel')} aria-describedby="stock-legacy-hint" type="checkbox" className="size-5 shrink-0 accent-[var(--brand-ink)]" checked={draft.auto_disable_soldout} disabled={saving || !canEdit} onChange={event => {setDraft({...draft,auto_disable_soldout:event.target.checked});setSaved(false);}}/>{t('autoDisableSoldoutLabel')}</label>
          </details>
        </Section>
        {saveError && <p role="alert" className="text-sm text-[var(--danger-500)]">{saveError}</p>}
        <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-5">
          <p role="status" className="min-w-0 text-sm text-fg-secondary">{t(saving ? 'saving' : saved ? 'saved' : dirty ? 'settingsUnsaved' : 'settingsUnchanged')}</p>
          {canEdit && <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" size="lg" variant="secondary" disabled={!dirty || saving} onClick={() => setPending('reset')}>{t('reset')}</Button><Button size="lg" type="submit" disabled={!dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button></div>}
        </div>
      </form>}
    <ConfirmDialog open={pending !== null} onOpenChange={open => {if (!open) setPending(null);}} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => {
      const destination = pending;setPending(null);setDraft(baseline);setSaved(false);setSaveError('');
      if (destination && destination !== 'reset') router.push(destination);
    }}/>
  </div>;
}
