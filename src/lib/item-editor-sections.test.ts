import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changedItemSections } from './item-editor-sections';

test('shortcuts do not mark fields dirty; restoring a field removes its marker', () => {
  const saved = { name: 'Salad', price: 48, activeTab: 'details' };
  assert.deepEqual(
    changedItemSections(saved, { ...saved, activeTab: 'recipe' }),
    [],
  );
  assert.deepEqual(
    changedItemSections(saved, { ...saved, name: 'New salad' }),
    ['information'],
  );
  assert.deepEqual(changedItemSections(saved, { ...saved }), []);
});

test('nested variants, allergens and combo changes are associated with their sections', () => {
  const saved = {
    variantGroups: [{ rows: [{ name: 'Small', price: 12 }] }],
    customerFacts: { allergens: [] },
    comboSteps: [],
  };
  assert.deepEqual(
    changedItemSections(saved, {
      ...saved,
      variantGroups: [{ rows: [{ name: 'Small', price: 14 }] }],
      customerFacts: { allergens: ['sesame'] },
      comboSteps: [{ name: 'Side' }],
    }),
    ['pricing', 'composition', 'customer-facts'],
  );
});

test('translated portions mark pricing while translated names mark information', () => {
  const saved = {
    translations: { name: { fr: 'Salade' }, portion: { fr: 'Une personne' } },
  };
  assert.deepEqual(
    changedItemSections(saved, {
      translations: {
        ...saved.translations,
        portion: { fr: 'Deux personnes' },
      },
    }),
    ['pricing'],
  );
  assert.deepEqual(
    changedItemSections(saved, {
      translations: { ...saved.translations, name: { fr: 'Salade verte' } },
    }),
    ['information'],
  );
});
