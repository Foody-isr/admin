import type { MenuItem, MenuItemIngredient, PrepItem, ItemOptionOverride } from '@/lib/api';
import { convertQuantity } from '@/lib/units';

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
}

export type PrepConfigIssue = 'missing_yield' | 'no_ingredients' | 'zero_cost_ingredients';

export const vatMultiplierFor = (vatRate: number) => 1 + vatRate / 100;

// Per-stock VAT rate. `null` override → use restaurant default. `0` override
// → exempt (e.g. Israeli produce). Non-null non-zero → custom rate.
export function effectiveVatRate(
  stock: { vat_rate_override?: number | null } | null | undefined,
  restaurantRate: number,
): number {
  const ov = stock?.vat_rate_override;
  return ov == null ? restaurantRate : ov;
}

export const vatMultiplierForStock = (
  stock: { vat_rate_override?: number | null } | null | undefined,
  restaurantRate: number,
) => vatMultiplierFor(effectiveVatRate(stock, restaurantRate));

// Stock cost_per_unit is always stored ex-VAT (migration 059). These helpers
// exist so callers don't hard-code the math.
export const costExVat = (stock: { cost_per_unit?: number } | null | undefined) =>
  stock?.cost_per_unit ?? 0;

export const costIncVat = (
  stock: { cost_per_unit?: number; vat_rate_override?: number | null } | null | undefined,
  restaurantRate: number,
) => costExVat(stock) * vatMultiplierForStock(stock, restaurantRate);

// Flattens an item's option-set options AND legacy variant groups into one
// list of selectable variants, applying per-item price overrides when present.
export function buildVariantOptions(
  item: MenuItem,
  overrides: ItemOptionOverride[] = [],
): VariantOption[] {
  const variants: VariantOption[] = [];
  for (const os of item.option_sets ?? []) {
    for (const opt of os.options ?? []) {
      if (!opt.is_active) continue;
      const override = overrides.find((ov) => ov.option_id === opt.id);
      // Combo-only variants are excluded from the cost summary — they have
      // price 0 by design (combo total covers them) so cost % computations
      // would divide by zero or report nonsensical margins. They still drive
      // stock deduction inside combos via the combo step's option_id lock.
      if (override?.is_combo_only ?? opt.is_combo_only) continue;
      variants.push({
        id: `opt:${opt.id}`,
        name: opt.name,
        price: override?.price ?? opt.price,
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
      });
    }
  }
  return variants;
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
// stored `prep.cost_per_unit` in that case. All stock costs are ex-VAT since
// migration 059.
export function computePrepUnitCostExVat(prep: PrepItem): number | null {
  if (!prep.ingredients || prep.ingredients.length === 0) return null;
  if ((prep.yield_per_batch ?? 0) <= 0) return null;
  const batchExVat = prep.ingredients.reduce(
    (sum, pi) => sum + pi.quantity_needed * costExVat(pi.stock_item ?? null),
    0,
  );
  return batchExVat / prep.yield_per_batch;
}

// Line cost for one recipe ingredient. Resolution rule (canonical):
//   1. If a VariantOverride matches the active variant's option_id, use it.
//   2. Otherwise fall back to ing.quantity_needed + ing.unit.
// Stock cost is always ex-VAT; inc-VAT display uses the per-item rate.
export function calcLineCost(
  ing: MenuItemIngredient,
  variantOptionId: number | null | undefined,
  showCostsExVat: boolean,
  restaurantRate: number,
): number {
  const stock = ing.stock_item;
  const prep = ing.prep_item;
  const stockUnit = stock?.unit ?? prep?.unit ?? '';

  const fallbackUnit = ing.unit || (MEASURABLE_UNITS.includes(stockUnit) ? stockUnit : '');
  let qty = ing.quantity_needed;
  let qtyUnit: string = fallbackUnit;

  if (variantOptionId != null) {
    const override = (ing.variant_overrides ?? []).find((o) => o.option_id === variantOptionId);
    if (override) {
      qty = override.quantity;
      qtyUnit = override.unit || fallbackUnit;
    }
  }

  // Unit cost, ex-VAT. For prep items, the derived cost is already ex-VAT
  // (sub-ingredient stock costs are ex-VAT); the stored prep.cost_per_unit
  // fallback is also ex-VAT post-migration.
  let unitCostExVat: number;
  if (prep && !stock) {
    const prepExVat = computePrepUnitCostExVat(prep);
    unitCostExVat = prepExVat != null ? prepExVat : (prep.cost_per_unit ?? 0);
  } else {
    unitCostExVat = costExVat(stock);
  }
  // Per-stock VAT rate — prep items use the restaurant default since their
  // cost aggregates multiple stock items (each with its own rate already
  // rolled into the computed ex-VAT value above).
  const multiplier = stock
    ? vatMultiplierForStock(stock, restaurantRate)
    : vatMultiplierFor(restaurantRate);
  const unitCost = showCostsExVat ? unitCostExVat : unitCostExVat * multiplier;

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

export interface CostLineDetail {
  ingredient: MenuItemIngredient;
  name: string;
  qty: number;
  qtyUnit: string;               // unit the qty is denominated in on the cost tab
  unitCost: number;              // ₪ per sourceUnit, VAT-normalized
  sourceUnit: string;            // stock.unit or prep.unit
  lineCost: number;              // contribution to foodCost (VAT-normalized)
  isPrep: boolean;
}

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
  lines: CostLineDetail[];       // per-ingredient breakdown for the modal
}

// Effective display qty + unit for an ingredient given the current variant.
// Mirrors calcLineCost: per-variant override wins, else base qty.
function effectiveQty(
  ing: MenuItemIngredient,
  optionId: number | null,
): { qty: number; unit: string } {
  const fallbackUnit = ing.unit || ing.stock_item?.unit || ing.prep_item?.unit || '';
  if (optionId != null) {
    const override = (ing.variant_overrides ?? []).find((o) => o.option_id === optionId);
    if (override) {
      return { qty: override.quantity, unit: override.unit || fallbackUnit };
    }
  }
  return { qty: ing.quantity_needed, unit: fallbackUnit };
}

// VAT-normalized unit cost for one ingredient, using the same precedence as
// calcLineCost (prep derived cost falls back to prep.cost_per_unit). Stock
// cost is ex-VAT; per-stock multiplier applied for inc-VAT display.
function unitCostFor(
  ing: MenuItemIngredient,
  showCostsExVat: boolean,
  restaurantRate: number,
): number {
  const prep = ing.prep_item;
  const stock = ing.stock_item;
  let costEx: number;
  if (prep && !stock) {
    const prepExVat = computePrepUnitCostExVat(prep);
    costEx = prepExVat != null ? prepExVat : (prep.cost_per_unit ?? 0);
  } else {
    costEx = costExVat(stock);
  }
  if (showCostsExVat) return costEx;
  const multiplier = stock
    ? vatMultiplierForStock(stock, restaurantRate)
    : vatMultiplierFor(restaurantRate);
  return costEx * multiplier;
}

// Computes the full KPI summary for one item. Used by the compare view to
// render each column. When no variantId is provided, picks the first variant
// (matching the Cost tab's default).
export function computeItemCostSummary(input: {
  item: MenuItem;
  ingredients: MenuItemIngredient[];
  overrides: ItemOptionOverride[];
  vatRate: number;
  showCostsExVat: boolean;
  variantId?: string;
}): ItemCostSummary {
  const restaurantRate = input.vatRate;
  // Menu item prices are quoted inc-VAT at the restaurant rate; deflate by
  // the restaurant multiplier (not per-item) when showing ex-VAT.
  const restaurantMultiplier = vatMultiplierFor(restaurantRate);
  const variants = buildVariantOptions(input.item, input.overrides);
  const activeVariantId = input.variantId ?? variants[0]?.id ?? '';
  const activeVariant = variants.find((v) => String(v.id) === activeVariantId) ?? null;
  const optionId = optionIdFromVariant(activeVariantId);

  const scoped = scopedIngredients(input.ingredients, optionId);
  const lineDetails: CostLineDetail[] = scoped.map((ing) => {
    const lineCost = calcLineCost(ing, optionId, input.showCostsExVat, restaurantRate);
    const eff = effectiveQty(ing, optionId);
    const sourceUnit = ing.stock_item?.unit ?? ing.prep_item?.unit ?? '';
    return {
      ingredient: ing,
      name: ing.stock_item?.name ?? ing.prep_item?.name ?? '?',
      qty: eff.qty,
      qtyUnit: eff.unit,
      unitCost: unitCostFor(ing, input.showCostsExVat, restaurantRate),
      sourceUnit,
      lineCost,
      isPrep: !!ing.prep_item && !ing.stock_item,
    };
  });

  const foodCost = lineDetails.reduce((s, l) => s + l.lineCost, 0);

  const rawPrice = activeVariant ? activeVariant.price : (input.item.price ?? 0);
  const displayPrice = input.showCostsExVat ? rawPrice / restaurantMultiplier : rawPrice;

  const costPct = displayPrice > 0 ? foodCost / displayPrice : 0;
  const margin = displayPrice - foodCost;

  const top = lineDetails.reduce<CostLineDetail | null>(
    (best, l) => (best == null || l.lineCost > best.lineCost ? l : best),
    null,
  );
  const topIngredient = top && top.lineCost > 0 && foodCost > 0
    ? {
        name: top.name,
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
    lines: lineDetails,
  };
}
