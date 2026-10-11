import type { MenuItemIngredient } from '@/lib/api';

/** Keeps editor rows stable when the API recreates ingredient IDs on every save. */
export function keyedRecipeIngredients(ingredients: MenuItemIngredient[]) {
  const occurrences = new Map<string, number>();
  return ingredients.map(ingredient => {
    const source = `${ingredient.stock_item_id ?? 0}:${ingredient.prep_item_id ?? 0}:${ingredient.option_id ?? 0}`;
    const occurrence = occurrences.get(source) ?? 0;
    occurrences.set(source, occurrence + 1);
    return { key: `${source}:${occurrence}`, ingredient };
  });
}
