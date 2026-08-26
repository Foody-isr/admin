import assert from 'node:assert/strict';
import test from 'node:test';
import { newIncludedSectionDraft, toIncludedSectionInputs } from './CateringFormulaComposer';

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
