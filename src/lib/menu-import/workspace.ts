import type { RichExtraction, TranslationReviewEntry } from '@/lib/api';
import { collectReviewEntries } from '@/lib/menu-import/primary-locale';
import { detectLocale, sectionFor } from '@/components/translations/sections';

const IMPORT_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
]);

/** Match the existing menu-import handler's MIME and ten-MiB contract. */
export function importFileError(file: File): 'type' | 'size' | null {
  if (!IMPORT_MIME_TYPES.has(file.type)) return 'type';
  if (file.size > 10 * 1024 * 1024) return 'size';
  return null;
}

/** Accept public-link syntax without changing server-side importer selection. */
export function validImportURL(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (url.protocol === 'https:' || url.protocol === 'http:') && !!url.hostname;
  } catch {
    return false;
  }
}

/** Derive each translation section's initial source with the existing heuristic. */
export function initialTranslationSources(extraction: RichExtraction): Record<string, string> {
  const sections: Record<string, string[]> = {};
  for (const entry of collectReviewEntries(extraction)) {
    (sections[sectionFor(entry.usage)] ??= []).push(entry.text);
  }
  return Object.fromEntries(
    Object.entries(sections).map(([section, texts]) => [section, detectLocale(texts)]),
  );
}

/** Group unique source texts without dropping usages shared by different fields. */
export function translationGroups(entries: TranslationReviewEntry[], sources: Record<string, string>) {
  const groups: Record<string, Set<string>> = {};
  for (const entry of entries) {
    const source = sources[sectionFor(entry.usage)] ?? 'en';
    (groups[source] ??= new Set()).add(entry.text);
  }
  return Object.entries(groups).map(([source_locale, texts]) => ({
    source_locale,
    texts: Array.from(texts),
  }));
}
