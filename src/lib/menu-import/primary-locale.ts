import { detectLocale, SUPPORTED_LOCALES, type Locale } from '@/components/translations/sections';
import type { RichExtraction, TranslationReviewEntry } from '@/lib/api';

export function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'he' || v === 'fr';
}

/**
 * Flattens an extraction into unique translatable texts with usage kinds —
 * the same dedup the server applies, so editing one row covers every
 * occurrence of that text.
 */
export function collectReviewEntries(extraction: RichExtraction): TranslationReviewEntry[] {
  const index = new Map<string, TranslationReviewEntry>();
  const add = (kind: string, raw?: string) => {
    const text = raw?.trim();
    if (!text) return;
    let e = index.get(text);
    if (!e) {
      e = { text, usage: {}, translations: {} };
      index.set(text, e);
    }
    e.usage[kind] = (e.usage[kind] ?? 0) + 1;
  };
  for (const cat of extraction.categories) {
    add('group_name', cat.name);
    for (const item of cat.items) {
      add('item_name', item.name);
      add('item_description', item.description);
      for (const os of item.option_sets ?? []) {
        add('option_set', os.name);
        for (const o of os.options) add('option', o.name);
      }
      for (const ms of item.modifier_sets ?? []) {
        add('modifier_set', ms.name);
        for (const m of ms.modifiers) add('modifier', m.name);
      }
    }
  }
  return Array.from(index.values());
}

/**
 * The language a menu is actually written in: every text judged on its own,
 * weighted by how many characters it carries.
 *
 * Two decisions here, both load-bearing:
 *
 * 1. Per TEXT, not per section. `detectLocale` answers "does any Hebrew
 *    character appear", which is fine for prefilling a section dropdown the user
 *    can correct, but ruinous here: one Hebrew dish on an otherwise English menu
 *    would flag the whole descriptions section Hebrew, and every long English
 *    description would then be counted as evidence FOR Hebrew.
 *
 * 2. Weighted by length, not by count. A menu routinely carries short Latin
 *    brand names ("Caprisea", "Salmon Melt") above long descriptions written in
 *    the restaurant's real language. Counting texts equally lets a handful of
 *    names outvote the body of the menu.
 *
 * Getting this wrong is not cosmetic: the answer becomes the base-column
 * language of the entire catalog, so a wrong call files the restaurant's real
 * menu away as a "translation" and promotes machine text in its place.
 *
 * Returns null when there is nothing to judge yet. The user can always override
 * the result; this only decides what they are shown first.
 */
export function dominantLocale(extraction: RichExtraction | null): Locale | null {
  if (!extraction) return null;
  const weight: Partial<Record<Locale, number>> = {};
  for (const e of collectReviewEntries(extraction)) {
    const loc = detectLocale([e.text]);
    weight[loc] = (weight[loc] ?? 0) + e.text.length;
  }
  let best: Locale | null = null;
  let bestWeight = 0;
  for (const loc of SUPPORTED_LOCALES) {
    const n = weight[loc] ?? 0;
    if (n > bestWeight) {
      best = loc;
      bestWeight = n;
    }
  }
  return best;
}
