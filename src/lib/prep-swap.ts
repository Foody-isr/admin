import { MenuItemIngredient, PrepItem } from '@/lib/api';

export interface SwapSuggestion {
  prep: PrepItem;
  matchedIngredients: MenuItemIngredient[];
  coverage: number;
}

// Ignore matches below this ratio — avoids noisy suggestions when a prep just
// happens to share 1-2 staple ingredients (salt, oil) with the menu item.
const COVERAGE_THRESHOLD = 0.6;

// Minimum raw ingredients on the menu item before we bother suggesting.
// A 1-ingredient menu item matching a multi-ingredient prep would trigger at
// 100 % coverage but isn't a useful swap.
const MIN_RAW_INGREDIENTS = 3;

// Look for preps whose raw-ingredient set covers enough of a menu item's raw
// ingredients to be a useful swap. Returns suggestions sorted by coverage desc.
// Requires each prep to have `ingredients` preloaded with `stock_item_id`.
export function detectPrepSwaps(
  menuItemIngredients: MenuItemIngredient[],
  prepItems: PrepItem[],
): SwapSuggestion[] {
  const rawRows = menuItemIngredients.filter(
    (i) => i.stock_item_id && !i.prep_item_id,
  );
  if (rawRows.length < MIN_RAW_INGREDIENTS) return [];

  // Don't suggest a prep that's already referenced by the menu item.
  const alreadyReferencedPrepIds = new Set(
    menuItemIngredients.filter((i) => i.prep_item_id).map((i) => i.prep_item_id!),
  );

  const suggestions: SwapSuggestion[] = [];
  for (const prep of prepItems) {
    if (alreadyReferencedPrepIds.has(prep.id)) continue;
    const prepStockIds = new Set(
      (prep.ingredients ?? []).map((ing) => ing.stock_item_id),
    );
    if (prepStockIds.size === 0) continue;
    const matched = rawRows.filter((r) => prepStockIds.has(r.stock_item_id!));
    const coverage = matched.length / rawRows.length;
    if (coverage >= COVERAGE_THRESHOLD) {
      suggestions.push({ prep, matchedIngredients: matched, coverage });
    }
  }

  suggestions.sort((a, b) => b.coverage - a.coverage);
  return suggestions;
}
