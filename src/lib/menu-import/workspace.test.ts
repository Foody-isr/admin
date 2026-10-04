import assert from 'node:assert/strict';
import test from 'node:test';
import { importFileError, initialTranslationSources, translationGroups, validImportURL } from './workspace';
import { collectReviewEntries } from './primary-locale';
import type { RichExtraction } from '../api';

test('file validation uses the same MIME and inclusive ten-MiB limit as the import handler', () => {
  assert.equal(importFileError(new File(['csv'], 'menu.csv', { type: 'text/csv' })), 'type');
  assert.equal(importFileError(new File([new Uint8Array(10 * 1024 * 1024)], 'menu.pdf', { type: 'application/pdf' })), null);
  assert.equal(importFileError(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'menu.png', { type: 'image/png' })), 'size');
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
    assert.equal(importFileError(new File(['fixture'], 'menu', { type })), null);
  }
});

test('import links require a complete HTTP URL without limiting the existing website importer to Wolt', () => {
  for (const value of ['https://example.test/menu?a=1', ' http://example.test/menu ']) assert.equal(validImportURL(value), true);
  for (const value of ['example.test', 'javascript:alert(1)', 'file:///menu.pdf', '']) assert.equal(validImportURL(value), false);
});

test('translation grouping preserves deduplicated usages and per-section source overrides', () => {
  const extraction: RichExtraction = { categories: [{ name: 'Plats', items: [{
    name: 'Salade fraîche', description: 'Herbes fraîches', price: 0,
    option_sets: [{ name: 'Taille', options: [{ name: 'Salade fraîche', price: 42 }] }],
  }] }] };
  const entries = collectReviewEntries(extraction);
  const sources = initialTranslationSources(extraction);
  assert.equal(sources.items, 'fr');
  assert.equal(sources.categories, 'en');
  assert.deepEqual(entries.find(entry => entry.text === 'Salade fraîche')?.usage, { item_name: 1, option: 1 });
  const groups = translationGroups(entries, { ...sources, items: 'he' });
  assert.deepEqual(groups.find(group => group.source_locale === 'he')?.texts, ['Salade fraîche']);
  assert.equal(groups.reduce((sum, group) => sum + group.texts.length, 0), entries.length);
});
