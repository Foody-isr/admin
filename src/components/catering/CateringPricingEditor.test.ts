import assert from 'node:assert/strict';
import test from 'node:test';
import type { CateringCatalogItem, CateringPricingRule } from '@/lib/api';
import { resolveCateringPricingPreview } from './CateringPricingEditor';

const item = { id: 42, base_price: 170 } as CateringCatalogItem;
const fallback: CateringPricingRule = {
  id: 'fallback',
  label: 'Tarif de secours',
  catalog_item_id: 42,
  catalog_per_guest_rate: 170,
  conditions: [],
};
const onsite: CateringPricingRule = {
  id: 'onsite-30',
  label: 'Vendredi sur place dès 30 convives',
  catalog_item_id: 42,
  catalog_per_guest_rate: 230,
  conditions: [
    { factor: 'weekday', operator: 'equals', value: '5' },
    { factor: 'guest_count', operator: 'between', min_value: '30', max_value: '999' },
    { factor: 'answer:fulfilment', operator: 'equals', value: 'onsite' },
  ],
};

test('pricing preview gives a matching specific rule priority over the fallback', () => {
  const preview = resolveCateringPricingPreview([fallback, onsite], item, {
    weekday: '5', guest_count: '30', 'answer:fulfilment': 'onsite',
  });

  assert.equal(preview.matched?.id, 'onsite-30');
  assert.equal(preview.rate, 230);
});

test('pricing preview uses the formula fallback when no specific rule matches', () => {
  const preview = resolveCateringPricingPreview([fallback, onsite], item, {
    weekday: '5', guest_count: '30', 'answer:fulfilment': 'delivery',
  });

  assert.equal(preview.matched?.id, 'fallback');
  assert.equal(preview.rate, 170);
});

test('pricing preview exposes ambiguous rules as a conflict', () => {
  const duplicate = { ...onsite, id: 'onsite-duplicate' };
  const preview = resolveCateringPricingPreview([fallback, onsite, duplicate], item, {
    weekday: '5', guest_count: '30', 'answer:fulfilment': 'onsite',
  });

  assert.equal(preview.matchingSpecific.length, 2);
  assert.equal(preview.matched, undefined);
});
