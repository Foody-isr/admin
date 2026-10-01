import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSalesLibraryItem } from './sales-library';
const item = { id: 1, name: 'Café crème', category: 'Boissons', image_url: '', has_recipe: false, translations: { name: { he: 'קָפֶה', en: 'Coffee' } } };
test('library search covers every language and category, ignoring accents and niqqud', () => {
  for (const query of ['cafe creme', 'קפה', 'coffee', 'cafe boissons', '']) assert.equal(matchesSalesLibraryItem(item, query), true);
  assert.equal(matchesSalesLibraryItem(item, 'unknown'), false);
});
