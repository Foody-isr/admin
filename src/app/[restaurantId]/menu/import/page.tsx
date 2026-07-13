'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  importMenuAI, importMenuFromWolt, confirmMenuImport, previewTranslationsGrouped, getRestaurant,
  RichExtraction, TranslationReviewEntry,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { SparklesIcon, LinkIcon, ImageIcon } from 'lucide-react';
import TranslationReviewTable from '@/components/translations/TranslationReviewTable';
import {
  LOCALE_LABELS, SUPPORTED_LOCALES, sectionFor, detectLocale, type Locale,
} from '@/components/translations/sections';
import { isLocale, collectReviewEntries, dominantLocale } from '@/lib/menu-import/primary-locale';

type ImportSource = 'photo' | 'wolt';

export default function MenuImportPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const router = useRouter();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');

  const [source, setSource] = useState<ImportSource>('photo');
  const [step, setStep] = useState<'upload' | 'review' | 'translations'>('upload');
  const [extraction, setExtraction] = useState<RichExtraction | null>(null);
  const [error, setError] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [woltUrl, setWoltUrl] = useState('');
  const [importBranding, setImportBranding] = useState(false);
  const [createCarte, setCreateCarte] = useState(true);
  const [carteName, setCarteName] = useState('');
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [trEntries, setTrEntries] = useState<TranslationReviewEntry[] | null>(null);
  const [trLoading, setTrLoading] = useState(false);
  // section key -> the language its original text is written in (auto-detected,
  // overridable). Drives the per-section translation direction.
  const [sectionSources, setSectionSources] = useState<Record<string, string>>({});
  // The user's explicit pick, if they made one. Null means "nobody has chosen",
  // which is NOT the same as English — conflating those two is the whole bug.
  const [primaryChoice, setPrimaryChoice] = useState<Locale | null>(null);
  // The restaurant's current default_locale, so we can warn when this import
  // will change it (which re-keys the existing catalog server-side).
  const [restaurantLocale, setRestaurantLocale] = useState<Locale | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getRestaurant(rid)
      .then((r) => {
        if (isLocale(r.default_locale)) setRestaurantLocale(r.default_locale);
      })
      .catch(() => {});
  }, [rid]);

  // Translate a set of entries: group each section's texts by its source
  // language, then fetch a full per-locale map so every language is populated.
  const runGroupedPreview = async (
    entries: TranslationReviewEntry[],
    sources: Record<string, string>,
  ) => {
    const bySource: Record<string, Set<string>> = {};
    for (const e of entries) {
      const src = sources[sectionFor(e.usage)] ?? 'en';
      (bySource[src] ||= new Set()).add(e.text);
    }
    const groups = Object.entries(bySource).map(([source_locale, texts]) => ({
      source_locale, texts: Array.from(texts),
    }));
    const translations = await previewTranslationsGrouped(rid, groups);
    return entries.map((e) => ({ ...e, translations: translations[e.text] ?? e.translations }));
  };

  // Detect each section's source language as soon as a menu is extracted —
  // independent of auto-translate, because the primary language must be offered
  // even when the user is not translating anything.
  useEffect(() => {
    if (!extraction) return;
    const entries = collectReviewEntries(extraction);
    if (entries.length === 0) return;
    const bySection: Record<string, string[]> = {};
    for (const e of entries) (bySection[sectionFor(e.usage)] ||= []).push(e.text);
    const sources: Record<string, string> = {};
    for (const [sec, texts] of Object.entries(bySection)) sources[sec] = detectLocale(texts);
    setSectionSources(sources);
  }, [extraction]);

  // The language the menu is actually written in, judged text by text and
  // weighted by volume. Deliberately independent of the per-section source
  // dropdowns: those are coarse by design (any Hebrew character wins the whole
  // section), which is harmless for a translation direction the user can fix,
  // but would be ruinous as the basis for re-keying an entire catalog.
  const detectedPrimary = useMemo(() => dominantLocale(extraction), [extraction]);

  // Derived, never assigned from two places: the restaurant fetch and the menu
  // detection resolve independently, so racing setters could clobber a detected
  // "he" with a stored "en" depending on which landed last.
  //
  // Precedence: the user's pick, else the menu we just read, else the
  // restaurant's stored language, else the platform default. Detection outranks
  // the stored setting because a restaurant that never chose is flagged 'en',
  // and trusting that over the evidence in front of us is exactly what files a
  // Hebrew menu away as a "translation".
  const primaryLocale: Locale =
    primaryChoice ?? detectedPrimary ?? restaurantLocale ?? 'en';

  // Pre-compute translations while the user is still checking the extracted
  // items, so the translation review step opens instantly.
  useEffect(() => {
    if (!extraction || !autoTranslate || trEntries !== null || trLoading) return;
    if (Object.keys(sectionSources).length === 0) return; // wait for detection
    const entries = collectReviewEntries(extraction);
    if (entries.length === 0) {
      setTrEntries([]);
      return;
    }
    setTrLoading(true);
    runGroupedPreview(entries, sectionSources)
      .then(setTrEntries)
      .catch(() => setTrEntries(entries))
      .finally(() => setTrLoading(false));
    // sectionSources is read once to kick off the preview; later edits to a
    // section re-translate through handleSectionSourceChange instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraction, autoTranslate, trEntries, trLoading, rid, sectionSources]);

  // Re-translate a single section when its source language is changed.
  const handleSectionSourceChange = async (section: string, locale: string) => {
    setSectionSources((prev) => ({ ...prev, [section]: locale }));
    if (!trEntries) return;
    setTrLoading(true);
    try {
      const texts = Array.from(
        new Set(trEntries.filter((e) => sectionFor(e.usage) === section).map((e) => e.text)),
      );
      const translations = await previewTranslationsGrouped(rid, [{ source_locale: locale, texts }]);
      setTrEntries((prev) =>
        prev?.map((e) =>
          sectionFor(e.usage) === section
            ? { ...e, translations: translations[e.text] ?? e.translations }
            : e,
        ) ?? prev,
      );
    } catch {
      /* keep the previous translations on failure */
    } finally {
      setTrLoading(false);
    }
  };

  // How the given raw text renders for a customer using `lang`: its translation,
  // else the primary-language value (the stored base), else the raw text.
  const displayValue = (raw: string | undefined, lang: string): string => {
    const text = raw?.trim();
    if (!text) return '';
    const tr = trEntries?.find((e) => e.text === text)?.translations ?? {};
    return tr[lang] || tr[primaryLocale] || text;
  };

  const handleTranslationEdit = (text: string, locale: string, value: string) => {
    setTrEntries((prev) =>
      prev?.map((e) =>
        e.text === text ? { ...e, translations: { ...e.translations, [locale]: value } } : e,
      ) ?? prev,
    );
  };

  // The primary-language control. Rendered on BOTH the review and translation
  // steps so every path to "Import" has shown the user which language will
  // become their catalog's — importing is what commits it, and when it differs
  // from their current setting the server re-keys the existing catalog.
  const willChangeLocale = restaurantLocale !== null && restaurantLocale !== primaryLocale;
  const primaryLanguageChoice = (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="primary-locale" className="text-sm font-medium text-fg-primary">
          {t('importPrimaryLanguageLabel')}
        </label>
        <select
          id="primary-locale"
          value={primaryLocale}
          onChange={(e) => setPrimaryChoice(e.target.value as Locale)}
          className="px-2.5 py-1.5 rounded-standard bg-[var(--surface)] border border-[var(--divider)] text-sm text-fg-primary focus:outline-none focus:border-brand-500"
        >
          {SUPPORTED_LOCALES.map((loc) => (
            <option key={loc} value={loc}>{LOCALE_LABELS[loc]}</option>
          ))}
        </select>
        {primaryChoice === null && detectedPrimary !== null && (
          <span className="text-xs text-fg-secondary">{t('importPrimaryDetected')}</span>
        )}
      </div>
      <p className="text-xs text-fg-secondary">{t('importPrimaryLanguageHint')}</p>
      {willChangeLocale && (
        <p className="text-xs text-amber-500">
          {t('importPrimaryLanguageChange')
            .replace('{from}', LOCALE_LABELS[restaurantLocale])
            .replace('{to}', LOCALE_LABELS[primaryLocale])}
        </p>
      )}
    </div>
  );

  const handleFile = async (file: File) => {
    setError('');
    setExtracting(true);
    try {
      const result = await importMenuAI(rid, file);
      setExtraction(result);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('importWoltError'));
    } finally {
      setExtracting(false);
    }
  };

  const handleWoltFetch = async () => {
    if (!woltUrl.trim()) return;
    setError('');
    setExtracting(true);
    try {
      const result = await importMenuFromWolt(rid, woltUrl.trim());
      setExtraction(result);
      setStep('review');
    } catch {
      setError(t('importWoltError'));
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirm = async () => {
    if (!extraction) return;
    setConfirming(true);
    try {
      const translations =
        autoTranslate && trEntries
          ? Object.fromEntries(trEntries.map((e) => [e.text, e.translations]))
          : undefined;
      const result = await confirmMenuImport(rid, extraction, {
        importBranding,
        createCarte,
        carteName: carteName.trim() || t('importCarteNameDefault'),
        autoTranslate,
        translations,
        // Always sent: the language control is shown on every path to this
        // button, so the user has seen (and can correct) what it will be. It was
        // previously sent only when auto-translating, which left an untranslated
        // Hebrew menu flagged as English forever.
        primaryLocale,
      });
      if (createCarte && result.carteId) {
        router.push(`/${restaurantId}/menu/menus/${result.carteId}`);
      } else {
        router.push(`/${restaurantId}/menu/items`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create menu');
    } finally {
      setConfirming(false);
    }
  };

  const resetToUpload = () => {
    setStep('upload');
    setExtraction(null);
    setImportBranding(false);
    setCreateCarte(true);
    setCarteName('');
    setAutoTranslate(true);
    setTrEntries(null);
    setSectionSources({});
  };

  const totalItems = extraction?.categories.reduce((sum, c) => sum + c.items.length, 0) ?? 0;
  const hasBranding = !!(extraction?.restaurant_logo_url || extraction?.restaurant_cover_url);
  // A representative item (first one with a name) for the live display preview.
  const previewItem =
    extraction?.categories.flatMap((c) => c.items).find((it) => it.name?.trim()) ?? null;

  if (!canEdit) {
    return (
      <div className="max-w-2xl">
        <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
          <SparklesIcon className="w-10 h-10 text-fg-secondary" strokeWidth={1.5} />
          <h2 className="text-lg font-semibold text-fg-primary">{t('noPermission') || 'No permission'}</h2>
          <p className="text-sm text-fg-secondary max-w-sm">
            {t('noPermissionDesc') || "You don't have permission to import menus."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {step === 'upload' && (
        <div className="space-y-4">
          {/* Source toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setSource('photo'); setError(''); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-standard text-sm font-medium transition-colors ${
                source === 'photo' ? 'bg-brand-500 text-white' : 'bg-[var(--surface-subtle)] text-fg-secondary'
              }`}
            >
              <ImageIcon className="w-4 h-4" />
              {t('importSourcePhoto')}
            </button>
            <button
              type="button"
              onClick={() => { setSource('wolt'); setError(''); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-standard text-sm font-medium transition-colors ${
                source === 'wolt' ? 'bg-brand-500 text-white' : 'bg-[var(--surface-subtle)] text-fg-secondary'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
              {t('importSourceWolt')}
            </button>
          </div>

          <p className="text-sm text-fg-secondary">
            {source === 'photo' ? t('uploadMenuAI') : t('importWoltHint')}
          </p>

          {source === 'photo' ? (
            <div
              className="flex flex-col items-center justify-center py-16 rounded-card cursor-pointer hover:bg-[var(--surface-subtle)] transition-colors"
              style={{ border: '2px dashed var(--divider)' }}
              onClick={() => fileRef.current?.click()}
            >
              {extracting ? (
                <>
                  <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full mb-3" />
                  <p className="text-sm text-fg-secondary">{t('analyzingMenuAI')}</p>
                </>
              ) : (
                <>
                  <SparklesIcon className="w-10 h-10 text-brand-500 mb-3" />
                  <p className="text-sm font-medium text-fg-primary">{t('clickToUpload')}</p>
                  <p className="text-xs text-fg-secondary mt-1">{t('imageFormats')}</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="url"
                value={woltUrl}
                disabled={extracting}
                onChange={(e) => setWoltUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleWoltFetch(); }}
                placeholder={t('importWoltUrlPlaceholder')}
                className="w-full px-4 py-3 rounded-standard bg-[var(--surface-subtle)] border border-[var(--divider)] text-sm text-fg-primary placeholder:text-fg-secondary focus:outline-none focus:border-brand-500"
                dir="ltr"
              />
              <button
                type="button"
                className="btn-primary w-full flex items-center justify-center gap-2"
                onClick={handleWoltFetch}
                disabled={extracting || !woltUrl.trim()}
              >
                {extracting ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    {t('importWoltFetching')}
                  </>
                ) : (
                  <>
                    <LinkIcon className="w-4 h-4" />
                    {t('importWoltFetch')}
                  </>
                )}
              </button>
            </div>
          )}

          <input ref={fileRef} type="file" className="hidden"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      )}

      {step === 'review' && extraction && (
        <div className="space-y-4">
          <p className="text-sm text-fg-secondary"
            dangerouslySetInnerHTML={{
              __html: t('foundCategoriesItems')
                .replace('{categories}', `<strong>${extraction.categories.length}</strong>`)
                .replace('{items}', `<strong>${totalItems}</strong>`),
            }}
          />

          <div className="max-h-96 overflow-y-auto space-y-4">
            {extraction.categories.map((cat, ci) => (
              <div key={ci}>
                <h4 className="text-sm font-bold text-fg-primary mb-2">{cat.name}</h4>
                <div className="space-y-1">
                  {cat.items.map((item, ii) => {
                    const optCount = item.option_sets?.length ?? 0;
                    const modCount = item.modifier_sets?.length ?? 0;
                    return (
                      <div key={ii} className="flex items-center gap-3 text-sm py-2 px-3 rounded"
                        style={{ background: 'var(--surface-subtle)' }}>
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image_url} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded bg-[var(--divider)] flex-shrink-0" />
                        )}
                        <span className="text-fg-primary flex-1 min-w-0 truncate">{item.name}</span>
                        {optCount > 0 && (
                          <span className="text-xs text-fg-secondary px-1.5 py-0.5 rounded bg-[var(--divider)] whitespace-nowrap">
                            {t('importOptionsBadge').replace('{count}', String(optCount))}
                          </span>
                        )}
                        {modCount > 0 && (
                          <span className="text-xs text-fg-secondary px-1.5 py-0.5 rounded bg-[var(--divider)] whitespace-nowrap">
                            {t('importAddonsBadge').replace('{count}', String(modCount))}
                          </span>
                        )}
                        <span className="text-fg-secondary whitespace-nowrap">₪{item.price.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-fg-primary cursor-pointer">
              <input
                type="checkbox"
                checked={createCarte}
                onChange={(e) => setCreateCarte(e.target.checked)}
                className="accent-brand-500"
              />
              {t('importCreateCarteLabel')}
            </label>
            {createCarte && (
              <input
                type="text"
                value={carteName}
                onChange={(e) => setCarteName(e.target.value)}
                placeholder={t('importCarteNameDefault')}
                aria-label={t('importCarteNameLabel')}
                className="w-full px-4 py-2 rounded-standard bg-[var(--surface-subtle)] border border-[var(--divider)] text-sm text-fg-primary placeholder:text-fg-secondary focus:outline-none focus:border-brand-500"
              />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-fg-primary cursor-pointer">
            <input
              type="checkbox"
              checked={autoTranslate}
              onChange={(e) => setAutoTranslate(e.target.checked)}
              className="accent-brand-500"
            />
            {t('importAutoTranslateLabel')}
          </label>

          {hasBranding && (
            <label className="flex items-center gap-2 text-sm text-fg-primary cursor-pointer">
              <input
                type="checkbox"
                checked={importBranding}
                onChange={(e) => setImportBranding(e.target.checked)}
                className="accent-brand-500"
              />
              {t('importBrandingLabel')}
            </label>
          )}

          <div
            className="rounded-card border border-[var(--divider)] p-4"
            style={{ background: 'var(--surface-subtle)' }}
          >
            {primaryLanguageChoice}
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button className="btn-secondary" onClick={resetToUpload}>
              {t('reUpload')}
            </button>
            {autoTranslate ? (
              <button
                className="btn-primary flex items-center gap-2"
                onClick={() => setStep('translations')}
                disabled={trLoading}
              >
                {trLoading && (
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                )}
                {trLoading ? t('trReviewTranslating') : t('trReviewContinue')}
              </button>
            ) : (
              <button className="btn-primary" onClick={handleConfirm} disabled={confirming}>
                {confirming ? t('creating') : t('importItems').replace('{count}', String(totalItems))}
              </button>
            )}
          </div>
        </div>
      )}

      {step === 'translations' && trEntries && (
        <div className="space-y-4">
          <p className="text-sm text-fg-secondary">{t('importLangReviewIntro')}</p>

          {/* Primary display language + live preview of how guests will see it */}
          <div
            className="rounded-card border border-[var(--divider)] p-4 space-y-3"
            style={{ background: 'var(--surface-subtle)' }}
          >
            {primaryLanguageChoice}

            {previewItem && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-fg-secondary uppercase tracking-wide">
                  {t('importPreviewHeading')}
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {SUPPORTED_LOCALES.map((lang) => (
                    <div
                      key={lang}
                      className="rounded-standard bg-[var(--surface)] border border-[var(--divider)] p-2.5"
                      dir={lang === 'he' ? 'rtl' : 'ltr'}
                    >
                      <div className="text-[11px] text-fg-secondary mb-1">
                        {LOCALE_LABELS[lang]}
                        {lang === primaryLocale ? ` · ${t('importPrimaryTag')}` : ''}
                      </div>
                      <div className="text-sm font-semibold text-fg-primary truncate">
                        {displayValue(previewItem.name, lang)}
                      </div>
                      {previewItem.description?.trim() && (
                        <div className="text-xs text-fg-secondary line-clamp-2 mt-0.5">
                          {displayValue(previewItem.description, lang)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <TranslationReviewTable
            entries={trEntries}
            sectionSources={sectionSources}
            onSectionSourceChange={handleSectionSourceChange}
            onEdit={handleTranslationEdit}
          />

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-standard text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button className="btn-secondary" onClick={() => setStep('review')}>
              {t('back')}
            </button>
            <button
              className="btn-primary flex items-center gap-2"
              onClick={handleConfirm}
              disabled={confirming || trLoading}
            >
              {trLoading && (
                <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              )}
              {confirming ? t('creating') : t('importItems').replace('{count}', String(totalItems))}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
