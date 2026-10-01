import type { SalesLibraryItem } from './api';

/** Matches library names in every stored language, including Hebrew niqqud. */
export function matchesSalesLibraryItem(item: SalesLibraryItem, query: string): boolean {
  const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f\u0591-\u05BD\u05BF-\u05C7]/g, '').toLocaleLowerCase().trim();
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const text = normalize([item.name, item.category, ...Object.values(item.translations?.name ?? {})].join(' '));
  return terms.every(term => text.includes(term));
}
