import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeLabDraftPayload } from './normalizePayload';
import type { DraftPayload } from './types';

test('normalizes nullable fields from historic recipe drafts', () => {
  const payload = {
    menu_item: null,
    components: null,
    recipe_steps: null,
    cost_summary: null,
    brief: null,
    context: null,
    creative: null,
    metrics: null,
    revision: null,
  } as unknown as DraftPayload;

  const normalized = normalizeLabDraftPayload(payload);

  assert.deepEqual(normalized.menu_item, { name_he: '', name_primary: '' });
  assert.deepEqual(normalized.components, []);
  assert.deepEqual(normalized.recipe_steps, []);
  assert.equal(normalized.cost_summary.total_estimated_cost, 0);
  assert.equal(normalized.cost_summary.target_pct, 0.35);
  assert.equal(normalized.cost_summary.verdict, 'no_price');
  assert.equal(normalized.metrics.ingredient_count, 0);
});

test('preserves populated recipe steps and commercial values', () => {
  const payload = {
    creation_mode: 'manual',
    menu_item: { name_he: '', name_primary: 'Fish burger' },
    components: [],
    recipe_steps: [{ order: 1, instruction_he: '', instruction_primary: 'Toast the bun' }],
    cost_summary: {
      total_estimated_cost: 18,
      target_pct: 0.35,
      verdict: 'ok',
      verified_cost: 18,
      estimated_cost: 0,
      unknown_cost_count: 0,
      cost_status: 'verified',
      selling_price: 60,
    },
    brief: { objective: 'document_recipe', stock_policy: 'prefer_existing', creativity: 0 },
    context: { currency: 'ILS', average_price: 0, min_price: 0, max_price: 0 },
    creative: {},
    metrics: { stock_reuse_pct: 100, menu_fit_score: 100, operational_score: 100, complexity_score: 0, prep_count: 0, ingredient_count: 0 },
    revision: 2,
  } satisfies DraftPayload;

  const normalized = normalizeLabDraftPayload(payload);

  assert.deepEqual(normalized.recipe_steps, payload.recipe_steps);
  assert.equal(normalized.cost_summary.selling_price, 60);
  assert.equal(normalized.revision, 2);
});
