'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ImageIcon, Palette } from 'lucide-react';
import { getRestaurant, updateRestaurant, type Restaurant } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, ConfirmDialog, Field, Input, PageHead, Section, Textarea } from '@/components/ds';

type Draft = Pick<Restaurant, 'name' | 'description' | 'logo_url'>;
function fromRestaurant(restaurant: Restaurant): Draft {
  if (typeof restaurant.name !== 'string') throw new Error('Incomplete restaurant identity');
  return { name: restaurant.name, description: restaurant.description ?? '', logo_url: restaurant.logo_url ?? '' };
}
function imageAddress(value: string) {
  if (!value) return true;
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^\/(?!\/)/.test(value) && !value.includes('\\')) return true;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}
const equal = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);

/** Edit the restaurant identity independently of Foody branding and website drafts. */
export default function BrandingSettingsPage() {
  const { restaurantId } = useParams();
  return <BrandingWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function BrandingWorkspace({ rid }: { rid: number }) {
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
  const [attempted, setAttempted] = useState(false);
  const [failedImage, setFailedImage] = useState('');
  const [leaving, setLeaving] = useState<string | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const lifetime = useRef({ generation: 0, sequence: 0 });
  const lock = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const dirty = !!draft && !equal(draft, baseline);
  const badName = !!draft && !draft.name.trim();
  const badUrl = !!draft && draft.logo_url !== baseline?.logo_url && !imageAddress(draft.logo_url || '');
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try { const next = fromRestaurant(await getRestaurant(rid)); if (current()) { setDraft(next); setBaseline(next); } }
    catch { if (current()) setLoadError(true); }
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
    setAttempted(true);
    if (badName || badUrl) { const input = formRef.current?.elements.namedItem(badName ? 'restaurant-name' : 'restaurant-logo'); if (input instanceof HTMLInputElement) input.focus(); return; }
    lock.current = true; setSaving(true); setSaveError(false); setSaved(false);
    const generation = lifetime.current.generation, current = () => generation === lifetime.current.generation;
    const input: Partial<Restaurant> = {};
    if (draft.name !== baseline.name) input.name = draft.name;
    if (draft.description !== baseline.description) input.description = draft.description;
    if (draft.logo_url !== baseline.logo_url) input.logo_url = draft.logo_url;
    try {
      const response = await updateRestaurant(rid, input);
      const next = fromRestaurant({ ...draft, ...response });
      if (current()) { setDraft(next); setBaseline(next); setAttempted(false); setSaved(true); }
    } catch { if (current()) setSaveError(true); }
    finally { if (current()) { lock.current = false; setSaving(false); } }
  };
  const logo = draft?.logo_url || '';
  const previewAvailable = !!logo && imageAddress(logo) && failedImage !== logo;
  return <div className="max-w-4xl space-y-6">
    <PageHead title={t('branding')} desc={t('brandingIdentityIntro')} actions={canEdit && <Button type="submit" form="restaurant-identity" disabled={loading || loadError || !dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button>} />
    {loading ? <p role="status" className="py-10 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('brandingLoadFailed')}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div> : draft && <form ref={formRef} id="restaurant-identity" noValidate onSubmit={save} className="space-y-6">
      {!canEdit && <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('pushPreferencesReadOnly')}</p>}
      <Section title={t('logoAndIdentity')} desc={t('brandingLiveHint')}>
        <div className="grid items-start gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
          <div className="space-y-3"><div className="flex aspect-square max-w-[180px] items-center justify-center overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface-2)] p-4" aria-label={t('brandingLogoPreview')}>
            {previewAvailable ? (
              // Restaurant logos can be remote or transparent; keep their full shape.
              // eslint-disable-next-line @next/next/no-img-element
              <img key={logo} src={logo} referrerPolicy="no-referrer" alt={t('brandingLogoPreview')} className="size-full object-contain" onError={() => setFailedImage(logo)} />
            ) : <ImageIcon className="size-12 text-[var(--fg-muted)]" aria-hidden="true" />}
          </div><p className="text-xs leading-5 text-[var(--fg-muted)]">{t(logo ? previewAvailable ? 'brandingPreviewHint' : 'brandingPreviewFailed' : 'brandingNoLogo')}</p>{logo && imageAddress(logo) && failedImage === logo && <Button type="button" variant="secondary" size="sm" onClick={() => setFailedImage('')}>{t('retry')}</Button>}</div>
          <div className="min-w-0 space-y-5">
            <Field label={t('name')}><Input name="restaurant-name" aria-label={t('name')} required dir="auto" value={draft.name} readOnly={!canEdit || saving} aria-invalid={attempted && badName ? true : undefined} aria-describedby={attempted && badName ? 'branding-name-error' : undefined} onChange={event => patch({ name: event.target.value })} />{attempted && badName && <span id="branding-name-error" className="text-sm text-[var(--danger-500)]">{t('brandingNameRequired')}</span>}</Field>
            <Field label={t('description')}><Textarea rows={4} dir="auto" value={draft.description} readOnly={!canEdit || saving} onChange={event => patch({ description: event.target.value })} /></Field>
            <Field label={t('logoUrl')} hint={<span id="branding-logo-hint">{t('brandingLogoUrlHint')}</span>}><Input name="restaurant-logo" dir="ltr" value={logo} readOnly={!canEdit || saving} autoComplete="off" spellCheck={false} aria-label={t('logoUrl')} aria-invalid={attempted && badUrl ? true : undefined} aria-describedby={`branding-logo-hint${attempted && badUrl ? ' branding-logo-error' : ''}`} onChange={event => { patch({ logo_url: event.target.value }); setFailedImage(''); }} />{attempted && badUrl && <span id="branding-logo-error" className="text-sm text-[var(--danger-500)]">{t('brandingLogoUrlInvalid')}</span>}</Field>
            {canEdit && logo && <Button type="button" variant="secondary" disabled={saving} onClick={() => setRemoveLogo(true)}>{t('brandingRemoveLogo')}</Button>}
          </div>
        </div>
      </Section>
      <Section title={t('brandingWebsiteTitle')}>
        <div className="flex items-start gap-3"><Palette className="mt-1 size-5 shrink-0 text-[var(--summary-fg)]" aria-hidden="true" /><div className="space-y-3 text-sm leading-6 text-[var(--fg-muted)]"><p>{t('brandingWebsiteHint')}</p><p>{t('brandingDraftLogoHint')}</p><Link className="inline-flex min-h-10 items-center font-semibold text-[var(--brand-ink)] underline underline-offset-4" href={`/${rid}/website-v3`}>{t('brandingOpenWebsite')}</Link></div></div>
      </Section>
      {saveError && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('brandingSaveFailed')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5"><p role="status" className="text-sm text-[var(--fg-muted)]">{t(saving ? 'saving' : dirty ? 'settingsUnsaved' : saved ? 'saved' : 'settingsUnchanged')}</p>{canEdit && <div className="flex gap-2"><Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => setLeaving('reset')}>{t('reset')}</Button><Button type="submit" disabled={!dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button></div>}</div>
    </form>}
    <ConfirmDialog open={removeLogo} onOpenChange={setRemoveLogo} title={t('brandingRemoveLogoTitle')} description={t('brandingRemoveLogoHint')} confirmLabel={t('remove')} cancelLabel={t('cancel')} onConfirm={() => { setRemoveLogo(false); patch({ logo_url: '' }); }} />
    <ConfirmDialog open={leaving !== null} onOpenChange={open => { if (!open) setLeaving(null); }} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { const target = leaving; setLeaving(null); setDraft(baseline); setAttempted(false); setSaveError(false); setSaved(false); if (target && target !== 'reset') router.push(target); }} />
  </div>;
}
