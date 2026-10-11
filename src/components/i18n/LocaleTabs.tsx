'use client';

import { Globe } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export type Locale = 'en' | 'he' | 'fr';

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  he: 'עברית',
  fr: 'Français',
};

interface Props {
  /** All locales the platform supports. */
  locales: Locale[];
  /** The restaurant's source locale. Marked as the source tab. */
  source: Locale;
  /** Currently active tab. */
  active: Locale;
  /** Called when the user clicks a tab. */
  onChange: (locale: Locale) => void;
  /**
   * Optional per-locale "missing" indicators. Adds a subtle dot to tabs
   * whose translation is empty for the user to notice at a glance.
   */
  missing?: Partial<Record<Locale, boolean>>;
}

/**
 * Locale tab strip used in entity editors (item, group, modifier set).
 * The source-locale tab is marked separately so the owner knows that's the
 * canonical text — translations into other locales are derived from it.
 */
export function LocaleTabs({ locales, source, active, onChange, missing }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex w-fit max-w-full flex-wrap items-center gap-1 bg-[var(--surface-2)] p-1 rounded-r-md">
      {locales.map((loc) => {
        const isActive = loc === active;
        const isSource = loc === source;
        const isMissing = !!missing?.[loc] && !isSource;
        return (
          <button
            key={loc}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(loc)}
            className={`inline-flex items-center gap-1.5 min-h-9 px-[var(--s-3)] rounded-r-sm text-fs-sm font-medium transition-colors duration-fast ${
              isActive
                ? 'bg-[var(--surface)] text-[var(--fg)]'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }`}
            title={isSource ? t('localeBannerSourceTitle').replace('{lang}', LOCALE_LABELS[loc]) : LOCALE_LABELS[loc]}
          >
            {isSource && <Globe className="w-3 h-3" aria-hidden />}
            <span>{LOCALE_LABELS[loc]}</span>
            {isSource && (
              <span className="text-fs-xs font-semibold text-[var(--brand-ink)]">
                {t('languageSourceLabel')}
              </span>
            )}
            {isMissing && (
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: 'var(--warning-500)' }}
                role="img"
                aria-label={t('translationMissing')}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
