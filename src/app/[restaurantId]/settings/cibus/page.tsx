'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CreditCard, ShieldCheck } from 'lucide-react';
import { getCibusCreds, updateCibusCreds, type CibusCreds, type UpdateCibusCredsInput } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Badge, Button, ConfirmDialog, PageHead, Section } from '@/components/ds';
import { PasswordField } from '@/components/PasswordField';

const emptyDraft = { cibus_restaurant_id: '', cibus_pos_id: '', cibus_company_code: '' };
const fields = [
  { key: 'cibus_restaurant_id', label: 'cibusRestaurantId', mask: 'masked_restaurant_id' },
  { key: 'cibus_pos_id', label: 'cibusPosId', mask: 'masked_pos_id' },
  { key: 'cibus_company_code', label: 'cibusCompanyCode', mask: 'masked_company_code' },
] as const;
// The resolver parses positive Go integers. Preserve the original string and its
// leading zeroes; masked hints must never be submitted as replacement values.
const validIdentifier = (value: string) => /^\d+$/.test(value) && /[1-9]/.test(value) && BigInt(value) <= BigInt('9223372036854775807');

/** Replace a complete Cibus terminal identity, retaining only masked readback. */
export default function CibusSettingsPage() {
  const { restaurantId } = useParams();
  return <CibusWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function CibusWorkspace({ rid }: { rid: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');
  const [creds, setCreds] = useState<CibusCreds | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [replace, setReplace] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const lifetime = useRef({ generation: 0, sequence: 0 });
  const lock = useRef(false);
  const dirty = Object.values(draft).some(Boolean);
  const valid = Object.values(draft).every(validIdentifier);
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try {
      const response = await getCibusCreds(rid);
      if (typeof response.enabled !== 'boolean') throw new Error('Incomplete Cibus status');
      if (current()) setCreds(response);
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
      event.preventDefault(); event.stopPropagation();
      if (!lock.current) setLeaving(link.pathname + link.search + link.hash);
    };
    window.addEventListener('beforeunload', guard); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', guard); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  const save = async () => {
    setReplace(false);
    if (!canEdit || !creds?.enabled || lock.current || loading || loadError || !valid) return;
    lock.current = true; setSaving(true); setError(''); setSaved(false);
    const generation = lifetime.current.generation;
    const current = () => generation === lifetime.current.generation;
    try {
      await updateCibusCreds(rid, { ...draft } satisfies UpdateCibusCredsInput);
      if (!current()) return;
      // A successful write is a receipt. Clear plaintext immediately; a failed
      // readback must offer GET retry only, never a repeat of this confirmed PUT.
      setDraft(emptyDraft); setAttempted(false); setSaved(true); setCreds({ enabled: true });
      await load();
    } catch { if (current()) setError('cibusSaveUnconfirmed'); }
    finally { if (current()) { lock.current = false; setSaving(false); } }
  };
  const review = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!canEdit || loading || loadError || lock.current || !creds?.enabled) return;
    setAttempted(true); setError('');
    if (valid) setReplace(true);
    else {
      const field = fields.find(field => !validIdentifier(draft[field.key]));
      const input = field ? event.currentTarget.elements.namedItem(field.key) : null;
      if (input instanceof HTMLInputElement) input.focus();
    }
  };
  return <div className="max-w-4xl space-y-6">
    <PageHead title={t('cibusSettings')} desc={t('cibusSettingsDesc')} />
    {saved && <p role="status" className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{t('cibusSavedReceipt')}</p>}
    {loading ? <p role="status" className="py-8 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t(saved ? 'cibusReadbackFailed' : 'cibusLoadFailed')}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div> : creds && <>
      {!canEdit && <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('pushPreferencesReadOnly')}</p>}
      <Section title={t('cibusStatusTitle')}>
        <div className="flex flex-wrap items-center gap-3"><span className="grid size-10 place-items-center rounded-r-md bg-[var(--summary-bg)] text-[var(--summary-fg)]"><CreditCard className="size-5" aria-hidden="true" /></span><span className="min-w-0 flex-1 text-sm font-semibold">Cibus · Pluxee</span><Badge tone={creds.enabled ? 'info' : 'neutral'}>{t(creds.enabled ? 'cibusProviderSelected' : 'cibusProviderNotSelected')}</Badge></div>
        <p className="mt-4 text-sm leading-6 text-[var(--fg-muted)]">{t(creds.enabled ? 'cibusStatusHint' : 'cibusNotEnabledDesc')}</p>
        {creds.enabled && <dl className="mt-5 grid gap-4 sm:grid-cols-3">{fields.map(field => <div key={field.key} className="min-w-0 rounded-r-md border border-[var(--line)] p-4"><dt className="text-xs font-medium text-[var(--fg-muted)]">{t(field.label)}</dt><dd className="mt-2 break-all text-sm font-semibold"><bdi dir="ltr">{creds[field.mask] || t('cibusNoSavedHint')}</bdi></dd></div>)}</dl>}
      </Section>
      {creds.enabled && canEdit && <form onSubmit={review} noValidate className="space-y-6">
        <Section title={t('cibusCredentialsTitle')} desc={t('cibusCredentialsHint')}>
          <div className="grid gap-5 sm:grid-cols-3">{fields.map(field => <PasswordField key={field.key} name={field.key} label={t(field.label)} value={draft[field.key]} dir="ltr" inputMode="numeric" autoComplete="new-password" spellCheck={false} required readOnly={saving || replace} error={attempted && !validIdentifier(draft[field.key]) ? t('cibusIdentifierInvalid') : undefined} onChange={event => { if (lock.current || replace) return; setDraft(current => ({ ...current, [field.key]: event.target.value })); setSaved(false); setError(''); }} />)}</div>
          <p className="mt-5 flex items-start gap-3 rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]"><ShieldCheck className="mt-1 size-4 shrink-0" aria-hidden="true" />{t('cibusPrivacyHint')}</p>
        </Section>
        {error && <p role="alert" className="text-sm text-[var(--danger-500)]">{t(error)}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5"><p role="status" className="text-sm text-[var(--fg-muted)]">{t(saving ? 'saving' : dirty ? 'settingsUnsaved' : 'settingsUnchanged')}</p><div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => setLeaving('reset')}>{t('clear')}</Button><Button type="submit" disabled={!dirty || saving}>{t(saving ? 'saving' : 'cibusReviewReplacement')}</Button></div></div>
      </form>}
    </>}
    <ConfirmDialog open={replace} onOpenChange={setReplace} title={t('cibusReplaceTitle')} description={t('cibusReplaceDescription')} confirmLabel={t('cibusReplaceConfirm')} cancelLabel={t('cancel')} onConfirm={() => void save()} />
    <ConfirmDialog open={leaving !== null} onOpenChange={open => { if (!open) setLeaving(null); }} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { const target = leaving; setLeaving(null); setDraft(emptyDraft); setAttempted(false); setError(''); if (target && target !== 'reset') router.push(target); }} />
  </div>;
}
