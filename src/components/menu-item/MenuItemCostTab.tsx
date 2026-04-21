'use client';

import { useMemo, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  BeakerIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import type {
  MenuItem, MenuItemIngredient, PrepItem, StockItem, ItemOptionOverride,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { COST_THRESHOLD, computeItemCostSummary, ItemCostSummary } from '@/lib/cost-utils';
import { SectionCard, Field, FormInput } from './MenuItemForm';

// Swatch palette used for the donut chart and matching dots in the ingredient
// breakdown table. Rotated per ingredient.
const SWATCH = ['#f54900', '#05df72', '#3b82f6', '#8e51ff', '#f59e0b', '#ec4899'];
const CURRENCY = '\u20AA';

type ColoredLine = ItemCostSummary['lines'][number] & {
  color: string;
  contributionPct: number;
};

interface Props {
  rid: number;
  item: MenuItem;
  ingredients: MenuItemIngredient[];
  prepItems: PrepItem[];
  stockItems?: StockItem[];
  vatRate: number;
  itemOptionOverrides?: ItemOptionOverride[];
  onGoToRecipe?: () => void;
}

// Figma-aligned Cost tab for the menu item edit page.
// File bpnbCfGmcUAW25nYHli2Lf, node 2:239. Dark-only palette — see MenuItemShell
// for the rationale (no theme tokens; colors are hardcoded to the mockup).
export default function MenuItemCostTab({
  item, ingredients, vatRate, itemOptionOverrides, onGoToRecipe,
}: Props) {
  const { t } = useI18n();

  const summary: ItemCostSummary = useMemo(
    () => computeItemCostSummary({
      item,
      ingredients,
      overrides: itemOptionOverrides ?? [],
      vatRate,
      showCostsExVat: true,
    }),
    [item, ingredients, itemOptionOverrides, vatRate],
  );

  // Color-coded line details — same order as the ingredient table. The dot
  // next to each name in the table reuses this color so legend and rows stay
  // visually linked with the donut.
  const coloredLines: ColoredLine[] = summary.lines.map((l, i) => ({
    ...l,
    color: SWATCH[i % SWATCH.length],
    contributionPct: summary.foodCost > 0 ? l.lineCost / summary.foodCost : 0,
  }));

  const overThreshold = summary.costPct > COST_THRESHOLD;
  const thresholdPct = Math.round(COST_THRESHOLD * 100);

  return (
    <div className="space-y-4">
      <OverviewSection
        summary={summary}
        coloredLines={coloredLines}
        t={t}
      />

      <SimulatorSection
        summary={summary}
        thresholdPct={thresholdPct}
        t={t}
      />

      <IngredientBreakdownSection
        coloredLines={coloredLines}
        foodCost={summary.foodCost}
        hasIngredients={summary.hasIngredients}
        onGoToRecipe={onGoToRecipe}
        t={t}
      />

      {overThreshold && summary.hasIngredients && (
        <SuggestionsSection
          item={item}
          summary={summary}
          coloredLines={coloredLines}
          thresholdPct={thresholdPct}
          t={t}
        />
      )}
    </div>
  );
}

// ── Section 1: Cost overview ────────────────────────────────────────────────
// KPI row (food cost, margin, cost%), plus donut + historical trend placeholder.

type TFn = (key: string) => string;

function OverviewSection({
  summary, coloredLines, t,
}: {
  summary: ItemCostSummary;
  coloredLines: ColoredLine[];
  t: TFn;
}) {
  const thresholdPct = Math.round(COST_THRESHOLD * 100);
  const marginPct = summary.displayPrice > 0
    ? (summary.margin / summary.displayPrice) * 100
    : 0;
  const overThreshold = summary.costPct > COST_THRESHOLD;

  return (
    <SectionCard
      title={t('tabCost')}
      headerRight={
        <div className="flex items-center gap-3">
          {overThreshold && <ExclamationTriangleIcon className="w-5 h-5 text-[#f54900]" />}
          <button
            type="button"
            className="h-9 px-4 inline-flex items-center gap-2 rounded-[8px] bg-[#27272a] hover:bg-[#3f3f46] text-[#fafafa] text-[14px] leading-[20px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled
            title={t('historicalComingSoon')}
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            {t('exportCost')}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          tone="neutral"
          label={t('foodCostLabel')}
          icon={<CurrencyDollarIcon className="w-4 h-4" />}
          value={`${summary.foodCost.toFixed(2)} ${CURRENCY}`}
          valueClass="text-[#fafafa]"
          barColor="#f54900"
          barPct={Math.min(100, summary.costPct * 100)}
          caption={t('costEvolutionPending')}
        />
        <KpiCard
          tone="positive"
          label={t('grossProfit')}
          icon={<ArrowTrendingUpIcon className="w-4 h-4" />}
          value={`${summary.margin.toFixed(2)} ${CURRENCY}`}
          valueClass="text-[#05df72]"
          barColor="#05df72"
          barPct={Math.max(0, Math.min(100, marginPct))}
          caption={summary.displayPrice > 0
            ? `${marginPct.toFixed(1)}% ${t('ofSellingPrice')}`
            : '—'}
        />
        <CostPctCard
          costPct={summary.costPct}
          thresholdPct={thresholdPct}
          t={t}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#0f0f12] p-5">
          <p className="text-[14px] leading-[20px] text-[#fafafa] mb-4">{t('costDistribution')}</p>
          <DistributionChart lines={coloredLines} t={t} />
        </div>
        <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#0f0f12] p-5">
          <p className="text-[14px] leading-[20px] text-[#fafafa] mb-4">{t('costEvolution6m')}</p>
          <TrendPlaceholder message={t('historicalComingSoon')} />
        </div>
      </div>
    </SectionCard>
  );
}

function KpiCard({
  tone, label, icon, value, valueClass, barColor, barPct, caption,
}: {
  tone: 'neutral' | 'positive' | 'warning';
  label: string;
  icon: React.ReactNode;
  value: string;
  valueClass: string;
  barColor: string;
  barPct: number;
  caption: string;
}) {
  const iconBg = tone === 'positive'
    ? 'bg-[rgba(5,223,114,0.12)] text-[#05df72]'
    : tone === 'warning'
      ? 'bg-[rgba(245,73,0,0.12)] text-[#f54900]'
      : 'bg-[#27272a] text-[#9f9fa9]';
  return (
    <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#0f0f12] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] leading-[16px] tracking-[0.6px] uppercase text-[#9f9fa9]">
          {label}
        </span>
        <span className={`w-7 h-7 rounded-md inline-flex items-center justify-center ${iconBg}`}>
          {icon}
        </span>
      </div>
      <p className={`text-[28px] leading-[36px] font-semibold ${valueClass}`}>{value}</p>
      <p className="text-[12px] leading-[16px] text-[#9f9fa9]">{caption}</p>
      <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(100, barPct))}%`, background: barColor }}
        />
      </div>
    </div>
  );
}

function CostPctCard({
  costPct, thresholdPct, t,
}: {
  costPct: number;
  thresholdPct: number;
  t: TFn;
}) {
  const pct = Math.max(0, Math.min(100, costPct * 100));
  const over = costPct > thresholdPct / 100;
  // The position of the "you are here" marker, relative to 0-100%.
  const markerPct = pct;
  return (
    <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#0f0f12] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] leading-[16px] tracking-[0.6px] uppercase text-[#9f9fa9]">
          {t('costPercent')}
        </span>
        <span className={`w-7 h-7 rounded-md inline-flex items-center justify-center ${
          over ? 'bg-[rgba(245,73,0,0.12)] text-[#f54900]' : 'bg-[rgba(5,223,114,0.12)] text-[#05df72]'
        }`}>
          <ExclamationTriangleIcon className="w-4 h-4" />
        </span>
      </div>
      <p className={`text-[28px] leading-[36px] font-semibold ${over ? 'text-[#f54900]' : 'text-[#fafafa]'}`}>
        {pct.toFixed(1)}%
      </p>
      <p className="text-[12px] leading-[16px] text-[#9f9fa9]">
        {t('objectiveLt').replace('{pct}', String(thresholdPct))}
      </p>
      <div className="relative">
        <div
          className="h-1.5 rounded-full"
          style={{
            background:
              `linear-gradient(to right, #05df72 0%, #05df72 ${thresholdPct}%, #f59e0b ${thresholdPct}%, #f59e0b ${Math.min(100, thresholdPct + 20)}%, #f54900 ${Math.min(100, thresholdPct + 20)}%, #f54900 100%)`,
          }}
        />
        {markerPct > 0 && (
          <div
            className="absolute -top-0.5 w-0.5 h-2.5 bg-[#fafafa] rounded-full"
            style={{ left: `calc(${markerPct}% - 1px)` }}
          />
        )}
        <div className="flex justify-between text-[10px] leading-[14px] text-[#9f9fa9] mt-1.5 font-mono">
          <span>0%</span>
          <span style={{ marginLeft: `${thresholdPct - 5}%` }}>{thresholdPct}%</span>
          <span className={over ? 'text-[#f54900]' : ''}>{pct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

// Donut + legend. Rendered in SVG (no chart library in the project).
function DistributionChart({
  lines, t,
}: {
  lines: ColoredLine[];
  t: TFn;
}) {
  const nonZero = lines.filter((l) => l.lineCost > 0);
  if (nonZero.length === 0) {
    return (
      <div className="h-[180px] flex items-center justify-center text-[#9f9fa9] text-[13px]">
        —
      </div>
    );
  }
  // Arc math: a full donut spans 2π. Each segment occupies (contributionPct)
  // of that. We draw with stroke-dasharray on a circle so no path maths.
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg
        width={160}
        height={160}
        viewBox="0 0 160 160"
        className="shrink-0"
        aria-hidden
      >
        <circle cx={80} cy={80} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={18} />
        {nonZero.map((l) => {
          const dash = circumference * l.contributionPct;
          const el = (
            <circle
              key={l.ingredient.id}
              cx={80} cy={80} r={radius}
              fill="none"
              stroke={l.color}
              strokeWidth={18}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <ul className="flex-1 min-w-0 space-y-3">
        {nonZero.map((l) => (
          <li key={l.ingredient.id} className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0"
                style={{ background: l.color }}
              />
              <div className="min-w-0">
                <p className="text-[13px] leading-[18px] text-[#fafafa] truncate" title={l.name}>{l.name}</p>
                <p className="text-[11px] leading-[14px] text-[#9f9fa9]">
                  {(l.contributionPct * 100).toFixed(1)}% {t('ofTotalCost')}
                </p>
              </div>
            </div>
            <span className="text-[13px] leading-[18px] text-[#fafafa] font-mono whitespace-nowrap">
              {l.lineCost.toFixed(2)} {CURRENCY}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Placeholder for the 6-month cost trend. Real data requires a backend
// endpoint (price_history or aggregated stock cost snapshots) — not yet
// implemented. The decorative sparkline keeps the layout parity with Figma
// but the caption signals that the numbers aren't live.
function TrendPlaceholder({ message }: { message: string }) {
  return (
    <div className="h-[180px] flex flex-col">
      <svg viewBox="0 0 320 140" className="w-full h-[130px]" aria-hidden>
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f54900" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f54900" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid */}
        {[28, 70, 112].map((y) => (
          <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
        ))}
        {/* Flat placeholder line */}
        <path d="M0 90 L64 80 L128 74 L192 60 L256 52 L320 44" fill="none" stroke="#f54900" strokeWidth="2" />
        <path d="M0 90 L64 80 L128 74 L192 60 L256 52 L320 44 L320 140 L0 140 Z" fill="url(#trend-fill)" />
      </svg>
      <p className="text-[11px] leading-[14px] text-[#9f9fa9] text-center">{message}</p>
    </div>
  );
}

// ── Section 2: What-if simulator ────────────────────────────────────────────

function SimulatorSection({
  summary, thresholdPct, t,
}: {
  summary: ItemCostSummary;
  thresholdPct: number;
  t: TFn;
}) {
  const [simPrice, setSimPrice] = useState<number | null>(null);
  const [simPortionReductionPct, setSimPortionReductionPct] = useState<number>(0);

  const activePrice = simPrice ?? summary.displayPrice;
  const simCost = summary.foodCost * (1 - simPortionReductionPct / 100);
  const simCostPct = activePrice > 0 ? simCost / activePrice : 0;
  const simMargin = activePrice - simCost;
  const currentCostPctPts = summary.costPct * 100;
  const simCostPctPts = simCostPct * 100;
  const deltaPts = simCostPctPts - currentCostPctPts;
  const simHitsGoal = simCostPct <= thresholdPct / 100;

  const recommendation = useMemo(() => {
    if (!summary.hasIngredients || summary.costPct <= COST_THRESHOLD) return null;
    const targetPrice = summary.foodCost / (thresholdPct / 100);
    const newMargin = targetPrice - summary.foodCost;
    return {
      suggestedPrice: targetPrice,
      suggestedPortionReductionPct: 10,
      projectedMargin: newMargin,
    };
  }, [summary, thresholdPct]);

  return (
    <SectionCard
      title={t('whatIfSimulatorTitle')}
      headerRight={
        <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-full bg-[rgba(142,81,255,0.12)] text-[#8e51ff] text-[12px] leading-[16px]">
          <BeakerIcon className="w-3.5 h-3.5" />
          {t('experimental')}
        </span>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label={t('simulatedSellingPrice')}>
          <div className="relative">
            <FormInput
              type="number"
              min="0"
              step="0.01"
              value={simPrice ?? summary.displayPrice.toFixed(2)}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setSimPrice(Number.isFinite(v) && v >= 0 ? v : 0);
              }}
              className="pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] leading-[20px] text-[#9f9fa9] pointer-events-none">
              {CURRENCY}
            </span>
          </div>
        </Field>
        <Field label={t('portionReductionPct')}>
          <div className="relative">
            <FormInput
              type="number"
              min="0"
              max="50"
              step="1"
              value={simPortionReductionPct}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setSimPortionReductionPct(Number.isFinite(v) && v >= 0 ? Math.min(50, v) : 0);
              }}
              className="pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] leading-[20px] text-[#9f9fa9] pointer-events-none">
              %
            </span>
          </div>
        </Field>
        <Field label={t('simulatedResult')}>
          <div className={`h-9 rounded-[6px] px-3 inline-flex items-center gap-2 text-[14px] leading-[20px] ${
            simHitsGoal
              ? 'bg-[rgba(5,223,114,0.12)] text-[#05df72]'
              : 'bg-[rgba(245,73,0,0.12)] text-[#f54900]'
          }`}>
            {simHitsGoal
              ? <CheckCircleIcon className="w-4 h-4" />
              : <ExclamationTriangleIcon className="w-4 h-4" />}
            <span className="font-semibold">{simCostPctPts.toFixed(1)}%</span>
            <span className="text-[12px] opacity-80">
              ({deltaPts >= 0 ? '+' : ''}{deltaPts.toFixed(1)} {t('pts')})
            </span>
          </div>
        </Field>
      </div>

      {recommendation && (
        <div className="flex items-start gap-3 rounded-[10px] border border-[rgba(5,223,114,0.25)] bg-[rgba(5,223,114,0.06)] p-4">
          <span className="w-8 h-8 rounded-md inline-flex items-center justify-center bg-[rgba(5,223,114,0.12)] text-[#05df72] shrink-0">
            <LightBulbIcon className="w-4 h-4" />
          </span>
          <div className="min-w-0 text-[13px] leading-[20px]">
            <p className="text-[#fafafa]">
              <span className="font-semibold">{t('recommendationLabel')}:</span>{' '}
              {t('recommendationBody')
                .replace('{price}', recommendation.suggestedPrice.toFixed(2))
                .replace('{portionPct}', String(recommendation.suggestedPortionReductionPct))
                .replace('{thresholdPct}', String(thresholdPct))}
            </p>
            <p className="text-[#9f9fa9] mt-1">
              <span className="font-semibold">{t('estimatedImpact')}:</span>{' '}
              {t('recommendationImpact')
                .replace('{currentMargin}', summary.margin.toFixed(2))
                .replace('{projectedMargin}', recommendation.projectedMargin.toFixed(2))}
            </p>
          </div>
        </div>
      )}

      {/* Compact live summary of the simulated margin, so the user can gauge
          the dollar impact of their knobs without leaving the panel. */}
      <div className="flex items-center justify-end gap-6 text-[12px] leading-[16px] text-[#9f9fa9]">
        <span>
          {t('simulatedFoodCost')}: <span className="text-[#fafafa] font-mono">{simCost.toFixed(2)} {CURRENCY}</span>
        </span>
        <span>
          {t('grossProfit')}: <span className={`font-mono ${simMargin >= 0 ? 'text-[#05df72]' : 'text-[#f54900]'}`}>{simMargin.toFixed(2)} {CURRENCY}</span>
        </span>
      </div>
    </SectionCard>
  );
}

// ── Section 3: Ingredient breakdown table ───────────────────────────────────

function IngredientBreakdownSection({
  coloredLines, foodCost, hasIngredients, onGoToRecipe, t,
}: {
  coloredLines: ColoredLine[];
  foodCost: number;
  hasIngredients: boolean;
  onGoToRecipe?: () => void;
  t: TFn;
}) {
  return (
    <SectionCard title={t('costDetailsByIngredient')}>
      {!hasIngredients || coloredLines.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <p className="text-[14px] text-[#9f9fa9]">{t('noIngredientsLinked')}</p>
          {onGoToRecipe && (
            <button
              type="button"
              onClick={onGoToRecipe}
              className="text-[14px] text-[#f54900] hover:text-[#e04300] transition-colors"
            >
              {t('addIngredients')} &rarr;
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-[25px]">
          <table className="w-full text-[13px] min-w-[560px]">
            <thead>
              <tr className="text-left text-[11px] leading-[16px] tracking-[0.6px] text-[#9f9fa9] uppercase">
                <th className="py-3 px-4 font-medium first:pl-[25px]">{t('ingredient')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('quantityLabel')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('unitCost')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('totalCostLabel')}</th>
                <th className="py-3 px-4 font-medium text-right last:pr-[25px]">{t('percentOfTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {coloredLines.map((l) => (
                <tr key={l.ingredient.id} className="border-t border-[rgba(255,255,255,0.06)]">
                  <td className="py-3 px-4 first:pl-[25px]">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: l.color }}
                      />
                      <span className="text-[#fafafa] truncate">{l.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[#fafafa]">
                    {Number(l.qty.toFixed(3))} <span className="text-[#9f9fa9]">{l.qtyUnit}</span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[#9f9fa9]">
                    {l.unitCost.toFixed(2)} {CURRENCY}/{l.sourceUnit}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[#fafafa]">
                    {l.lineCost.toFixed(2)} {CURRENCY}
                  </td>
                  <td className={`py-3 px-4 text-right font-mono last:pr-[25px] ${
                    l.contributionPct >= 0.5 ? 'text-[#f54900]' : 'text-[#fafafa]'
                  }`}>
                    {(l.contributionPct * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
              <tr className="border-t border-[rgba(255,255,255,0.1)]">
                <td colSpan={3} className="py-3 px-4 first:pl-[25px] text-[#fafafa] font-semibold">
                  {t('totalLabel')}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-[#fafafa]">
                  {foodCost.toFixed(2)} {CURRENCY}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-[#fafafa] last:pr-[25px]">
                  100%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

// ── Section 4: Optimization suggestions ─────────────────────────────────────

type Suggestion = {
  key: string;
  tone: 'positive' | 'warning' | 'neutral';
  icon: React.ReactNode;
  title: string;
  description: string;
  impact: string;
  impactTone: 'positive' | 'warning' | 'neutral';
};

function SuggestionsSection({
  item, summary, coloredLines, thresholdPct, t,
}: {
  item: MenuItem;
  summary: ItemCostSummary;
  coloredLines: ColoredLine[];
  thresholdPct: number;
  t: TFn;
}) {
  const suggestions: Suggestion[] = [];

  // Suggestion 1 — reduce the main portion by 10% (only meaningful when the
  // item has a measurable portion_size).
  if ((item.portion_size ?? 0) > 0) {
    const unit = item.portion_size_unit || '';
    const from = item.portion_size!;
    const to = from * 0.9;
    const newCost = summary.foodCost * 0.9;
    const saving = summary.foodCost - newCost;
    const newCostPct = summary.displayPrice > 0 ? (newCost / summary.displayPrice) * 100 : 0;
    suggestions.push({
      key: 'reduce-portion',
      tone: 'warning',
      icon: <ArrowTrendingDownIcon className="w-4 h-4" />,
      title: t('suggestReducePortion'),
      description: t('suggestReducePortionBody')
        .replace('{from}', Number(from.toFixed(2)).toString())
        .replace('{to}', Number(to.toFixed(2)).toString())
        .replace('{unit}', unit)
        .replace('{cost}', newCost.toFixed(2))
        .replace('{pct}', newCostPct.toFixed(1)),
      impact: `-${saving.toFixed(2)} ${CURRENCY}`,
      impactTone: 'positive',
    });
  }

  // Suggestion 2 — raise the selling price to hit the target ratio.
  if (summary.displayPrice > 0) {
    const targetPrice = summary.foodCost / (thresholdPct / 100);
    if (targetPrice > summary.displayPrice) {
      const pctIncrease = ((targetPrice - summary.displayPrice) / summary.displayPrice) * 100;
      suggestions.push({
        key: 'raise-price',
        tone: 'positive',
        icon: <CurrencyDollarIcon className="w-4 h-4" />,
        title: t('suggestRaisePrice').replace('{price}', targetPrice.toFixed(2)),
        description: t('suggestRaisePriceBody')
          .replace('{pctIncrease}', pctIncrease.toFixed(0))
          .replace('{thresholdPct}', String(thresholdPct)),
        impact: t('objectiveReached'),
        impactTone: 'positive',
      });
    }
  }

  // Suggestion 3 — negotiate the biggest contributor. We take the top
  // ingredient by line cost (excluding top-one to keep the suggestion focused
  // on a concrete supplier change).
  const top = [...coloredLines].sort((a, b) => b.lineCost - a.lineCost)[0];
  if (top && top.lineCost > 0) {
    const savingPerUnit = top.lineCost * 0.2; // 20% savings assumption
    suggestions.push({
      key: 'negotiate',
      tone: 'neutral',
      icon: <ArrowPathIcon className="w-4 h-4" />,
      title: t('suggestNegotiate').replace('{name}', top.name),
      description: t('suggestNegotiateBody')
        .replace('{name}', top.name)
        .replace('{pct}', (top.contributionPct * 100).toFixed(1))
        .replace('{saving}', savingPerUnit.toFixed(2)),
      impact: `-${savingPerUnit.toFixed(2)} ${CURRENCY}`,
      impactTone: 'positive',
    });
  }

  if (suggestions.length === 0) return null;

  return (
    <SectionCard
      title={t('optimizationSuggestions')}
      headerRight={
        <span className="w-7 h-7 rounded-md inline-flex items-center justify-center bg-[rgba(245,191,0,0.12)] text-[#f59e0b]">
          <LightBulbIcon className="w-4 h-4" />
        </span>
      }
    >
      <ul className="flex flex-col gap-3">
        {suggestions.map((s) => (
          <li
            key={s.key}
            className="flex items-start gap-3 rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#0f0f12] p-4"
          >
            <span className={`w-8 h-8 rounded-md inline-flex items-center justify-center shrink-0 ${
              s.tone === 'positive'
                ? 'bg-[rgba(5,223,114,0.12)] text-[#05df72]'
                : s.tone === 'warning'
                  ? 'bg-[rgba(245,73,0,0.12)] text-[#f54900]'
                  : 'bg-[rgba(142,81,255,0.12)] text-[#8e51ff]'
            }`}>
              {s.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] leading-[20px] text-[#fafafa]">{s.title}</p>
              <p className="text-[12px] leading-[16px] text-[#9f9fa9] mt-1">{s.description}</p>
            </div>
            <span className={`text-[14px] leading-[20px] font-semibold whitespace-nowrap ${
              s.impactTone === 'positive' ? 'text-[#05df72]' : 'text-[#fafafa]'
            }`}>
              {s.impact}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

