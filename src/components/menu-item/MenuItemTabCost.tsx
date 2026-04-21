'use client';

import { AlertCircle, FlaskConical, Package } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '@/lib/i18n';
import {
  COST_THRESHOLD,
  computeItemCostSummary,
} from '@/lib/cost-utils';
import type {
  MenuItem,
  MenuItemIngredient,
  ItemOptionOverride,
} from '@/lib/api';

// Figma MenuItemDetails.tsx:644-807 — Coût tab.
// Direct port with real cost data plugged in.

interface Props {
  item: MenuItem;
  ingredients: MenuItemIngredient[];
  itemOptionOverrides: ItemOptionOverride[];
  vatRate: number;
  price: number;
}

const CURRENCY = '\u20AA';

export default function MenuItemTabCost({
  item,
  ingredients,
  itemOptionOverrides,
  vatRate,
  price,
}: Props) {
  const { t } = useI18n();

  const summary = useMemo(
    () =>
      computeItemCostSummary({
        item,
        ingredients,
        overrides: itemOptionOverrides,
        vatRate,
        showCostsExVat: true,
      }),
    [item, ingredients, itemOptionOverrides, vatRate],
  );

  const over = summary.costPct > COST_THRESHOLD;
  const targetPriceForThreshold =
    summary.foodCost > 0 ? summary.foodCost / COST_THRESHOLD : 0;

  // Labor + overhead — Figma displays them as separate bars. We use prep time
  // at a fixed ~₪18.75/hour rate for labor, and 8% overhead on price.
  const laborMins = item.prep_time_mins ?? 0;
  const laborCost = (laborMins / 60) * 18.75;
  const overheadCost = price * 0.08;
  const totalCostWithLabor = summary.foodCost + laborCost + overheadCost;
  const breakdownTotal = Math.max(price, totalCostWithLabor + summary.margin);
  const pctOf = (v: number) =>
    breakdownTotal > 0 ? Math.round((v / breakdownTotal) * 100) : 0;

  // Suggestions
  const topLine = [...summary.lines].sort((a, b) => b.lineCost - a.lineCost)[0];
  const topPct = topLine
    ? summary.foodCost > 0
      ? Math.round((topLine.lineCost / summary.foodCost) * 100)
      : 0
    : 0;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-1 h-6 bg-orange-500 rounded-full" />
        <h3 className="text-xl font-bold text-neutral-900 dark:text-white">
          {t('tabCost')}
        </h3>
      </div>

      {/* 3 KPI cards — Figma:653-672 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-800 dark:to-neutral-900 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700">
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-2">
            {t('foodCostLabel')}
          </p>
          <p className="text-3xl font-bold text-neutral-900 dark:text-white">
            {summary.foodCost.toFixed(2)} {CURRENCY}
          </p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 rounded-xl p-6 border border-green-200 dark:border-green-700">
          <p className="text-sm text-green-700 dark:text-green-400 mb-2">
            {t('grossProfit')}
          </p>
          <p className="text-3xl font-bold text-green-900 dark:text-green-300">
            {summary.margin.toFixed(2)} {CURRENCY}
          </p>
        </div>
        <div
          className={`rounded-xl p-6 border ${
            over
              ? 'bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/30 dark:to-orange-800/30 border-orange-200 dark:border-orange-700'
              : 'bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/30 border-green-200 dark:border-green-700'
          }`}
        >
          <p
            className={`text-sm mb-2 ${
              over
                ? 'text-orange-700 dark:text-orange-400'
                : 'text-green-700 dark:text-green-400'
            }`}
          >
            {t('costPercent')}
          </p>
          <div className="flex items-center gap-2">
            <p
              className={`text-3xl font-bold ${
                over
                  ? 'text-orange-900 dark:text-orange-300'
                  : 'text-green-900 dark:text-green-300'
              }`}
            >
              {(summary.costPct * 100).toFixed(1)}%
            </p>
            {over && <AlertCircle size={24} className="text-orange-500" />}
          </div>
          {over && (
            <p className="text-sm text-orange-600 dark:text-orange-400 mt-2">
              {t('aboveTarget') || 'Au-dessus de la cible'} ({Math.round(COST_THRESHOLD * 100)}%)
            </p>
          )}
        </div>
      </div>

      {/* Détail des coûts par ingrédient — Figma:674-738 */}
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
            return (
              <CostIngredientItem
                key={i}
                name={line.name}
                type={line.isPrep ? 'preparation' : 'brut'}
                quantity={`${line.qty ?? 0} ${line.qtyUnit ?? ''}`.trim()}
                unitCost={unitCostStr}
                totalCost={`${line.lineCost.toFixed(2)} ${CURRENCY}`}
                percentage={`${pct}%`}
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

      {/* Répartition globale — Figma:741-749 */}
      <div className="bg-neutral-50 dark:bg-[#1a1a1a] rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 mb-8">
        <h4 className="font-semibold text-neutral-900 dark:text-white mb-4">
          {t('globalCostBreakdown') || 'Répartition globale des coûts'}
        </h4>
        <div className="space-y-3">
          <CostBreakdownItem
            label={`${t('foodCostLabel')} (${t('ingredients') || 'ingrédients'})`}
            amount={`${summary.foodCost.toFixed(2)} ${CURRENCY}`}
            percentage={pctOf(summary.foodCost)}
            color="bg-orange-500"
          />
          <CostBreakdownItem
            label={`${t('directLabor') || 'Main-d\'œuvre directe'} (${laborMins} min)`}
            amount={`${laborCost.toFixed(2)} ${CURRENCY}`}
            percentage={pctOf(laborCost)}
            color="bg-blue-500"
          />
          <CostBreakdownItem
            label={t('grossProfit')}
            amount={`${summary.margin.toFixed(2)} ${CURRENCY}`}
            percentage={pctOf(summary.margin)}
            color="bg-green-500"
          />
          <CostBreakdownItem
            label={t('overheadEstimate') || 'Frais généraux estimés'}
            amount={`${overheadCost.toFixed(2)} ${CURRENCY}`}
            percentage={pctOf(overheadCost)}
            color="bg-purple-500"
          />
        </div>
      </div>

      {/* Suggestions — Figma:751-762 */}
      {(over || topPct >= 30) && (
        <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-6 border border-orange-200 dark:border-orange-700">
          <h4 className="font-semibold text-orange-900 dark:text-orange-300 mb-3 flex items-center gap-2">
            <AlertCircle size={20} />
            {t('optimizationSuggestions') || 'Suggestions d\'optimisation'}
          </h4>
          <ul className="space-y-2 text-sm text-orange-800 dark:text-orange-400">
            {topLine && topPct >= 30 && (
              <li>
                • <strong>{topLine.name} ({topPct}%)</strong> —{' '}
                {t('reducePortionSuggestion') || 'Envisager de réduire la portion ou renégocier le coût de cet ingrédient'}
              </li>
            )}
            {over && targetPriceForThreshold > 0 && (
              <li>
                • <strong>{t('sellingPriceLabel')}</strong> —{' '}
                {t('raisePriceSuggestion') || 'Augmenter à'}{' '}
                <strong>
                  {targetPriceForThreshold.toFixed(2)} {CURRENCY}
                </strong>{' '}
                {t('toReachThreshold') || 'pour atteindre'} {Math.round(COST_THRESHOLD * 100)}%
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function CostIngredientItem({
  name,
  type,
  quantity,
  unitCost,
  totalCost,
  percentage,
}: {
  name: string;
  type: 'preparation' | 'brut';
  quantity: string;
  unitCost: string;
  totalCost: string;
  percentage: string;
}) {
  return (
    <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-white dark:bg-[#0a0a0a] rounded-lg border border-neutral-200 dark:border-neutral-700 hover:border-orange-500/50 transition-colors">
      <div className="col-span-5 flex items-center gap-2 min-w-0">
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
        <span className="text-sm font-medium text-neutral-900 dark:text-white truncate">
          {name}
        </span>
      </div>
      <div className="col-span-2 text-sm text-neutral-600 dark:text-neutral-400 text-right">
        {quantity}
      </div>
      <div className="col-span-2 text-sm text-neutral-600 dark:text-neutral-400 text-right">
        {unitCost}
      </div>
      <div className="col-span-2 text-sm font-semibold text-neutral-900 dark:text-white text-right">
        {totalCost}
      </div>
      <div className="col-span-1 text-sm font-semibold text-orange-500 text-right">
        {percentage}
      </div>
    </div>
  );
}

function CostBreakdownItem({
  label,
  amount,
  percentage,
  color,
}: {
  label: string;
  amount: string;
  percentage: number;
  color: string;
}) {
  const pct = Math.max(0, Math.min(100, percentage));
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-neutral-700 dark:text-neutral-300">{label}</span>
        <div className="flex items-center gap-4">
          <span className="text-sm font-semibold text-neutral-900 dark:text-white">
            {amount}
          </span>
          <span className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 w-12 text-right">
            {pct}%
          </span>
        </div>
      </div>
      <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
