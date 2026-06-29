'use client';

import { Globe, Languages } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { Locale } from './LocaleTabs';

/**
 * Endonym fallbacks used when an i18n key is missing. The banner normally
 * shows the language name in the current UI language (e.g. "Anglais" in a
 * French UI), matching the rest of the app.
 */
const LOCALE_ENDONYM: Record<Locale, string> = {
  en: 'English',
  he: 'עברית',
  fr: 'Français',
};

const LOCALE_NAME_KEY: Record<Locale, string> = {
  en: 'languageEnglish',
  he: 'languageHebrew',
  fr: 'languageFrench',
};

interface Props {
  /** Currently active editing tab. */
  active: Locale;
  /** The restaurant's source (canonical) locale. */
  source: Locale;
}

/**
 * Prominent, stateful banner that tells the owner which language they are
 * editing right now, and whether that is the canonical source or a derived
 * translation. It sits directly above the editable fields (in the reading
 * path) so the language context can't be missed — the small tab strip alone
 * was too easy to skip, which led owners to edit a translation by mistake and
 * never see their change on the web.
 */
export function LocaleEditingBanner({ active, source }: Props) {
  const { t } = useI18n();
  const isSource = active === source;
  const langName = t(LOCALE_NAME_KEY[active]) || LOCALE_ENDONYM[active];

  const accent = isSource ? 'var(--brand-500)' : 'var(--info-500)';
  const Icon = isSource ? Globe : Languages;

  const title = (
    isSource
      ? t('localeBannerSourceTitle') || "You're editing the original ({lang})"
      : t('localeBannerTranslationTitle') || "You're editing a translation only ({lang})"
  ).replace('{lang}', langName);

  const hint = isSource
    ? t('localeBannerSourceHint') ||
      'This is what customers see, and the basis for automatic translations.'
    : t('localeBannerTranslationHint') ||
      'The original stays unchanged. Leave a field blank to use the automatic translation.';

  return (
    <div
      role="status"
      className="flex items-start gap-[var(--s-3)] rounded-r-lg border p-[var(--s-3)]"
      style={{
        background: `color-mix(in oklab, ${accent} 6%, var(--surface))`,
        borderColor: `color-mix(in oklab, ${accent} 30%, var(--line))`,
      }}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" style={{ color: accent }} aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="text-fs-sm font-semibold text-[var(--fg)]">{title}</p>
        <p className="text-fs-xs text-[var(--fg-muted)] mt-0.5">{hint}</p>
      </div>
    </div>
  );
}
