'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  confirmMenuImport, getRestaurant, importMenuAI, importMenuFromURL,
  previewTranslationsGrouped, type RichExtraction, type TranslationReviewEntry,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { collectReviewEntries, dominantLocale, isLocale } from '@/lib/menu-import/primary-locale';
import { importFileError, initialTranslationSources, translationGroups, validImportURL } from '@/lib/menu-import/workspace';
import { sectionFor, type Locale } from '@/components/translations/sections';

type Source = 'photo' | 'wolt' | 'website';
type PreviewJob = { section: string; locale: string } | null;

/** Coordinate extraction, translation review and acknowledged import within one restaurant. */
export function useMenuImport(rid: number, canEdit: boolean) {
  const { t } = useI18n();
  const router = useRouter();
  const translations = useRef(t);
  translations.current = t;
  const scope = useRef({ generation: 0 });
  const lock = useRef(false);
  const receipt = useRef<string | null>(null);
  const edited = useRef(new Set<string>());
  const failedPreview = useRef<PreviewJob>(null);
  const [source, setSource] = useState<Source>('photo');
  const [step, setStep] = useState<'upload' | 'review' | 'translations'>('upload');
  const [busy, setBusy] = useState<'extract' | 'translate' | 'confirm' | null>(null);
  const [extraction, setExtraction] = useState<RichExtraction | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [translationError, setTranslationError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [restaurantLocale, setRestaurantLocale] = useState<Locale | null>(null);
  const [primaryChoice, setPrimaryChoice] = useState<Locale | null>(null);
  const [importBranding, setImportBranding] = useState(false);
  const [createCarte, setCreateCarte] = useState(true);
  const [carteName, setCarteName] = useState('');
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [entries, setEntries] = useState<TranslationReviewEntry[] | null>(null);
  const [sectionSources, setSectionSources] = useState<Record<string, string>>({});
  const [pendingSource, setPendingSource] = useState<PreviewJob>(null);
  const [confirmFailed, setConfirmFailed] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);

  const load = useCallback(async () => {
    const generation = scope.current.generation;
    setLoading(true);
    setLoadError('');
    try {
      const restaurant = await getRestaurant(rid);
      if (generation !== scope.current.generation) return;
      setRestaurantLocale(isLocale(restaurant.default_locale) ? restaurant.default_locale : 'en');
    } catch (cause) {
      if (generation === scope.current.generation) {
        setLoadError(cause instanceof Error ? cause.message : translations.current('loadFailed'));
      }
    } finally {
      if (generation === scope.current.generation) setLoading(false);
    }
  }, [rid]);

  useEffect(() => {
    const current = scope.current;
    if (canEdit) void load();
    return () => { current.generation += 1; };
  }, [canEdit, load]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!receipt.current && (extraction || lock.current)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [extraction]);

  const detectedPrimary = useMemo(() => dominantLocale(extraction), [extraction]);
  const primaryLocale = primaryChoice ?? detectedPrimary ?? restaurantLocale ?? 'en';
  const totalItems = extraction?.categories.reduce((sum, category) => sum + category.items.length, 0) ?? 0;
  const message = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : t(fallback);

  // Called only while the caller owns the operation lock. Source changes are
  // committed together with their translations, so a failed preview cannot
  // relabel the previous values as translations from a different language.
  const translate = async (
    original: TranslationReviewEntry[], sources: Record<string, string>, job: PreviewJob = null,
  ) => {
    const generation = scope.current.generation;
    setBusy('translate');
    setTranslationError('');
    const selected = job ? original.filter(entry => sectionFor(entry.usage) === job.section) : original;
    const nextSources = job ? { ...sources, [job.section]: job.locale } : sources;
    try {
      const result = await previewTranslationsGrouped(rid, translationGroups(selected, nextSources));
      if (generation !== scope.current.generation) return;
      setEntries(original.map(entry => !job || sectionFor(entry.usage) === job.section
        ? { ...entry, translations: result[entry.text] ?? entry.translations }
        : entry));
      setSectionSources(nextSources);
      selected.forEach(entry => edited.current.delete(entry.text));
      failedPreview.current = null;
    } catch (cause) {
      if (generation !== scope.current.generation) return;
      failedPreview.current = job;
      setTranslationError(message(cause, 'menuImportTranslationFailed'));
    }
  };

  const extract = async (work: () => Promise<RichExtraction>) => {
    if (!canEdit || lock.current || loading || loadError) return;
    lock.current = true;
    const generation = scope.current.generation;
    setBusy('extract');
    setError('');
    try {
      const result = await work();
      if (generation !== scope.current.generation) return;
      const sources = initialTranslationSources(result);
      setExtraction(result);
      setSectionSources(sources);
      setPrimaryChoice(null);
      setStep('review');
      if (autoTranslate) await translate(collectReviewEntries(result), sources);
    } catch (cause) {
      if (generation === scope.current.generation) setError(message(cause, 'menuImportReadFailed'));
    } finally {
      if (generation === scope.current.generation) {
        lock.current = false;
        setBusy(null);
      }
    }
  };

  const upload = async (file: File) => {
    if (lock.current || !canEdit) return;
    const invalid = importFileError(file);
    if (invalid) { setError(t(invalid === 'type' ? 'menuImportFileType' : 'menuImportFileSize')); return; }
    await extract(() => importMenuAI(rid, file));
  };

  const fetchURL = async () => {
    if (lock.current || !canEdit) return;
    if (!validImportURL(url)) { setError(t('menuImportInvalidURL')); return; }
    await extract(() => importMenuFromURL(rid, url.trim()));
  };

  const preview = async (job: PreviewJob = failedPreview.current) => {
    if (lock.current || !canEdit || !extraction || receipt.current) return;
    lock.current = true;
    const generation = scope.current.generation;
    try {
      await translate(entries ?? collectReviewEntries(extraction), sectionSources, job);
    } finally {
      if (generation === scope.current.generation) { lock.current = false; setBusy(null); }
    }
  };

  const changeSource = (section: string, locale: string) => {
    if (lock.current || !canEdit || !isLocale(locale) || sectionSources[section] === locale) return;
    const job = { section, locale };
    if (entries?.some(entry => sectionFor(entry.usage) === section && edited.current.has(entry.text))) {
      setPendingSource(job);
    } else void preview(job);
  };

  const editTranslation = (text: string, locale: string, value: string) => {
    if (lock.current || !canEdit || receipt.current) return;
    edited.current.add(text);
    setEntries(current => current?.map(entry => entry.text === text
      ? { ...entry, translations: { ...entry.translations, [locale]: value } }
      : entry) ?? null);
  };

  const toggleTranslation = (value: boolean) => {
    if (lock.current) return;
    setAutoTranslate(value);
    if (value && entries === null) void preview(null);
  };

  const confirm = async () => {
    if (!canEdit || lock.current || !extraction || loading || loadError || !totalItems) return;
    if (receipt.current) { router.push(receipt.current); return; }
    if (autoTranslate && (entries === null || translationError)) return;
    lock.current = true;
    const generation = scope.current.generation;
    setBusy('confirm');
    setError('');
    try {
      const result = await confirmMenuImport(rid, extraction, {
        importBranding, createCarte, carteName: carteName.trim() || t('importCarteNameDefault'),
        autoTranslate,
        translations: autoTranslate && entries
          ? Object.fromEntries(entries.map(entry => [entry.text, entry.translations])) : undefined,
        primaryLocale,
      });
      if (generation !== scope.current.generation) return;
      const href = createCarte && result.carteId ? `/${rid}/menu/menus/${result.carteId}` : `/${rid}/menu/items`;
      receipt.current = href;
      setDestination(href);
      router.push(href);
    } catch (cause) {
      if (generation === scope.current.generation) {
        setConfirmFailed(true);
        setError(message(cause, 'saveFailed'));
      }
    } finally {
      if (generation === scope.current.generation) { lock.current = false; setBusy(null); }
    }
  };

  const reset = () => {
    if (lock.current || receipt.current) return;
    scope.current.generation += 1;
    setStep('upload');
    setExtraction(null);
    setImportBranding(false);
    setCreateCarte(true);
    setCarteName('');
    setAutoTranslate(true);
    setEntries(null);
    setSectionSources({});
    setPrimaryChoice(null);
    setError('');
    setTranslationError('');
    setConfirmFailed(false);
    failedPreview.current = null;
    edited.current.clear();
  };

  return {
    source, setSource, step, setStep, busy, extraction, url, setUrl, error, setError,
    translationError, loading, loadError, load, restaurantLocale, primaryLocale,
    primaryChoice, setPrimaryChoice, detectedPrimary, importBranding, setImportBranding,
    createCarte, setCreateCarte, carteName, setCarteName, autoTranslate, toggleTranslation,
    entries, sectionSources, pendingSource, setPendingSource, confirmFailed, destination,
    totalItems, upload, fetchURL, preview, changeSource, editTranslation, confirm, reset,
  };
}
