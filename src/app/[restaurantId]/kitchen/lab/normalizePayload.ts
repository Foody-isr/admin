import type { DraftPayload } from './types';

type LooseDraftPayload = Partial<{
  [Key in keyof DraftPayload]: DraftPayload[Key] | null;
}>;

/** Return recipe steps as a render-safe array at every runtime boundary. */
export function safeRecipeSteps(
  value: DraftPayload['recipe_steps'] | null | undefined,
): DraftPayload['recipe_steps'] {
  return Array.isArray(value) ? value : [];
}

/** Normalize historic or partially generated recipe drafts before rendering them. */
export function normalizeLabDraftPayload(payload: DraftPayload): DraftPayload {
  const source = payload as LooseDraftPayload;
  const components = Array.isArray(source.components) ? source.components : [];
  const recipeSteps = safeRecipeSteps(source.recipe_steps);
  const summary: Partial<DraftPayload['cost_summary']> = source.cost_summary ?? {};
  const totalEstimatedCost = summary.total_estimated_cost ?? 0;

  return {
    ...payload,
    creation_mode: source.creation_mode ?? 'ai',
    menu_item: source.menu_item ?? { name_he: '', name_primary: '' },
    components,
    recipe_steps: recipeSteps,
    brief: source.brief ?? { objective: 'refresh_menu', stock_policy: 'prefer_existing', creativity: 45 },
    context: source.context ?? { currency: 'ILS', average_price: 0, min_price: 0, max_price: 0 },
    creative: source.creative ?? {},
    metrics: source.metrics ?? {
      stock_reuse_pct: 0,
      menu_fit_score: 0,
      operational_score: 0,
      complexity_score: 0,
      prep_count: 0,
      ingredient_count: components.length,
    },
    revision: source.revision ?? 0,
    cost_summary: {
      total_estimated_cost: totalEstimatedCost,
      target_food_cost: summary.target_food_cost,
      food_cost_pct: summary.food_cost_pct,
      selling_price: summary.selling_price,
      suggested_min_price: summary.suggested_min_price,
      target_pct: summary.target_pct ?? 0.35,
      verdict: summary.verdict ?? 'no_price',
      verified_cost: summary.verified_cost ?? totalEstimatedCost,
      estimated_cost: summary.estimated_cost ?? 0,
      unknown_cost_count: summary.unknown_cost_count ?? 0,
      cost_status: summary.cost_status ?? 'verified',
      contribution_margin: summary.contribution_margin,
      margin_pct: summary.margin_pct,
    },
  };
}
