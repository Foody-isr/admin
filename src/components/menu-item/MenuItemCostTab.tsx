'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  DownloadIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  BeakerIcon,
  CheckCircleIcon,
  DollarSignIcon,
  AlertTriangleIcon,
  LightbulbIcon,
  RefreshCwIcon,
} from 'lucide-react';
import type {
  MenuItem, MenuItemIngredient, PrepItem, StockItem, ItemOptionOverride,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { convertQuantity, sameUnitFamily } from '@/lib/units';
import { detectPrepSwaps } from '@/lib/prep-swap';
import PrepCostBreakdownModal from '@/components/food-cost/PrepCostBreakdownModal';
import CostPctBreakdownModal from '@/components/food-cost/CostPctBreakdownModal';
import {
  COST_THRESHOLD, VariantOption, PrepConfigIssue, ItemCostSummary,
  vatMultiplierFor, vatMultiplierForStock, costExVat,
  buildVariantOptions, resolvePortion, optionIdFromVariant,
  computePrepUnitCostExVat, computeItemCostSummary,
  scopedIngredients, diagnosePrep,
} from '@/lib/cost-utils';
import { SectionCard, Field, FormInput } from './MenuItemForm';

// Unit-family arrays used by the display-only hasUnitMismatch check below. The
// cost-math helpers in cost-utils own their own copy — this one stays here so
// the shared module is free of React/display concerns.
const PACKAGE_UNITS = ['unit', 'pack', 'box', 'bag', 'dose'];
const MEASURABLE_UNITS = ['g', 'kg', 'ml', 'l'];

// Swatch palette used for the donut chart and matching dots in the ingredient
// breakdown table. Rotated per ingredient.
const SWATCH = ['#f97316', '#05df72', '#3b82f6', '#8e51ff', '#f59e0b', '#ec4899'];
const CURRENCY = '\u20AA';

type ColoredLine = ItemCostSummary['lines'][number] & {
  color: string;
  contributionPct: number;
};

type TFn = (key: string) => string;

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
// Interactive behaviors preserved from the previous panel: variant selection,
// VAT toggle, simulate mode (per-stock-cost editing), prep cost breakdown
// modal, cost-% breakdown modal, swap-suggestion banner, config warnings,
// modifier consumption table, per-variant cost table.
export default function MenuItemCostTab({
  rid, item, ingredients, prepItems, stockItems, vatRate, itemOptionOverrides,
  onGoToRecipe,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();

  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [showCostsExVat, setShowCostsExVat] = useState(true);

  // Simulate mode (per-stock-cost editing). Affects the KPIs and ingredient
  // table live. The Figma "Simulateur" card is a separate, isolated scenario.
  const [simMode, setSimMode] = useState(false);
  const [simStockCosts, setSimStockCosts] = useState<Record<number, number>>({});

  const [breakdownIng, setBreakdownIng] = useState<MenuItemIngredient | null>(null);
  const [showCostPctBreakdown, setShowCostPctBreakdown] = useState(false);

  const restaurantMultiplier = vatMultiplierFor(vatRate);
  const allVariants: VariantOption[] = buildVariantOptions(item, itemOptionOverrides ?? []);
  const variantsWithPortion = allVariants.filter((v) => (v.portion_size ?? 0) > 0);
  const activeVariantId = selectedVariantId
    || (variantsWithPortion[0]?.id ?? '');

  // Switching variant loses sim edits — mirrors the UX decision from the old
  // panel. Keeps the simulator tied to one portion/price pair.
  useEffect(() => {
    if (simMode) setSimStockCosts({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVariantId]);

  // Sim-aware ingredient list. When simMode is off, returns the prop
  // unchanged. When on, wraps stock (or sub-stock on preps) with the user's
  // sim value and forces vat_rate_override=0 so the typed display-basis value
  // flows through calcLineCost unchanged.
  const effectiveIngredients = useMemo<MenuItemIngredient[]>(() => {
    if (!simMode) return ingredients;
    const wrapStock = (s: StockItem): StockItem => ({
      ...s,
      cost_per_unit: simStockCosts[s.id],
      vat_rate_override: 0,
    });
    return ingredients.map((ing) => {
      let stock = ing.stock_item;
      let prep = ing.prep_item;
      if (stock && simStockCosts[stock.id] != null) {
        stock = wrapStock(stock);
      }
      if (prep && !ing.stock_item) {
        const subHasOverride = (prep.ingredients ?? []).some(
          (pi) => pi.stock_item && simStockCosts[pi.stock_item.id] != null,
        );
        if (subHasOverride) {
          prep = {
            ...prep,
            ingredients: (prep.ingredients ?? []).map((pi) =>
              pi.stock_item && simStockCosts[pi.stock_item.id] != null
                ? { ...pi, stock_item: wrapStock(pi.stock_item) }
                : pi,
            ),
          };
        }
      }
      return { ...ing, stock_item: stock, prep_item: prep };
    });
  }, [simMode, ingredients, simStockCosts]);

  const summary: ItemCostSummary = useMemo(
    () => computeItemCostSummary({
      item,
      ingredients: effectiveIngredients,
      overrides: itemOptionOverrides ?? [],
      vatRate,
      showCostsExVat,
      variantId: activeVariantId || undefined,
    }),
    [item, effectiveIngredients, itemOptionOverrides, vatRate, showCostsExVat, activeVariantId],
  );

  // Color-coded line details — same order as the ingredient table. The dot
  // next to each name in the table reuses this color so legend and rows stay
  // visually linked with the donut.
  const coloredLines: ColoredLine[] = summary.lines.map((l, i) => ({
    ...l,
    color: SWATCH[i % SWATCH.length],
    contributionPct: summary.foodCost > 0 ? l.lineCost / summary.foodCost : 0,
  }));

  // Warnings (match old panel wording/behavior)
  const currentPortion = resolvePortion(item, allVariants, activeVariantId);
  const currentOptionId = optionIdFromVariant(activeVariantId);

  const hasMissingVariantPortion =
    ingredients.some((i) => i.scales_with_variant) && !currentPortion;

  const hasUnitFamilyMismatch = (() => {
    if ((item.recipe_yield ?? 0) > 0) return false;
    if (!ingredients.some((i) => i.scales_with_variant)) return false;
    if (!currentPortion) return false;
    const itemUnit = item.portion_size_unit || '';
    if ((item.portion_size ?? 0) <= 0) return false;
    return !sameUnitFamily(currentPortion.unit, itemUnit);
  })();

  const unconfiguredPreps: Array<{ prep: PrepItem; issue: PrepConfigIssue }> = [];
  {
    const seen = new Set<number>();
    for (const ing of scopedIngredients(ingredients, currentOptionId)) {
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

  // Swap suggestion — top candidate only, same heuristic as the old panel.
  const swap = detectPrepSwaps(ingredients, prepItems)[0];
  const rawIngredientCount = ingredients.filter((i) => i.stock_item_id).length;

  // Modifier consumption rows (only modifiers linked to a stock or prep item
  // consume inventory). Multi-pick is applied at order time; this shows the
  // per-selection cost.
  type ModCostRow = {
    id: number;
    name: string;
    setName: string;
    source: string;
    qty: number;
    unit: string;
    perSelectionCost: number;
  };
  const modCostRows: ModCostRow[] = [];
  const stockUnitCostDisplayed = (s: StockItem | null | undefined) => {
    const ex = costExVat(s ?? null);
    return showCostsExVat ? ex : ex * vatMultiplierForStock(s ?? null, vatRate);
  };
  const collectMod = (
    m: { id: number; name: string; stock_item_id?: number; prep_item_id?: number; quantity?: number; unit?: string },
    setName: string,
  ) => {
    const q = m.quantity ?? 0;
    if (q <= 0) return;
    if (!m.stock_item_id && !m.prep_item_id) return;
    if (m.stock_item_id) {
      const s = (stockItems ?? []).find((x) => x.id === m.stock_item_id);
      if (!s) return;
      const converted = convertQuantity(q, m.unit || s.unit, s.unit);
      modCostRows.push({
        id: m.id, name: m.name, setName,
        source: `${s.name} (stock)`, qty: q, unit: m.unit || s.unit,
        perSelectionCost: converted * stockUnitCostDisplayed(s),
      });
      return;
    }
    if (m.prep_item_id) {
      const p = (prepItems ?? []).find((x) => x.id === m.prep_item_id);
      if (!p) return;
      const prepExVat = computePrepUnitCostExVat(p);
      const baseCost = prepExVat != null ? prepExVat : (p.cost_per_unit ?? 0);
      const unitCost = showCostsExVat ? baseCost : baseCost * restaurantMultiplier;
      const converted = convertQuantity(q, m.unit || p.unit, p.unit);
      modCostRows.push({
        id: m.id, name: m.name, setName,
        source: `${p.name} (prep)`, qty: q, unit: m.unit || p.unit,
        perSelectionCost: converted * unitCost,
      });
    }
  };
  for (const ms of item.modifier_sets ?? []) {
    for (const m of ms.modifiers ?? []) collectMod(m, ms.name);
  }
  for (const m of item.modifiers ?? []) collectMod(m, '');

  const overThreshold = summary.costPct > COST_THRESHOLD;
  const thresholdPct = Math.round(COST_THRESHOLD * 100);

  // Raw (inc-VAT) price needed for the modal's step-by-step breakdown, which
  // shows the VAT line regardless of the current display basis.
  const rawPrice = useMemo(() => {
    const v = allVariants.find((vv) => String(vv.id) === activeVariantId);
    return v ? v.price : (item.price ?? 0);
  }, [allVariants, activeVariantId, item.price]);

  return (
    <div className="space-y-4">
      {variantsWithPortion.length > 0 && (
        <VariantPills
          variants={variantsWithPortion}
          active={activeVariantId}
          onChange={setSelectedVariantId}
        />
      )}

      {swap && (
        <Banner
          tone="brand"
          icon="💡"
          body={t('swapSuggestionBanner')
            .replace('{prep}', swap.prep.name)
            .replace('{matched}', String(swap.matchedIngredients.length))
            .replace('{total}', String(rawIngredientCount))}
          action={{
            label: `${t('replaceWithPrep')} →`,
            onClick: onGoToRecipe ?? (() => router.push(`/${rid}/menu/items/${item.id}?tab=recipe`)),
          }}
        />
      )}

      {hasMissingVariantPortion && (
        <Banner
          tone="amber"
          icon={<AlertTriangleIcon className="w-5 h-5" />}
          body={t('missingVariantPortion')}
          action={{
            label: `${t('configureVariants')} →`,
            onClick: () => router.push(`/${rid}/menu/items/${item.id}/variants`),
          }}
        />
      )}

      {hasUnitFamilyMismatch && currentPortion && (
        <Banner
          tone="amber"
          icon={<AlertTriangleIcon className="w-5 h-5" />}
          body={t('unitFamilyMismatch')}
          detail={`${t('item') || 'item'}: ${item.portion_size} ${item.portion_size_unit || '?'} ≠ ${t('variant') || 'variant'}: ${currentPortion.qty} ${currentPortion.unit}`}
        />
      )}

      {unconfiguredPreps.length > 0 && (
        <UnconfiguredPrepsBanner
          items={unconfiguredPreps}
          onFix={(prepId) => router.push(`/${rid}/kitchen/prep?edit=${prepId}`)}
          t={t}
        />
      )}

      <OverviewSection
        summary={summary}
        coloredLines={coloredLines}
        overThreshold={overThreshold}
        thresholdPct={thresholdPct}
        showCostsExVat={showCostsExVat}
        onToggleVat={() => setShowCostsExVat((v) => !v)}
        simMode={simMode}
        onToggleSim={() => {
          if (simMode) setSimStockCosts({});
          setSimMode((v) => !v);
        }}
        onOpenCostPctBreakdown={() => setShowCostPctBreakdown(true)}
        t={t}
      />

      <SimulatorSection
        summary={summary}
        thresholdPct={thresholdPct}
        t={t}
      />

      <IngredientBreakdownSection
        rid={rid}
        item={item}
        coloredLines={coloredLines}
        currentPortion={currentPortion}
        currentOptionId={currentOptionId}
        foodCost={summary.foodCost}
        hasIngredients={summary.hasIngredients}
        simMode={simMode}
        simStockCosts={simStockCosts}
        onEditStockCost={(sid, v) =>
          setSimStockCosts((prev) => ({ ...prev, [sid]: v }))
        }
        onOpenPrepBreakdown={(ing) => setBreakdownIng(ing)}
        onGoToRecipe={onGoToRecipe}
        onNavigate={(href) => router.push(href)}
        t={t}
      />

      {modCostRows.length > 0 && (
        <ModifierConsumptionSection rows={modCostRows} t={t} />
      )}

      {(item.recipe_yield ?? 0) > 0 && ingredients.length > 0 && (
        <PerVariantBreakdownSection
          item={item}
          effectiveIngredients={effectiveIngredients}
          showCostsExVat={showCostsExVat}
          vatRate={vatRate}
          t={t}
        />
      )}

      {overThreshold && summary.hasIngredients && (
        <SuggestionsSection
          item={item}
          summary={summary}
          coloredLines={coloredLines}
          thresholdPct={thresholdPct}
          t={t}
        />
      )}

      {breakdownIng && breakdownIng.prep_item && (() => {
        // Re-resolve against effectiveIngredients so edits made inside the
        // modal (via onEditStockCost) take effect on the next render without
        // the user needing to reopen.
        const liveIng = effectiveIngredients.find((i) => i.id === breakdownIng.id) ?? breakdownIng;
        return (
          <PrepCostBreakdownModal
            ing={liveIng}
            item={item}
            portion={currentPortion}
            optionId={currentOptionId}
            showExVat={showCostsExVat}
            restaurantRate={vatRate}
            simMode={simMode}
            simStockCosts={simStockCosts}
            onEditStockCost={(sid, v) =>
              setSimStockCosts((prev) => ({ ...prev, [sid]: v }))
            }
            onClose={() => setBreakdownIng(null)}
            t={t}
          />
        );
      })()}

      {showCostPctBreakdown && (
        <CostPctBreakdownModal
          displayPrice={rawPrice}
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

// ── Variant pills ───────────────────────────────────────────────────────────

function VariantPills({
  variants, active, onChange,
}: {
  variants: VariantOption[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {variants.map((v) => {
        const isActive = String(v.id) === active;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(String(v.id))}
            className={`inline-flex flex-col items-center px-4 py-2 rounded-full text-[12px] leading-[16px] transition-colors ${
              isActive
                ? 'bg-[#f97316] text-white'
                : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <span className="font-medium">
              {v.name} ({v.portion_size}{v.portion_size_unit || 'g'})
            </span>
            <span className={`text-[11px] ${isActive ? 'text-white/80' : 'text-[var(--text-secondary)]'}`}>
              {v.price.toFixed(2)} {CURRENCY}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Inline banner (brand / amber tone) ──────────────────────────────────────

function Banner({
  tone, icon, body, detail, action,
}: {
  tone: 'brand' | 'amber';
  icon: React.ReactNode;
  body: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}) {
  const palette = tone === 'brand'
    ? 'border-[rgba(249,115,22,0.3)] bg-[rgba(249,115,22,0.08)] text-[var(--text-primary)]'
    : 'border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.08)] text-[#f59e0b]';
  return (
    <div className={`flex items-start gap-3 rounded-[10px] border p-4 text-[13px] leading-[18px] ${palette}`}>
      <span className="shrink-0 mt-0.5">
        {typeof icon === 'string' ? <span className="text-[18px] leading-none">{icon}</span> : icon}
      </span>
      <div className="flex-1 min-w-0">
        <p>{body}</p>
        {detail && <p className="mt-1 font-mono text-[11px] opacity-80">{detail}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`shrink-0 h-8 px-3 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors ${
            tone === 'brand'
              ? 'bg-[#f97316] text-white hover:bg-[#ea580c]'
              : 'underline hover:opacity-80'
          }`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function UnconfiguredPrepsBanner({
  items, onFix, t,
}: {
  items: Array<{ prep: PrepItem; issue: PrepConfigIssue }>;
  onFix: (prepId: number) => void;
  t: TFn;
}) {
  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.08)] p-4 text-[13px] leading-[18px] text-[#f59e0b]">
      <AlertTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-medium">
          {items.length === 1
            ? (t('prepConfigIncompleteSingle') || 'A preparation is missing cost data.')
            : (t('prepConfigIncompleteMany') || 'Some preparations are missing cost data.')}
        </p>
        <ul className="mt-1.5 space-y-1 text-[12px]">
          {items.map(({ prep, issue }) => {
            const reason =
              issue === 'missing_yield' ? (t('prepMissingYield') || 'no yield per batch set')
              : issue === 'no_ingredients' ? (t('prepNoIngredients') || 'no raw ingredients linked')
              : (t('prepZeroCostIngredients') || 'linked ingredients have no purchase cost set');
            return (
              <li key={prep.id} className="flex flex-wrap items-center gap-x-2">
                <span className="font-semibold text-[var(--text-primary)]">{prep.name}</span>
                <span>{reason}.</span>
                <button
                  type="button"
                  onClick={() => onFix(prep.id)}
                  className="underline hover:opacity-80"
                >
                  {t('fix') || 'Fix'} &rarr;
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ── Section 1: Cost overview ────────────────────────────────────────────────

function OverviewSection({
  summary, coloredLines, overThreshold, thresholdPct,
  showCostsExVat, onToggleVat,
  simMode, onToggleSim,
  onOpenCostPctBreakdown,
  t,
}: {
  summary: ItemCostSummary;
  coloredLines: ColoredLine[];
  overThreshold: boolean;
  thresholdPct: number;
  showCostsExVat: boolean;
  onToggleVat: () => void;
  simMode: boolean;
  onToggleSim: () => void;
  onOpenCostPctBreakdown: () => void;
  t: TFn;
}) {
  const marginPct = summary.displayPrice > 0
    ? (summary.margin / summary.displayPrice) * 100
    : 0;

  return (
    <SectionCard
      title={t('tabCost')}
      headerRight={
        <div className="flex items-center gap-2">
          {overThreshold && <AlertTriangleIcon className="w-5 h-5 text-[#f97316]" />}
          <button
            type="button"
            onClick={onToggleVat}
            className="h-8 px-3 rounded-full text-[12px] leading-[16px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--divider)] transition-colors"
            title={showCostsExVat ? t('showIncVat') : t('showExVat')}
          >
            {showCostsExVat ? t('showIncVat') : t('showExVat')}
          </button>
          <button
            type="button"
            onClick={onToggleSim}
            className={`h-8 px-3 rounded-full text-[12px] leading-[16px] border transition-colors ${
              simMode
                ? 'bg-[rgba(142,81,255,0.12)] border-[rgba(142,81,255,0.4)] text-[#8e51ff]'
                : 'border-[var(--divider)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            title={simMode ? (t('exitSimulate') || 'Exit simulation') : (t('simulateCost') || 'Simulate cost')}
          >
            {simMode
              ? (t('exitSimulate') || 'Exit simulation')
              : (t('simulateCost') || 'Simulate cost')}
          </button>
          <button
            type="button"
            className="h-9 px-4 inline-flex items-center gap-2 rounded-[8px] bg-[var(--surface-subtle)] hover:bg-[var(--divider)] text-[var(--text-primary)] text-[14px] leading-[20px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled
            title={t('historicalComingSoon')}
          >
            <DownloadIcon className="w-4 h-4" />
            {t('exportCost')}
          </button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          tone="neutral"
          label={t('foodCostLabel')}
          icon={<DollarSignIcon className="w-4 h-4" />}
          value={`${summary.foodCost.toFixed(2)} ${CURRENCY}`}
          valueClass="text-[var(--text-primary)]"
          barColor="#f97316"
          barPct={Math.min(100, summary.costPct * 100)}
          caption={t('costEvolutionPending')}
        />
        <KpiCard
          tone="positive"
          label={t('grossProfit')}
          icon={<TrendingUpIcon className="w-4 h-4" />}
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
          onClick={onOpenCostPctBreakdown}
          t={t}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#0f0f12] p-5">
          <p className="text-[14px] leading-[20px] text-[var(--text-primary)] mb-4">{t('costDistribution')}</p>
          <DistributionChart lines={coloredLines} t={t} />
        </div>
        <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#0f0f12] p-5">
          <p className="text-[14px] leading-[20px] text-[var(--text-primary)] mb-4">{t('costEvolution6m')}</p>
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
      ? 'bg-[rgba(249,115,22,0.12)] text-[#f97316]'
      : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)]';
  return (
    <div className="rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#0f0f12] p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] leading-[16px] tracking-[0.6px] uppercase text-[var(--text-secondary)]">
          {label}
        </span>
        <span className={`w-7 h-7 rounded-md inline-flex items-center justify-center ${iconBg}`}>
          {icon}
        </span>
      </div>
      <p className={`text-[28px] leading-[36px] font-semibold ${valueClass}`}>{value}</p>
      <p className="text-[12px] leading-[16px] text-[var(--text-secondary)]">{caption}</p>
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
  costPct, thresholdPct, onClick, t,
}: {
  costPct: number;
  thresholdPct: number;
  onClick: () => void;
  t: TFn;
}) {
  const pct = Math.max(0, Math.min(100, costPct * 100));
  const over = costPct > thresholdPct / 100;
  const markerPct = pct;
  return (
    <button
      type="button"
      onClick={onClick}
      title={t('showCostBreakdown') || 'Show cost breakdown'}
      className="group text-left rounded-[10px] border border-[rgba(255,255,255,0.08)] bg-[#0f0f12] p-4 flex flex-col gap-3 hover:border-[rgba(255,255,255,0.2)] transition-colors"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] leading-[16px] tracking-[0.6px] uppercase text-[var(--text-secondary)]">
          {t('costPercent')}
        </span>
        <span className={`w-7 h-7 rounded-md inline-flex items-center justify-center ${
          over ? 'bg-[rgba(249,115,22,0.12)] text-[#f97316]' : 'bg-[rgba(5,223,114,0.12)] text-[#05df72]'
        }`}>
          <AlertTriangleIcon className="w-4 h-4" />
        </span>
      </div>
      <p className={`text-[28px] leading-[36px] font-semibold ${over ? 'text-[#f97316]' : 'text-[var(--text-primary)]'}`}>
        {pct.toFixed(1)}%
      </p>
      <p className="text-[12px] leading-[16px] text-[var(--text-secondary)]">
        {t('objectiveLt').replace('{pct}', String(thresholdPct))}
      </p>
      <div className="relative">
        <div
          className="h-1.5 rounded-full"
          style={{
            background:
              `linear-gradient(to right, #05df72 0%, #05df72 ${thresholdPct}%, #f59e0b ${thresholdPct}%, #f59e0b ${Math.min(100, thresholdPct + 20)}%, #f97316 ${Math.min(100, thresholdPct + 20)}%, #f97316 100%)`,
          }}
        />
        {markerPct > 0 && (
          <div
            className="absolute -top-0.5 w-0.5 h-2.5 bg-[var(--text-primary)] rounded-full"
            style={{ left: `calc(${markerPct}% - 1px)` }}
          />
        )}
        <div className="flex justify-between text-[10px] leading-[14px] text-[var(--text-secondary)] mt-1.5 font-mono">
          <span>0%</span>
          <span style={{ marginLeft: `${thresholdPct - 5}%` }}>{thresholdPct}%</span>
          <span className={over ? 'text-[#f97316]' : ''}>{pct.toFixed(1)}%</span>
        </div>
      </div>
    </button>
  );
}

function DistributionChart({
  lines, t,
}: {
  lines: ColoredLine[];
  t: TFn;
}) {
  const nonZero = lines.filter((l) => l.lineCost > 0);
  if (nonZero.length === 0) {
    return (
      <div className="h-[180px] flex items-center justify-center text-[var(--text-secondary)] text-[13px]">
        —
      </div>
    );
  }
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <svg width={160} height={160} viewBox="0 0 160 160" className="shrink-0" aria-hidden>
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
                <p className="text-[13px] leading-[18px] text-[var(--text-primary)] truncate" title={l.name}>{l.name}</p>
                <p className="text-[11px] leading-[14px] text-[var(--text-secondary)]">
                  {(l.contributionPct * 100).toFixed(1)}% {t('ofTotalCost')}
                </p>
              </div>
            </div>
            <span className="text-[13px] leading-[18px] text-[var(--text-primary)] font-mono whitespace-nowrap">
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
            <stop offset="0%" stopColor="#f97316" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[28, 70, 112].map((y) => (
          <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" />
        ))}
        <path d="M0 90 L64 80 L128 74 L192 60 L256 52 L320 44" fill="none" stroke="#f97316" strokeWidth="2" />
        <path d="M0 90 L64 80 L128 74 L192 60 L256 52 L320 44 L320 140 L0 140 Z" fill="url(#trend-fill)" />
      </svg>
      <p className="text-[11px] leading-[14px] text-[var(--text-secondary)] text-center">{message}</p>
    </div>
  );
}

// ── Section 2: What-if simulator ────────────────────────────────────────────
// Isolated from the Overview/ingredient table — this is a scenario tool that
// only affects the numbers shown inside the card. For live edits that
// propagate everywhere, use the "Simulate cost" toggle on the Overview.

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
  const simCostPctPts = simCostPct * 100;
  const currentCostPctPts = summary.costPct * 100;
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
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] leading-[20px] text-[var(--text-secondary)] pointer-events-none">
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
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px] leading-[20px] text-[var(--text-secondary)] pointer-events-none">
              %
            </span>
          </div>
        </Field>
        <Field label={t('simulatedResult')}>
          <div className={`h-9 rounded-[6px] px-3 inline-flex items-center gap-2 text-[14px] leading-[20px] ${
            simHitsGoal
              ? 'bg-[rgba(5,223,114,0.12)] text-[#05df72]'
              : 'bg-[rgba(249,115,22,0.12)] text-[#f97316]'
          }`}>
            {simHitsGoal
              ? <CheckCircleIcon className="w-4 h-4" />
              : <AlertTriangleIcon className="w-4 h-4" />}
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
            <LightbulbIcon className="w-4 h-4" />
          </span>
          <div className="min-w-0 text-[13px] leading-[20px]">
            <p className="text-[var(--text-primary)]">
              <span className="font-semibold">{t('recommendationLabel')}:</span>{' '}
              {t('recommendationBody')
                .replace('{price}', recommendation.suggestedPrice.toFixed(2))
                .replace('{portionPct}', String(recommendation.suggestedPortionReductionPct))
                .replace('{thresholdPct}', String(thresholdPct))}
            </p>
            <p className="text-[var(--text-secondary)] mt-1">
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
      <div className="flex items-center justify-end gap-6 text-[12px] leading-[16px] text-[var(--text-secondary)]">
        <span>
          {t('simulatedFoodCost')}: <span className="text-[var(--text-primary)] font-mono">{simCost.toFixed(2)} {CURRENCY}</span>
        </span>
        <span>
          {t('grossProfit')}: <span className={`font-mono ${simMargin >= 0 ? 'text-[#05df72]' : 'text-[#f97316]'}`}>{simMargin.toFixed(2)} {CURRENCY}</span>
        </span>
      </div>
    </SectionCard>
  );
}

// ── Section 3: Ingredient breakdown table ───────────────────────────────────

function IngredientBreakdownSection({
  rid, item, coloredLines, currentPortion, currentOptionId,
  foodCost, hasIngredients,
  simMode, simStockCosts, onEditStockCost,
  onOpenPrepBreakdown, onGoToRecipe, onNavigate, t,
}: {
  rid: number;
  item: MenuItem;
  coloredLines: ColoredLine[];
  currentPortion: { qty: number; unit: string } | null;
  currentOptionId: number | null;
  foodCost: number;
  hasIngredients: boolean;
  simMode: boolean;
  simStockCosts: Record<number, number>;
  onEditStockCost: (stockId: number, value: number) => void;
  onOpenPrepBreakdown: (ing: MenuItemIngredient) => void;
  onGoToRecipe?: () => void;
  onNavigate: (href: string) => void;
  t: TFn;
}) {
  const batchModeRow = (item.recipe_yield ?? 0) > 0;

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

  return (
    <SectionCard title={t('costDetailsByIngredient')}>
      {!hasIngredients || coloredLines.length === 0 ? (
        <div className="text-center py-8 space-y-2">
          <p className="text-[14px] text-[var(--text-secondary)]">{t('noIngredientsLinked')}</p>
          {onGoToRecipe && (
            <button
              type="button"
              onClick={onGoToRecipe}
              className="text-[14px] text-[#f97316] hover:text-[#ea580c] transition-colors"
            >
              {t('addIngredients')} &rarr;
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-[25px]">
          <table className="w-full text-[13px] min-w-[620px]">
            <thead>
              <tr className="text-left text-[11px] leading-[16px] tracking-[0.6px] text-[var(--text-secondary)] uppercase">
                <th className="py-3 px-4 font-medium first:pl-[25px]">{t('ingredient')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('quantityLabel')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('unitCost')}</th>
                <th className="py-3 px-4 font-medium text-right">{t('totalCostLabel')}</th>
                <th className="py-3 px-4 font-medium text-right last:pr-[25px]">{t('percentOfTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {coloredLines.map((l) => {
                const ing = l.ingredient;
                const stock = ing.stock_item;
                const stockUnit = stock?.unit ?? '';
                const prep = ing.prep_item;
                const mismatch = hasUnitMismatch(ing);
                const prepIssue = prep && !stock ? diagnosePrep(prep) : null;
                const editHref = prep
                  ? `/${rid}/kitchen/prep?edit=${prep.id}`
                  : stock
                    ? `/${rid}/kitchen/stock?edit=${stock.id}`
                    : null;
                const override = !batchModeRow && currentOptionId != null
                  ? (ing.variant_overrides ?? []).find((o) => o.option_id === currentOptionId)
                  : undefined;
                const isOverrideRow = !!(override && override.quantity > 0);
                const followsVariant = !batchModeRow && ing.scales_with_variant && !!currentPortion;

                return (
                  <tr key={ing.id} className="border-t border-[rgba(255,255,255,0.06)] align-top">
                    <td className="py-3 px-4 first:pl-[25px]">
                      <div className="flex items-start gap-2.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
                          style={{ background: l.color }}
                        />
                        <div className="min-w-0">
                          {editHref ? (
                            <button
                              type="button"
                              onClick={() => onNavigate(editHref)}
                              className="text-[var(--text-primary)] hover:text-[#f97316] hover:underline text-left transition-colors"
                              title={prep
                                ? (t('editPrepItem') || t('editItem'))
                                : (t('editStockItem') || t('editItem'))}
                            >
                              {l.name}
                            </button>
                          ) : (
                            <span className="text-[var(--text-primary)]">{l.name}</span>
                          )}
                          {prepIssue && prep && (
                            <div className="flex items-center gap-1 mt-0.5 text-[11px] text-[#f59e0b]">
                              <AlertTriangleIcon className="w-3.5 h-3.5" />
                              <span>
                                {prepIssue === 'missing_yield' && (t('prepMissingYield') || 'no yield per batch set')}
                                {prepIssue === 'no_ingredients' && (t('prepNoIngredients') || 'no raw ingredients linked')}
                                {prepIssue === 'zero_cost_ingredients' && (t('prepZeroCostIngredients') || 'linked ingredients have no purchase cost set')}
                              </span>
                              <button
                                type="button"
                                onClick={() => onNavigate(`/${rid}/kitchen/prep?edit=${prep.id}`)}
                                className="ml-1 underline hover:opacity-80"
                              >
                                {t('fix') || 'Fix'}
                              </button>
                            </div>
                          )}
                          {mismatch && (
                            <div className="flex items-center gap-1 mt-0.5 text-[11px] text-[#f59e0b]">
                              <AlertTriangleIcon className="w-3.5 h-3.5" />
                              <span>
                                {t('unitMismatchWarning')
                                  .replace('{ingUnit}', ing.unit || '')
                                  .replace('{stockUnit}', stockUnit)}
                              </span>
                              {stock && (
                                <button
                                  type="button"
                                  onClick={() => onNavigate(`/${rid}/kitchen/stock?edit=${stock.id}`)}
                                  className="ml-1 underline hover:opacity-80"
                                >
                                  {t('fix')}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-[var(--text-primary)]">
                      {isOverrideRow || followsVariant ? (
                        <span className="inline-flex flex-col items-end">
                          <span>
                            {Number(l.qty.toFixed(3))} <span className="text-[var(--text-secondary)]">{l.qtyUnit}</span>
                          </span>
                          <span className="text-[9px] uppercase text-[#f97316]/80 tracking-wider">
                            {isOverrideRow
                              ? (t('variantOverride') || 'variant override')
                              : (t('followVariantPortion') || 'follows variant')}
                          </span>
                        </span>
                      ) : (
                        <>
                          {Number(l.qty.toFixed(3))} <span className="text-[var(--text-secondary)]">{l.qtyUnit}</span>
                        </>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right font-mono text-[var(--text-secondary)]">
                      {simMode && stock && !prep ? (
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={simStockCosts[stock.id] ?? Number(l.unitCost.toFixed(2))}
                            onChange={(e) => {
                              const raw = parseFloat(e.target.value);
                              onEditStockCost(stock.id, Number.isFinite(raw) && raw >= 0 ? raw : 0);
                            }}
                            className="w-20 h-7 rounded-[6px] bg-[var(--surface-subtle)] px-2 text-right text-[12px] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#f97316]"
                          />
                          <span className="text-[11px]">{CURRENCY}/{l.sourceUnit}</span>
                        </div>
                      ) : prep ? (
                        <button
                          type="button"
                          onClick={() => onOpenPrepBreakdown(ing)}
                          className="hover:text-[#f97316] hover:underline transition-colors"
                          title={t('showCostBreakdown')}
                        >
                          {l.unitCost.toFixed(2)} {CURRENCY}/{l.sourceUnit}
                        </button>
                      ) : (
                        <span>
                          {l.unitCost.toFixed(2)} {CURRENCY}/{l.sourceUnit}
                        </span>
                      )}
                    </td>

                    <td className={`py-3 px-4 text-right font-mono ${mismatch ? 'text-[#f59e0b]' : 'text-[var(--text-primary)]'}`}>
                      {prep ? (
                        <button
                          type="button"
                          onClick={() => onOpenPrepBreakdown(ing)}
                          className="hover:text-[#f97316] hover:underline transition-colors"
                          title={t('showCostBreakdown')}
                        >
                          {mismatch ? '—' : `${l.lineCost.toFixed(2)} ${CURRENCY}`}
                        </button>
                      ) : (
                        mismatch ? '—' : `${l.lineCost.toFixed(2)} ${CURRENCY}`
                      )}
                    </td>

                    <td className={`py-3 px-4 text-right font-mono last:pr-[25px] ${
                      l.contributionPct >= 0.5 ? 'text-[#f97316]' : 'text-[var(--text-primary)]'
                    }`}>
                      {(l.contributionPct * 100).toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-[var(--divider)]">
                <td colSpan={3} className="py-3 px-4 first:pl-[25px] text-[var(--text-primary)] font-semibold">
                  {t('totalLabel')}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--text-primary)]">
                  {foodCost.toFixed(2)} {CURRENCY}
                </td>
                <td className="py-3 px-4 text-right font-mono font-semibold text-[var(--text-primary)] last:pr-[25px]">
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

// ── Modifier consumption (linked add-ons) ───────────────────────────────────

function ModifierConsumptionSection({
  rows, t,
}: {
  rows: Array<{
    id: number; name: string; setName: string; source: string;
    qty: number; unit: string; perSelectionCost: number;
  }>;
  t: TFn;
}) {
  return (
    <SectionCard title={t('linkedAddons') || t('modifierConsumption') || 'Linked Add-ons'}>
      <div className="overflow-x-auto -mx-[25px]">
        <table className="w-full text-[13px] min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] leading-[16px] tracking-[0.6px] text-[var(--text-secondary)] uppercase">
              <th className="py-3 px-4 font-medium first:pl-[25px]">{t('modifier') || 'Modifier'}</th>
              <th className="py-3 px-4 font-medium">{t('consumesFromStock') || 'Consumes'}</th>
              <th className="py-3 px-4 font-medium text-right">{t('qty') || 'Qty'}</th>
              <th className="py-3 px-4 font-medium text-right last:pr-[25px]">{t('perSelectionCost') || 'Per selection'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`mod-${r.id}`} className="border-t border-[rgba(255,255,255,0.06)]">
                <td className="py-3 px-4 first:pl-[25px] text-[var(--text-primary)]">
                  {r.name}
                  {r.setName && <span className="text-[11px] text-[var(--text-secondary)] ml-2">({r.setName})</span>}
                </td>
                <td className="py-3 px-4 text-[var(--text-secondary)]">{r.source}</td>
                <td className="py-3 px-4 text-right font-mono text-[var(--text-primary)]">{r.qty} {r.unit}</td>
                <td className="py-3 px-4 text-right font-mono text-[var(--text-primary)] last:pr-[25px]">
                  {r.perSelectionCost.toFixed(2)} {CURRENCY}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ── Per-variant cost breakdown (batch mode with variants) ───────────────────

function PerVariantBreakdownSection({
  item, effectiveIngredients, showCostsExVat, vatRate, t,
}: {
  item: MenuItem;
  effectiveIngredients: MenuItemIngredient[];
  showCostsExVat: boolean;
  vatRate: number;
  t: TFn;
}) {
  const variants = (item.variant_groups ?? [])
    .flatMap((g) => g.variants ?? [])
    .filter((v) => (v.portion_size ?? 0) > 0);
  if (variants.length === 0) return null;

  return (
    <SectionCard title={t('variantCostBreakdown')}>
      <div className="overflow-x-auto -mx-[25px]">
        <table className="w-full text-[13px] min-w-[620px]">
          <thead>
            <tr className="text-left text-[11px] leading-[16px] tracking-[0.6px] text-[var(--text-secondary)] uppercase">
              <th className="py-3 px-4 font-medium first:pl-[25px]">{t('variant')}</th>
              <th className="py-3 px-4 font-medium text-right">{t('portion')}</th>
              <th className="py-3 px-4 font-medium text-right">{t('foodCostLabel')}</th>
              <th className="py-3 px-4 font-medium text-right">{t('price')}</th>
              <th className="py-3 px-4 font-medium text-right">{t('costPercent')}</th>
              <th className="py-3 px-4 font-medium text-right last:pr-[25px]">{t('grossProfit')}</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              // Legacy MenuItemVariant has no OptionSetOption id — no
              // variant-scoped ingredients apply on this path. We reuse
              // computeItemCostSummary per variant so batch-mode proration
              // and the sim-aware effectiveIngredients still flow through.
              const s = computeItemCostSummary({
                item,
                ingredients: effectiveIngredients,
                overrides: [],
                vatRate,
                showCostsExVat,
                variantId: `var:${v.id}`,
              });
              const vCost = s.foodCost;
              const vPriceBasis = s.displayPrice;
              const vPct = vPriceBasis > 0 ? vCost / vPriceBasis : 0;
              return (
                <tr key={v.id} className="border-t border-[rgba(255,255,255,0.06)]">
                  <td className="py-3 px-4 first:pl-[25px] text-[var(--text-primary)]">{v.name}</td>
                  <td className="py-3 px-4 text-right font-mono text-[var(--text-primary)]">
                    {v.portion_size} {v.portion_size_unit}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[var(--text-primary)]">
                    {vCost.toFixed(2)} {CURRENCY}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[var(--text-secondary)]">
                    {vPriceBasis.toFixed(2)} {CURRENCY}
                  </td>
                  <td className={`py-3 px-4 text-right font-mono font-semibold ${
                    vPct > COST_THRESHOLD ? 'text-[#f97316]' : 'text-[var(--text-primary)]'
                  }`}>
                    {(vPct * 100).toFixed(1)}%
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-[#05df72] last:pr-[25px]">
                    {(vPriceBasis - vCost).toFixed(2)} {CURRENCY}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
      icon: <TrendingDownIcon className="w-4 h-4" />,
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

  if (summary.displayPrice > 0) {
    const targetPrice = summary.foodCost / (thresholdPct / 100);
    if (targetPrice > summary.displayPrice) {
      const pctIncrease = ((targetPrice - summary.displayPrice) / summary.displayPrice) * 100;
      suggestions.push({
        key: 'raise-price',
        tone: 'positive',
        icon: <DollarSignIcon className="w-4 h-4" />,
        title: t('suggestRaisePrice').replace('{price}', targetPrice.toFixed(2)),
        description: t('suggestRaisePriceBody')
          .replace('{pctIncrease}', pctIncrease.toFixed(0))
          .replace('{thresholdPct}', String(thresholdPct)),
        impact: t('objectiveReached'),
        impactTone: 'positive',
      });
    }
  }

  const top = [...coloredLines].sort((a, b) => b.lineCost - a.lineCost)[0];
  if (top && top.lineCost > 0) {
    const savingPerUnit = top.lineCost * 0.2;
    suggestions.push({
      key: 'negotiate',
      tone: 'neutral',
      icon: <RefreshCwIcon className="w-4 h-4" />,
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
          <LightbulbIcon className="w-4 h-4" />
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
                  ? 'bg-[rgba(249,115,22,0.12)] text-[#f97316]'
                  : 'bg-[rgba(142,81,255,0.12)] text-[#8e51ff]'
            }`}>
              {s.icon}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] leading-[20px] text-[var(--text-primary)]">{s.title}</p>
              <p className="text-[12px] leading-[16px] text-[var(--text-secondary)] mt-1">{s.description}</p>
            </div>
            <span className={`text-[14px] leading-[20px] font-semibold whitespace-nowrap ${
              s.impactTone === 'positive' ? 'text-[#05df72]' : 'text-[var(--text-primary)]'
            }`}>
              {s.impact}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
