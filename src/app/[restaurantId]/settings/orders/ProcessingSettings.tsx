'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChefHat, ShoppingBag, Truck, UtensilsCrossed } from 'lucide-react';
import { getRestaurant, getRestaurantSettings, updateRestaurantSettings, type RestaurantSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, ConfirmDialog, Field, Input, Section, Select } from '@/components/ds';
import { SettingsWorkspace } from '@/components/settings/SettingsWorkspace';

const CHANNELS = ['dine_in', 'pickup', 'delivery'] as const;
type Channel = typeof CHANNELS[number];
type Policy = { prepayment: boolean; kitchen: boolean | null | undefined };
type Draft = { service: string; prep: string; policies: Record<Channel, Policy> };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function draftFrom(settings: RestaurantSettings): Draft {
  if (typeof settings.service_mode !== 'string' || !Number.isFinite(settings.pickup_prep_time_minutes) || CHANNELS.some(channel => typeof settings[`require_${channel}_prepayment`] !== 'boolean' || (settings[`auto_send_${channel}_to_kitchen`] != null && typeof settings[`auto_send_${channel}_to_kitchen`] !== 'boolean'))) throw new Error('Incomplete processing settings');
  return { service: settings.service_mode, prep: String(settings.pickup_prep_time_minutes), policies: Object.fromEntries(CHANNELS.map(channel => [channel, { prepayment: settings[`require_${channel}_prepayment`], kitchen: settings[`auto_send_${channel}_to_kitchen`] }])) as Draft['policies'] };
}

/** Configure each order channel without pinning inherited kitchen policies. */
export default function ProcessingSettings() {
  const { restaurantId } = useParams();
  return <ProcessingWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function ProcessingWorkspace({ rid }: { rid: number }) {
  const { t } = useI18n(); const router = useRouter();
  const { hasAnyPermission } = usePermissions(); const canEdit = hasAnyPermission('settings.edit');
  const [draft, setDraft] = useState<Draft | null>(null), [baseline, setBaseline] = useState<Draft | null>(null);
  const [enabled, setEnabled] = useState<Record<Channel, boolean> | null>(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState(false), [saved, setSaved] = useState(false);
  const [invalid, setInvalid] = useState(false), [leaving, setLeaving] = useState<string | null>(null);
  const lifetime = useRef({ generation: 0, sequence: 0 }); const lock = useRef(false);
  const dirty = !!draft && !equal(draft, baseline);
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try {
      const [restaurant, settings] = await Promise.all([getRestaurant(rid), getRestaurantSettings(rid)]);
      const next = draftFrom(settings);
      if (CHANNELS.some(channel => typeof restaurant[`${channel}_enabled`] !== 'boolean')) throw new Error('Incomplete channel availability');
      if (current()) { setDraft(next); setBaseline(next); setEnabled(Object.fromEntries(CHANNELS.map(channel => [channel, restaurant[`${channel}_enabled`]])) as Record<Channel, boolean>); }
    } catch { if (current()) setLoadError(true); }
    finally { if (current()) setLoading(false); }
  }, [rid]);
  useEffect(() => { const current = lifetime.current; void load(); return () => { current.generation += 1; }; }, [load]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || lock.current) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: MouseEvent) => {
      if ((!dirty && !lock.current) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || link.origin !== location.origin || link.href === location.href) return;
      event.preventDefault(); event.stopPropagation(); if (!lock.current) setLeaving(link.pathname + link.search + link.hash);
    };
    window.addEventListener('beforeunload', guard); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', guard); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  const patch = (value: Partial<Draft>) => { if (!canEdit || lock.current) return; setDraft(current => current ? { ...current, ...value } : current); setSaved(false); setSaveError(false); setInvalid(false); };
  const patchPolicy = (channel: Channel, value: Partial<Policy>) => { if (draft && enabled?.[channel]) patch({ policies: { ...draft.policies, [channel]: { ...draft.policies[channel], ...value } } }); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!canEdit || !draft || !baseline || !dirty || lock.current || loading || loadError) return;
    const input: Partial<RestaurantSettings> = {};
    if (draft.prep !== baseline.prep) {
      const minutes = Number(draft.prep);
      if (!/^\d+$/.test(draft.prep) || !Number.isInteger(minutes) || minutes < 0 || minutes > 240) { setInvalid(true); document.getElementById('processing-prep')?.focus(); return; }
      input.pickup_prep_time_minutes = minutes;
    }
    if (draft.service !== baseline.service) input.service_mode = draft.service;
    for (const channel of CHANNELS) {
      if (draft.policies[channel].prepayment !== baseline.policies[channel].prepayment) input[`require_${channel}_prepayment`] = draft.policies[channel].prepayment;
      // A null/absent override belongs to the workflow/global policy. The API cannot clear an override with null.
      if (draft.policies[channel].kitchen !== baseline.policies[channel].kitchen && typeof draft.policies[channel].kitchen === 'boolean') input[`auto_send_${channel}_to_kitchen`] = draft.policies[channel].kitchen;
    }
    lock.current = true; setSaving(true); setSaveError(false); setSaved(false);
    const generation = lifetime.current.generation, current = () => generation === lifetime.current.generation;
    try { const response = await updateRestaurantSettings(rid, input), next = draftFrom(response); if (current()) { setDraft(next); setBaseline(next); setSaved(true); } }
    catch { if (current()) setSaveError(true); }
    finally { if (current()) { lock.current = false; setSaving(false); } }
  };
  const linkStyle = 'inline-flex min-h-10 items-center rounded-r-md px-2 text-sm font-semibold text-[var(--brand-ink)] hover:bg-[var(--surface-2)]';
  return <SettingsWorkspace title={t('ordersProcessingTitle')} description={t('ordersProcessingDesc')}>
    {loading ? <p role="status" className="py-10 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('processingLoadFailed')}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div> : draft && enabled && <form onSubmit={save} noValidate className="space-y-6">
      {!canEdit && <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('pushPreferencesReadOnly')}</p>}
      <div className="flex items-start gap-3 rounded-r-lg bg-[var(--summary-bg)] p-5 text-sm leading-6 text-[var(--summary-fg)]"><ChefHat className="mt-1 size-5 shrink-0" aria-hidden="true" /><p>{t('ordersProcessingGuideDesc')}</p></div>
      <Section title={t('ordersProcessingSettingsTitle')} desc={t('ordersProcessingSettingsDesc')}>
        <div className="grid items-start gap-4 xl:grid-cols-3">{CHANNELS.map(channel => {
          const title = t(channel === 'dine_in' ? 'ordersProcessingDineInTitle' : channel === 'pickup' ? 'ordersProcessingPickupTitle' : 'delivery');
          const Icon = channel === 'dine_in' ? UtensilsCrossed : channel === 'pickup' ? ShoppingBag : Truck;
          const policy = draft.policies[channel], inherited = policy.kitchen == null;
          return <fieldset key={channel} data-channel={channel} disabled={!canEdit || saving || !enabled[channel]} className="min-w-0 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4">
            <legend className="sr-only">{title}</legend>
            <div className="mb-4 flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-r-md bg-[var(--surface-2)] text-[var(--brand-ink)]"><Icon className="size-5" aria-hidden="true" /></span><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs text-[var(--fg-muted)]">{t(enabled[channel] ? 'active' : 'ordersProcessingInactive')}</p></div></div>
            <div className="space-y-5">
              <Field label={t('ordersFlowPaymentLabel')}><Select aria-label={`${title} · ${t('ordersFlowPaymentLabel')}`} value={String(policy.prepayment)} onChange={event => patchPolicy(channel, { prepayment: event.target.value === 'true' })}><option value="true">{t('ordersFlowPayBefore')}</option><option value="false">{t('ordersFlowPayAfter')}</option></Select></Field>
              <Field label={t('ordersFlowKitchenLabel')}><Select aria-label={`${title} · ${t('ordersFlowKitchenLabel')}`} value={inherited ? 'inherited' : String(policy.kitchen)} aria-describedby={`processing-${channel}-hint`} onChange={event => patchPolicy(channel, { kitchen: event.target.value === 'inherited' ? baseline?.policies[channel].kitchen : event.target.value === 'true' })}>{baseline?.policies[channel].kitchen == null && <option value="inherited">{t('processingInherited')}</option>}<option value="true">{t('ordersFlowKitchenAutomatic')}</option><option value="false">{t('ordersFlowKitchenManual')}</option></Select></Field>
              <p id={`processing-${channel}-hint`} className="text-sm leading-6 text-[var(--fg-muted)]">{t(inherited ? 'processingInheritedHint' : policy.prepayment ? policy.kitchen ? 'ordersFlowResultPaidAuto' : 'ordersFlowResultPaidManual' : policy.kitchen ? 'ordersFlowResultLaterAuto' : 'ordersFlowResultLaterManual')}</p>
              {baseline?.policies[channel].kitchen == null && <p className="text-xs leading-5 text-[var(--fg-muted)]">{t('processingOverrideHint')}</p>}
              {!enabled[channel] && <Link href={`/${rid}/settings/orders/availability`} className={linkStyle}>{t('ordersProcessingManage')}</Link>}
            </div>
          </fieldset>;
        })}</div>
        <p className="mt-5 text-sm leading-6 text-[var(--fg-muted)]">{t('cashPrepaymentNote')}</p>
        <Link href={`/${rid}/settings/orders/workflow`} className={`mt-2 ${linkStyle}`}>{t('processingViewWorkflow')}</Link>
      </Section>
      <Section title={t('ordersProcessingOperationalDetails')}>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3"><Field label={t('serviceMode')} hint={t('ordersProcessingDineInDesc')}><Select aria-label={t('serviceMode')} value={draft.service} disabled={!canEdit || saving || !enabled.dine_in} onChange={event => patch({ service: event.target.value })}>{!['table','counter'].includes(baseline?.service ?? '') && <option value={baseline?.service} disabled>{t('processingExistingMode').replace('{mode}', baseline?.service || '—')}</option>}<option value="table">{t('tableService')}</option><option value="counter">{t('counterService')}</option></Select></Field><p className="text-sm leading-6 text-[var(--fg-muted)]">{t(['table','counter'].includes(draft.service) ? 'processingDefaultWorkflowHint' : 'processingHistoricModeHint')}</p>{!enabled.dine_in && <p className="text-sm text-[var(--fg-muted)]">{t('ordersProcessingInactive')}</p>}</div>
          <div><Field label={t('pickupPrepTime')} hint={t('ordersPickupPrepHint')}><Input aria-label={t('pickupPrepTime')} id="processing-prep" type="number" inputMode="numeric" min={Math.min(0, Number(baseline?.prep ?? 0))} max={Math.max(240, Number(baseline?.prep ?? 240))} step={1} dir="ltr" value={draft.prep} readOnly={!canEdit || saving || !enabled.pickup} aria-invalid={invalid || undefined} aria-describedby={invalid ? 'processing-prep-error' : 'processing-prep-unit'} onChange={event => patch({ prep: event.target.value })} /></Field><p id="processing-prep-unit" className="mt-2 text-sm text-[var(--fg-muted)]">{t('ordersMinutesShort')} · {t('processingPrepRange')}</p>{invalid && <p id="processing-prep-error" role="alert" className="mt-2 text-sm text-[var(--danger-500)]">{t('processingPrepInvalid')}</p>}{!enabled.pickup && <p className="mt-3 text-sm text-[var(--fg-muted)]">{t('ordersProcessingInactive')}</p>}</div>
        </div>
      </Section>
      {saveError && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('processingSaveFailed')}</p>}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-2"><p role="status" className="text-sm text-[var(--fg-muted)]">{t(saving ? 'saving' : dirty ? 'settingsUnsaved' : saved ? 'saved' : 'settingsUnchanged')}</p>{canEdit && <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2 sm:flex sm:w-auto"><Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => setLeaving('reset')}>{t('reset')}</Button><Button type="submit" className="whitespace-normal" disabled={!dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button></div>}</div>
    </form>}
    <ConfirmDialog open={leaving !== null} onOpenChange={open => { if (!open) setLeaving(null); }} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { const target = leaving; setLeaving(null); setDraft(baseline); setInvalid(false); setSaveError(false); setSaved(false); if (target && target !== 'reset') router.push(target); }} />
  </SettingsWorkspace>;
}
