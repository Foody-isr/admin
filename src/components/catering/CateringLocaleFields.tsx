'use client';

import { useState } from 'react';
import { LocaleTabs, type Locale } from '@/components/i18n/LocaleTabs';
import { SUPPORTED_LOCALES } from '@/lib/i18n';

export type TranslationMap = Record<string, Record<string, string>>;

/**
 * Translatable name + description editor for catering entities (services, items,
 * options), mirroring the classic menu: the source-locale value lives in the
 * regular name/description columns; other locales are stored in `translations`.
 * LocaleTabs switches the active locale; the source tab edits the columns, the
 * other tabs edit the translations map.
 */
export function CateringLocaleFields({
  sourceLocale,
  name,
  onName,
  description,
  onDescription,
  translations,
  onTranslations,
  nameLabel,
  descLabel,
  onEnter,
}: {
  sourceLocale: Locale;
  name: string;
  onName: (v: string) => void;
  description: string;
  onDescription: (v: string) => void;
  translations: TranslationMap;
  onTranslations: (t: TranslationMap) => void;
  nameLabel: string;
  descLabel: string;
  onEnter?: () => void;
}) {
  const [active, setActive] = useState<Locale>(sourceLocale);
  const isSource = active === sourceLocale;

  const setField = (field: 'name' | 'description', value: string) => {
    const next: TranslationMap = { ...translations };
    const fieldMap = { ...(next[field] ?? {}) };
    if (value === '') delete fieldMap[active];
    else fieldMap[active] = value;
    if (Object.keys(fieldMap).length === 0) delete next[field];
    else next[field] = fieldMap;
    onTranslations(next);
  };

  // Highlight tabs whose translation is still missing (source tab never missing).
  const missing: Partial<Record<Locale, boolean>> = {};
  for (const loc of SUPPORTED_LOCALES) {
    if (loc === sourceLocale) continue;
    const hasName = !!translations?.name?.[loc];
    const hasDesc = !!translations?.description?.[loc] || !description.trim();
    missing[loc] = !hasName || !hasDesc;
  }

  return (
    <div className="space-y-3">
      <LocaleTabs locales={SUPPORTED_LOCALES} source={sourceLocale} active={active} onChange={setActive} missing={missing} />
      <div>
        <label className="block text-sm font-medium text-fg-secondary mb-1">{nameLabel}</label>
        <input
          autoFocus
          className="input"
          value={isSource ? name : translations?.name?.[active] ?? ''}
          onChange={(e) => (isSource ? onName(e.target.value) : setField('name', e.target.value))}
          onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-fg-secondary mb-1">{descLabel}</label>
        <textarea
          className="input"
          value={isSource ? description : translations?.description?.[active] ?? ''}
          onChange={(e) => (isSource ? onDescription(e.target.value) : setField('description', e.target.value))}
        />
      </div>
    </div>
  );
}
