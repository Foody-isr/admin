'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MenuItem, MenuItemIngredient, PrepItem, StockItem, ItemOptionOverride } from '@/lib/api';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useI18n } from '@/lib/i18n';
import { convertQuantity, sameUnitFamily } from '@/lib/units';
import { detectPrepSwaps } from '@/lib/prep-swap';
import PrepCostBreakdownModal from '@/components/food-cost/PrepCostBreakdownModal';
import CostPctBreakdownModal from '@/components/food-cost/CostPctBreakdownModal';
import {
  COST_THRESHOLD, VariantOption, PrepConfigIssue,
  vatMultiplierFor, toExVat as toExVatShared, toIncVat as toIncVatShared,
  buildVariantOptions, resolvePortion, optionIdFromVariant,
  computePrepUnitCostExVat as computePrepUnitCostExVatShared,
  calcLineCost as calcLineCostShared,
  calcVariantLineCost as calcVariantLineCostShared,
  scopedIngredients, diagnosePrep,
} from '@/lib/cost-utils';

// Unit-family arrays used by the local hasUnitMismatch display logic. The
// cost-math helpers in cost-utils have their own copy — kept separate so the
// shared module stays free of React/display concerns.
const PACKAGE_UNITS = ['unit', 'pack', 'box', 'bag', 'dose'];
const MEASURABLE_UNITS = ['g', 'kg', 'ml', 'l'];

interface Props {
  rid: number;
  item: MenuItem;
  ingredients: MenuItemIngredient[];
  prepItems: PrepItem[];
  stockItems?: StockItem[];
  vatRate: number;
  // Per-item option overrides — this is where variant portion_size actually
  // lives when variants come through the option_sets system. Without this the
  // panel sees every option with portion_size = 0 and the Cost tab looks empty.
  itemOptionOverrides?: ItemOptionOverride[];
  // When present, the swap banner CTA calls this instead of linking out — used
  // when the panel is embedded inside the Menu Item page's Cost tab (swap flow
  // lives on the Recipe tab, not on a separate route).
  onGoToRecipe?: () => void;
  // Optional: open the stock-cost editor for a raw stock item (inline quick-fix).
  onEditStockItem?: (s: StockItem) => void;
}

// Complete food-cost dashboard for a single menu item. Read-only.
// Used both on the standalone Food Cost page (right panel) and on the
// Menu Item edit page Cost tab. Extracted so the two places stay in lockstep.
export default function MenuItemCostPanel({
  rid, item, ingredients, prepItems, stockItems, vatRate, itemOptionOverrides,
  onGoToRecipe, onEditStockItem,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();

  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [showCostsExVat, setShowCostsExVat] = useState(true);
  const [breakdownIng, setBreakdownIng] = useState<MenuItemIngredient | null>(null);
  const [showCostPctBreakdown, setShowCostPctBreakdown] = useState(false);

  const vatMultiplier = vatMultiplierFor(vatRate);
  // Component-local VAT helpers that bind the current multiplier — makes the
  // JSX below (which calls these in many places) less noisy than passing
  // vatMultiplier everywhere.
  const toExVat = (c: number, incl: boolean) => toExVatShared(c, incl, vatMultiplier);
  const toIncVat = (c: number, incl: boolean) => toIncVatShared(c, incl, vatMultiplier);

  const allVariants: VariantOption[] = buildVariantOptions(item, itemOptionOverrides ?? []);
  const hasYield = (item.recipe_yield ?? 0) > 0;

  const activeVariantId = selectedVariantId
    || (allVariants.find((v) => (v.portion_size ?? 0) > 0)?.id ?? '');

  const computePrepUnitCostExVat = (prep: PrepItem) =>
    computePrepUnitCostExVatShared(prep, vatMultiplier);

  const calcLineCost = (
    ing: MenuItemIngredient,
    portionOverride?: { qty: number; unit: string } | null,
    variantOptionId?: number | null,
  ) => calcLineCostShared(ing, item, portionOverride, variantOptionId, showCostsExVat, vatMultiplier);

  const calcVariantLineCost = (
    ing: MenuItemIngredient,
    portion: { qty: number; unit: string } | null,
    optionId?: number | null,
  ) => calcVariantLineCostShared(ing, item, portion, optionId, showCostsExVat, vatMultiplier);

  // Component-local display helper — not cost math, so stays here. Detects
  // whether a recipe ingredient's unit can't be reconciled with the stock
  // item's unit, for the amber inline warning on that row.
  const hasUnitMismatch = (ing: MenuItemIngredient): boolean => {
    const stock = ing.stock_item;
    const stockUnit = stock?.unit ?? '';
    const ingUnit = ing.unit || '';
    if (!ingUnit && PACKAGE_UNITS.includes(stockUnit) && !(stock?.unit_content)) return true;
    if (ingUnit === stockUnit || !ingUnit) return false;
    if (PACKAGE_UNITS.includes(stockUnit) && MEASURABLE_UNITS.includes(ingUnit) && !(stock?.unit_content)) return true;
    if (MEASURABLE_UNITS.includes(stockUnit) && PACKAGE_UNITS.includes(ingUnit)) return true;
    return false;
  };

  const scopedFor = (optionId: number | null) => scopedIngredients(ingredients, optionId);

  const sumVariantCost = (portion: { qty: number; unit: string } | null, optionId: number | null) =>
    scopedFor(optionId).reduce((sum, ing) => sum + calcVariantLineCost(ing, portion, optionId), 0);

  const currentPortion = resolvePortion(item, allVariants, activeVariantId);
  const currentOptionId = optionIdFromVariant(activeVariantId);
  const displayCost = currentPortion
    ? sumVariantCost(currentPortion, currentOptionId)
    : scopedFor(currentOptionId).reduce((s, i) => s + calcLineCost(i), 0);
  let displayPrice = item.price ?? 0;
  if (activeVariantId) {
    const v = allVariants.find((vv) => String(vv.id) === activeVariantId);
    if (v) displayPrice = v.price;
  }
  const normalizedPrice = showCostsExVat ? displayPrice / vatMultiplier : displayPrice;
  const costPct = normalizedPrice > 0 ? displayCost / normalizedPrice : 0;
  const totalCost = displayCost;

  const hasMissingVariantPortion =
    ingredients.some((i) => i.scales_with_variant) && !currentPortion;

  // Unit-family mismatch: at least one ingredient is flagged scales_with_variant
  // and the currently-selected variant's unit is in a different family from the
  // item's base portion unit. In that case, calcLineCost falls back to ratio=1
  // (no scaling), so Normal and Grand produce identical costs — surface why.
  const hasUnitFamilyMismatch = (() => {
    if ((item.recipe_yield ?? 0) > 0) return false; // batch mode — flag ignored
    if (!ingredients.some((i) => i.scales_with_variant)) return false;
    if (!currentPortion) return false;
    const itemUnit = item.portion_size_unit || '';
    if ((item.portion_size ?? 0) <= 0) return false;
    return !sameUnitFamily(currentPortion.unit, itemUnit);
  })();

  // Collect preps referenced by this item whose derived cost is 0 for a
  // fixable reason. Deduplicated by prep id — one warning per prep even when
  // the prep appears in multiple variant-scoped rows.
  const unconfiguredPreps: Array<{ prep: PrepItem; issue: PrepConfigIssue }> = [];
  {
    const seen = new Set<number>();
    for (const ing of scopedFor(currentOptionId)) {
      const prep = ing.prep_item;
      if (!prep || ing.stock_item) continue;
      if (seen.has(prep.id)) continue;
      const issue = diagnosePrep(prep);
      if (issue) {
        unconfiguredPreps.push({ prep, issue });
        seen.add(prep.id);
      }
    }
  }

  // ── Modifier consumption ─────────────────────────────────────
  // A modifier with stock_item_id or prep_item_id consumes inventory when
  // selected. Multi-pick count is applied at order time; the cost row below
  // shows per-selection cost (count = 1).
  type ModCostRow = {
    id: number;
    name: string;
    setName: string;
    source: string;   // e.g. "Cheese (stock)" / "Sauce special (prep)"
    qty: number;
    unit: string;
    perSelectionCost: number;
  };
  const modCostRows: ModCostRow[] = [];
  const collectMod = (m: { id: number; name: string; stock_item_id?: number; prep_item_id?: number; quantity?: number; unit?: string }, setName: string) => {
    const q = m.quantity ?? 0;
    if (q <= 0) return;
    if (!m.stock_item_id && !m.prep_item_id) return;
    let rawCost = 0;
    let includesVat = false;
    let sourceName = '';
    if (m.stock_item_id) {
      const s = (stockItems ?? []).find((x) => x.id === m.stock_item_id);
      if (!s) return;
      rawCost = s.cost_per_unit ?? 0;
      includesVat = s.price_includes_vat ?? false;
      sourceName = `${s.name} (stock)`;
      // Convert qty to stock unit when possible so cost math aligns.
      const converted = convertQuantity(q, m.unit || s.unit, s.unit);
      const unitCost = showCostsExVat ? toExVat(rawCost, includesVat) : toIncVat(rawCost, includesVat);
      modCostRows.push({
        id: m.id, name: m.name, setName,
        source: sourceName, qty: q, unit: m.unit || s.unit,
        perSelectionCost: converted * unitCost,
      });
      return;
    }
    if (m.prep_item_id) {
      const p = (prepItems ?? []).find((x) => x.id === m.prep_item_id);
      if (!p) return;
      const prepExVat = computePrepUnitCostExVat(p);
      const baseCost = prepExVat != null ? prepExVat : (p.cost_per_unit ?? 0);
      const unitCost = showCostsExVat ? baseCost : baseCost * vatMultiplier;
      sourceName = `${p.name} (prep)`;
      const converted = convertQuantity(q, m.unit || p.unit, p.unit);
      modCostRows.push({
        id: m.id, name: m.name, setName,
        source: sourceName, qty: q, unit: m.unit || p.unit,
        perSelectionCost: converted * unitCost,
      });
    }
  };
  for (const ms of item.modifier_sets ?? []) {
    for (const m of ms.modifiers ?? []) collectMod(m, ms.name);
  }
  for (const m of item.modifiers ?? []) collectMod(m, '');

  return (
    <div className="space-y-4">
      {/* Item header: variant pills OR mini P&L */}
      <div className="card p-5">
        {allVariants.filter((v) => (v.portion_size ?? 0) > 0).length > 0 ? (
          <div className="flex flex-wrap gap-2 mb-4">
            {allVariants.filter((v) => (v.portion_size ?? 0) > 0).map((v) => {
              const isActive = (selectedVariantId || String(allVariants.find((vv) => (vv.portion_size ?? 0) > 0)?.id ?? 'full')) === String(v.id);
              return (
                <button key={v.id} type="button" onClick={() => setSelectedVariantId(String(v.id))}
                  className={`flex flex-col items-center px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-500 text-white'
                      : 'bg-[var(--surface-subtle)] text-fg-secondary hover:text-fg-primary hover:bg-[var(--divider)]'
                  }`}>
                  <span>{v.name} ({v.portion_size}{v.portion_size_unit || 'g'})</span>
                  <span className={`text-xs ${isActive ? 'text-white/80' : 'text-fg-tertiary'}`}>{v.price.toFixed(2)} &#8362;</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mb-4 text-sm max-w-sm space-y-1">
            <div className="flex justify-between text-fg-primary">
              <span>{t('pnlPriceInc')}</span>
              <span className="font-mono">{displayPrice.toFixed(2)} &#8362;</span>
            </div>
            <div className="flex justify-between text-fg-secondary">
              <span>− {t('pnlVat').replace('{rate}', String(vatRate))}</span>
              <span className="font-mono">{(displayPrice - displayPrice / vatMultiplier).toFixed(2)} &#8362;</span>
            </div>
            <div className="flex justify-between text-fg-primary pt-1 border-t border-[var(--divider)]">
              <span className="font-medium">{t('pnlPriceEx')}</span>
              <span className="font-mono font-semibold">{(displayPrice / vatMultiplier).toFixed(2)} &#8362;</span>
            </div>
          </div>
        )}

        <div className="flex justify-end mb-2">
          <button onClick={() => setShowCostsExVat((v) => !v)} className="text-xs text-brand-500 hover:text-brand-400 transition-colors">
            {showCostsExVat ? t('showIncVat') : t('showExVat')}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg p-3" style={{ background: 'var(--surface-subtle)' }}>
            <p className="text-xs text-fg-secondary">{t('foodCostLabel')}</p>
            <p className="text-xl font-bold text-fg-primary">{displayCost.toFixed(2)} &#8362;</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCostPctBreakdown(true)}
            className={`rounded-lg p-3 text-left hover:ring-1 hover:ring-brand-500/30 transition-all ${costPct > COST_THRESHOLD ? 'bg-red-500/10' : ''}`}
            style={costPct <= COST_THRESHOLD ? { background: 'var(--surface-subtle)' } : {}}
            title={t('showCostBreakdown') || 'Show cost breakdown'}
          >
            <p className="text-xs text-fg-secondary">{t('costPercent')}</p>
            <p className={`text-xl font-bold ${costPct > COST_THRESHOLD ? 'text-red-500' : 'text-fg-primary'}`}>
              {(costPct * 100).toFixed(1)}%
            </p>
          </button>
          <div className="rounded-lg p-3" style={{ background: 'var(--surface-subtle)' }}>
            <p className="text-xs text-fg-secondary">{t('grossProfit')}</p>
            <p className={`text-xl font-bold ${(normalizedPrice - displayCost) >= 0 ? 'text-status-ready' : 'text-red-500'}`}>{(normalizedPrice - displayCost).toFixed(2)} &#8362;</p>
          </div>
        </div>
        {costPct > COST_THRESHOLD && (
          <div className="flex items-center gap-2 mt-3 text-sm text-red-500">
            <ExclamationTriangleIcon className="w-4 h-4" />
            {t('foodCostExceedsThreshold').replace('{threshold}', (COST_THRESHOLD * 100).toFixed(0))}
          </div>
        )}
      </div>

      {/* Swap suggestion banner */}
      {(() => {
        const top = detectPrepSwaps(ingredients, prepItems)[0];
        if (!top) return null;
        const rawCount = ingredients.filter((i) => i.stock_item_id).length;
        return (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-brand-500/30 bg-brand-500/10 text-sm">
            <span className="text-xl leading-none shrink-0">💡</span>
            <div className="flex-1 text-fg-primary">
              {t('swapSuggestionBanner')
                .replace('{prep}', top.prep.name)
                .replace('{matched}', String(top.matchedIngredients.length))
                .replace('{total}', String(rawCount))}
            </div>
            <button
              onClick={onGoToRecipe ?? (() => router.push(`/${rid}/menu/items/${item.id}?tab=recipe`))}
              className="btn-primary text-xs py-1.5 px-3 rounded-full whitespace-nowrap"
            >
              {t('replaceWithPrep')} &rarr;
            </button>
          </div>
        );
      })()}

      {/* Missing-variant-portion warning */}
      {hasMissingVariantPortion && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-amber-500">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>{t('missingVariantPortion')}</p>
            <button
              onClick={() => router.push(`/${rid}/menu/items/${item.id}/variants`)}
              className="mt-1 text-amber-400 underline hover:text-amber-300"
            >
              {t('configureVariants')} →
            </button>
          </div>
        </div>
      )}

      {/* Unit-family mismatch warning */}
      {hasUnitFamilyMismatch && currentPortion && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-amber-500">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>
              {t('unitFamilyMismatch') || 'Unit mismatch: the item\u2019s base portion unit and the variant portion unit are not in the same family; variant scaling falls back to 1\u00D7.'}
            </p>
            <p className="mt-1 text-amber-400 font-mono text-xs">
              {t('item') || 'item'}: {item.portion_size} {item.portion_size_unit || '?'} &nbsp;&ne;&nbsp; {t('variant') || 'variant'}: {currentPortion.qty} {currentPortion.unit}
            </p>
          </div>
        </div>
      )}

      {/* Unconfigured prep warning — surfaces why a prep ingredient's line cost
          is 0 (no yield / no ingredients / no priced ingredients) so the user
          doesn't chase a phantom "variant not detecting portion" issue. */}
      {unconfiguredPreps.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-amber-500">
          <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">
              {unconfiguredPreps.length === 1
                ? (t('prepConfigIncompleteSingle') || 'A preparation is missing cost data.')
                : (t('prepConfigIncompleteMany') || 'Some preparations are missing cost data.')}
            </p>
            <ul className="mt-1.5 space-y-1 text-xs text-amber-400">
              {unconfiguredPreps.map(({ prep, issue }) => {
                const reason =
                  issue === 'missing_yield' ? (t('prepMissingYield') || 'no yield per batch set')
                  : issue === 'no_ingredients' ? (t('prepNoIngredients') || 'no raw ingredients linked')
                  : (t('prepZeroCostIngredients') || 'linked ingredients have no purchase cost set');
                return (
                  <li key={prep.id} className="flex flex-wrap items-center gap-x-2">
                    <span className="font-semibold text-amber-300">{prep.name}</span>
                    <span>{reason}.</span>
                    <button
                      type="button"
                      onClick={() => router.push(`/${rid}/kitchen/prep?edit=${prep.id}`)}
                      className="underline hover:text-amber-300"
                    >
                      {t('fix') || 'Fix'} &rarr;
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Ingredient breakdown table */}
      <div className="card overflow-hidden p-0">
        {ingredients.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-sm text-fg-secondary">{t('noIngredientsLinked')}</p>
            <button
              onClick={onGoToRecipe ?? (() => router.push(`/${rid}/menu/items/${item.id}?tab=recipe`))}
              className="text-sm text-brand-500 hover:text-brand-400"
            >
              {t('addIngredients')}
            </button>
          </div>
        ) : (
          <>
            {hasYield && (
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: 'var(--surface-subtle)', borderBottom: '1px solid var(--divider)' }}>
                <span className="text-xs font-semibold text-fg-secondary uppercase tracking-wider">
                  {t('recipeCostBreakdown')} — {t('fullRecipe')} ({item.recipe_yield} {item.recipe_yield_unit})
                </span>
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                  <th className="py-3 px-4 font-medium">{t('ingredient')}</th>
                  <th className="py-3 px-4 font-medium">{t('type')}</th>
                  <th className="py-3 px-4 font-medium text-right">{t('qtyPerServing')}</th>
                  <th className="py-3 px-4 font-medium text-right">{t('unitCost')}</th>
                  <th className="py-3 px-4 font-medium text-right">{t('lineCost')}</th>
                </tr>
              </thead>
              <tbody>
                {scopedFor(currentOptionId).map((ing) => {
                  const name = ing.stock_item?.name ?? ing.prep_item?.name ?? '?';
                  const unit = ing.unit || ing.stock_item?.unit || ing.prep_item?.unit || '';
                  const stockUnit = ing.stock_item?.unit ?? '';
                  // unitCost (below) is denominated in the SOURCE's base unit:
                  // stock.unit for raw items, prep.unit for prep ingredients.
                  // ing.unit is the recipe author's chosen unit (e.g. "g" while
                  // the prep is in kg) — using it for the label would mis-state
                  // the cost by the unit conversion factor.
                  const sourceUnit = ing.stock_item?.unit ?? ing.prep_item?.unit ?? '';
                  let rawUnitCost: number;
                  let incVat: boolean;
                  if (ing.prep_item && !ing.stock_item) {
                    const prepExVat = computePrepUnitCostExVat(ing.prep_item);
                    if (prepExVat != null) { rawUnitCost = prepExVat; incVat = false; }
                    else { rawUnitCost = ing.prep_item.cost_per_unit ?? 0; incVat = false; }
                  } else {
                    rawUnitCost = ing.stock_item?.cost_per_unit ?? 0;
                    incVat = ing.stock_item?.price_includes_vat ?? false;
                  }
                  const unitCost = showCostsExVat ? toExVat(rawUnitCost, incVat) : toIncVat(rawUnitCost, incVat);
                  const lineCost = calcVariantLineCost(ing, currentPortion, currentOptionId);
                  const mismatch = hasUnitMismatch(ing);
                  const type = ing.stock_item_id ? t('raw') : t('prep');
                  // Effective qty display — MUST mirror calcLineCost precedence:
                  //   1) batch mode: base qty (proration applied later, not shown here).
                  //   2) per-variant override (legacy matrix data).
                  //   3) scales_with_variant → current variant's portion_size.
                  //   4) base qty.
                  const batchModeRow = (item.recipe_yield ?? 0) > 0;
                  let effectiveQty = ing.quantity_needed;
                  let effectiveUnit = unit;
                  const override = !batchModeRow && currentOptionId != null
                    ? (ing.variant_overrides ?? []).find((o) => o.option_id === currentOptionId)
                    : undefined;
                  if (override && override.quantity > 0) {
                    effectiveQty = override.quantity;
                    effectiveUnit = override.unit || unit;
                  } else if (!batchModeRow && ing.scales_with_variant && currentPortion) {
                    effectiveQty = currentPortion.qty;
                    effectiveUnit = currentPortion.unit || unit;
                  }
                  const qtyDisplay = `${Number(effectiveQty.toFixed(3))} ${effectiveUnit}`;
                  const prepIssue = ing.prep_item && !ing.stock_item ? diagnosePrep(ing.prep_item) : null;
                  return (
                    <tr key={ing.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                      <td className="py-3 px-4">
                        <span className="font-medium text-fg-primary">{name}</span>
                        {prepIssue && ing.prep_item && (
                          <div className="flex items-center gap-1 mt-0.5 text-xs text-amber-500">
                            <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                            <span>
                              {prepIssue === 'missing_yield' && (t('prepMissingYield') || 'no yield per batch set')}
                              {prepIssue === 'no_ingredients' && (t('prepNoIngredients') || 'no raw ingredients linked')}
                              {prepIssue === 'zero_cost_ingredients' && (t('prepZeroCostIngredients') || 'linked ingredients have no purchase cost set')}
                            </span>
                            <button
                              onClick={() => router.push(`/${rid}/kitchen/prep?edit=${ing.prep_item!.id}`)}
                              className="ml-1 underline hover:text-amber-400"
                            >
                              {t('fix') || 'Fix'}
                            </button>
                          </div>
                        )}
                        {mismatch && (
                          <div className="flex items-center gap-1 mt-0.5 text-xs text-amber-500">
                            <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                            <span>{t('unitMismatchWarning').replace('{ingUnit}', unit).replace('{stockUnit}', stockUnit)}</span>
                            {ing.stock_item && onEditStockItem && (
                              <button onClick={() => onEditStockItem(ing.stock_item!)}
                                className="ml-1 underline hover:text-amber-400">{t('fix')}</button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ing.stock_item_id ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'}`}>
                          {type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-fg-primary">
                        {override && override.quantity > 0 ? (
                          <span className="inline-flex flex-col items-end">
                            <span>{qtyDisplay}</span>
                            <span className="text-[10px] uppercase text-brand-500/80 tracking-wider">
                              {t('variantOverride') || 'variant override'}
                            </span>
                          </span>
                        ) : !batchModeRow && ing.scales_with_variant ? (
                          <span className="inline-flex flex-col items-end">
                            <span>{qtyDisplay}</span>
                            <span className="text-[10px] uppercase text-brand-500/80 tracking-wider">
                              {t('followVariantPortion') || 'follows variant'}
                            </span>
                          </span>
                        ) : (
                          <>{Number(effectiveQty.toFixed(3))} <span className="text-fg-secondary text-xs">{effectiveUnit}</span></>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {ing.prep_item ? (
                          <button
                            onClick={() => setBreakdownIng(ing)}
                            className="font-mono text-fg-secondary hover:text-brand-500 hover:underline transition-colors cursor-pointer"
                            title={t('showCostBreakdown')}
                          >
                            {unitCost.toFixed(2)} &#8362;/{sourceUnit}
                          </button>
                        ) : onEditStockItem ? (
                          <button onClick={() => ing.stock_item && onEditStockItem(ing.stock_item)}
                            className="font-mono text-fg-secondary hover:text-brand-500 hover:underline transition-colors cursor-pointer"
                            title={t('clickToEditCost')}>
                            {unitCost.toFixed(2)} &#8362;/{sourceUnit}
                          </button>
                        ) : (
                          <span className="font-mono text-fg-secondary">
                            {unitCost.toFixed(2)} &#8362;/{sourceUnit}
                          </span>
                        )}
                      </td>
                      <td className={`py-3 px-4 text-right font-mono font-bold ${mismatch ? 'text-amber-500' : 'text-fg-primary'}`}>
                        {ing.prep_item ? (
                          <button
                            onClick={() => setBreakdownIng(ing)}
                            className="hover:text-brand-500 hover:underline transition-colors cursor-pointer"
                            title={t('showCostBreakdown')}
                          >
                            {mismatch ? '—' : `${lineCost.toFixed(2)} ₪`}
                          </button>
                        ) : (
                          mismatch ? '—' : `${lineCost.toFixed(2)} ₪`
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: 'var(--surface-subtle)' }}>
                  <td colSpan={4} className="py-3 px-4 text-right font-semibold text-fg-primary">{t('totalFoodCost')}</td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-fg-primary">{totalCost.toFixed(2)} &#8362;</td>
                </tr>
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Modifier consumption — per-selection cost for modifiers linked to a
          stock/prep item. Customers can pick multiple, so total impact scales
          with selected count at order time. */}
      {modCostRows.length > 0 && (
        <div className="card overflow-hidden p-0">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
            <p className="text-xs text-fg-secondary uppercase tracking-wider font-medium">{t('linkedAddons') || t('modifierConsumption') || 'Linked Add-ons'}</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                <th className="py-2 px-4 font-medium">{t('modifier') || 'Modifier'}</th>
                <th className="py-2 px-4 font-medium">{t('consumesFromStock') || 'Consumes'}</th>
                <th className="py-2 px-4 font-medium text-right">{t('qty') || 'Qty'}</th>
                <th className="py-2 px-4 font-medium text-right">{t('perSelectionCost') || 'Per selection'}</th>
              </tr>
            </thead>
            <tbody>
              {modCostRows.map((r) => (
                <tr key={`mod-${r.id}`} style={{ borderBottom: '1px solid var(--divider)' }}>
                  <td className="py-2.5 px-4 font-medium text-fg-primary">
                    {r.name}
                    {r.setName && <span className="text-xs text-fg-tertiary ml-2">({r.setName})</span>}
                  </td>
                  <td className="py-2.5 px-4 text-fg-secondary">{r.source}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-fg-primary">{r.qty} {r.unit}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-fg-primary">{r.perSelectionCost.toFixed(2)} &#8362;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-variant cost breakdown */}
      {ingredients.length > 0 && (item.recipe_yield ?? 0) > 0 && (() => {
        const variants = (item.variant_groups ?? []).flatMap((g) => g.variants ?? []).filter((v) => (v.portion_size ?? 0) > 0);
        if (variants.length === 0) return null;
        return (
          <div className="card overflow-hidden p-0">
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
              <p className="text-xs text-fg-secondary uppercase tracking-wider font-medium">{t('variantCostBreakdown')}</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                  <th className="py-2 px-4 font-medium">{t('variant')}</th>
                  <th className="py-2 px-4 font-medium text-right">{t('portion')}</th>
                  <th className="py-2 px-4 font-medium text-right">{t('foodCostLabel')}</th>
                  <th className="py-2 px-4 font-medium text-right">{t('price')}</th>
                  <th className="py-2 px-4 font-medium text-right">{t('costPercent')}</th>
                  <th className="py-2 px-4 font-medium text-right">{t('grossProfit')}</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const vPortion = { qty: v.portion_size!, unit: v.portion_size_unit || 'g' };
                  // Legacy MenuItemVariant has no OptionSetOption id — no
                  // variant-scoped ingredients apply on this path.
                  const vCost = sumVariantCost(vPortion, null);
                  const vPct = v.price > 0 ? vCost / v.price : 0;
                  return (
                    <tr key={v.id} style={{ borderBottom: '1px solid var(--divider)' }}>
                      <td className="py-2.5 px-4 font-medium text-fg-primary">{v.name}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-fg-primary">{v.portion_size} {v.portion_size_unit}</td>
                      <td className="py-2.5 px-4 text-right font-mono text-fg-primary">{vCost.toFixed(2)} &#8362;</td>
                      <td className="py-2.5 px-4 text-right font-mono text-fg-secondary">{v.price.toFixed(2)} &#8362;</td>
                      <td className={`py-2.5 px-4 text-right font-mono font-bold ${vPct > COST_THRESHOLD ? 'text-red-500' : 'text-fg-primary'}`}>
                        {(vPct * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-status-ready">{(v.price - vCost).toFixed(2)} &#8362;</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}

      {breakdownIng && breakdownIng.prep_item && (
        <PrepCostBreakdownModal
          ing={breakdownIng}
          item={item}
          portion={currentPortion}
          optionId={currentOptionId}
          showExVat={showCostsExVat}
          vatMultiplier={vatMultiplier}
          onClose={() => setBreakdownIng(null)}
          t={t}
        />
      )}

      {showCostPctBreakdown && (
        <CostPctBreakdownModal
          displayPrice={displayPrice}
          displayCost={displayCost}
          costPct={costPct}
          showCostsExVat={showCostsExVat}
          vatRate={vatRate}
          onClose={() => setShowCostPctBreakdown(false)}
        />
      )}
    </div>
  );
}

