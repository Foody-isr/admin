/**
 * Shared helpers for the translation review tables (import wizard + language
 * settings). Kept in one module so both surfaces group rows into identical
 * sections and agree on locale labels.
 */

export type Locale = 'en' | 'fr' | 'he';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'fr', 'he'];

export const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  fr: 'Français',
  he: 'עברית',
};

/**
 * Maps a usage kind (from the API or built client-side) to a display section.
 * Sections keep big menus scannable: items, descriptions, categories, options,
 * modifiers, then anything else.
 */
export const KIND_SECTION: Record<string, string> = {
  item_name: 'items',
  item_description: 'descriptions',
  group_name: 'categories',
  option_set: 'options',
  option: 'options',
  modifier_set: 'modifiers',
  modifier: 'modifiers',
  portion: 'other',
};

export const SECTION_ORDER = ['items', 'descriptions', 'categories', 'options', 'modifiers', 'other'];

export const SECTION_LABEL_KEY: Record<string, string> = {
  items: 'trReviewSectionItems',
  descriptions: 'trReviewSectionDescriptions',
  categories: 'trReviewSectionCategories',
  options: 'trReviewSectionOptions',
  modifiers: 'trReviewSectionModifiers',
  other: 'trReviewSectionOther',
};

/** Picks the dominant section for an entry from its usage kinds. */
export function sectionFor(usage: Record<string, number>): string {
  for (const section of SECTION_ORDER) {
    for (const [kind, count] of Object.entries(usage)) {
      if (count > 0 && KIND_SECTION[kind] === section) return section;
    }
  }
  return 'other';
}

export function usageTotal(usage: Record<string, number>): number {
  return Object.values(usage).reduce((a, b) => a + b, 0);
}

// French-specific accented letters and a few unambiguous stopwords. Enough to
// separate French from English for menu text; Hebrew is detected by script.
const FRENCH_ACCENTS = /[àâçéèêëîïôûùüœæ]/;
const FRENCH_WORDS = /(^|\s)(le|la|les|des|du|au|aux|avec|et|sans|sur|à|glacé|maison|poulet|fromage)(\s|$)/;

/**
 * Best-effort source-language guess for a section's texts, used only to prefill
 * the per-section source dropdown in the import wizard (always overridable).
 * Hebrew is detected by its Unicode block; French by accents/stopwords;
 * everything else defaults to English.
 */
export function detectLocale(texts: string[]): Locale {
  const sample = texts.join(' ');
  if (!sample.trim()) return 'en';
  if (/[֐-׿]/.test(sample)) return 'he';
  const lower = sample.toLowerCase();
  if (FRENCH_ACCENTS.test(lower) || FRENCH_WORDS.test(lower)) return 'fr';
  return 'en';
}
