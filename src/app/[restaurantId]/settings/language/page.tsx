'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Languages, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  getRestaurant,
  updateRestaurant,
  backfillTranslations,
  Restaurant,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, Field, PageHead, Section, Select } from '@/components/ds';

const SUPPORTED_LOCALES: { value: 'en' | 'he' | 'fr'; labelKey: string; nativeLabel: string }[] = [
  { value: 'en', labelKey: 'languageEnglish', nativeLabel: 'English' },
  { value: 'fr', labelKey: 'languageFrench', nativeLabel: 'Français' },
  { value: 'he', labelKey: 'languageHebrew', nativeLabel: 'עברית' },
];

type Locale = (typeof SUPPORTED_LOCALES)[number]['value'];

function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'he' || v === 'fr';
}

export default function LanguageSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [locale, setLocale] = useState<Locale>('en');
  const [savedLocale, setSavedLocale] = useState<Locale>('en');

  const [savingLocale, setSavingLocale] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [retranslating, setRetranslating] = useState(false);
  const [retranslateResult, setRetranslateResult] = useState<string | null>(null);
  const [retranslateError, setRetranslateError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    getRestaurant(rid)
      .then((r) => {
        setRestaurant(r);
        const initial: Locale = isLocale(r.default_locale) ? r.default_locale : 'en';
        setLocale(initial);
        setSavedLocale(initial);
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const localeChanged = locale !== savedLocale;

  const handleSave = async () => {
    setSavingLocale(true);
    setSaveError(null);
    try {
      const updated = await updateRestaurant(rid, { default_locale: locale } as Partial<Restaurant>);
      setRestaurant(updated);
      setSavedLocale(locale);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingLocale(false);
    }
  };

  const handleRetranslate = async () => {
    setConfirmOpen(false);
    setRetranslating(true);
    setRetranslateError(null);
    setRetranslateResult(null);
    try {
      const res = await backfillTranslations(rid, true);
      const total =
        res.items + res.groups + res.modifier_sets + res.modifiers + res.variant_groups + res.variants;
      setRetranslateResult(
        t('languageRetranslateSummary')?.replace('{count}', String(total)) ||
          `Re-translated ${total} entities (items: ${res.items}, groups: ${res.groups}, modifier sets: ${res.modifier_sets}, modifiers: ${res.modifiers}, variant groups: ${res.variant_groups}, variants: ${res.variants}).`,
      );
    } catch (e) {
      setRetranslateError(e instanceof Error ? e.message : 'Re-translate failed');
    } finally {
      setRetranslating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-[760px]">
      <PageHead
        title={t('languageSettings') || 'Language'}
        desc={
          t('languageSettingsDesc') ||
          "Choose the language you type your menu in. We'll automatically translate to other languages so guests can read your menu in their preferred language."
        }
      />

      <Section
        title={
          <span className="inline-flex items-center gap-2">
            <Languages className="w-4 h-4" />
            {t('languageDefaultTitle') || 'Default menu language'}
          </span>
        }
        desc={
          t('languageDefaultDesc') ||
          "This is the language you type your menu items in. Translations into the other supported languages are generated automatically when you save an item."
        }
      >
        <Field label={t('languageFieldLabel') || 'Language'}>
          <Select
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
            disabled={savingLocale}
          >
            {SUPPORTED_LOCALES.map((l) => (
              <option key={l.value} value={l.value}>
                {l.nativeLabel} ({l.value})
              </option>
            ))}
          </Select>
        </Field>

        {localeChanged && (
          <div
            className="mt-[var(--s-4)] px-[var(--s-4)] py-[var(--s-3)] rounded-r-md text-fs-sm flex gap-2"
            style={{
              background: 'color-mix(in oklab, var(--warning-500) 12%, transparent)',
              color: 'var(--warning-500)',
              border: '1px solid color-mix(in oklab, var(--warning-500) 35%, var(--line))',
            }}
          >
            <AlertTriangle className="w-4 h-4 mt-[2px] shrink-0" />
            <div>
              {t('languageChangeWarning') ||
                "Changing this won't update your existing menu items — their text will stay as it was. Use \"Re-translate everything\" below to regenerate translations from the new language."}
            </div>
          </div>
        )}

        <div className="mt-[var(--s-4)] flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={!localeChanged || savingLocale}
            variant="primary"
          >
            {savingLocale ? t('saving') || 'Saving…' : t('save') || 'Save'}
          </Button>
          {savedFlash && (
            <span className="text-fs-sm text-[var(--success-500)]">
              {t('saved') || 'Saved'}
            </span>
          )}
          {saveError && (
            <span className="text-fs-sm text-[var(--danger-500)]">{saveError}</span>
          )}
        </div>
      </Section>

      <Section
        title={
          <span className="inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            {t('languageRetranslateTitle') || 'Re-translate all menu content'}
          </span>
        }
        desc={
          t('languageRetranslateDesc') ||
          'Erase auto-generated translations on every menu item, group, modifier and variant for this restaurant, then regenerate them from your default menu language.'
        }
      >
        <div
          className="mb-[var(--s-4)] px-[var(--s-4)] py-[var(--s-3)] rounded-r-md text-fs-sm flex gap-2"
          style={{
            background: 'color-mix(in oklab, var(--warning-500) 12%, transparent)',
            color: 'var(--warning-500)',
            border: '1px solid color-mix(in oklab, var(--warning-500) 35%, var(--line))',
          }}
        >
          <AlertTriangle className="w-4 h-4 mt-[2px] shrink-0" />
          <div>
            {t('languageRetranslateWarning') ||
              "This overwrites every translation, including any you've manually edited. Run it after changing the default language above, or if auto-translations look wrong across the board. Source-language text (the values you type in) is never touched — only translations are regenerated."}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={retranslating}
            variant="secondary"
          >
            {retranslating
              ? t('languageRetranslating') || 'Re-translating…'
              : t('languageRetranslateAction') || 'Re-translate everything'}
          </Button>
          {retranslateResult && (
            <span className="text-fs-sm text-[var(--success-500)]">{retranslateResult}</span>
          )}
          {retranslateError && (
            <span className="text-fs-sm text-[var(--danger-500)]">{retranslateError}</span>
          )}
        </div>

        {confirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-[var(--surface)] rounded-r-lg shadow-2xl max-w-[440px] w-full p-[var(--s-5)]">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[var(--warning-500)] mt-1 shrink-0" />
                <div className="flex-1">
                  <h3 className="text-fs-md font-semibold mb-2">
                    {t('languageRetranslateConfirmTitle') || 'Re-translate everything?'}
                  </h3>
                  <p className="text-fs-sm text-[var(--fg-muted)]">
                    {t('languageRetranslateConfirmBody')?.replace('{lang}', restaurant?.default_locale || locale) ||
                      `All current translations on every menu item, group, modifier and variant will be erased and regenerated from your default menu language (${restaurant?.default_locale || locale}). This cannot be undone except by editing items individually.`}
                  </p>
                </div>
              </div>
              <div className="mt-[var(--s-5)] flex justify-end gap-2">
                <Button onClick={() => setConfirmOpen(false)} variant="ghost">
                  {t('cancel') || 'Cancel'}
                </Button>
                <Button onClick={handleRetranslate} variant="primary">
                  {t('languageRetranslateConfirmAction') || 'Re-translate everything'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
