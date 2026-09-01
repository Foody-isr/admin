import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyOfferRateDrafts,
  normalizeCateringFlowConfig,
  offerRateDrafts,
  removeLegacyGlobalServiceModeSteps,
} from './catering-offer-pricing';

test('creates a safe empty flow for legacy service groups', () => {
  assert.deepEqual(normalizeCateringFlowConfig(undefined), {
    version: 3,
    enabled: false,
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
      serviceModeId: 'onsite',
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
    serviceModeId: 'onsite',
    price: '230',
  }]);
});

test('removes obsolete group-wide service modes and their dependent questions', () => {
  const cleaned = removeLegacyGlobalServiceModeSteps(normalizeCateringFlowConfig({
    version: 3,
    enabled: true,
    steps: [
      { id: 'guests', kind: 'guest_count', title: 'Guests', required: true },
      { id: 'mode', kind: 'single_choice', title: 'Mode', required: true, options: [
        { id: 'delivery', label: 'Delivery', price: 150, price_mode: 'per_guest', price_effect: 'replace_catalog_per_guest' },
      ] },
      { id: 'staff', kind: 'multi_choice', title: 'Staff', required: false, condition: { step_id: 'mode', operator: 'equals', option_id: 'delivery' }, options: [] },
    ],
    pricing: { rules: [{ id: 'legacy', label: 'Legacy', catalog_item_id: 4, catalog_per_guest_rate: 230, conditions: [{ factor: 'answer:mode', operator: 'equals', value: 'delivery' }] }] },
  }));

  assert.deepEqual(cleaned.steps.map((step) => step.id), ['guests']);
  assert.equal(cleaned.pricing?.rules?.length, 0);
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
