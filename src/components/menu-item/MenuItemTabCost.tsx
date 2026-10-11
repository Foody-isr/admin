'use client';

import { AlertCircle, ChevronDown, FlaskConical, Package } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n, useCurrency } from '@/lib/i18n';
import {
  COST_THRESHOLD,
  computeItemCostSummary,
  buildVariantOptions,
} from '@/lib/cost-utils';
import { customUnitFactor } from '@/lib/units';
import type {
  MenuItem,
  MenuItemIngredient,
  ItemOptionOverride,
} from '@/lib/api';
import KPIInfoModal, { KPI_INFO } from '@/components/common/KPIInfoModal';
import PrepCostBreakdownModal from '@/components/food-cost/PrepCostBreakdownModal';
import CostPctBreakdownModal from '@/components/food-cost/CostPctBreakdownModal';
import WhatIfSimulator, {type SimulatorReceipt} from './WhatIfSimulator';
import { ConfirmDialog } from '@/components/ds';

// Shared recipe cost section used by the item editor and the food-cost workspace.
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
  onChangesApplied?: (receipt: SimulatorReceipt) => void | Promise<void>;
  onSimulationStateChange?: (state: {dirty:boolean; busy:boolean}) => void;
  /** When true, the whole section starts collapsed behind its "Coût" header
   *  (used inside the Recette tab, where the live summary already shows in the
   *  left rail). The standalone food-cost page leaves this off. */
  collapsible?: boolean;
  /** Let the parent protect unsaved edits before opening an ingredient. */
  onNavigate?: (href: string) => void;
}


export default function MenuItemTabCost({
  rid,
  item,
  ingredients,
  itemOptionOverrides,
  vatRate,
  price,
  headerIndentClass = '',
  onChangesApplied,
  onSimulationStateChange,
  collapsible = false,
  onNavigate,
}: Props) {
  const { money } = useCurrency();
  const { t } = useI18n();
  const router = useRouter();

  const [selectedKpi, setSelectedKpi] = useState<string | null>(null);
  const [breakdownIng, setBreakdownIng] = useState<MenuItemIngredient | null>(null);
  const [showCostPctBreakdown, setShowCostPctBreakdown] = useState(false);
  // Collapsed-by-default when embedded in the Recette tab. The header stays
  // visible (with a compact cost summary) and toggles the body.
  const [collapsed, setCollapsed] = useState(collapsible);
  const [simulation, setSimulation] = useState({dirty:false,busy:false,pending:false});
  const [pendingView, setPendingView] = useState<{kind:'variant'|'vat'; value:string} | null>(null);
  const onSimulationState = useCallback((state: {dirty:boolean; busy:boolean; pending:boolean}) => {
    setSimulation(previous => previous.dirty === state.dirty && previous.busy === state.busy && previous.pending === state.pending ? previous : state);
    onSimulationStateChange?.(state);
  }, [onSimulationStateChange]);
  const requestView = (kind:'variant'|'vat', value:string) => {
    if (simulation.busy || simulation.pending) return;
    if (simulation.dirty) setPendingView({kind,value});
    else if (kind === 'variant') setVariantId(value);
    else toggleVatDisplay();
  };

  // Variant pills — lets the user switch the "portion" the cost math uses.
  const variants = useMemo(
    () => buildVariantOptions(item, itemOptionOverrides),
    [item, itemOptionOverrides],
  );
  // Default to the first variant. When an item has variants, exposing a
  // synthetic "Base" pill is confusing — users only configured the named
  // variants.
  const defaultVariantId = variants[0]?.id ?? '';
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
      <div className={`flex flex-wrap items-center justify-between gap-[var(--s-3)] ${collapsed ? '' : 'mb-[var(--s-5)]'}`}>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className={`flex items-center gap-[var(--s-3)] min-w-0 text-start ${headerIndentClass}`}
          >
            <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)] shrink-0" />
            <h3 className="text-fs-xl font-semibold text-[var(--fg)]">{t('tabCost')}</h3>
            <ChevronDown
              className={`w-5 h-5 text-[var(--fg-muted)] shrink-0 transition-transform duration-fast ${collapsed ? '' : 'rotate-180'}`}
            />
            {collapsed && (
              <span
                className="text-fs-sm tabular-nums truncate"
                style={{ color: over ? 'var(--warning-500)' : 'var(--fg-muted)' }}
              >
                {money(summary.foodCost)} · {(summary.costPct * 100).toFixed(0)}%
              </span>
            )}
          </button>
        ) : (
          <div className={`flex items-center gap-[var(--s-3)] ${headerIndentClass}`}>
            <span className="w-[3px] h-6 rounded-e-md bg-[var(--brand-500)]" />
            <h3 className="text-fs-xl font-semibold text-[var(--fg)]">{t('tabCost')}</h3>
          </div>
        )}

        {/* HT / TTC toggle — segmented control; only meaningful when expanded */}
        {!collapsed && (
          <div
            role="group"
            aria-label={t('showExVat') || 'Affichage TVA'}
            className="inline-flex items-center gap-0.5 bg-[var(--surface-2)] p-1 rounded-r-md"
          >
            {(['ex', 'inc'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={simulation.busy || simulation.pending} onClick={() => vatDisplayMode !== mode && requestView('vat',mode)}
                aria-pressed={vatDisplayMode === mode}
                className={`inline-flex items-center min-h-11 px-[var(--s-3)] rounded-r-sm text-fs-xs font-semibold transition-colors ${
                  vatDisplayMode === mode
                    ? 'bg-[var(--surface)] text-[var(--brand-ink)]'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                }`}
              >
                {mode === 'ex' ? (t('exVat') || 'HT') : (t('incVat') || 'TTC')}
              </button>
            ))}
          </div>
        )}
      </div>

      {!collapsed && (
      <>
      {/* Variant pills + active variant's selling price (follows HT/TTC) */}
      {variants.length > 0 && (
        <div className="mb-[var(--s-5)] flex items-start justify-between gap-[var(--s-4)] flex-wrap">
          <div className="min-w-0">
            <p className="text-fs-xs font-semibold text-[var(--fg-subtle)] mb-[var(--s-2)]">
              {t('activePortion') || 'Portion active'}
            </p>
            <div className="flex gap-[var(--s-2)] flex-wrap">
              {variants.map((v) => {
                const active = variantId === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={simulation.busy || simulation.pending} onClick={() => requestView('variant',v.id)}
                    aria-pressed={active}
                    title={`${v.name}: ${money(v.price)}`}
                    className={`inline-flex items-center gap-1.5 min-h-11 px-[var(--s-3)] rounded-r-xl border text-fs-sm font-medium whitespace-nowrap transition-colors duration-fast ${
                      active
                        ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)] border-[var(--brand-ink)]'
                        : 'bg-[var(--surface)] text-[var(--fg-muted)] border-[var(--line)] hover:text-[var(--fg)] hover:border-[var(--line-strong)]'
                    }`}
                  >
                    {v.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-end shrink-0">
            <p className="text-fs-xs font-semibold text-[var(--fg-subtle)] mb-[var(--s-2)]">
              {t('sellingPriceLabel') || 'Prix de vente'}
            </p>
            <p className="text-fs-lg font-semibold leading-none tabular-nums text-[var(--fg)]">
              {money(summary.displayPrice)}
            </p>
          </div>
        </div>
      )}

      <div className="grid items-center gap-6 sm:grid-cols-[minmax(140px,190px)_minmax(0,1fr)]">
        <button type="button" onClick={() => setShowCostPctBreakdown(true)} title={t('viewCostPctBreakdown')}
          className="flex min-w-0 flex-col items-center gap-3 rounded-r-md p-2 text-center">
          <span className="text-fs-sm font-semibold text-[var(--fg)]">{t('costPercent')}</span>
          <span className="relative flex h-40 w-40 items-center justify-center">
            <svg viewBox="0 0 180 180" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
              <circle cx="90" cy="90" r="78" fill="none" stroke="var(--surface-3)" strokeWidth="10" />
              <circle cx="90" cy="90" r="78" fill="none" stroke={over ? 'var(--warning-500)' : 'var(--success-500)'} strokeWidth="10"
                strokeDasharray={`${Math.max(0, Math.min(1, summary.costPct)) * 490.09} 490.09`} />
            </svg>
            <span className="text-[32px] font-semibold tabular-nums text-[var(--fg)]" dir="ltr">{summary.displayPrice > 0 ? `${(summary.costPct * 100).toFixed(1)}%` : '—'}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-fs-xs text-[var(--fg-muted)]">{over && <AlertCircle aria-hidden className="h-4 w-4 text-[var(--warning-500)]" />}{over ? t('aboveTarget') : t('target')} {Math.round(COST_THRESHOLD * 100)}%</span>
        </button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] py-5">
            <span className="text-fs-sm text-[var(--fg-muted)]">{t('sellingPriceLabel')} · {showCostsExVat ? t('exVat') : t('incVat')}</span>
            <bdi className="text-fs-xl font-semibold tabular-nums">{money(summary.displayPrice)}</bdi>
          </div>
          <button type="button" onClick={() => setSelectedKpi('item-food-cost')} title={t('viewCalculationDetails')}
            className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] py-5 text-start hover:bg-[var(--surface-2)]">
            <span className="text-fs-sm text-[var(--fg-muted)]">{t('foodCostLabel')}</span>
            <bdi className="text-fs-xl font-semibold tabular-nums">{money(summary.foodCost)}</bdi>
          </button>
          <button type="button" onClick={() => setSelectedKpi('item-margin')} title={t('viewCalculationDetails')}
            className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] py-5 text-start hover:bg-[var(--surface-2)]">
            <span className="text-fs-sm text-[var(--fg-muted)]">{t('grossProfit')}</span>
            <bdi className="text-fs-xl font-semibold tabular-nums text-[var(--fg)]">{money(summary.margin)}</bdi>
          </button>
          <p className="pt-4 text-fs-xs leading-relaxed text-[var(--fg-muted)]">{t('foodCostMarginScope')}</p>
        </div>
      </div>
      </>
      )}

      </section>

      <div hidden={collapsed}>
      {/* Ingredient breakdown — own card, tokenized */}
      <section className="bg-[var(--surface)] rounded-r-lg border border-[var(--line)] p-[var(--s-5)]">
        <h4 className="text-fs-md font-semibold text-[var(--fg)] mb-[var(--s-4)]">
          {t('costDetailsByIngredient') || 'Détail des coûts par ingrédient'} · {summary.lines.length}{' '}
          {t('ingredients')}
        </h4>

        <div className="rounded-r-md border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
          {/* Column headers — desktop only; mobile rows show inline labels per cell */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-[var(--fg-muted)] bg-[var(--surface-2)] border-b border-[var(--line)]">
            <div className="col-span-5">{t('ingredient') || 'Ingrédient'}</div>
            <div className="col-span-2 text-end">{t('quantity') || 'Quantité'}</div>
            <div className="col-span-2 text-end">{t('unitCost') || 'Prix unitaire'}</div>
            <div className="col-span-2 text-end">{t('totalCost') || 'Coût total'}</div>
            <div className="col-span-1 text-end">%</div>
          </div>

          {summary.lines.map((line, i) => {
            const pct =
              summary.foodCost > 0
                ? Math.round((line.lineCost / summary.foodCost) * 100)
                : 0;
            const unitCostStr = line.unitCost
              ? `${money(line.unitCost)}${line.sourceUnit ? `/${line.sourceUnit}` : ''}`
              : '\u2014';
            const ing = line.ingredient;
            const stockId = ing.stock_item?.id ?? null;
            const prepId = ing.prep_item?.id ?? null;
            const goToSource = () => {
              if (prepId) (onNavigate ?? router.push)(`/${rid}/kitchen/prep?edit=${prepId}`);
              else if (stockId) (onNavigate ?? router.push)(`/${rid}/kitchen/stock?edit=${stockId}`);
            };
            // Resolve a custom-unit quantity ("1 Unité") to its base-unit
            // equivalent ("= 0.35 kg") so the breakdown row spells out the
            // portion size the cost is actually computed from.
            const customFactor = customUnitFactor(line.qtyUnit, ing.stock_item?.unit_conversions);
            const quantityHint = customFactor != null && line.sourceUnit
              ? `= ${+(line.qty * customFactor).toFixed(4)} ${line.sourceUnit}`
              : undefined;
            return (
              <CostIngredientRow
                key={i}
                name={line.name}
                type={line.isPrep ? 'preparation' : 'brut'}
                quantity={`${line.qty ?? 0} ${line.qtyUnit ?? ''}`.trim()}
                quantityHint={quantityHint}
                unitCost={unitCostStr}
                totalCost={money(line.lineCost)}
                percentage={`${pct}%`}
                quantityLabel={t('quantity') || 'Quantité'}
                unitCostLabel={t('unitCost') || 'Prix unitaire'}
                totalCostLabel={t('totalCost') || 'Coût total'}
                onNameClick={goToSource}
                onPriceClick={line.isPrep ? () => setBreakdownIng({...ing,quantity_needed:line.qty,unit:line.qtyUnit}) : undefined}
                priceActionLabel={`${t('viewCalculationDetails')} — ${line.name}`}
              />
            );
          })}

          {summary.lines.length === 0 && (
            <p className="text-sm text-[var(--fg-muted)] py-6 text-center">
              {t('noIngredientCosts') || 'Ajoutez des ingrédients pour voir le détail des coûts.'}
            </p>
          )}

          {summary.lines.length > 0 && (
            <div className="border-t border-[var(--line)] bg-[var(--surface-2)]/30">
              {/* Total — flex row on mobile (label · value · pct), 12-col grid on desktop */}
              <div className="flex items-center justify-between gap-3 md:grid md:grid-cols-12 md:gap-4 px-4 py-2 font-semibold">
                <div className="md:col-span-5 text-[var(--fg)]">
                  {t('total') || 'Total'}
                </div>
                <div className="hidden md:block md:col-span-2" />
                <div className="hidden md:block md:col-span-2" />
                <div className="md:col-span-2 text-end text-[var(--fg)] tabular-nums">
                  {money(summary.foodCost)}
                </div>
                <div className="md:col-span-1 text-end text-[var(--brand-ink)]">100%</div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* The same simulator remains available on touch layouts. */}
      <div>
        <WhatIfSimulator
          key={`${item.id}|${variantId}|${vatDisplayMode}`}
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
          onStateChange={onSimulationState}
          t={t}
        />
      </div>
      </div>

      {/* Modals */}
      <ConfirmDialog open={pendingView !== null} onOpenChange={open => { if (!open) setPendingView(null); }} title={t('discardUnsavedChanges')} description={t('simulatorDiscardHint')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => {
        if (pendingView?.kind === 'variant') setVariantId(pendingView.value);
        else if (pendingView) toggleVatDisplay();
        setPendingView(null);
      }}/>

      <KPIInfoModal
        kpiInfo={selectedKpi ? KPI_INFO[selectedKpi] ?? null : null}
        onClose={() => setSelectedKpi(null)}
      />
      {breakdownIng && (
        <PrepCostBreakdownModal
          ing={breakdownIng}
          item={item}
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
  quantityHint,
  unitCost,
  totalCost,
  percentage,
  quantityLabel,
  unitCostLabel,
  totalCostLabel,
  priceActionLabel,
  onNameClick,
  onPriceClick,
}: {
  name: string;
  type: 'preparation' | 'brut';
  quantity: string;
  /** Optional secondary line under the quantity, e.g. "= 0.35 kg" when the
   *  ingredient uses a custom unit and the row's cost is computed against the
   *  resolved base amount. */
  quantityHint?: string;
  unitCost: string;
  totalCost: string;
  percentage: string;
  quantityLabel: string;
  unitCostLabel: string;
  totalCostLabel: string;
  priceActionLabel: string;
  onNameClick: () => void;
  onPriceClick?: () => void;
}) {
  // Mobile: stacked card with name + percentage badge as the heading row, then
  // label/value rows for quantity / unit cost / total. Desktop: 12-col grid.
  return (
    <div className="flex flex-col gap-2 md:grid md:grid-cols-12 md:gap-4 md:items-center px-4 py-3 border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface-2)]/50 transition-colors">
      {/* Heading row on mobile: name + pct on the right; just name on desktop */}
      <div className="flex items-center justify-between gap-3 md:contents">
        <button
          type="button"
          onClick={onNameClick}
          className="md:col-span-5 flex items-center gap-2 min-w-0 text-start hover:text-[var(--brand-ink)] transition-colors"
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
          <span className="text-sm font-medium text-[var(--fg)] truncate underline-offset-2 hover:underline">
            {name}
          </span>
        </button>
        <span className="md:hidden text-sm font-semibold text-[var(--brand-ink)] shrink-0 tabular-nums">
          {percentage}
        </span>
      </div>

      {/* Quantity */}
      <div className="flex items-center justify-between gap-3 md:flex md:flex-col md:items-end md:col-span-2 md:text-end text-sm text-[var(--fg-muted)]">
        <span className="md:hidden text-fs-xs font-semibold tracking-wider text-[var(--fg-muted)]">
          {quantityLabel}
        </span>
        <div className="flex flex-col items-end">
          <span className="tabular-nums text-end">{quantity}</span>
          {quantityHint && (
            <span className="text-fs-xs tabular-nums text-[var(--fg-subtle)]" title={quantityHint}>
              {quantityHint}
            </span>
          )}
        </div>
      </div>

      {/* Unit cost */}
      <div className="flex items-center justify-between gap-3 md:block md:col-span-2 md:text-end text-sm text-[var(--fg-muted)]">
        <span className="md:hidden text-fs-xs font-semibold tracking-wider text-[var(--fg-muted)]">
          {unitCostLabel}
        </span>
        <span className="tabular-nums text-end">{unitCost}</span>
      </div>

      {/* Total cost */}
      {onPriceClick ? (
        <button
          type="button"
          onClick={onPriceClick}
          className="flex items-center justify-between gap-3 md:block md:col-span-2 md:text-end text-sm font-semibold text-[var(--fg)] hover:text-[var(--brand-ink)] underline-offset-2 hover:underline transition-colors"
          aria-label={priceActionLabel} title={priceActionLabel}
        >
          <span className="md:hidden text-fs-xs font-semibold tracking-wider text-[var(--fg-muted)]">
            {totalCostLabel}
          </span>
          <span className="tabular-nums text-end">{totalCost}</span>
        </button>
      ) : (
        <div className="flex items-center justify-between gap-3 md:block md:col-span-2 md:text-end text-sm font-semibold text-[var(--fg)]">
          <span className="md:hidden text-fs-xs font-semibold tracking-wider text-[var(--fg-muted)]">
            {totalCostLabel}
          </span>
          <span className="tabular-nums text-end">{totalCost}</span>
        </div>
      )}

      {/* Percentage — visible only on desktop (mobile shows it in the heading row) */}
      <div className="hidden md:block md:col-span-1 text-sm font-semibold text-[var(--brand-ink)] text-end">
        {percentage}
      </div>
    </div>
  );
}

