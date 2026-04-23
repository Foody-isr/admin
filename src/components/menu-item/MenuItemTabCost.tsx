'use client';

import { AlertCircle, FlaskConical, Package } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import {
  COST_THRESHOLD,
  computeItemCostSummary,
  buildVariantOptions,
  resolvePortion,
} from '@/lib/cost-utils';
import type {
  MenuItem,
  MenuItemIngredient,
  ItemOptionOverride,
} from '@/lib/api';
import KPIInfoModal, { KPI_INFO } from '@/components/common/KPIInfoModal';
import PrepCostBreakdownModal from '@/components/food-cost/PrepCostBreakdownModal';
import CostPctBreakdownModal from '@/components/food-cost/CostPctBreakdownModal';

// Shared Cost section — used by both the MenuItem edit page's Coût tab AND
// the standalone Food Cost page's selected-item panel. Figma:644-807.
//
// 3 KPI cards (all clickable → KPIInfoModal / CostPctBreakdownModal).
// Ingredient breakdown table with clickable names (route to stock/prep
// editor) and clickable prep-line prices (open PrepCostBreakdownModal).
// Enhanced suggestions with concrete savings examples.

interface Props {
  rid: number;
  item: MenuItem;
  ingredients: MenuItemIngredient[];
  itemOptionOverrides: ItemOptionOverride[];
  vatRate: number;
  price: number;
}

const CURRENCY = '\u20AA';

export default function MenuItemTabCost({
  rid,
  item,
  ingredients,
  itemOptionOverrides,
  vatRate,
  price,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();

  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);
  const [breakdownIng, setBreakdownIng] = useState<MenuItemIngredient | null>(null);
  const [showCostPctBreakdown, setShowCostPctBreakdown] = useState(false);

  // Variant pills — lets the user switch the "portion" the cost math uses.
  // "" = base recipe (no variant override).
  const variants = useMemo(
    () => buildVariantOptions(item, itemOptionOverrides),
    [item, itemOptionOverrides],
  );
  // Default to the first variant that has a portion so the Cost tab opens
  // on a concrete portion, matching the old panel's UX.
  const firstVariantWithPortion =
    variants.find((v) => (v.portion_size ?? 0) > 0)?.id ?? '';
  const [variantId, setVariantId] = useState<string>(firstVariantWithPortion);
  const activeVariant = variants.find((v) => v.id === variantId) ?? null;

  // Item price shown for the active variant — falls back to the base item price.
  const effectivePrice = activeVariant?.price ?? price;

  // HT/TTC (ex-VAT / inc-VAT) display toggle — mirrors the stock page pattern
  // so the user has one mental model across cost tooling. Persisted per-user.
  const [vatDisplayMode, setVatDisplayMode] = useState<'ex' | 'inc'>('ex');
  useEffect(() => {
    try {
      const v = localStorage.getItem('foody.cost.vatDisplay');
      if (v === 'ex' || v === 'inc') setVatDisplayMode(v);
    } catch { /* ignore */ }
  }, []);
  const toggleVatDisplay = () => {
    setVatDisplayMode((prev) => {
      const next = prev === 'ex' ? 'inc' : 'ex';
      try { localStorage.setItem('foody.cost.vatDisplay', next); } catch { /* ignore */ }
      return next;
    });
  };
  const showCostsExVat = vatDisplayMode === 'ex';

  const summary = useMemo(
    () =>
      computeItemCostSummary({
        item,
        ingredients,
        overrides: itemOptionOverrides,
        vatRate,
        showCostsExVat,
        variantId: variantId || undefined,
      }),
    [item, ingredients, itemOptionOverrides, vatRate, variantId, showCostsExVat],
  );

  const over = summary.costPct > COST_THRESHOLD;
  const targetPriceForThreshold =
    summary.foodCost > 0 ? summary.foodCost / COST_THRESHOLD : 0;

  // ── Suggestions ────────────────────────────────────────────────
  // Sort lines by cost share, pick the top two contributors as reduction
  // candidates. For each, propose reducing by 12% and compute the ₪ savings.
  const sortedLines = [...summary.lines].sort((a, b) => b.lineCost - a.lineCost);
  const topLine = sortedLines[0];
  const topPct = topLine && summary.foodCost > 0
    ? Math.round((topLine.lineCost / summary.foodCost) * 100)
    : 0;

  // Reduction example: current qty × 0.88 (−12%). Savings = line cost × 0.12.
  const reductionPct = 0.12;
  const reductionSavings = topLine ? topLine.lineCost * reductionPct : 0;
  const reducedQty = topLine ? topLine.qty * (1 - reductionPct) : 0;
  const newCostPctAfterReduction = summary.foodCost > 0 && price > 0
    ? ((summary.foodCost - reductionSavings) / price) * 100
    : 0;

  // Price hike example: price needed to land on COST_THRESHOLD (35%).
  const currentPct = summary.costPct * 100;
  const priceDelta = targetPriceForThreshold - effectivePrice;

  return (
    <div className="max-w-5xl">
      {/* Section head with 3px brand accent + HT/TTC toggle */}
      <div className="flex items-center justify-between gap-[var(--s-3)] mb-[var(--s-5)]">
        <div className="flex items-center gap-[var(--s-3)]">
          <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)]" />
          <h3 className="text-fs-xl font-semibold text-[var(--fg)]">{t('tabCost')}</h3>
        </div>

        {/* HT / TTC toggle — segmented control matching .tabs pattern */}
        <div
          role="group"
          aria-label={t('showExVat') || 'Affichage TVA'}
          className="inline-flex items-center gap-0.5 bg-[var(--surface-2)] p-1 rounded-r-md"
        >
          {(['ex', 'inc'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => vatDisplayMode !== mode && toggleVatDisplay()}
              aria-pressed={vatDisplayMode === mode}
              className={`inline-flex items-center h-[26px] px-[var(--s-3)] rounded-r-sm text-fs-xs font-semibold transition-colors ${
                vatDisplayMode === mode
                  ? 'bg-[var(--surface)] text-[var(--fg)] shadow-1'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              {mode === 'ex' ? (t('exVat') || 'HT') : (t('incVat') || 'TTC')}
            </button>
          ))}
        </div>
      </div>

      {/* Variant pills — .chip pattern */}
      {variants.length > 0 && (
        <div className="mb-[var(--s-5)]">
          <p className="text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-subtle)] mb-[var(--s-2)]">
            {t('activePortion') || 'Portion active'}
          </p>
          <div className="flex gap-[var(--s-2)] flex-wrap">
            <button
              type="button"
              onClick={() => setVariantId('')}
              aria-pressed={variantId === ''}
              className={`inline-flex items-center gap-1.5 h-[30px] px-[var(--s-3)] rounded-r-xl border text-fs-sm font-medium whitespace-nowrap transition-colors duration-fast ${
                variantId === ''
                  ? 'bg-[var(--brand-500)] text-white border-[var(--brand-500)]'
                  : 'bg-[var(--surface)] text-[var(--fg-muted)] border-[var(--line)] hover:text-[var(--fg)] hover:border-[var(--line-strong)]'
              }`}
            >
              {t('base') || 'Base'}
              {item.portion_size ? (
                <span className={`text-fs-xs ${variantId === '' ? 'text-white/80' : 'opacity-70'}`}>
                  {item.portion_size} {item.portion_size_unit || 'g'}
                </span>
              ) : null}
            </button>
            {variants.map((v) => {
              const active = variantId === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariantId(v.id)}
                  aria-pressed={active}
                  title={`${v.name} — ${v.price.toFixed(2)} ₪`}
                  className={`inline-flex items-center gap-1.5 h-[30px] px-[var(--s-3)] rounded-r-xl border text-fs-sm font-medium whitespace-nowrap transition-colors duration-fast ${
                    active
                      ? 'bg-[var(--brand-500)] text-white border-[var(--brand-500)]'
                      : 'bg-[var(--surface)] text-[var(--fg-muted)] border-[var(--line)] hover:text-[var(--fg)] hover:border-[var(--line-strong)]'
                  }`}
                >
                  {v.name}
                  {v.portion_size > 0 && (
                    <span className={`text-fs-xs ${active ? 'text-white/80' : 'opacity-70'}`}>
                      {v.portion_size} {v.portion_size_unit}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3 KPI cards — neutral / success-tinted margin / warning-tinted % over threshold */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--s-4)] mb-[var(--s-6)]">
        <button
          type="button"
          onClick={() => setSelectedKpi('food-cost-moyen')}
          title={t('viewCalculationDetails') || 'Voir le détail du calcul'}
          className="text-left bg-[var(--surface)] border border-[var(--line)] rounded-r-lg p-[var(--s-5)] flex flex-col gap-[var(--s-3)] hover:border-[var(--line-strong)] transition-colors"
        >
          <p className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
            {t('foodCostLabel')}
          </p>
          <p className="text-fs-3xl font-semibold leading-none text-[var(--fg)] tabular-nums">
            {summary.foodCost.toFixed(2)} {CURRENCY}
          </p>
          <p className="text-fs-xs text-[var(--fg-subtle)]">
            {t('perPortion') || 'Par portion'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setSelectedKpi('marge-totale')}
          title={t('viewCalculationDetails') || 'Voir le détail du calcul'}
          className="text-left rounded-r-lg p-[var(--s-5)] flex flex-col gap-[var(--s-3)] hover:shadow-2 transition-shadow"
          style={{
            background: 'color-mix(in oklab, var(--success-500) 8%, var(--surface))',
            border: '1px solid color-mix(in oklab, var(--success-500) 30%, var(--line))',
          }}
        >
          <p className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
            {t('grossProfit')}
          </p>
          <p className="text-fs-3xl font-semibold leading-none text-[var(--success-500)] tabular-nums">
            {summary.margin.toFixed(2)} {CURRENCY}
          </p>
          <p className="text-fs-xs text-[var(--fg-subtle)]">
            {effectivePrice > 0
              ? `${((summary.margin / effectivePrice) * 100).toFixed(1)}% · ${t('healthy') || 'sain'}`
              : '—'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setShowCostPctBreakdown(true)}
          title={t('viewCostPctBreakdown') || 'Voir le détail du calcul'}
          className="text-left rounded-r-lg p-[var(--s-5)] flex flex-col gap-[var(--s-3)] hover:shadow-2 transition-shadow"
          style={{
            background: over
              ? 'color-mix(in oklab, var(--warning-500) 8%, var(--surface))'
              : 'color-mix(in oklab, var(--success-500) 8%, var(--surface))',
            border: over
              ? '1px solid color-mix(in oklab, var(--warning-500) 30%, var(--line))'
              : '1px solid color-mix(in oklab, var(--success-500) 30%, var(--line))',
          }}
        >
          <p className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
            {t('costPercent')}
          </p>
          <div className="flex items-center gap-[var(--s-2)]">
            <p
              className="text-fs-3xl font-semibold leading-none tabular-nums"
              style={{ color: over ? 'var(--warning-500)' : 'var(--success-500)' }}
            >
              {(summary.costPct * 100).toFixed(1)}%
            </p>
            {over && <AlertCircle className="w-5 h-5 text-[var(--warning-500)]" />}
          </div>
          <p
            className="text-fs-xs"
            style={{ color: over ? 'var(--warning-500)' : 'var(--fg-subtle)' }}
          >
            {over
              ? `${t('aboveTarget') || 'Au-dessus de la cible'} (${Math.round(COST_THRESHOLD * 100)}%)`
              : `${t('target') || 'Cible'} ${Math.round(COST_THRESHOLD * 100)}%`}
          </p>
        </button>
      </div>

      {/* Ingredient breakdown — Figma:674-738 */}
      <div className="bg-neutral-50 dark:bg-[#1a1a1a] rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 mb-8">
        <h4 className="font-semibold text-neutral-900 dark:text-white mb-4">
          {t('costDetailsByIngredient') || 'Détail des coûts par ingrédient'} • {summary.lines.length}{' '}
          {summary.lines.length === 1 ? 'élément' : 'éléments'}
        </h4>

        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase">
            <div className="col-span-5">{t('ingredient') || 'Ingrédient'}</div>
            <div className="col-span-2 text-right">{t('quantity') || 'Quantité'}</div>
            <div className="col-span-2 text-right">{t('unitCost') || 'Prix unitaire'}</div>
            <div className="col-span-2 text-right">{t('totalCost') || 'Coût total'}</div>
            <div className="col-span-1 text-right">%</div>
          </div>

          {summary.lines.map((line, i) => {
            const pct =
              summary.foodCost > 0
                ? Math.round((line.lineCost / summary.foodCost) * 100)
                : 0;
            const unitCostStr = line.unitCost
              ? `${line.unitCost.toFixed(2)} ${CURRENCY}${line.sourceUnit ? `/${line.sourceUnit}` : ''}`
              : '\u2014';
            const ing = line.ingredient;
            const stockId = ing.stock_item?.id ?? null;
            const prepId = ing.prep_item?.id ?? null;
            const goToSource = () => {
              if (prepId) router.push(`/${rid}/kitchen/prep?edit=${prepId}`);
              else if (stockId) router.push(`/${rid}/kitchen/stock?edit=${stockId}`);
            };
            return (
              <CostIngredientRow
                key={i}
                name={line.name}
                type={line.isPrep ? 'preparation' : 'brut'}
                quantity={`${line.qty ?? 0} ${line.qtyUnit ?? ''}`.trim()}
                unitCost={unitCostStr}
                totalCost={`${line.lineCost.toFixed(2)} ${CURRENCY}`}
                percentage={`${pct}%`}
                onNameClick={goToSource}
                onPriceClick={line.isPrep ? () => setBreakdownIng(ing) : undefined}
              />
            );
          })}

          {summary.lines.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400 py-6 text-center">
              {t('noIngredientCosts') || 'Ajoutez des ingrédients pour voir le détail des coûts.'}
            </p>
          )}

          {summary.lines.length > 0 && (
            <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
              <div className="grid grid-cols-12 gap-4 px-4 py-2 font-semibold">
                <div className="col-span-5 text-neutral-900 dark:text-white">
                  {t('total') || 'Total'}
                </div>
                <div className="col-span-2" />
                <div className="col-span-2" />
                <div className="col-span-2 text-right text-neutral-900 dark:text-white">
                  {summary.foodCost.toFixed(2)} {CURRENCY}
                </div>
                <div className="col-span-1 text-right text-orange-500">100%</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Suggestions — enhanced with concrete numeric examples. */}
      {(over || topPct >= 25) && (
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-6 border border-orange-200 dark:border-orange-700">
          <h4 className="font-semibold text-orange-900 dark:text-orange-300 mb-4 flex items-center gap-2">
            <AlertCircle size={20} />
            {t('optimizationSuggestions') || "Suggestions d'optimisation"}
          </h4>

          <div className="space-y-3 text-sm text-orange-800 dark:text-orange-400">
            {/* Portion reduction suggestion */}
            {topLine && topPct >= 25 && (
              <SuggestionRow
                title={`${t('reducePortionOf') || 'Réduire la portion de'} ${topLine.name}`}
                body={
                  <>
                    {t('reducePortionFrom') || 'Passer de'}{' '}
                    <strong>{topLine.qty.toFixed(topLine.qty >= 10 ? 0 : 2)} {topLine.qtyUnit}</strong>{' '}
                    {t('to') || 'à'}{' '}
                    <strong>{reducedQty.toFixed(reducedQty >= 10 ? 0 : 2)} {topLine.qtyUnit}</strong>{' '}
                    ({t('minus') || '−'}12%) →{' '}
                    <strong className="text-green-700 dark:text-green-400">
                      {t('savings') || 'économie'} {reductionSavings.toFixed(2)} {CURRENCY}
                    </strong>{' '}
                    {t('perDish') || 'par plat'}
                    {over && newCostPctAfterReduction > 0 && (
                      <>
                        {' '}·{' '}
                        {t('fromTo') || 'de'} <strong>{currentPct.toFixed(1)}%</strong>{' '}
                        {t('to') || 'à'}{' '}
                        <strong>{newCostPctAfterReduction.toFixed(1)}%</strong>
                      </>
                    )}
                  </>
                }
              />
            )}

            {/* Price hike suggestion */}
            {over && targetPriceForThreshold > 0 && priceDelta > 0.01 && (
              <SuggestionRow
                title={t('raiseSellingPrice') || 'Augmenter le prix de vente'}
                body={
                  <>
                    {t('raisePriceFrom') || 'De'}{' '}
                    <strong>{price.toFixed(2)} {CURRENCY}</strong>{' '}
                    {t('to') || 'à'}{' '}
                    <strong>{targetPriceForThreshold.toFixed(2)} {CURRENCY}</strong>{' '}
                    ({t('plus') || '+'}
                    {priceDelta.toFixed(2)} {CURRENCY}) →{' '}
                    <strong className="text-green-700 dark:text-green-400">
                      {t('ratioAt') || 'ratio à'} {Math.round(COST_THRESHOLD * 100)}%
                    </strong>{' '}
                    ({t('fromTo') || 'de'} {currentPct.toFixed(1)}%)
                  </>
                }
              />
            )}

            {/* Supplier renegotiation — fallback for secondary cost driver */}
            {sortedLines[1] && sortedLines[1].lineCost / Math.max(summary.foodCost, 1) >= 0.15 && (
              <SuggestionRow
                title={`${t('renegotiateSupplier') || 'Renégocier le fournisseur de'} ${sortedLines[1].name}`}
                body={
                  <>
                    {t('supplierSavingsHint') || "Une baisse de 10% sur cet ingrédient économiserait"}{' '}
                    <strong className="text-green-700 dark:text-green-400">
                      {(sortedLines[1].lineCost * 0.1).toFixed(2)} {CURRENCY}
                    </strong>{' '}
                    {t('perDish') || 'par plat'}.
                  </>
                }
              />
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <KPIInfoModal
        kpiInfo={selectedKpi ? KPI_INFO[selectedKpi] ?? null : null}
        onClose={() => setSelectedKpi(null)}
      />
      {breakdownIng && (
        <PrepCostBreakdownModal
          ing={breakdownIng}
          item={item}
          portion={resolvePortion(item, variants, variantId)}
          optionId={null}
          showExVat={showCostsExVat}
          restaurantRate={vatRate}
          onClose={() => setBreakdownIng(null)}
          t={t}
        />
      )}
      {showCostPctBreakdown && (
        <CostPctBreakdownModal
          itemName={activeVariant ? `${item.name} — ${activeVariant.name}` : item.name}
          displayPrice={effectivePrice}
          displayCost={summary.foodCost}
          costPct={summary.costPct}
          showCostsExVat={showCostsExVat}
          vatRate={vatRate}
          onClose={() => setShowCostPctBreakdown(false)}
        />
      )}
    </div>
  );
}

function CostIngredientRow({
  name,
  type,
  quantity,
  unitCost,
  totalCost,
  percentage,
  onNameClick,
  onPriceClick,
}: {
  name: string;
  type: 'preparation' | 'brut';
  quantity: string;
  unitCost: string;
  totalCost: string;
  percentage: string;
  onNameClick: () => void;
  onPriceClick?: () => void;
}) {
  return (
    <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-white dark:bg-[#0a0a0a] rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-orange-500/50 transition-colors items-center">
      <button
        type="button"
        onClick={onNameClick}
        className="col-span-5 flex items-center gap-2 min-w-0 text-left hover:text-orange-500 transition-colors"
        title={type === 'preparation' ? 'Ouvrir la préparation' : "Ouvrir l'article de stock"}
      >
        <div
          className={`flex-shrink-0 size-6 rounded flex items-center justify-center ${
            type === 'preparation'
              ? 'bg-purple-100 dark:bg-purple-900/30'
              : 'bg-blue-100 dark:bg-blue-900/30'
          }`}
        >
          {type === 'preparation' ? (
            <FlaskConical size={12} className="text-purple-600 dark:text-purple-400" />
          ) : (
            <Package size={12} className="text-blue-600 dark:text-blue-400" />
          )}
        </div>
        <span className="text-sm font-medium text-neutral-900 dark:text-white truncate underline-offset-2 hover:underline">
          {name}
        </span>
      </button>
      <div className="col-span-2 text-sm text-neutral-600 dark:text-neutral-400 text-right">
        {quantity}
      </div>
      <div className="col-span-2 text-sm text-neutral-600 dark:text-neutral-400 text-right">
        {unitCost}
      </div>
      {onPriceClick ? (
        <button
          type="button"
          onClick={onPriceClick}
          className="col-span-2 text-sm font-semibold text-neutral-900 dark:text-white text-right hover:text-orange-500 underline-offset-2 hover:underline transition-colors"
          title="Voir le détail du coût"
        >
          {totalCost}
        </button>
      ) : (
        <div className="col-span-2 text-sm font-semibold text-neutral-900 dark:text-white text-right">
          {totalCost}
        </div>
      )}
      <div className="col-span-1 text-sm font-semibold text-orange-500 text-right">
        {percentage}
      </div>
    </div>
  );
}

function SuggestionRow({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-[#0a0a0a] border border-orange-200 dark:border-orange-800 rounded-lg p-3">
      <p className="font-semibold text-orange-900 dark:text-orange-300 mb-1">• {title}</p>
      <p className="text-sm text-orange-800 dark:text-orange-400 ml-3">{body}</p>
    </div>
  );
}
