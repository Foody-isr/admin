'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Globe, ImageIcon, LinkIcon, LoaderCircle, Upload } from 'lucide-react';
import { useI18n, useCurrency } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, ConfirmDialog, EmptyState, Field, Input, PageHead, Section, Select } from '@/components/ds';
import TranslationReviewTable from '@/components/translations/TranslationReviewTable';
import { isLocale } from '@/lib/menu-import/primary-locale';
import { LOCALE_LABELS, SUPPORTED_LOCALES } from '@/components/translations/sections';
import { useMenuImport } from './useMenuImport';

/** Import and review a menu without carrying a draft across restaurants. */
export default function MenuImportPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  return <MenuImportWorkspace key={rid} rid={rid} />;
}

function MenuImportWorkspace({ rid }: { rid: number }) {
  const { t } = useI18n();
  const { money } = useCurrency();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const state = useMenuImport(rid, canEdit);
  const fileRef = useRef<HTMLInputElement>(null);
  const [discard, setDiscard] = useState(false);
  const [retryConfirm, setRetryConfirm] = useState(false);
  const disabled = !!state.busy || !!state.destination;
  const hasBranding = !!(state.extraction?.restaurant_logo_url || state.extraction?.restaurant_cover_url);
  const previewItem = state.extraction?.categories.flatMap(category => category.items).find(item => item.name.trim());
  const displayValue = (raw: string, locale: string) => {
    const text = raw.trim();
    const values = state.entries?.find(entry => entry.text === text)?.translations ?? {};
    return values[locale] || values[state.primaryLocale] || text;
  };
  const submit = () => state.confirmFailed ? setRetryConfirm(true) : void state.confirm();
  const primaryLanguage = <div className="space-y-3">
    <Field label={t('importPrimaryLanguageLabel')} className="max-w-md">
      <Select aria-describedby="menu-primary-language-hint" value={state.primaryLocale} disabled={disabled} onChange={event => {
        if (isLocale(event.target.value)) state.setPrimaryChoice(event.target.value);
      }}>
        {SUPPORTED_LOCALES.map(locale => <option key={locale} value={locale}>{LOCALE_LABELS[locale]}</option>)}
      </Select>
    </Field>
    <p id="menu-primary-language-hint" className="text-xs leading-5 text-[var(--fg-muted)]">{t('importPrimaryLanguageHint')}</p>
    {state.primaryChoice === null && state.detectedPrimary && <p className="text-xs text-[var(--fg-muted)]">{t('importPrimaryDetected')}</p>}
    {state.restaurantLocale && state.restaurantLocale !== state.primaryLocale && <p className="rounded-r-md bg-[var(--warning-50)] p-3 text-sm text-[var(--warning-700)]">
      {t('importPrimaryLanguageChange').replace('{from}', LOCALE_LABELS[state.restaurantLocale]).replace('{to}', LOCALE_LABELS[state.primaryLocale])}
    </p>}
  </div>;

  if (!canEdit) return <EmptyState title={t('noPermission')} desc={t('noPermissionDesc')} />;
  return <div className="mx-auto max-w-6xl space-y-6">
    <PageHead title={t('importMenuWithAI')} desc={t('menuImportDescription')} />
    {state.loading ? <p role="status" className="py-10 text-sm">{t('loading')}</p> : state.loadError ?
      <div role="alert" className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-5">
        <p className="mb-3 text-sm text-[var(--danger-500)]">{state.loadError}</p>
        <Button variant="secondary" onClick={() => void state.load()}>{t('retry')}</Button>
      </div> : state.destination ?
      <Section title={t('menuImportCompleted')}>
        <p role="status" className="mb-4 text-sm text-[var(--fg-muted)]">{t('menuImportCompletedHint')}</p>
        <Button asChild><Link href={state.destination}>{t('menuImportOpenResult')}</Link></Button>
      </Section> : <>
        <ol aria-label={t('menuImportSteps')} className="grid grid-cols-3 gap-2 border-b border-[var(--line)] pb-5">
          {(['upload', 'review', 'translations'] as const).map((step, index) => <li key={step} aria-current={state.step === step ? 'step' : undefined}
            className={`flex min-w-0 items-start gap-2 text-xs sm:text-sm ${state.step === step ? 'font-semibold text-[var(--fg)]' : 'text-[var(--fg-muted)]'}`}>
            <span className={`flex size-6 shrink-0 items-center justify-center rounded-full ${state.step === step ? 'bg-[var(--summary-bg)] text-[var(--summary-fg)]' : 'bg-[var(--surface-2)]'}`}>{index + 1}</span>
            <span className="pt-0.5">{t(step === 'upload' ? 'menuImportSource' : step === 'review' ? 'menuImportReview' : 'menuImportTranslations')}</span>
          </li>)}
        </ol>

        {state.step === 'upload' ? <Section title={t('menuImportSource')}>
          <div role="group" aria-label={t('menuImportSource')} className="mb-5 flex flex-wrap gap-2">
            {([{ value: 'photo', key: 'importSourcePhoto', icon: ImageIcon }, { value: 'wolt', key: 'importSourceWolt', icon: LinkIcon }, { value: 'website', key: 'importSourceWebsite', icon: Globe }] as const).map(({ value, key, icon: Icon }) =>
              <Button key={value} variant={state.source === value ? 'primary' : 'secondary'} aria-pressed={state.source === value} disabled={disabled}
                onClick={() => { state.setSource(value); state.setError(''); }}><Icon aria-hidden="true" />{t(key)}</Button>)}
          </div>
          <p className="mb-5 max-w-3xl text-sm leading-6 text-[var(--fg-muted)]">{t(state.source === 'photo' ? 'uploadMenuAI' : state.source === 'website' ? 'importWebsiteHint' : 'importWoltHint')}</p>
          {state.source === 'photo' ? <div className="rounded-r-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-2)] px-5 py-10 text-center">
            <Upload aria-hidden="true" className="mx-auto mb-4 size-7 text-[var(--fg-muted)]" />
            <Button variant="secondary" disabled={disabled} onClick={() => fileRef.current?.click()}>{t('menuImportChooseFile')}</Button>
            <p className="mt-3 text-xs text-[var(--fg-muted)]">{t('menuImportFileHint')}</p>
            <input ref={fileRef} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" disabled={disabled}
              onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void state.upload(file); }} />
          </div> : <form noValidate className="max-w-3xl space-y-4" onSubmit={event => { event.preventDefault(); void state.fetchURL(); }}>
            <Field label={t('menuImportURL')}>
              <Input type="url" dir="ltr" value={state.url} disabled={disabled} aria-invalid={!!state.error} aria-describedby={state.error ? 'menu-import-error' : undefined}
                placeholder={t(state.source === 'website' ? 'importWebsiteUrlPlaceholder' : 'importWoltUrlPlaceholder')}
                onChange={event => { state.setUrl(event.target.value); state.setError(''); }} />
            </Field>
            <Button type="submit" disabled={disabled || !state.url.trim()}>{t('importWoltFetch')}</Button>
          </form>}
        </Section> : state.extraction && <>
          <div className="rounded-r-lg bg-[var(--summary-bg)] px-5 py-4 text-sm leading-6 text-[var(--summary-fg)]">
            {t('menuImportSummary').replace('{categories}', String(state.extraction.categories.length)).replace('{items}', String(state.totalItems))}
          </div>
          {state.step === 'review' ? <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
            <div className="min-w-0 space-y-4">
              {state.extraction.categories.map((category, ci) => <section key={ci} className="overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
                <h2 className="break-words border-b border-[var(--line)] bg-[var(--surface-2)] px-5 py-4 text-base font-semibold" dir="auto">{category.name}</h2>
                <ul className="divide-y divide-[var(--line)]">
                  {category.items.map((item, ii) => <li key={ii} className="space-y-3 p-5">
                    <div className="flex items-start gap-3">
                      {item.image_url && /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={item.image_url} alt="" className="size-12 shrink-0 rounded-r-md object-cover" />}
                      <div className="min-w-0 flex-1">
                        <h3 className="break-words text-sm font-semibold" dir="auto">{item.name}</h3>
                        {item.description && <p className="mt-1 whitespace-pre-line break-words text-xs leading-5 text-[var(--fg-muted)]" dir="auto">{item.description}</p>}
                        <p className="mt-2 text-sm font-semibold tabular-nums"><bdi>{money(item.pricing_mode === 'by_weight' ? item.price_per_kg ?? 0 : item.price)}</bdi>
                          {item.pricing_mode === 'by_weight' && <span className="ms-2 text-xs font-normal text-[var(--fg-muted)]">{t('pricePerKgLabel')}</span>}</p>
                        {item.pricing_mode === 'by_weight' && item.estimated_weight_grams !== undefined && <p className="mt-1 text-xs text-[var(--fg-muted)]">{t('estimatedWeightLabel')} · <bdi>{item.estimated_weight_grams} g</bdi></p>}
                      </div>
                    </div>
                    {(!!item.option_sets?.length || !!item.modifier_sets?.length) && <details className="rounded-r-md border border-[var(--line)]">
                      <summary className="cursor-pointer px-3 py-3 text-xs font-medium focus-visible:shadow-ring">{[
                        item.option_sets?.length ? t('menuImportOptionGroups').replace('{count}', String(item.option_sets.length)) : '',
                        item.modifier_sets?.length ? t('menuImportModifierGroups').replace('{count}', String(item.modifier_sets.length)) : '',
                      ].filter(Boolean).join(' · ')}</summary>
                      <div className="space-y-4 border-t border-[var(--line)] p-3">
                        {item.option_sets?.map((group, gi) => <div key={`o${gi}`} className="space-y-2">
                          <p className="break-words text-sm font-medium" dir="auto">{group.name}</p>
                          <p className="text-xs text-[var(--fg-muted)]">{t('menuImportAbsolutePrices')}</p>
                          {group.options.map((option, oi) => <div key={oi} className="flex flex-wrap items-start justify-between gap-2 text-xs">
                            <span className="min-w-0 flex-1 break-words" dir="auto">{option.name}</span>
                            <bdi className="shrink-0 tabular-nums">{money(option.price)}</bdi>
                          </div>)}
                        </div>)}
                        {item.modifier_sets?.map((group, gi) => <div key={`m${gi}`} className="space-y-2">
                          <p className="break-words text-sm font-medium" dir="auto">{group.name}</p>
                          <p className="text-xs text-[var(--fg-muted)]">{t('menuImportDeltaPrices')}</p>
                          <p className="text-xs text-[var(--fg-muted)]">{t(group.is_required ? 'required' : 'optional')} · {t('menuImportSelectionBounds')}: <bdi dir="ltr">{group.min_selections}–{group.max_selections === 0 ? '∞' : group.max_selections}</bdi></p>
                          {group.modifiers.map((modifier, mi) => <div key={mi} className="flex flex-wrap items-start justify-between gap-2 text-xs">
                            <span className="min-w-0 flex-1 break-words" dir="auto">{modifier.name}</span><bdi className="shrink-0 tabular-nums">{modifier.price_delta > 0 ? '+' : ''}{money(modifier.price_delta)}</bdi>
                          </div>)}
                        </div>)}
                      </div>
                    </details>}
                  </li>)}
                </ul>
              </section>)}
            </div>
            <Section title={t('menuImportOptions')}>
              <fieldset disabled={disabled} className="min-w-0 space-y-5">
                <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 shrink-0" checked={state.createCarte} onChange={event => state.setCreateCarte(event.target.checked)} />{t('importCreateCarteLabel')}</label>
                {state.createCarte && <Field label={t('importCarteNameLabel')}><Input dir="auto" value={state.carteName} placeholder={t('importCarteNameDefault')} onChange={event => state.setCarteName(event.target.value)} /></Field>}
                {!state.createCarte && <p className="text-xs leading-5 text-[var(--fg-muted)]">{t('menuImportLibraryHint')}</p>}
                <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 shrink-0" checked={state.autoTranslate} onChange={event => state.toggleTranslation(event.target.checked)} />{t('importAutoTranslateLabel')}</label>
                {hasBranding && <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 shrink-0" checked={state.importBranding} onChange={event => state.setImportBranding(event.target.checked)} />{t('importBrandingLabel')}</label>}
                <div className="border-t border-[var(--line)] pt-5">{primaryLanguage}</div>
              </fieldset>
            </Section>
          </div> : <>
            <Section title={t('menuImportTranslations')} desc={t('importLangReviewIntro')}>
              {primaryLanguage}
              {previewItem && <div className="mt-5 space-y-3">
                <h3 className="text-sm font-semibold">{t('importPreviewHeading')}</h3>
                <div className="grid gap-3 md:grid-cols-3">
                  {SUPPORTED_LOCALES.map(locale => <div key={locale} dir={locale === 'he' ? 'rtl' : 'ltr'} className="min-w-0 rounded-r-md bg-[var(--surface-2)] p-4">
                    <p className="mb-2 text-xs text-[var(--fg-muted)]">{LOCALE_LABELS[locale]}{locale === state.primaryLocale ? ` · ${t('importPrimaryTag')}` : ''}</p>
                    <p className="break-words text-sm font-semibold">{displayValue(previewItem.name, locale)}</p>
                    {previewItem.description && <p className="mt-1 break-words text-xs leading-5 text-[var(--fg-muted)]">{displayValue(previewItem.description, locale)}</p>}
                  </div>)}
                </div>
              </div>}
            </Section>
            {state.entries && <TranslationReviewTable entries={state.entries} sectionSources={state.sectionSources} onSectionSourceChange={state.changeSource} onEdit={state.editTranslation} disabled={disabled} />}
          </>}
        </>}

        {state.busy && <p role="status" className="flex items-center gap-2 text-sm text-[var(--fg-muted)]"><LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />{t(state.busy === 'extract' ? 'analyzingMenuAI' : state.busy === 'translate' ? 'trReviewTranslating' : 'creating')}</p>}
        {state.translationError && state.autoTranslate && <div role="alert" className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="text-sm text-[var(--danger-500)]">{t('menuImportTranslationFailed')} {state.translationError}</p>
          <Button className="mt-3" variant="secondary" disabled={disabled} onClick={() => void state.preview()}>{t('retry')}</Button>
        </div>}
        {state.error && <div role="alert" id="menu-import-error" className="space-y-2 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm">
          <p className="text-[var(--danger-500)]">{state.error}</p>
          {state.confirmFailed && <><p className="leading-6 text-[var(--fg-muted)]">{t('menuImportUncertain')}</p><Link href={`/${rid}/menu/items`} className="inline-block underline underline-offset-4">{t('menuImportCheckCatalog')}</Link></>}
        </div>}
        {state.step !== 'upload' && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
          <div className="flex flex-wrap gap-2">
            {state.step === 'translations' && <Button variant="secondary" disabled={disabled} onClick={() => state.setStep('review')}>{t('back')}</Button>}
            <Button variant="ghost" disabled={disabled} onClick={() => setDiscard(true)}>{t('menuImportRestart')}</Button>
          </div>
          {state.step === 'review' && state.autoTranslate ? <Button disabled={disabled || !state.entries || !!state.translationError} onClick={() => state.setStep('translations')}>{t('trReviewContinue')}</Button>
            : <Button disabled={disabled || (state.autoTranslate && (!state.entries || !!state.translationError))} onClick={submit}>{t('importItems').replace('{count}', String(state.totalItems))}</Button>}
        </div>}
      </>}
    <ConfirmDialog open={discard} onOpenChange={setDiscard} title={t('menuImportRestart')} description={t(state.confirmFailed ? 'menuImportUncertain' : 'menuImportDiscardHint')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} danger onConfirm={state.reset} />
    <ConfirmDialog open={retryConfirm} onOpenChange={setRetryConfirm} title={t('menuImportRetryTitle')} description={t('menuImportUncertain')} confirmLabel={t('retry')} cancelLabel={t('cancel')} onConfirm={() => void state.confirm()} />
    <ConfirmDialog open={!!state.pendingSource} onOpenChange={open => { if (!open) state.setPendingSource(null); }} title={t('menuImportReplaceTranslations')} description={t('menuImportReplaceTranslationsHint')} confirmLabel={t('confirm')} cancelLabel={t('cancel')}
      onConfirm={() => { const job = state.pendingSource; state.setPendingSource(null); if (job) void state.preview(job); }} />
  </div>;
}
