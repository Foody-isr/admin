import assert from 'node:assert/strict';
import test from 'node:test';
import { newChoiceGroupDraft, newIncludedSectionDraft, toChoiceGroupInputs, toIncludedSectionInputs } from './CateringFormulaComposer';

test('included section drafts serialize without their UI-only key', () => {
  const draft = {
    ...newIncludedSectionDraft(0, 'Pain & dips'),
    description: 'À partager',
    translations: { name: { fr: 'Pains et dips' } },
    items: [{ menu_item_id: 42, description: '' }, { name: 'Tapenade', description: '' }],
  };

  assert.deepEqual(toIncludedSectionInputs([draft]), [{
    name: 'Pain & dips',
    description: 'À partager',
    translations: { name: { fr: 'Pains et dips' } },
    items: [{ menu_item_id: 42, description: '' }, { name: 'Tapenade', description: '' }],
  }]);
});

test('choice drafts preserve linked and offer-specific manual options', () => {
  const draft = {
    ...newChoiceGroupDraft(0, 'Choisissez un poisson'),
    items: [
      { menu_item_id: 42, price_delta: 0, default_quantity: 1 },
      { name: 'Poisson du marché', description: 'Selon arrivage', price_delta: 5, default_quantity: 0 },
    ],
  };

  assert.deepEqual(toChoiceGroupInputs([draft]), [{
    name: 'Choisissez un poisson',
    description: '',
    min_selections: 1,
    max_selections: 1,
    max_per_item: 1,
    items: [
      { menu_item_id: 42, price_delta: 0, default_quantity: 1 },
      { name: 'Poisson du marché', description: 'Selon arrivage', price_delta: 5, default_quantity: 0 },
    ],
  }]);
});
