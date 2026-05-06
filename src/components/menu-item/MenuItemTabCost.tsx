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
import WhatIfSimulator from './WhatIfSimulator';

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
  /** Optional left-indent on the section head (e.g. `ms-[37px]`) so callers
   *  can align the "Coût" title with a sibling card's emoji-offset title.
   *  Defaults to no indent — inside the item-editor the 3px bar sits flush
   *  so "Recette" / "Coût" tabs align across the editor's content area. */
  headerIndentClass?: string;
  /** Called after the simulator's Apply persists changes — caller refetches
   *  ingredients / item state. */
  onChangesApplied?: () => void | Promise<void>;
}

const CURRENCY = '\u20AA';

export default function MenuItemTabCost({
  rid,
  item,
  ingredients,
  itemOptionOverrides,
  vatRate,
  price,
  headerIndentClass = '',
  onChangesApplied,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();

  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);
  const [breakdownIng, setBreakdownIng] = useState<MenuItemIngredient | null>(null);
  const [showCostPctBreakdown, setShowCostPctBreakdown] = useState(false);

  // Variant pills — lets the user switch the "portion" the cost math uses.
  const variants = useMemo(
    () => buildVariantOptions(item, itemOptionOverrides),
    [item, itemOptionOverrides],
  );
  // Default to the first variant with a portion (concrete cost), else the
  // first variant outright. We never default to "" (base recipe) because
  // when an item has variants, exposing a synthetic "Base" pill is confusing
  // — users only configured Normal/Grand/etc., not "Base".
  const defaultVariantId =
    variants.find((v) => (v.portion_size ?? 0) > 0)?.id ?? variants[0]?.id ?? '';
  const [variantId, setVariantId] = useState<string>(defaultVariantId);
  const activeVariant = variants.find((v) => v.id === variantId) ?? null;

  // Raw stored price for the active variant (always inc-VAT — DB convention).
  // Falls back to the base item price. Used by CostPctBreakdownModal which
  // normalizes internally based on showCostsExVat.
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

  return (
    <div className="max-w-5xl space-y-[var(--s-5)]">
      {/* Cost overview card — mirrors the food-cost page's "Coût" section */}
      <section className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] p-[var(--s-5)]">
      {/* Section head with 3px brand accent + HT/TTC toggle. Caller may
          pass `headerIndentClass` (e.g. `ms-[37px]`) to align with an
          adjacent emoji-offset title — see food-cost/page.tsx. */}
      <div className="flex items-center justify-between gap-[var(--s-3)] mb-[var(--s-5)]">
        <div className={`flex items-center gap-[var(--s-3)] ${headerIndentClass}`}>
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
                  ? 'bg-[var(--surface)] text-[var(--brand-500)] shadow-1'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              {mode === 'ex' ? (t('exVat') || 'HT') : (t('incVat') || 'TTC')}
            </button>
          ))}
        </div>
      </div>

      {/* Variant pills + active variant's selling price (follows HT/TTC) */}
      {variants.length > 0 && (
        <div className="mb-[var(--s-5)] flex items-start justify-between gap-[var(--s-4)] flex-wrap">
          <div className="min-w-0">
            <p className="text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-subtle)] mb-[var(--s-2)]">
              {t('activePortion') || 'Portion active'}
            </p>
            <div className="flex gap-[var(--s-2)] flex-wrap">
              {variants.map((v) => {
                const active = variantId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setVariantId(v.id)}
                    aria-pressed={active}
                    title={`${v.name}: ${v.price.toFixed(2)} ₪`}
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

          <div className="text-end shrink-0">
            <p className="text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-subtle)] mb-[var(--s-2)]">
              {t('sellingPriceLabel') || 'Prix de vente'}
            </p>
            <p className="text-fs-lg font-semibold leading-none tabular-nums text-[var(--fg)]">
              {summary.displayPrice.toFixed(2)} {CURRENCY}
            </p>
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
            {summary.displayPrice > 0
              ? `${((summary.margin / summary.displayPrice) * 100).toFixed(1)}% · ${t('healthy') || 'sain'}`
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

      </section>

      {/* Ingredient breakdown — own card, tokenized */}
      <section className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] p-[var(--s-5)]">
        <h4 className="text-fs-md font-semibold text-[var(--fg)] mb-[var(--s-4)]">
          {t('costDetailsByIngredient') || 'Détail des coûts par ingrédient'} · {summary.lines.length}{' '}
          {summary.lines.length === 1 ? 'élément' : 'éléments'}
        </h4>

        <div className="space-y-2">
          {/* Column headers — desktop only; mobile rows show inline labels per cell */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 uppercase">
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
                quantityLabel={t('quantity') || 'Quantité'}
                unitCostLabel={t('unitCost') || 'Prix unitaire'}
                totalCostLabel={t('totalCost') || 'Coût total'}
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
              {/* Total — flex row on mobile (label · value · pct), 12-col grid on desktop */}
              <div className="flex items-center justify-between gap-3 md:grid md:grid-cols-12 md:gap-4 px-4 py-2 font-semibold">
                <div className="md:col-span-5 text-neutral-900 dark:text-white">
                  {t('total') || 'Total'}
                </div>
                <div className="hidden md:block md:col-span-2" />
                <div className="hidden md:block md:col-span-2" />
                <div className="md:col-span-2 text-end text-neutral-900 dark:text-white tabular-nums">
                  {summary.foodCost.toFixed(2)} {CURRENCY}
                </div>
                <div className="md:col-span-1 text-end text-orange-500">100%</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* "Et si… ?" simulator — sandbox the same KPIs by playing with portion,
          sell price, and per-ingredient cost. Nothing persists.
          Hidden on mobile: the sliders + side-by-side comparison cards are
          desktop-oriented; the static cost overview above already covers the
          mobile read-only use case. */}
      <div className="hidden md:block">
        <WhatIfSimulator
          rid={rid}
          item={item}
          summary={summary}
          activeVariant={activeVariant}
          effectivePrice={summary.displayPrice}
          thresholdPct={COST_THRESHOLD * 100}
          vatRate={vatRate}
          showCostsExVat={showCostsExVat}
          resetKey={`${variantId}|${vatDisplayMode}`}
          onApplied={onChangesApplied}
          t={t}
        />
      </div>

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
  quantityLabel,
  unitCostLabel,
  totalCostLabel,
  onNameClick,
  onPriceClick,
}: {
  name: string;
  type: 'preparation' | 'brut';
  quantity: string;
  unitCost: string;
  totalCost: string;
  percentage: string;
  quantityLabel: string;
  unitCostLabel: string;
  totalCostLabel: string;
  onNameClick: () => void;
  onPriceClick?: () => void;
}) {
  // Mobile: stacked card with name + percentage badge as the heading row, then
  // label/value rows for quantity / unit cost / total. Desktop: 12-col grid.
  return (
    <div className="flex flex-col gap-2 md:grid md:grid-cols-12 md:gap-4 md:items-center px-4 py-3 bg-white dark:bg-[#0a0a0a] rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-orange-500/50 transition-colors">
      {/* Heading row on mobile: name + pct on the right; just name on desktop */}
      <div className="flex items-center justify-between gap-3 md:contents">
        <button
          type="button"
          onClick={onNameClick}
          className="md:col-span-5 flex items-center gap-2 min-w-0 text-left hover:text-orange-500 transition-colors"
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
        <span className="md:hidden text-sm font-semibold text-orange-500 shrink-0 tabular-nums">
          {percentage}
        </span>
      </div>

      {/* Quantity */}
      <div className="flex items-center justify-between gap-3 md:block md:col-span-2 md:text-end text-sm text-neutral-600 dark:text-neutral-400">
        <span className="md:hidden text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-secondary,var(--text-secondary))]">
          {quantityLabel}
        </span>
        <span className="tabular-nums text-end">{quantity}</span>
      </div>

      {/* Unit cost */}
      <div className="flex items-center justify-between gap-3 md:block md:col-span-2 md:text-end text-sm text-neutral-600 dark:text-neutral-400">
        <span className="md:hidden text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-secondary,var(--text-secondary))]">
          {unitCostLabel}
        </span>
        <span className="tabular-nums text-end">{unitCost}</span>
      </div>

      {/* Total cost */}
      {onPriceClick ? (
        <button
          type="button"
          onClick={onPriceClick}
          className="flex items-center justify-between gap-3 md:block md:col-span-2 md:text-end text-sm font-semibold text-neutral-900 dark:text-white hover:text-orange-500 underline-offset-2 hover:underline transition-colors"
          title="Voir le détail du coût"
        >
          <span className="md:hidden text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-secondary,var(--text-secondary))]">
            {totalCostLabel}
          </span>
          <span className="tabular-nums text-end">{totalCost}</span>
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3 md:block md:col-span-2 md:text-end text-sm font-semibold text-neutral-900 dark:text-white">
          <span className="md:hidden text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-secondary,var(--text-secondary))]">
            {totalCostLabel}
          </span>
          <span className="tabular-nums text-end">{totalCost}</span>
        </div>
      )}

      {/* Percentage — visible only on desktop (mobile shows it in the heading row) */}
      <div className="hidden md:block md:col-span-1 text-sm font-semibold text-orange-500 text-end">
        {percentage}
      </div>
    </div>
  );
}

