import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyOfferRateDrafts,
  normalizeCateringFlowConfig,
  offerRateDrafts,
} from './catering-offer-pricing';

test('creates a safe empty flow for legacy service groups', () => {
  assert.deepEqual(normalizeCateringFlowConfig(undefined), {
    version: 3,
    enabled: true,
    steps: [],
    pricing: { rules: [] },
  });
});

test('round-trips the simple Friday price shown in an offer', () => {
  const flow = applyOfferRateDrafts(
    normalizeCateringFlowConfig(undefined),
    42,
    [{
      id: 'friday',
      label: 'Vendredi soir',
      weekday: '5',
      startTime: '18:00',
      endTime: '',
      minGuests: '30',
      maxGuests: '',
      price: '230',
    }],
  );

  assert.deepEqual(offerRateDrafts(flow, 42), [{
    id: 'friday',
    label: 'Vendredi soir',
    weekday: '5',
    startTime: '18:00',
    endTime: '',
    minGuests: '30',
    maxGuests: '',
    price: '230',
  }]);
});

test('preserves advanced and other-offer rules when simple rates are replaced', () => {
  const flow = normalizeCateringFlowConfig({
    version: 3,
    enabled: true,
    steps: [],
    pricing: {
      rules: [
        { id: 'other', label: 'Other', catalog_item_id: 8, catalog_per_guest_rate: 90 },
        {
          id: 'advanced',
          label: 'On site',
          catalog_item_id: 7,
          catalog_per_guest_rate: 220,
          conditions: [{ factor: 'answer:service', operator: 'equals', value: 'onsite' }],
        },
      ],
    },
  });

  const next = applyOfferRateDrafts(flow, 7, []);
  assert.deepEqual(next.pricing?.rules?.map((rule) => rule.id), ['other', 'advanced']);
});
