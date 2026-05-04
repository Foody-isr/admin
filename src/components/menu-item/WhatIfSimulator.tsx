'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  FlaskConical,
  RefreshCw,
  Check,
  SlidersHorizontal,
  DollarSign,
  ArrowDown,
  ArrowUp,
  Info,
  ChevronRight,
} from 'lucide-react';
import {
  setItemOptionPrice,
  updateMenuItem,
  updateStockItem,
  type MenuItem,
  type MenuItemIngredient,
} from '@/lib/api';
import {
  costExVat,
  vatMultiplierForStock,
  resolvePortion,
  buildVariantOptions,
  type ItemCostSummary,
  type VariantOption,
} from '@/lib/cost-utils';
import PrepCostBreakdownModal from '@/components/food-cost/PrepCostBreakdownModal';

// "Et si… ?" simulator card — Figma reference:
//   foodyadmin/foody-os-handoff/design-reference/screens/item-editor.jsx (WhatIfSimulator).
//
// Three levers (portion · sell price · per-ingredient cost) and a side-by-side
// outcome panel (% material cost gauge + side-by-side material cost / gross
// profit cards). Apply persists in three places: variant price+portion (or
// item.price+portion when no variant) and per-stock cost_per_unit.

const CURRENCY = '₪';

interface Props {
  rid: number;
  item: MenuItem;
  summary: ItemCostSummary;
  activeVariant: VariantOption | null;
  /** Display-basis price (HT or TTC depending on the parent toggle). Mirrors
   *  the same number the parent's KPI cards use. */
  effectivePrice: number;
  /** Threshold percent (0–100). Defaults to 35 in the parent. */
  thresholdPct: number;
  /** Restaurant VAT rate (percent). Used to convert sub-ingredient costs
   *  inside preparations between ex/inc-VAT bases. */
  vatRate: number;
  /** When true, all costs in the simulator are shown ex-VAT; when false,
   *  inc-VAT. Mirrors the parent's HT/TTC toggle. */
  showCostsExVat: boolean;
  /** Reset signal: whenever this value changes, the simulator clears all
   *  levers. Parent flips it on variant / VAT-display switches so the
   *  scenario stays tied to one (variant, basis) pair. */
  resetKey?: string;
  /** Called after a successful Apply so the parent can refetch. */
  onApplied?: () => void | Promise<void>;
  t: (k: string) => string;
}

// One editable cost row in the "Coût des ingrédients" list.
//   • `stock` rows are inline-editable (raw ingredient).
//   • `prep` rows show the aggregate cost and open a modal to drill into
//     the recipe's sub-ingredients.
type CostLever =
  | {
      type: 'stock';
      key: string;
      stockId: number;
      name: string;
      baseUnitCost: number;
      unitSuffix: string;
      tag: string;
      color: string;
    }
  | {
      type: 'prep';
      key: string;
      ingredient: MenuItemIngredient;
      prepId: number;
      name: string;
      baseUnitCost: number;
      unitSuffix: string;
      tag: string;
      color: string;
    };

const SWATCH = ['#f97316', '#05df72', '#3b82f6', '#8e51ff', '#f59e0b', '#ec4899'];

export default function WhatIfSimulator({
  rid,
  item,
  summary,
  activeVariant,
  effectivePrice,
  thresholdPct,
  vatRate,
  showCostsExVat,
  resetKey,
  onApplied,
  t,
}: Props) {
  // ── Bases ────────────────────────────────────────────────────────────────
  const basePortion = activeVariant?.portion_size ?? item.portion_size ?? 0;
  const portionUnit =
    activeVariant?.portion_size_unit || item.portion_size_unit || 'g';
  const basePrice = effectivePrice;
  const baseFoodCost = summary.foodCost;
  const baseMargin = summary.margin;
  const basePctCost = summary.costPct * 100;
  const isBatch = (item.recipe_yield ?? 0) > 0;

  // Slider bounds — ±50% around base, clamped sensibly. Avoids 0-base
  // divide-by-zero by falling back to a fixed range.
  const portionMin = basePortion > 0 ? Math.max(1, Math.round(basePortion * 0.5)) : 0;
  const portionMax = basePortion > 0 ? Math.round(basePortion * 1.5) : 0;
  const portionStep = basePortion >= 100 ? 5 : 1;
  const priceMin = basePrice > 0 ? Math.max(0.5, +(basePrice * 0.5).toFixed(2)) : 0;
  const priceMax = basePrice > 0 ? +(basePrice * 1.5).toFixed(2) : 0;

  // ── Lever state ──────────────────────────────────────────────────────────
  const [simPortion, setSimPortion] = useState<number>(basePortion);
  const [simPrice, setSimPrice] = useState<number>(basePrice);
  const [simStockCosts, setSimStockCosts] = useState<Record<number, number>>({});

  // Reset when the parent signals (variant change, VAT toggle, etc.). Also
  // covers initial mount when basePortion/basePrice arrive after an async
  // load — without this, the sliders stick at 0.
  useEffect(() => {
    setSimPortion(basePortion);
    setSimPrice(basePrice);
    setSimStockCosts({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, basePortion, basePrice]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const portionRatio = basePortion > 0 ? simPortion / basePortion : 1;
  const portionChanged =
    basePortion > 0 && Math.abs(simPortion - basePortion) > 0.001;
  const priceChanged = Math.abs(simPrice - basePrice) > 0.001;
  const ingChanged = Object.keys(simStockCosts).length > 0;
  const dirtyCount =
    (portionChanged ? 1 : 0) + (priceChanged ? 1 : 0) + (ingChanged ? 1 : 0);
  const dirty = dirtyCount > 0;

  // Display-basis unit cost for a stock item — matches what the user sees in
  // the simulator inputs and keeps `simStockCosts` consistent across stocks
  // edited directly vs. through a prep modal.
  function displayUnitCostFor(
    stock: { cost_per_unit?: number; vat_rate_override?: number | null } | null | undefined,
  ): number {
    if (!stock) return 0;
    const ex = costExVat(stock);
    return showCostsExVat ? ex : ex * vatMultiplierForStock(stock, vatRate);
  }

  // Recompute simulated foodCost line-by-line. Two override paths:
  //   • Stock line: costRatio = override / baseUnitCost.
  //   • Prep line: re-derive the prep's batch cost from its sub-ingredients
  //     using overrides on their stock_items, then ratio = newBatch/baseBatch.
  // portionRatio applies only to lines that scale (batch items always scale;
  // variant-scoped lines via scales_with_variant).
  const simFoodCost = useMemo(() => {
    return summary.lines.reduce((acc, line) => {
      const ing = line.ingredient;
      const stock = ing.stock_item;
      const prep = ing.prep_item;

      let costRatio = 1;
      if (stock?.id != null) {
        const baseUnitCost = line.unitCost;
        const overrideCost = simStockCosts[stock.id];
        if (overrideCost != null && baseUnitCost > 0) {
          costRatio = overrideCost / baseUnitCost;
        }
      } else if (prep) {
        let baseBatch = 0;
        let newBatch = 0;
        for (const pi of prep.ingredients ?? []) {
          const subStock = pi.stock_item;
          const baseSub = displayUnitCostFor(subStock);
          const ovr = subStock?.id != null ? simStockCosts[subStock.id] : undefined;
          const newSub = ovr != null ? ovr : baseSub;
          baseBatch += pi.quantity_needed * baseSub;
          newBatch += pi.quantity_needed * newSub;
        }
        if (baseBatch > 0) costRatio = newBatch / baseBatch;
      }

      const scales = isBatch || !!ing.scales_with_variant;
      const ratio = scales ? portionRatio : 1;
      return acc + line.lineCost * costRatio * ratio;
    }, 0);
    // displayUnitCostFor depends on showCostsExVat + vatRate, both stable
    // for the panel's lifetime; explicit deps keep the lint quiet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.lines, simStockCosts, portionRatio, isBatch, showCostsExVat, vatRate]);

  const simMargin = simPrice - simFoodCost;
  const simMarginPct = simPrice > 0 ? (simMargin / simPrice) * 100 : 0;
  const simPctCost = simPrice > 0 ? (simFoodCost / simPrice) * 100 : 0;
  const deltaPctPts = simPctCost - basePctCost;

  const status =
    simPctCost <= thresholdPct
      ? { tone: 'good' as const, label: t('simulatorStatusUnderTarget') || 'Sous la cible' }
      : simPctCost <= 40
      ? { tone: 'warn' as const, label: t('simulatorStatusAboveTarget') || 'Au-dessus de la cible' }
      : { tone: 'danger' as const, label: t('simulatorStatusWellAboveTarget') || 'Bien au-dessus de la cible' };
  const statusColor =
    status.tone === 'good'
      ? 'var(--success-500)'
      : status.tone === 'warn'
      ? 'var(--warning-500)'
      : 'var(--danger-500)';

  // ── Per-ingredient lever rows. Stock rows dedup by stock_item.id; prep
  // rows dedup by prep_item.id. Multiple lines pointing at the same stock or
  // prep (e.g. base + option override) collapse to one row whose override
  // applies everywhere.
  const costLevers: CostLever[] = useMemo(() => {
    const seenStock = new Map<number, CostLever>();
    const seenPrep = new Map<number, CostLever>();
    summary.lines.forEach((line, i) => {
      const ing = line.ingredient;
      const stock = ing.stock_item;
      const prep = ing.prep_item;
      const tag = String.fromCharCode(65 + (i % 26));
      const color = SWATCH[i % SWATCH.length];
      const unitSuffix = line.sourceUnit ? `/${line.sourceUnit}` : '';
      if (stock?.id != null) {
        if (seenStock.has(stock.id)) return;
        seenStock.set(stock.id, {
          type: 'stock',
          key: `s${stock.id}`,
          stockId: stock.id,
          name: line.name,
          baseUnitCost: line.unitCost,
          unitSuffix,
          tag,
          color,
        });
      } else if (prep?.id != null) {
        if (seenPrep.has(prep.id)) return;
        seenPrep.set(prep.id, {
          type: 'prep',
          key: `p${prep.id}`,
          ingredient: ing,
          prepId: prep.id,
          name: line.name,
          baseUnitCost: line.unitCost,
          unitSuffix,
          tag,
          color,
        });
      }
    });
    return Array.from(seenStock.values()).concat(Array.from(seenPrep.values()));
  }, [summary.lines]);

  // Effective unit cost of a prep, taking sub-stock overrides into account.
  // Used to render the live aggregate price next to a prep row.
  function effectivePrepUnitCost(ing: MenuItemIngredient, fallback: number): number {
    const prep = ing.prep_item;
    if (!prep) return fallback;
    let baseBatch = 0;
    let newBatch = 0;
    for (const pi of prep.ingredients ?? []) {
      const subStock = pi.stock_item;
      const baseSub = displayUnitCostFor(subStock);
      const ovr = subStock?.id != null ? simStockCosts[subStock.id] : undefined;
      const newSub = ovr != null ? ovr : baseSub;
      baseBatch += pi.quantity_needed * baseSub;
      newBatch += pi.quantity_needed * newSub;
    }
    if (baseBatch <= 0) return fallback;
    return fallback * (newBatch / baseBatch);
  }

  // Whether a prep row currently has any sub-stock overrides applied.
  function prepHasOverride(ing: MenuItemIngredient): boolean {
    const prep = ing.prep_item;
    if (!prep) return false;
    for (const pi of prep.ingredients ?? []) {
      const sid = pi.stock_item?.id;
      if (sid != null && simStockCosts[sid] != null) return true;
    }
    return false;
  }

  // Modal state — which prep ingredient is currently expanded for editing.
  const [openPrepIng, setOpenPrepIng] = useState<MenuItemIngredient | null>(null);
  const variants = useMemo(() => buildVariantOptions(item), [item]);
  const variantIdForPrep = activeVariant?.id ?? '';
  const prepPortion = resolvePortion(item, variants, variantIdForPrep);

  // ── Apply state ─────────────────────────────────────────────────────────
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Walks the item's option_sets to find which set owns a given option_id —
  // setItemOptionPrice needs both ids and `VariantOption.id` only carries the
  // option id (`opt:<n>`). Returns null for legacy `var:` variants.
  function setIdForOption(optionId: number): number | null {
    for (const os of item.option_sets ?? []) {
      if ((os.options ?? []).some((o) => o.id === optionId)) return os.id;
    }
    return null;
  }

  async function handleApply() {
    if (!dirty || applying) return;
    setApplyError(null);
    setApplying(true);
    try {
      const calls: Promise<unknown>[] = [];

      // Menu prices are stored inc-VAT at the restaurant rate. When the user
      // is editing on the HT (ex-VAT) basis, inflate back to TTC before save.
      const restaurantMultiplier = 1 + vatRate / 100;
      const priceForStorage = showCostsExVat ? simPrice * restaurantMultiplier : simPrice;

      // 1) Variant-level updates (price + portion). Option-set variants use
      //    setItemOptionPrice; legacy `var:` variants only support price via
      //    updateVariant — portion edits on those need the variants page.
      if (activeVariant && (priceChanged || portionChanged)) {
        if (activeVariant.id.startsWith('opt:')) {
          const optionId = Number(activeVariant.id.slice(4));
          const setId = setIdForOption(optionId);
          if (setId != null) {
            calls.push(
              setItemOptionPrice(rid, setId, item.id, optionId, {
                price: priceForStorage,
                portion_size: simPortion,
                portion_size_unit: portionUnit,
                is_active: true,
              }),
            );
          }
        }
      } else {
        // No active variant — apply to the item itself.
        const patch: Partial<MenuItem> = {};
        if (priceChanged) patch.price = priceForStorage;
        if (portionChanged) {
          patch.portion_size = simPortion;
          patch.portion_size_unit = portionUnit;
        }
        if (Object.keys(patch).length > 0) {
          calls.push(updateMenuItem(rid, item.id, patch));
        }
      }

      // 2) Stock cost overrides — one PUT per stock_item. Storage is always
      //    ex-VAT (migration 059), so when the user is viewing inc-VAT we
      //    must deflate by the stock's effective VAT rate before saving.
      for (const [sid, cost] of Object.entries(simStockCosts)) {
        const stockId = Number(sid);
        let exVat = cost;
        if (!showCostsExVat) {
          // Find the stock's VAT rate via the existing summary's lines so we
          // don't need an extra fetch. Falls back to the restaurant rate.
          let stockForRate: { vat_rate_override?: number | null } | undefined;
          for (const line of summary.lines) {
            if (line.ingredient.stock_item?.id === stockId) {
              stockForRate = line.ingredient.stock_item;
              break;
            }
            const subs = line.ingredient.prep_item?.ingredients ?? [];
            const sub = subs.find((pi) => pi.stock_item?.id === stockId);
            if (sub?.stock_item) {
              stockForRate = sub.stock_item;
              break;
            }
          }
          const multiplier = vatMultiplierForStock(stockForRate, vatRate);
          if (multiplier > 0) exVat = cost / multiplier;
        }
        calls.push(updateStockItem(rid, stockId, { cost_per_unit: exVat }));
      }

      await Promise.all(calls);
      await onApplied?.();
      // Local levers reset on the next props pass (parent re-fetches → resetKey
      // changes via new base values), but clear them now for snappy feedback.
      setSimStockCosts({});
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : String(err));
    } finally {
      setApplying(false);
    }
  }

  // ── Quick-action chips (empty state)
  const reset = () => {
    setSimPortion(basePortion);
    setSimPrice(basePrice);
    setSimStockCosts({});
    setApplyError(null);
  };
  const quickMinus10Portion = () =>
    basePortion > 0 && setSimPortion(Math.max(portionMin, Math.round(basePortion * 0.9)));
  const quickPlus10Price = () =>
    basePrice > 0 && setSimPrice(Math.min(priceMax, +(basePrice * 1.1).toFixed(2)));
  const quickMinus5Ingredients = () => {
    const next: Record<number, number> = {};
    // Apply -5% to every leaf stock item — both direct ingredients and
    // sub-ingredients inside preparations — so the chip moves all material
    // costs in lockstep.
    for (const line of summary.lines) {
      const stock = line.ingredient.stock_item;
      if (stock?.id != null) {
        const baseUnit = displayUnitCostFor(stock);
        if (baseUnit > 0) next[stock.id] = +(baseUnit * 0.95).toFixed(4);
        continue;
      }
      const prep = line.ingredient.prep_item;
      for (const pi of prep?.ingredients ?? []) {
        const sub = pi.stock_item;
        if (sub?.id == null || next[sub.id] != null) continue;
        const baseUnit = displayUnitCostFor(sub);
        if (baseUnit > 0) next[sub.id] = +(baseUnit * 0.95).toFixed(4);
      }
    }
    setSimStockCosts(next);
  };

  // ── Deltas (formatted) ───────────────────────────────────────────────────
  const portionDeltaPct = basePortion > 0 ? ((simPortion - basePortion) / basePortion) * 100 : 0;
  const priceDeltaPct = basePrice > 0 ? ((simPrice - basePrice) / basePrice) * 100 : 0;

  // % cost gauge — clamp at 60 (matches the design's ceiling)
  const gaugeMax = 60;
  const simGaugePct = Math.min(simPctCost, gaugeMax) / gaugeMax * 100;
  const baseGaugePct = Math.min(basePctCost, gaugeMax) / gaugeMax * 100;
  const targetGaugePct = (thresholdPct / gaugeMax) * 100;

  return (
    <>
    <section
      className="rounded-r-lg overflow-hidden"
      style={{
        marginTop: 'var(--s-5)',
        border: dirty
          ? '1px solid color-mix(in oklab, var(--brand-500) 35%, var(--line))'
          : '1px solid var(--line)',
        background: dirty
          ? 'color-mix(in oklab, var(--brand-500) 3%, var(--surface))'
          : 'var(--surface)',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-[var(--s-3)] p-[var(--s-5)]"
        style={{ borderBottom: '1px dashed var(--line)' }}
      >
        <div className="flex items-start gap-[var(--s-3)] min-w-0">
          <span
            className="shrink-0 inline-grid place-items-center rounded-r-md"
            style={{
              width: 32,
              height: 32,
              background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
              color: 'var(--brand-500)',
            }}
          >
            <FlaskConical className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-[var(--s-2)] flex-wrap">
              <h4 className="text-fs-md font-semibold text-[var(--fg)]">
                {t('simulatorTitle') || 'Et si… ?'}
              </h4>
              <span
                className="inline-flex items-center h-[18px] px-[6px] rounded-r-xs text-[10px] font-semibold uppercase tracking-[.04em]"
                style={{
                  background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
                  color: 'var(--brand-500)',
                }}
              >
                {t('simulatorBadge') || 'SIMULATEUR'}
              </span>
              {dirty && (
                <span
                  className="inline-flex items-center h-[18px] px-[6px] rounded-r-xs text-[10px] font-semibold"
                  style={{
                    background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
                    color: 'var(--brand-500)',
                  }}
                >
                  {(t('simulatorChangesInProgress') || '{n} changements en cours').replace(
                    '{n}',
                    String(dirtyCount),
                  )}
                </span>
              )}
            </div>
            {/* Two-line description split into halves and rendered as
                explicit lines so the header height never depends on available
                width. Without this the line wraps when "Réinitialiser"
                appears on the right and the card jumps. */}
            <p className="text-fs-xs text-[var(--fg-subtle)] mt-1 leading-[16px]">
              <span className="block">
                {t('simulatorIntroLine1') ||
                  "Bougez les curseurs pour voir l'impact sur le coût et la marge."}
              </span>
              <span className="block">
                {t('simulatorIntroLine2') ||
                  "Rien n'est sauvegardé tant que vous n'appliquez pas."}
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-[var(--s-2)] shrink-0">
          {/* Always rendered (just invisible when clean) so the right-side
              width — and thus the wrapping of the description on the left —
              stays constant between clean and dirty states. */}
          <button
            type="button"
            onClick={reset}
            aria-hidden={!dirty}
            tabIndex={dirty ? 0 : -1}
            className={`inline-flex items-center gap-1.5 h-8 px-[var(--s-3)] rounded-r-sm text-fs-xs font-medium transition-colors ${
              dirty
                ? 'text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)]'
                : 'invisible pointer-events-none'
            }`}
          >
            <RefreshCw className="w-3 h-3" />
            {t('simulatorReset') || 'Réinitialiser'}
          </button>
          <button
            type="button"
            disabled={!dirty || applying}
            onClick={handleApply}
            className="inline-flex items-center gap-1.5 h-8 px-[var(--s-3)] rounded-r-sm text-fs-xs font-semibold transition-colors"
            style={{
              border: '1px solid var(--line)',
              background: dirty ? 'var(--surface)' : 'transparent',
              color: dirty ? 'var(--fg)' : 'var(--fg-subtle)',
              opacity: dirty && !applying ? 1 : 0.5,
              cursor: dirty && !applying ? 'pointer' : 'not-allowed',
            }}
          >
            {applying ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Check className="w-3 h-3" />
            )}
            {t('simulatorApply') || 'Appliquer les changements'}
          </button>
        </div>
      </div>

      {applyError && (
        <div
          className="px-[var(--s-5)] py-[var(--s-3)] text-fs-xs"
          style={{
            background: 'color-mix(in oklab, var(--danger-500) 10%, transparent)',
            color: 'var(--danger-500)',
            borderBottom: '1px solid color-mix(in oklab, var(--danger-500) 25%, var(--line))',
          }}
        >
          {applyError}
        </div>
      )}

      {/* ── Body: 2 columns (Levers | Outcome) ───────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr]">
        {/* ===== LEVERS ===== */}
        <div
          className="p-[var(--s-5)]"
          style={{ borderRight: '1px solid var(--line)' }}
        >
          <SectionLabel>{t('simulatorLeversTitle') || 'Leviers à actionner'}</SectionLabel>

          {/* Lever 1 — portion (only when item has a portion size) */}
          {basePortion > 0 ? (
            <Lever
              icon={<SlidersHorizontal className="w-3 h-3" />}
              title={`${t('simulatorPortionLeverTitle') || 'Portion'} · ${activeVariant?.name || (t('baseVariant') || 'Base')}`}
              sub={t('simulatorPortionLeverHint') || 'Réduire la quantité servie pour cette variante'}
              valueLabel={`${formatPortion(simPortion)} ${portionUnit}`}
              baseLabel={portionChanged ? `${formatPortion(basePortion)} ${portionUnit}` : null}
              deltaPct={portionChanged ? portionDeltaPct : null}
              dirty={portionChanged}
              min={portionMin}
              max={portionMax}
              step={portionStep}
              value={simPortion}
              onChange={setSimPortion}
              ticks={[
                { v: portionMin, l: `${portionMin}${portionUnit}` },
                { v: basePortion, l: `${basePortion}${portionUnit} · ${t('simulatorBase') || 'base'}`, base: true },
                { v: portionMax, l: `${portionMax}${portionUnit}` },
              ]}
              inverseDelta
            />
          ) : (
            <div className="mb-[var(--s-5)] p-[var(--s-3)] rounded-r-md text-fs-xs text-[var(--fg-subtle)] bg-[var(--surface-2)]">
              {t('simulatorNoPortionHint') ||
                "Pas de taille de portion configurée — le levier portion est désactivé."}
            </div>
          )}

          {/* Lever 2 — sell price */}
          {basePrice > 0 && (
            <Lever
              icon={<DollarSign className="w-3 h-3" />}
              title={`${t('simulatorPriceLeverTitle') || 'Prix de vente'} · ${
                showCostsExVat ? (t('exVat') || 'HT') : (t('incVat') || 'TTC')
              }`}
              sub={t('simulatorPriceLeverHint') || 'Augmenter le prix de vente sans toucher la recette'}
              valueLabel={`${CURRENCY}${simPrice.toFixed(2)}`}
              baseLabel={priceChanged ? `${CURRENCY}${basePrice.toFixed(2)}` : null}
              deltaPct={priceChanged ? priceDeltaPct : null}
              dirty={priceChanged}
              min={priceMin}
              max={priceMax}
              step={0.5}
              value={simPrice}
              onChange={setSimPrice}
              ticks={[
                { v: priceMin, l: `${CURRENCY}${priceMin.toFixed(0)}` },
                { v: basePrice, l: `${CURRENCY}${basePrice.toFixed(0)} · ${t('simulatorBase') || 'base'}`, base: true },
                { v: priceMax, l: `${CURRENCY}${priceMax.toFixed(0)}` },
              ]}
            />
          )}

          {/* Lever 3 — ingredient cost overrides */}
          {costLevers.length > 0 && (
            <div className="mt-[var(--s-5)]">
              <SectionLabel sub={t('simulatorIngredientCostsHint') || 'Renégocier ou tester un autre fournisseur'}>
                {t('simulatorIngredientCosts') || 'Coût des ingrédients'}
              </SectionLabel>
              <div className="flex flex-col gap-[var(--s-2)] mt-[var(--s-3)]">
                {costLevers.map((row) => {
                  if (row.type === 'stock') {
                    const overrideVal = simStockCosts[row.stockId];
                    const overridden =
                      overrideVal != null && Math.abs(overrideVal - row.baseUnitCost) > 0.001;
                    return (
                      <div
                        key={row.key}
                        className="grid items-center gap-[var(--s-3)] p-[var(--s-3)] rounded-r-md"
                        style={{
                          gridTemplateColumns: '24px 1fr 140px',
                          background: 'var(--surface-2)',
                          border: overridden
                            ? '1px solid color-mix(in oklab, var(--brand-500) 35%, var(--line))'
                            : '1px solid var(--line)',
                        }}
                      >
                        <span
                          className="inline-grid place-items-center text-white font-bold rounded-r-xs"
                          style={{
                            width: 24,
                            height: 24,
                            background: row.color,
                            fontSize: 10,
                          }}
                        >
                          {row.tag}
                        </span>
                        <div className="min-w-0">
                          <div className="text-fs-sm font-medium truncate">{row.name}</div>
                          <div className="text-[10px] text-[var(--fg-subtle)] mt-0.5">
                            {t('base') || 'Base'} ·{' '}
                            <span className="tabular-nums">
                              {CURRENCY}
                              {row.baseUnitCost.toFixed(2)}
                              {row.unitSuffix}
                            </span>
                          </div>
                        </div>
                        <div
                          className="flex items-center gap-1 h-8 px-[var(--s-2)] rounded-r-sm bg-[var(--surface)]"
                          style={{
                            border: `1px solid ${overridden ? 'var(--brand-500)' : 'var(--line)'}`,
                          }}
                        >
                          <span className="text-fs-xs text-[var(--fg-subtle)]">{CURRENCY}</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={
                              overrideVal != null
                                ? overrideVal
                                : row.baseUnitCost.toFixed(2)
                            }
                            onChange={(e) => {
                              const v = parseFloat(e.target.value);
                              setSimStockCosts((prev) => {
                                const next = { ...prev };
                                if (!Number.isFinite(v) || v < 0) {
                                  delete next[row.stockId];
                                } else if (Math.abs(v - row.baseUnitCost) <= 0.001) {
                                  delete next[row.stockId];
                                } else {
                                  next[row.stockId] = v;
                                }
                                return next;
                              });
                            }}
                            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-fs-sm tabular-nums text-right text-[var(--fg)]"
                          />
                          <span className="text-fs-xs text-[var(--fg-subtle)]">
                            {row.unitSuffix.replace('/', '')}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  // Prep row — clickable, opens the recipe modal where each
                  // sub-stock cost is editable.
                  const overridden = prepHasOverride(row.ingredient);
                  const liveUnitCost = effectivePrepUnitCost(row.ingredient, row.baseUnitCost);
                  return (
                    <button
                      type="button"
                      key={row.key}
                      onClick={() => setOpenPrepIng(row.ingredient)}
                      className="grid items-center gap-[var(--s-3)] p-[var(--s-3)] rounded-r-md text-left transition-colors hover:bg-[var(--surface-3,var(--surface-2))]"
                      style={{
                        gridTemplateColumns: '24px 1fr auto auto',
                        background: 'var(--surface-2)',
                        border: overridden
                          ? '1px solid color-mix(in oklab, var(--brand-500) 35%, var(--line))'
                          : '1px solid var(--line)',
                      }}
                    >
                      <span
                        className="inline-grid place-items-center text-white font-bold rounded-r-xs"
                        style={{
                          width: 24,
                          height: 24,
                          background: row.color,
                          fontSize: 10,
                        }}
                      >
                        {row.tag}
                      </span>
                      <div className="min-w-0">
                        <div className="text-fs-sm font-medium truncate flex items-center gap-1.5">
                          <FlaskConical className="w-3 h-3 text-[var(--fg-subtle)] shrink-0" />
                          {row.name}
                        </div>
                        <div className="text-[10px] text-[var(--fg-subtle)] mt-0.5">
                          {t('preparation') || 'Préparation'} ·{' '}
                          <span className="tabular-nums">
                            {CURRENCY}
                            {row.baseUnitCost.toFixed(2)}
                            {row.unitSuffix}
                          </span>
                        </div>
                      </div>
                      <div
                        className="text-fs-sm font-semibold tabular-nums whitespace-nowrap"
                        style={{ color: overridden ? 'var(--brand-500)' : 'var(--fg)' }}
                      >
                        {CURRENCY}
                        {liveUnitCost.toFixed(2)}
                        <span className="text-[10px] text-[var(--fg-subtle)] font-normal">
                          {row.unitSuffix}
                        </span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-[var(--fg-subtle)]" />
                    </button>
                  );
                })}
              </div>
              {ingChanged && (
                <p className="flex items-start gap-1.5 mt-[var(--s-3)] text-fs-xs text-[var(--fg-muted)]">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    {t('simulatorOverrideNote') ||
                      "Les overrides sont locaux à cette simulation — votre fiche fournisseur n'est pas modifiée."}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* ===== OUTCOME ===== */}
        <div
          className="p-[var(--s-5)]"
          style={{
            background: dirty
              ? 'color-mix(in oklab, var(--brand-500) 4%, var(--surface))'
              : 'var(--surface-2)',
          }}
        >
          <SectionLabel>{t('simulatorResultTitle') || 'Résultat'}</SectionLabel>

          {/* % cost matter — headline */}
          <div className="mt-[var(--s-3)]">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-fs-xs uppercase tracking-[.06em] font-semibold text-[var(--fg-subtle)]">
                {t('simulatorMaterialCostPct') || '% Coût matière'}
              </p>
              <p className="text-fs-xs text-[var(--fg-subtle)]">
                {(t('simulatorTargetLabel') || 'Cible {pct}%').replace(
                  '{pct}',
                  String(Math.round(thresholdPct)),
                )}
              </p>
            </div>
            <div className="flex items-baseline gap-[var(--s-3)]">
              <p
                className="font-semibold tabular-nums leading-none"
                style={{
                  fontSize: 'var(--fs-4xl)',
                  letterSpacing: '-0.02em',
                  color: statusColor,
                }}
              >
                {simPctCost.toFixed(1)}
                <span style={{ fontSize: 'var(--fs-2xl)', marginLeft: 2 }}>%</span>
              </p>
              {dirty && (
                <div className="flex items-center gap-1.5">
                  <span className="text-fs-md tabular-nums text-[var(--fg-subtle)] line-through">
                    {basePctCost.toFixed(1)}%
                  </span>
                  <Delta value={deltaPctPts} unit="pt" inverse />
                </div>
              )}
            </div>

            {/* Gauge bar */}
            <div
              className="relative mt-[var(--s-3)]"
              style={{
                height: 8,
                background: 'var(--surface-2)',
                borderRadius: 4,
                overflow: 'hidden',
                border: '1px solid var(--line)',
              }}
            >
              <div
                className="absolute left-0 top-0 bottom-0 transition-[width] duration-200"
                style={{
                  width: `${simGaugePct}%`,
                  background: statusColor,
                }}
              />
              {dirty && (
                <div
                  className="absolute"
                  style={{
                    left: `${baseGaugePct}%`,
                    top: -2,
                    bottom: -2,
                    width: 2,
                    background: 'var(--fg-subtle)',
                    borderRadius: 1,
                  }}
                />
              )}
              <div
                className="absolute"
                style={{
                  left: `${targetGaugePct}%`,
                  top: -4,
                  bottom: -4,
                  width: 2,
                  background: 'var(--success-500)',
                  opacity: 0.6,
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-[var(--fg-subtle)]">
              <span>0%</span>
              <span style={{ color: 'var(--success-500)', fontWeight: 600 }}>
                {' ● '}
                {(t('simulatorTargetMarker') || '{pct}% cible').replace(
                  '{pct}',
                  String(Math.round(thresholdPct)),
                )}
              </span>
              <span>{gaugeMax}%</span>
            </div>

            {/* Status pill */}
            <span
              className="inline-flex items-center gap-1.5 mt-[var(--s-3)] py-1 px-2.5 rounded-r-full text-fs-xs font-semibold"
              style={{
                background: `color-mix(in oklab, ${statusColor} 14%, transparent)`,
                color: statusColor,
              }}
            >
              <span
                className="rounded-full"
                style={{ width: 6, height: 6, background: 'currentColor' }}
              />
              {status.label}
            </span>
          </div>

          {/* Side-by-side: Coût matière + Marge brute */}
          <div className="grid grid-cols-2 gap-[var(--s-3)] mt-[var(--s-5)]">
            <ResultCard
              label={t('simulatorMaterialCost') || 'Coût matière'}
              value={`${CURRENCY}${simFoodCost.toFixed(2)}`}
              base={dirty ? `${CURRENCY}${baseFoodCost.toFixed(2)}` : null}
              delta={dirty ? simFoodCost - baseFoodCost : null}
              inverse
            />
            <ResultCard
              label={t('grossProfit') || 'Marge brute'}
              value={`${CURRENCY}${simMargin.toFixed(2)}`}
              sub={`${simMarginPct.toFixed(1)}%`}
              base={dirty ? `${CURRENCY}${baseMargin.toFixed(2)}` : null}
              delta={dirty ? simMargin - baseMargin : null}
              accent="var(--success-500)"
            />
          </div>

          {/* Empty state — quick-action chips */}
          {!dirty && (
            <div
              className="mt-[var(--s-5)] p-[var(--s-4)] rounded-r-md text-center"
              style={{
                background: 'var(--surface)',
                border: '1px dashed var(--line-strong, var(--line))',
              }}
            >
              <p className="text-fs-sm text-[var(--fg-muted)] leading-snug">
                {t('simulatorEmptyHint') ||
                  "Bougez un curseur à gauche pour voir comment chaque levier change la rentabilité de cet article."}
              </p>
              <div className="flex items-center justify-center gap-1.5 mt-[var(--s-3)] flex-wrap">
                {basePortion > 0 && (
                  <QuickChip onClick={quickMinus10Portion}>
                    <SlidersHorizontal className="w-3 h-3" />
                    {t('simulatorQuickMinus10Portion') || '−10% portion'}
                  </QuickChip>
                )}
                {basePrice > 0 && (
                  <QuickChip onClick={quickPlus10Price}>
                    <DollarSign className="w-3 h-3" />
                    {t('simulatorQuickPlus10Price') || '+10% prix'}
                  </QuickChip>
                )}
                {costLevers.length > 0 && (
                  <QuickChip onClick={quickMinus5Ingredients}>
                    <RefreshCw className="w-3 h-3" />
                    {t('simulatorQuickMinus5Ingredients') || '−5% ingrédients'}
                  </QuickChip>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </section>

    {/* Recipe drill-down: clicking a prep row in the levers list opens the
        breakdown modal with sub-stock costs editable. Edits flow back into
        simStockCosts so the simulator KPIs update in real time. */}
    {openPrepIng && (
      <PrepCostBreakdownModal
        ing={openPrepIng}
        item={item}
        portion={prepPortion}
        optionId={null}
        showExVat={showCostsExVat}
        restaurantRate={vatRate}
        simStockCosts={simStockCosts}
        onEditStockCost={(stockId, value) => {
          setSimStockCosts((prev) => {
            const next = { ...prev };
            // Treat "value equals base" as clearing the override so the row
            // visually returns to its base state when the user backs out.
            const base = (() => {
              const sub = openPrepIng.prep_item?.ingredients?.find(
                (pi) => pi.stock_item?.id === stockId,
              )?.stock_item;
              return displayUnitCostFor(sub);
            })();
            if (Math.abs(value - base) <= 0.0001) {
              delete next[stockId];
            } else {
              next[stockId] = value;
            }
            return next;
          });
        }}
        onClose={() => setOpenPrepIng(null)}
        t={t}
      />
    )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-[var(--s-2)]">
      <p className="text-fs-xs uppercase tracking-[.08em] font-bold text-[var(--fg-muted)]">
        {children}
      </p>
      {sub && <p className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">{sub}</p>}
    </div>
  );
}

function Lever({
  icon, title, sub, valueLabel, baseLabel, deltaPct, dirty,
  min, max, step, value, onChange, ticks, inverseDelta,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  valueLabel: string;
  baseLabel: string | null;
  deltaPct: number | null;
  dirty: boolean;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  ticks: { v: number; l: string; base?: boolean }[];
  /** When true (e.g. portion), reducing is "good" (green down arrow). */
  inverseDelta?: boolean;
}) {
  const range = Math.max(0.0001, max - min);
  const pct = Math.max(0, Math.min(100, ((value - min) / range) * 100));

  return (
    <div className="mb-[var(--s-5)]">
      <div className="flex items-center justify-between mb-[var(--s-2)] gap-[var(--s-3)]">
        <div className="flex items-center gap-[var(--s-2)] min-w-0">
          <span
            className="inline-grid place-items-center shrink-0 rounded-r-xs text-[var(--fg-muted)]"
            style={{ width: 24, height: 24, background: 'var(--surface-2)' }}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-fs-sm font-semibold truncate">{title}</p>
            <p className="text-[10px] text-[var(--fg-subtle)] mt-0.5">{sub}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="flex items-center gap-1.5 justify-end">
            {dirty && baseLabel && (
              <span className="text-fs-xs tabular-nums text-[var(--fg-subtle)] line-through">
                {baseLabel}
              </span>
            )}
            <span
              className="text-fs-lg font-semibold tabular-nums"
              style={{ color: dirty ? 'var(--brand-500)' : 'var(--fg)' }}
            >
              {valueLabel}
            </span>
          </div>
          {dirty && deltaPct != null && Math.abs(deltaPct) > 0.05 && (
            <div className="mt-0.5">
              <Delta value={deltaPct} unit="%" inverse={inverseDelta} />
            </div>
          )}
        </div>
      </div>

      {/* Slider — visual track + thumb on top of an invisible <input range>
          for accessibility & keyboard support. */}
      <div className="relative" style={{ height: 32, marginTop: 8 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-grab z-10"
          aria-label={title}
        />
        {/* track */}
        <div
          className="absolute"
          style={{
            left: 0, right: 0, top: 14, height: 4,
            background: 'var(--surface-2)', borderRadius: 2,
          }}
        />
        <div
          className="absolute transition-[width] duration-150"
          style={{
            left: 0, top: 14, width: `${pct}%`, height: 4,
            background: dirty ? 'var(--brand-500)' : 'var(--fg-subtle)',
            borderRadius: 2,
          }}
        />
        {/* base marker */}
        {ticks
          .filter((tk) => tk.base)
          .map((tk) => {
            const tp = ((tk.v - min) / range) * 100;
            return (
              <div
                key={tk.v}
                className="absolute"
                style={{
                  left: `${tp}%`, top: 10, width: 2, height: 12,
                  background: 'var(--fg-subtle)', borderRadius: 1,
                  transform: 'translateX(-50%)',
                }}
              />
            );
          })}
        {/* thumb */}
        <div
          className="absolute pointer-events-none shadow-1"
          style={{
            left: `${pct}%`, top: 8,
            width: 16, height: 16, borderRadius: '50%',
            background: 'var(--surface)',
            border: `2px solid ${dirty ? 'var(--brand-500)' : 'var(--fg-subtle)'}`,
            transform: 'translateX(-50%)',
          }}
        />
      </div>

      {/* tick labels */}
      <div className="flex items-center justify-between mt-1.5 text-[10px] text-[var(--fg-subtle)]">
        {ticks.map((tk) => {
          const isBase = !!tk.base;
          return (
            <span
              key={tk.v}
              style={{
                fontWeight: isBase ? 600 : 400,
                color: isBase ? 'var(--fg-muted)' : undefined,
              }}
            >
              {tk.l}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Delta({
  value, unit = '', inverse = false,
}: { value: number; unit?: string; inverse?: boolean }) {
  if (!Number.isFinite(value) || Math.abs(value) < 0.001) return null;
  const isDown = value < 0;
  const good = inverse ? isDown : !isDown;
  const color = good ? 'var(--success-500)' : 'var(--danger-500)';
  const sign = isDown ? '−' : '+';
  const abs = Math.abs(value);
  const decimals = unit === 'pt' || unit === '%' ? 1 : 2;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-fs-xs font-semibold tabular-nums"
      style={{ color }}
    >
      {isDown ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
      {sign}
      {unit === CURRENCY ? unit : ''}
      {abs.toFixed(decimals)}
      {unit !== CURRENCY ? unit : ''}
    </span>
  );
}

function ResultCard({
  label, value, sub, base, delta, accent, inverse,
}: {
  label: string;
  value: string;
  sub?: string;
  base: string | null;
  delta: number | null;
  accent?: string;
  inverse?: boolean;
}) {
  const dirty = base != null && delta != null;
  return (
    <div
      className="p-[var(--s-4)] rounded-r-md"
      style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
    >
      <p className="text-[10px] uppercase tracking-[.08em] font-bold text-[var(--fg-subtle)]">
        {label}
      </p>
      <div className="flex items-baseline gap-[var(--s-2)] mt-[var(--s-2)]">
        <p
          className="font-semibold tabular-nums leading-none"
          style={{
            fontSize: 'var(--fs-2xl)',
            letterSpacing: '-0.01em',
            color: accent || 'var(--fg)',
          }}
        >
          {value}
        </p>
        {sub && <span className="text-fs-xs text-[var(--fg-subtle)]">{sub}</span>}
      </div>
      {dirty && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <span className="text-[10px] tabular-nums text-[var(--fg-subtle)] line-through">
            {base}
          </span>
          <Delta value={delta!} unit={CURRENCY} inverse={inverse} />
        </div>
      )}
    </div>
  );
}

function QuickChip({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 h-7 px-[var(--s-3)] rounded-r-xl text-fs-xs font-medium border border-[var(--line)] bg-[var(--surface)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--line-strong,var(--line))] transition-colors"
    >
      {children}
    </button>
  );
}

function formatPortion(n: number): string {
  // Avoid trailing ".0" for integers, but keep one decimal for fractional grams
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
