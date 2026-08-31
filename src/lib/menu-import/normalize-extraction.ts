import type { RichCategory, RichExtraction, RichItem } from '@/lib/api';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the import API at runtime before React receives it. Older servers
 * could return Wolt retail categories with `items: null`; treating the response
 * as a TypeScript interface then crashed the whole route during rendering.
 */
export function normalizeRichExtraction(payload: unknown): RichExtraction {
  if (!isRecord(payload) || !Array.isArray(payload.categories)) {
    throw new Error('The imported menu response is invalid.');
  }

  const categories: RichCategory[] = payload.categories.map((rawCategory) => {
    if (!isRecord(rawCategory) || typeof rawCategory.name !== 'string' || !Array.isArray(rawCategory.items)) {
      throw new Error('The imported menu contains a category without items.');
    }
    const items: RichItem[] = rawCategory.items.map((rawItem) => {
      if (
        !isRecord(rawItem)
        || typeof rawItem.name !== 'string'
        || typeof rawItem.price !== 'number'
        || !Number.isFinite(rawItem.price)
      ) {
        throw new Error('The imported menu contains an invalid item.');
      }
      if (
        rawItem.pricing_mode === 'by_weight'
        && (typeof rawItem.price_per_kg !== 'number' || rawItem.price_per_kg <= 0)
      ) {
        throw new Error('The imported menu contains invalid weight pricing.');
      }
      return {
        ...(rawItem as unknown as RichItem),
        description: typeof rawItem.description === 'string' ? rawItem.description : '',
        option_sets: Array.isArray(rawItem.option_sets) ? rawItem.option_sets as RichItem['option_sets'] : undefined,
        modifier_sets: Array.isArray(rawItem.modifier_sets) ? rawItem.modifier_sets as RichItem['modifier_sets'] : undefined,
      };
    });
    return { name: rawCategory.name.trim(), items };
  }).filter((category) => category.name && category.items.length > 0);

  if (categories.length === 0) {
    throw new Error('No importable menu items were found at this link.');
  }

  return {
    categories,
    restaurant_logo_url: typeof payload.restaurant_logo_url === 'string' ? payload.restaurant_logo_url : undefined,
    restaurant_cover_url: typeof payload.restaurant_cover_url === 'string' ? payload.restaurant_cover_url : undefined,
  };
}
