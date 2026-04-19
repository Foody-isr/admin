import type { MenuItem, MenuItemIngredient, PrepItem, ItemOptionOverride } from '@/lib/api';
import { convertQuantity, toBaseUnit } from '@/lib/units';

// Industry guideline used as the threshold below which a menu item has a
// healthy food-cost %. Lives here so the Cost tab and any other consumer
// (compare view, future dashboards) reference one constant.
export const COST_THRESHOLD = 0.35;

const PACKAGE_UNITS = ['unit', 'pack', 'box', 'bag', 'dose'];
const MEASURABLE_UNITS = ['g', 'kg', 'ml', 'l'];

export interface VariantOption {
  id: string;              // "opt:<id>" for option-set options, "var:<id>" for legacy variants
  name: string;
  price: number;
  portion_size: number;
  portion_size_unit: string;
}

export type PrepConfigIssue = 'missing_yield' | 'no_ingredients' | 'zero_cost_ingredients';

export const vatMultiplierFor = (vatRate: number) => 1 + vatRate / 100;

export const toExVat = (c: number, includesVat: boolean, vatMultiplier: number) =>
  includesVat ? c / vatMultiplier : c;

export const toIncVat = (c: number, includesVat: boolean, vatMultiplier: number) =>
  includesVat ? c : c * vatMultiplier;

// Flattens an item's option-set options AND legacy variant groups into one
// list of selectable variants, applying per-item price/portion overrides when
// present.
export function buildVariantOptions(
  item: MenuItem,
  overrides: ItemOptionOverride[] = [],
): VariantOption[] {
  const variants: VariantOption[] = [];
  for (const os of item.option_sets ?? []) {
    for (const opt of os.options ?? []) {
      if (!opt.is_active) continue;
      const override = overrides.find((ov) => ov.option_id === opt.id);
      variants.push({
        id: `opt:${opt.id}`,
        name: opt.name,
        price: override?.price ?? opt.price,
        portion_size: override?.portion_size ?? 0,
        portion_size_unit: override?.portion_size_unit ?? 'g',
      });
    }
  }
  for (const g of item.variant_groups ?? []) {
    for (const v of g.variants ?? []) {
      if (!v.is_active) continue;
      variants.push({
        id: `var:${v.id}`,
        name: v.name,
        price: v.price,
        portion_size: v.portion_size ?? 0,
        portion_size_unit: v.portion_size_unit ?? 'g',
      });
    }
  }
  return variants;
}

// Resolves the per-serving portion to use for ingredient scaling, in
// priority: active variant's portion → item's base portion → null (no scaling
// possible). Never falls back to recipe_yield because yield is the whole
// batch, not a portion.
export function resolvePortion(
  item: MenuItem,
  variants: VariantOption[],
  activeVariantId: string,
): { qty: number; unit: string } | null {
  const v = variants.find((vv) => String(vv.id) === activeVariantId);
  if (v && (v.portion_size ?? 0) > 0) {
    return { qty: v.portion_size, unit: v.portion_size_unit || 'g' };
  }
  if ((item.portion_size ?? 0) > 0) {
    return { qty: item.portion_size!, unit: item.portion_size_unit || 'g' };
  }
  return null;
}

// Extracts the OptionSetOption id from an "opt:N" variant id. Returns null
// for legacy "var:N" variants or when no variant is selected.
export function optionIdFromVariant(variantId: string): number | null {
  if (!variantId.startsWith('opt:')) return null;
  const n = Number(variantId.slice(4));
  return Number.isFinite(n) ? n : null;
}

// Cost of one unit of a prep item, computed from its sub-recipe. Returns null
// when the prep is not configured well enough to compute a cost (no yield,
// no ingredients, no stock items preloaded). Callers can fall back to the
// stored `prep.cost_per_unit` in that case.
export function computePrepUnitCostExVat(prep: PrepItem, vatMultiplier: number): number | null {
  if (!prep.ingredients || prep.ingredients.length === 0) return null;
  if ((prep.yield_per_batch ?? 0) <= 0) return null;
  const batchExVat = prep.ingredients.reduce((sum, pi) => {
    const s = pi.stock_item;
    if (!s) return sum;
    const costExVat = toExVat(s.cost_per_unit ?? 0, s.price_includes_vat ?? false, vatMultiplier);
    return sum + pi.quantity_needed * costExVat;
  }, 0);
  return batchExVat / prep.yield_per_batch;
}

// Line cost for one recipe ingredient, honoring per-variant overrides,
// scales_with_variant, and package-unit conversion. Does NOT prorate batch
// items by variant portion — callers apply that in calcVariantLineCost when
// the item is in batch mode.
export function calcLineCost(
  ing: MenuItemIngredient,
  item: MenuItem,
  portionOverride: { qty: number; unit: string } | null | undefined,
  variantOptionId: number | null | undefined,
  showCostsExVat: boolean,
  vatMultiplier: number,
): number {
  const stock = ing.stock_item;
  const prep = ing.prep_item;
  const stockUnit = stock?.unit ?? prep?.unit ?? '';

  let qty: number;
  let qtyUnit: string = ing.unit || (MEASURABLE_UNITS.includes(stockUnit) ? stockUnit : '');
  const batchMode = (item.recipe_yield ?? 0) > 0;

  const override = !batchMode && variantOptionId != null
    ? (ing.variant_overrides ?? []).find((o) => o.option_id === variantOptionId)
    : undefined;
  if (override && override.quantity > 0) {
    qty = override.quantity;
    qtyUnit = override.unit || qtyUnit;
  } else if (ing.scales_with_variant && !batchMode && portionOverride) {
    qty = portionOverride.qty;
    qtyUnit = portionOverride.unit || qtyUnit;
  } else {
    qty = ing.quantity_needed;
  }

  let rawCost: number;
  let includesVat: boolean;
  if (prep && !stock) {
    const prepExVat = computePrepUnitCostExVat(prep, vatMultiplier);
    if (prepExVat != null) { rawCost = prepExVat; includesVat = false; }
    else { rawCost = prep.cost_per_unit ?? 0; includesVat = false; }
  } else {
    rawCost = stock?.cost_per_unit ?? 0;
    includesVat = stock?.price_includes_vat ?? false;
  }
  const unitCost = showCostsExVat
    ? toExVat(rawCost, includesVat, vatMultiplier)
    : toIncVat(rawCost, includesVat, vatMultiplier);

  if (qtyUnit === stockUnit || !qtyUnit) {
    if (!qtyUnit && PACKAGE_UNITS.includes(stockUnit) && stock?.unit_content && stock?.unit_content_unit) {
      return (qty / stock.unit_content) * unitCost;
    }
    if (!qtyUnit && PACKAGE_UNITS.includes(stockUnit)) return 0;
    return qty * unitCost;
  }

  const converted = convertQuantity(qty, qtyUnit, stockUnit);
  if (converted !== qty) return converted * unitCost;

  if (PACKAGE_UNITS.includes(stockUnit) && stock?.unit_content && stock?.unit_content_unit) {
    const inContentUnit = convertQuantity(qty, qtyUnit, stock.unit_content_unit);
    return (inContentUnit / stock.unit_content) * unitCost;
  }
  if (PACKAGE_UNITS.includes(stockUnit) && MEASURABLE_UNITS.includes(qtyUnit)) return 0;
  if (MEASURABLE_UNITS.includes(stockUnit) && PACKAGE_UNITS.includes(qtyUnit)) return 0;
  return qty * unitCost;
}

// Variant-aware line cost. For batch items (recipe_yield > 0), applies the
// (portion / yield) proration so a 450 ml serving of a 5 L soup pays only
// its share of the batch cost.
export function calcVariantLineCost(
  ing: MenuItemIngredient,
  item: MenuItem,
  portion: { qty: number; unit: string } | null,
  optionId: number | null | undefined,
  showCostsExVat: boolean,
  vatMultiplier: number,
): number {
  const raw = calcLineCost(ing, item, portion, optionId, showCostsExVat, vatMultiplier);
  const hasYield = (item.recipe_yield ?? 0) > 0;
  if (hasYield && portion) {
    const yieldBase = toBaseUnit(item.recipe_yield!, item.recipe_yield_unit || 'kg');
    if (yieldBase > 0) {
      const portionBase = toBaseUnit(portion.qty, portion.unit);
      return raw * (portionBase / yieldBase);
    }
  }
  return raw;
}

// Filters ingredients to those that apply to the current variant selection:
// base rows (option_id == null) always apply; option-scoped rows only when
// their option_id matches.
export function scopedIngredients(
  ingredients: MenuItemIngredient[],
  optionId: number | null,
): MenuItemIngredient[] {
  return ingredients.filter((i) => i.option_id == null || (optionId != null && i.option_id === optionId));
}

// Mirrors the server-side guards in PrepItem.CostPerUnit(). Returns why the
// prep's derived cost is 0, so the UI can surface an actionable warning
// instead of silently rendering 0.00 ₪.
export function diagnosePrep(prep: PrepItem): PrepConfigIssue | null {
  if ((prep.yield_per_batch ?? 0) <= 0) return 'missing_yield';
  if (!prep.ingredients || prep.ingredients.length === 0) return 'no_ingredients';
  const anyPriced = prep.ingredients.some((pi) => (pi.stock_item?.cost_per_unit ?? 0) > 0);
  if (!anyPriced) return 'zero_cost_ingredients';
  return null;
}

// ── One-shot summary for the compare view ───────────────────────────────────

export interface ItemCostSummary {
  foodCost: number;              // on the VAT basis selected via showCostsExVat
  displayPrice: number;          // same VAT basis as foodCost
  costPct: number;               // foodCost / displayPrice (0 when price is 0)
  margin: number;                // displayPrice - foodCost
  topIngredient: {
    name: string;
    lineCost: number;
    contributionPct: number;     // lineCost / foodCost
  } | null;
  configIssues: Array<{ prep: PrepItem; issue: PrepConfigIssue }>;
  ingredientCount: number;
  activeVariant: VariantOption | null;
  hasIngredients: boolean;
  isOverThreshold: boolean;      // costPct > COST_THRESHOLD
}

// Computes the full KPI summary for one item. Used by the compare view to
// render each column. When no variantId is provided, picks the first variant
// that has a configured portion size (matching the Cost tab's default).
export function computeItemCostSummary(input: {
  item: MenuItem;
  ingredients: MenuItemIngredient[];
  overrides: ItemOptionOverride[];
  vatRate: number;
  showCostsExVat: boolean;
  variantId?: string;
}): ItemCostSummary {
  const vatMultiplier = vatMultiplierFor(input.vatRate);
  const variants = buildVariantOptions(input.item, input.overrides);
  const activeVariantId = input.variantId
    ?? variants.find((v) => (v.portion_size ?? 0) > 0)?.id
    ?? '';
  const activeVariant = variants.find((v) => String(v.id) === activeVariantId) ?? null;
  const portion = resolvePortion(input.item, variants, activeVariantId);
  const optionId = optionIdFromVariant(activeVariantId);

  const scoped = scopedIngredients(input.ingredients, optionId);
  const lines = scoped.map((ing) => ({
    ing,
    lineCost: portion
      ? calcVariantLineCost(ing, input.item, portion, optionId, input.showCostsExVat, vatMultiplier)
      : calcLineCost(ing, input.item, null, optionId, input.showCostsExVat, vatMultiplier),
  }));

  const foodCost = lines.reduce((s, l) => s + l.lineCost, 0);

  const rawPrice = activeVariant ? activeVariant.price : (input.item.price ?? 0);
  const displayPrice = input.showCostsExVat ? rawPrice / vatMultiplier : rawPrice;

  const costPct = displayPrice > 0 ? foodCost / displayPrice : 0;
  const margin = displayPrice - foodCost;

  const top = lines.reduce<{ ing: MenuItemIngredient; lineCost: number } | null>(
    (best, l) => (best == null || l.lineCost > best.lineCost ? l : best),
    null,
  );
  const topIngredient = top && top.lineCost > 0 && foodCost > 0
    ? {
        name: top.ing.stock_item?.name ?? top.ing.prep_item?.name ?? '',
        lineCost: top.lineCost,
        contributionPct: top.lineCost / foodCost,
      }
    : null;

  const configIssues: Array<{ prep: PrepItem; issue: PrepConfigIssue }> = [];
  const seen = new Set<number>();
  for (const ing of scoped) {
    const prep = ing.prep_item;
    if (!prep || ing.stock_item) continue;
    if (seen.has(prep.id)) continue;
    const issue = diagnosePrep(prep);
    if (issue) {
      configIssues.push({ prep, issue });
      seen.add(prep.id);
    }
  }

  return {
    foodCost,
    displayPrice,
    costPct,
    margin,
    topIngredient,
    configIssues,
    ingredientCount: scoped.length,
    activeVariant,
    hasIngredients: input.ingredients.length > 0,
    isOverThreshold: costPct > COST_THRESHOLD,
  };
}
