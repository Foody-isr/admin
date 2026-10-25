'use client';

import { BooleanInput } from '@/components/ds/Selection';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { CreditCard, Info } from 'lucide-react';
import { getRestaurantSettings, updateRestaurantSettings, type RestaurantSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, ConfirmDialog, Field, NumberField, PageHead, Section, Select } from '@/components/ds';

type Draft = { vat_rate: number; tips_enabled: boolean; online_payment_only: boolean | undefined; weight_hold_buffer_percent: number | undefined };
function draftFrom(settings: RestaurantSettings): Draft {
  if (!Number.isFinite(settings.vat_rate) || typeof settings.tips_enabled !== 'boolean') throw new Error('Incomplete payment settings');
  return { vat_rate: settings.vat_rate!, tips_enabled: settings.tips_enabled, online_payment_only: typeof settings.online_payment_only === 'boolean' ? settings.online_payment_only : undefined, weight_hold_buffer_percent: Number.isFinite(settings.weight_hold_buffer_percent) ? settings.weight_hold_buffer_percent : undefined };
}
const equal = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);

/** Edit supported payment settings without inferring missing provider or policy data. */
export default function PaymentsSettingsPage() {
  const { restaurantId } = useParams();
  return <PaymentsWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function PaymentsWorkspace({ rid }: { rid: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const lifetime = useRef({ generation: 0, sequence: 0 });
  const lock = useRef(false);
  const dirty = !!draft && !equal(draft, baseline);
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try {
      const settings = await getRestaurantSettings(rid), next = draftFrom(settings);
      if (current()) { setDraft(next); setBaseline(next); }
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
  const patch = (value: Partial<Draft>) => { if (!canEdit || lock.current) return; setDraft(current => current ? { ...current, ...value } : null); setSaved(false); setSaveError(false); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!canEdit || !draft || !baseline || !dirty || lock.current || loading || loadError) return;
    lock.current = true; setSaving(true); setSaveError(false); setSaved(false);
    const generation = lifetime.current.generation, current = () => generation === lifetime.current.generation;
    // Never rewrite an unknown online-payment policy while changing VAT or tips.
    // Omitted fields stay unknown, including on an older API deployment.
    const input: Partial<RestaurantSettings> = {};
    if (draft.vat_rate !== baseline.vat_rate) input.vat_rate = draft.vat_rate;
    if (draft.tips_enabled !== baseline.tips_enabled) input.tips_enabled = draft.tips_enabled;
    if (draft.online_payment_only !== undefined && draft.online_payment_only !== baseline.online_payment_only) input.online_payment_only = draft.online_payment_only;
    if (draft.weight_hold_buffer_percent !== undefined && draft.weight_hold_buffer_percent !== baseline.weight_hold_buffer_percent) {
      if (!Number.isFinite(draft.weight_hold_buffer_percent) || draft.weight_hold_buffer_percent < 0 || draft.weight_hold_buffer_percent > 100) { lock.current = false; setSaving(false); setSaveError(true); return; }
      input.weight_hold_buffer_percent = draft.weight_hold_buffer_percent;
    }
    try {
      const response = await updateRestaurantSettings(rid, input);
      const next = draftFrom({ ...draft, ...response, online_payment_only: typeof response.online_payment_only === 'boolean' ? response.online_payment_only : draft.online_payment_only });
      if (current()) { setDraft(next); setBaseline(next); setSaved(true); }
    } catch { if (current()) setSaveError(true); }
    finally { if (current()) { lock.current = false; setSaving(false); } }
  };
  return <div className="max-w-4xl space-y-6">
    <PageHead title={t('paymentsAndVat')} desc={t('paymentSettingsIntro')} actions={canEdit && <Button type="submit" form="payment-settings" disabled={loading || loadError || !dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button>} />
    {loading ? <p role="status" className="py-10 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('paymentSettingsLoadFailed')}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div> : draft && <form id="payment-settings" onSubmit={save} className="space-y-6">
      {!canEdit && <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('pushPreferencesReadOnly')}</p>}
      <Section title={t('paymentMethods')}>
        <div className="flex items-start gap-3 rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]"><CreditCard className="mt-1 size-5 shrink-0" aria-hidden="true" /><p>{t('paymentProviderManaged')}</p></div>
        <div className="my-5 flex flex-wrap items-center justify-between gap-3 rounded-r-md border border-[var(--line)] p-4"><div><p className="text-sm font-semibold">Cibus · Pluxee</p><p className="mt-1 text-sm text-[var(--fg-muted)]">{t('paymentCibusLinkHint')}</p></div><Link className="inline-flex min-h-10 items-center rounded-r-md px-3 text-sm font-semibold text-[var(--brand-ink)] hover:bg-[var(--surface-2)]" href={`/${rid}/settings/cibus`}>{t('paymentCibusLink')}</Link></div>
        <Field label={t('onlinePaymentOnly')} hint={<span id="payment-policy-hint">{t('paymentPolicyHint')}</span>}><Select aria-label={t('onlinePaymentOnly')} aria-describedby="payment-policy-hint" disabled={!canEdit || saving} value={draft.online_payment_only === undefined ? 'unknown' : String(draft.online_payment_only)} onChange={event => patch({ online_payment_only: event.target.value === 'true' })}>
          {baseline?.online_payment_only === undefined && <option value="unknown" disabled>{t('paymentPolicyUnknownOption')}</option>}
          <option value="true">{t('paymentPolicyOnline')}</option><option value="false">{t('paymentPolicyFlexible')}</option>
        </Select></Field>
        {baseline?.online_payment_only === undefined && <p className="mt-3 text-sm leading-6 text-[var(--fg-muted)]">{t('paymentPolicyUnknownHint')}</p>}
      </Section>
      <Section title={t('vatRatesTitle')} desc={t('paymentVatHint')}>
        <div className="max-w-xs"><Field label={t('paymentDefaultVat')}><NumberField required min={Math.min(0, baseline?.vat_rate ?? 0)} max={Math.max(100, baseline?.vat_rate ?? 100)} value={draft.vat_rate} format={String} readOnly={!canEdit || saving} onChange={vat_rate => patch({ vat_rate })} dir="ltr" /></Field></div>
      </Section>
      <Section title={t('paymentTipsTitle')}>
        <label className="flex items-start gap-4"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t('enableTips')}</span><span id="payment-tips-hint" className="mt-1 block text-sm leading-6 text-[var(--fg-muted)]">{t('enableTipsDesc')}</span></span><BooleanInput aria-label={t('enableTips')} aria-describedby="payment-tips-hint" checked={draft.tips_enabled} disabled={!canEdit || saving} onChange={event => patch({ tips_enabled: event.target.checked })} /></label>
        <p className="mt-5 text-sm leading-6 text-[var(--fg-muted)]">{t('paymentTipsFixed')}</p>
      </Section>
      <Section title={t('weightHoldBufferTitle')}>
        <div className="flex items-start gap-3 text-sm leading-6 text-[var(--fg-muted)]"><Info className="mt-1 size-4 shrink-0" aria-hidden="true" /><p id="weight-buffer-hint">{t('paymentWeightHelp')}</p></div>
        {draft.weight_hold_buffer_percent !== undefined ? <>
          <div className="mt-4 max-w-xs"><Field label={t('weightHoldBufferLabel')}><NumberField aria-describedby="weight-buffer-hint weight-buffer-example" min={0} max={100} readOnly={!canEdit || saving} value={draft.weight_hold_buffer_percent} format={String} onChange={weight_hold_buffer_percent => patch({ weight_hold_buffer_percent })} dir="ltr" /></Field></div>
          <p id="weight-buffer-example" className="mt-3 text-sm leading-6 text-[var(--fg-muted)]">{t('paymentWeightExample').replace('{margin}', String(draft.weight_hold_buffer_percent)).replace('{hold}', String(Math.round((150 + draft.weight_hold_buffer_percent) * 100) / 100))}</p>
        </> : <p className="mt-3 text-sm font-medium">{t('paymentWeightUnknown')}</p>}
      </Section>
      {saveError && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('paymentSettingsSaveFailed')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5"><p role="status" className="text-sm text-[var(--fg-muted)]">{t(saving ? 'saving' : dirty ? 'settingsUnsaved' : saved ? 'saved' : 'settingsUnchanged')}</p>{canEdit && <div className="flex gap-2"><Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => setLeaving('reset')}>{t('reset')}</Button><Button type="submit" disabled={!dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button></div>}</div>
    </form>}
    <ConfirmDialog open={leaving !== null} onOpenChange={open => { if (!open) setLeaving(null); }} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { const target = leaving; setLeaving(null); setDraft(baseline); setSaveError(false); setSaved(false); if (target && target !== 'reset') router.push(target); }} />
  </div>;
}
