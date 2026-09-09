'use client';

import { useEffect, useState } from 'react';
import { Input } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import type { TranslationMap } from '@/lib/api';
import { LocaleTabs, type Locale } from './LocaleTabs';

const SUPPORTED_LOCALES: Locale[] = ['en', 'he', 'fr'];

export function supportedOrderLocale(value?: string): Locale {
  return value === 'he' || value === 'fr' ? value : 'en';
}

export default function LocalizedOrderNameField({
  sourceLocale,
  name,
  translations,
  onNameChange,
  onTranslationsChange,
}: {
  sourceLocale: Locale;
  name: string;
  translations?: TranslationMap;
  onNameChange: (value: string) => void;
  onTranslationsChange: (value: TranslationMap) => void;
}) {
  const { t } = useI18n();
  const [activeLocale, setActiveLocale] = useState<Locale>(sourceLocale);

  useEffect(() => setActiveLocale(sourceLocale), [sourceLocale]);

  const isSource = activeLocale === sourceLocale;
  const value = isSource ? name : translations?.name?.[activeLocale] ?? '';
  const language = t(`language_${activeLocale}`);
  const missing = Object.fromEntries(
    SUPPORTED_LOCALES.map((locale) => [
      locale,
      locale !== sourceLocale && !!name.trim() && !translations?.name?.[locale]?.trim(),
    ]),
  );

  const updateTranslation = (nextValue: string) => {
    const nextName = { ...(translations?.name ?? {}) };
    if (nextValue) nextName[activeLocale] = nextValue;
    else delete nextName[activeLocale];
    const next: TranslationMap = { ...translations };
    if (Object.keys(nextName).length > 0) next.name = nextName;
    else delete next.name;
    onTranslationsChange(next);
  };

  return (
    <div className="space-y-[var(--s-3)]">
      <LocaleTabs
        locales={SUPPORTED_LOCALES}
        source={sourceLocale}
        active={activeLocale}
        onChange={setActiveLocale}
        missing={missing}
      />
      <label className="block">
        <span className="mb-1 block text-fs-xs font-medium text-[var(--fg-muted)]">
          {isSource
            ? t('orderItemSourceName')
            : t('orderItemTranslatedName').replace('{language}', language)}
        </span>
        <Input
          dir={activeLocale === 'he' ? 'rtl' : 'auto'}
          value={value}
          onChange={(event) =>
            isSource ? onNameChange(event.target.value) : updateTranslation(event.target.value)
          }
          autoFocus={isSource}
        />
        <span className="mt-1.5 block text-fs-xs leading-relaxed text-[var(--fg-subtle)]">
          {isSource ? t('orderItemSourceNameHint') : t('orderItemTranslatedNameHint')}
        </span>
      </label>
    </div>
  );
}
