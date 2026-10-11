'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlaskConical,
  RefreshCw,
  Check,
  DollarSign,
  ArrowDown,
  ArrowUp,
  Info,
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
  type ItemCostSummary,
  type VariantOption,
} from '@/lib/cost-utils';
import PrepCostBreakdownModal from '@/components/food-cost/PrepCostBreakdownModal';
import { NumberInput } from '@/components/ui/NumberInput';
import { usePermissions } from '@/lib/permissions-context';
import { useCurrency, useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';

/** The persisted price, in the API's inclusive-VAT basis, if changed. */
export interface SimulatorReceipt { price?: number; variantId?: string }

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
  onApplied?: (receipt: SimulatorReceipt) => void | Promise<void>;
  onStateChange?: (state: {dirty: boolean; busy: boolean; pending: boolean}) => void;
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

// Tags keep ingredient rows identifiable without relying on colour.
const SWATCH = ['var(--summary-fg)'];

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
  onStateChange,
  t,
}: Props) {
  const { money, symbol } = useCurrency();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('menu.edit');
  const canEditStock = hasAnyPermission('kitchen.manage');
  // ── Bases ────────────────────────────────────────────────────────────────
  const basePrice = effectivePrice;
  const baseFoodCost = summary.foodCost;
  const baseMargin = summary.margin;
  const basePctCost = summary.costPct * 100;

  // Slider bounds — ±50% around base, clamped sensibly. Avoids 0-base
  // divide-by-zero by falling back to a fixed range.
  const priceMin = basePrice > 0 ? Math.max(0.5, +(basePrice * 0.5).toFixed(2)) : 0;
  const priceMax = basePrice > 0 ? +(basePrice * 1.5).toFixed(2) : 0;

  // ── Lever state ──────────────────────────────────────────────────────────
  const [simPrice, setSimPrice] = useState<number>(basePrice);
  const [simStockCosts, setSimStockCosts] = useState<Record<number, number>>({});

  const operation = useRef<{steps: Array<() => Promise<unknown>>; completed: number; receipt: SimulatorReceipt} | null>(null);
  const applyLock = useRef(false);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reset when the parent signals (variant change, VAT toggle, etc.). Also
  // covers initial mount when basePrice arrives after an async load.
  useEffect(() => {
    if (!operation.current) {
      setSimPrice(basePrice);
      setSimStockCosts({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, basePrice]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const priceChanged = Math.abs(simPrice - basePrice) > 0.001;
  const ingChanged = Object.keys(simStockCosts).length > 0;
  const dirtyCount = (priceChanged ? 1 : 0) + (ingChanged ? 1 : 0);
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

      return acc + line.lineCost * costRatio;
    }, 0);
    // displayUnitCostFor depends on showCostsExVat + vatRate, both stable
    // for the panel's lifetime; explicit deps keep the lint quiet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.lines, simStockCosts, showCostsExVat, vatRate]);

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

  const unsupportedPrice = priceChanged && !!activeVariant && (
    !activeVariant.id.startsWith('opt:') || setIdForOption(Number(activeVariant.id.slice(4))) == null
  );
  const permissionMissing = (priceChanged && !canEdit) || (ingChanged && !canEditStock);
  const unsupportedCost = summary.lines.some(line => line.unitCost <= 0 && (
    (line.ingredient.stock_item?.id != null && simStockCosts[line.ingredient.stock_item.id] != null)
    || line.ingredient.prep_item?.ingredients?.some(ingredient => ingredient.stock_item?.id != null && simStockCosts[ingredient.stock_item.id] != null)
  ));
  useEffect(() => { onStateChange?.({dirty: dirty || pending, busy: applying, pending}); }, [dirty, pending, applying, onStateChange]);

  async function handleApply() {
    if ((!dirty && !operation.current) || applyLock.current || permissionMissing || unsupportedPrice || unsupportedCost) return;
    applyLock.current = true;
    setApplyError(null); setSaved(false); setApplying(true);
    try {
      if (!operation.current) {
        const steps: Array<() => Promise<unknown>> = [];
        const priceForStorage = showCostsExVat ? simPrice * (1 + vatRate / 100) : simPrice;
        const receipt: SimulatorReceipt = {};
        if (priceChanged) {
          receipt.price = priceForStorage;
          receipt.variantId = activeVariant?.id;
          if (activeVariant) {
            const optionId = Number(activeVariant.id.slice(4));
            const setId = setIdForOption(optionId)!;
            steps.push(() => setItemOptionPrice(rid, setId, item.id, optionId, {price: priceForStorage, is_active:true}));
          } else {
            steps.push(() => updateMenuItem(rid, item.id, {price:priceForStorage}));
          }
        }
        for (const [sid, cost] of Object.entries(simStockCosts)) {
          const stockId = Number(sid);
          let stockForRate: {vat_rate_override?: number | null} | undefined;
          for (const line of summary.lines) {
            const direct = line.ingredient.stock_item;
            const nested = line.ingredient.prep_item?.ingredients?.find(ingredient => ingredient.stock_item?.id === stockId)?.stock_item;
            if (direct?.id === stockId || nested) { stockForRate = direct?.id === stockId ? direct : nested; break; }
          }
          const multiplier = vatMultiplierForStock(stockForRate, vatRate);
          const storedCost = !showCostsExVat && multiplier > 0 ? cost / multiplier : cost;
          steps.push(() => updateStockItem(rid, stockId, {cost_per_unit:storedCost}));
        }
        operation.current = {steps, completed:0, receipt};
      }
      const current = operation.current;
      setPending(true);
      while (current.completed < current.steps.length) {
        await current.steps[current.completed]();
        current.completed += 1;
      }
      await onApplied?.(current.receipt);
      operation.current = null;
      setPending(false); setSimStockCosts({}); setSaved(true);
    } catch (error) {
      if (operation.current?.completed === 0) { operation.current = null; setPending(false); }
      setApplyError(error instanceof Error ? error.message : String(error));
    } finally {
      applyLock.current = false;
      setApplying(false);
    }
  }

  // ── Quick-action chips (empty state)
  const reset = () => {
    if (operation.current || applyLock.current) return;
    setSaved(false);
    setSimPrice(basePrice);
    setSimStockCosts({});
    setApplyError(null);
  };
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
  const priceDeltaPct = basePrice > 0 ? ((simPrice - basePrice) / basePrice) * 100 : 0;

  // % cost gauge — clamp at 60 (matches the design's ceiling)
  const gaugeMax = 60;
  const simGaugePct = Math.min(simPctCost, gaugeMax) / gaugeMax * 100;
  const baseGaugePct = Math.min(basePctCost, gaugeMax) / gaugeMax * 100;
  const targetGaugePct = (thresholdPct / gaugeMax) * 100;

  return (
    <>
    <section aria-label={t('simulatorTitle')} aria-busy={applying}
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
        className="flex flex-wrap items-start justify-between gap-4 p-[var(--s-5)]"
        style={{ borderBottom: '1px dashed var(--line)' }}
      >
        <div className="flex flex-1 basis-72 items-start gap-[var(--s-3)] min-w-0">
          <span
            className="shrink-0 inline-grid place-items-center rounded-r-md"
            style={{
              width: 32,
              height: 32,
              background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
              color: 'var(--brand-ink)',
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
                className="inline-flex items-center h-[18px] px-[6px] rounded-r-xs text-xs font-semibold uppercase tracking-[.04em]"
                style={{
                  background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
                  color: 'var(--brand-ink)',
                }}
              >
                {t('simulatorBadge') || 'SIMULATEUR'}
              </span>
              {/* Always rendered (just invisible when clean) so the badges row
                  never wraps when entering the dirty state — without this, the
                  third badge can push the description down a line and the
                  whole header (and section below) jumps. */}
              <span
                aria-hidden={!dirty}
                className={`inline-flex items-center h-[18px] px-[6px] rounded-r-xs text-xs font-semibold ${
                  dirty ? '' : 'invisible'
                }`}
                style={{
                  background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
                  color: 'var(--brand-ink)',
                }}
              >
                {(t('simulatorChangesInProgress') || '{n} changements en cours').replace(
                  '{n}',
                  String(dirtyCount),
                )}
              </span>
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

        <div className="flex flex-wrap items-center gap-2">
          {dirty && <Button type="button" size="lg" variant="secondary" onClick={reset} disabled={applying || pending}><RefreshCw className="size-4"/>{t('simulatorReset')}</Button>}
          {(canEdit || canEditStock) && <Button type="button" size="lg" onClick={handleApply} disabled={(!dirty && !pending) || applying || permissionMissing || unsupportedPrice || unsupportedCost}>
            {applying ? <RefreshCw className="size-4 animate-spin"/> : <Check className="size-4"/>}{pending ? t('retry') : t('simulatorApply')}
          </Button>}
        </div>
      </div>
      <div className="space-y-2 border-b border-[var(--line)] px-5 py-3 text-sm text-fg-secondary">
        <p>{t('simulatorApplyScope')}</p>
        {permissionMissing && <p>{t('simulatorPermissionHint')}</p>}
        {unsupportedPrice && <p>{t('simulatorUnsupportedPrice')}</p>}
        {unsupportedCost && <p className="text-[var(--warning-500)]">{t('simulatorZeroCostHint')}</p>}
        {saved && !dirty && <p role="status" className="text-[var(--success-500)]">{t('simulatorSaved')}</p>}
        {pending && operation.current && <p role="status">{operation.current.completed === operation.current.steps.length ? t('simulatorRefreshPending') : t('simulatorPartialSave').replace('{done}',String(operation.current.completed)).replace('{total}',String(operation.current.steps.length))}</p>}
        {applyError && <p role="alert" className="text-[var(--danger-500)]">{applyError}</p>}
      </div>

      {/* ── Body: 2 columns (Levers | Outcome) ───────────────────────────── */}
      <fieldset disabled={applying || pending} className="min-w-0 grid grid-cols-1 xl:grid-cols-[1.15fr_1fr]">
        {/* ===== LEVERS ===== */}
        <div
          className="p-[var(--s-5)]"
          style={{ borderInlineEnd: '1px solid var(--line)' }}
        >
          <SectionLabel>{t('simulatorLeversTitle') || 'Leviers à actionner'}</SectionLabel>

          {/* Lever — sell price */}
          {basePrice > 0 && (
            <Lever
              icon={<DollarSign className="w-3 h-3" />}
              title={`${t('simulatorPriceLeverTitle') || 'Prix de vente'} · ${
                showCostsExVat ? (t('exVat') || 'HT') : (t('incVat') || 'TTC')
              }`}
              sub={t('simulatorPriceLeverHint') || 'Augmenter le prix de vente sans toucher la recette'}
              valueLabel={money(simPrice)}
              baseLabel={priceChanged ? money(basePrice) : null}
              deltaPct={priceChanged ? priceDeltaPct : null}
              dirty={priceChanged}
              min={priceMin}
              max={priceMax}
              step={0.01}
              value={simPrice}
              onChange={setSimPrice}
              ticks={[
                { v: priceMin, l: money(priceMin, { decimals: 0 }) },
                { v: basePrice, l: `${money(basePrice, { decimals: 0 })} · ${t('simulatorBase') || 'base'}`, base: true },
                { v: priceMax, l: money(priceMax, { decimals: 0 }) },
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
                        className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-3 p-3 rounded-r-md"
                        style={{
                          background: 'var(--surface-2)',
                          border: overridden
                            ? '1px solid color-mix(in oklab, var(--brand-500) 35%, var(--line))'
                            : '1px solid var(--line)',
                        }}
                      >
                        <span
                          className="inline-grid place-items-center text-[var(--summary-bg)] font-semibold rounded-r-xs"
                          style={{
                            width: 24,
                            height: 24,
                            background: row.color,
                            fontSize: 12,
                          }}
                        >
                          {row.tag}
                        </span>
                        <div className="min-w-0">
                          <div className="text-fs-sm font-medium break-words">{row.name}</div>
                          <div className="text-xs text-[var(--fg-subtle)] mt-0.5">
                            {t('base') || 'Base'} ·{' '}
                            <bdi dir="ltr" className="tabular-nums">
                              {symbol}
                              {row.baseUnitCost.toFixed(2)}
                              {row.unitSuffix}
                            </bdi>
                          </div>
                        </div>
                        <div
                          dir="ltr" className="col-start-2 flex items-center gap-2 min-h-11 px-3 rounded-r-md bg-[var(--surface)]"
                          style={{
                            border: `1px solid ${overridden ? 'var(--brand-500)' : 'var(--line)'}`,
                          }}
                        >
                          <span className="text-fs-xs text-[var(--fg-subtle)]">{symbol}</span>
                          <NumberInput
                            min={0} aria-label={`${t('unitCost')} — ${row.name}`}
                            value={overrideVal != null ? overrideVal : row.baseUnitCost}
                            onChange={(v) => {
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
                            format={(n) => n.toFixed(2)}
                            className="min-h-11 flex-1 min-w-0 bg-transparent border-0 outline-none text-fs-sm tabular-nums text-end text-[var(--fg)]"
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
                      className="grid items-center gap-[var(--s-3)] p-[var(--s-3)] rounded-r-md text-start transition-colors hover:bg-[var(--surface-3,var(--surface-2))]"
                      style={{
                        gridTemplateColumns: '24px minmax(0,1fr) auto',
                        background: 'var(--surface-2)',
                        border: overridden
                          ? '1px solid color-mix(in oklab, var(--brand-500) 35%, var(--line))'
                          : '1px solid var(--line)',
                      }}
                    >
                      <span
                        className="inline-grid place-items-center text-[var(--summary-bg)] font-semibold rounded-r-xs"
                        style={{
                          width: 24,
                          height: 24,
                          background: row.color,
                          fontSize: 12,
                        }}
                      >
                        {row.tag}
                      </span>
                      <div className="min-w-0">
                        <div className="text-fs-sm font-medium break-words flex items-center gap-1.5">
                          <FlaskConical className="w-3 h-3 text-[var(--fg-subtle)] shrink-0" />
                          {row.name}
                        </div>
                        <div className="text-xs text-[var(--fg-subtle)] mt-0.5">
                          {t('preparation') || 'Préparation'} ·{' '}
                          <bdi dir="ltr" className="tabular-nums">
                            {symbol}
                            {row.baseUnitCost.toFixed(2)}
                            {row.unitSuffix}
                          </bdi>
                        </div>
                      </div>
                      <div
                        className="text-fs-sm font-semibold tabular-nums whitespace-nowrap"
                        style={{ color: overridden ? 'var(--brand-ink)' : 'var(--fg)' }}
                      >
                        {symbol}
                        {liveUnitCost.toFixed(2)}
                        <span className="text-xs text-[var(--fg-subtle)] font-normal">
                          {row.unitSuffix}
                        </span>
                      </div>

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
            <div className="flex flex-wrap items-baseline gap-[var(--s-3)]">
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

            {/* Gauge bar — pinned to LTR so the fill (grows from physical left)
                stays aligned with the 0% / target / max labels below. */}
            <div
              className="relative mt-[var(--s-3)]"
              dir="ltr"
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
            <div
              className="flex items-center justify-between mt-1.5 text-xs text-[var(--fg-subtle)]"
              dir="ltr"
            >
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--s-3)] mt-[var(--s-5)]">
            <ResultCard
              label={t('simulatorMaterialCost') || 'Coût matière'}
              value={money(simFoodCost)}
              base={dirty ? money(baseFoodCost) : null}
              delta={dirty ? simFoodCost - baseFoodCost : null}
              inverse
            />
            <ResultCard
              label={t('grossProfit') || 'Marge brute'}
              value={money(simMargin)}
              sub={`${simMarginPct.toFixed(1)}%`}
              base={dirty ? money(baseMargin) : null}
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
      </fieldset>
    </section>

    {/* Recipe drill-down: clicking a prep row in the levers list opens the
        breakdown modal with sub-stock costs editable. Edits flow back into
        simStockCosts so the simulator KPIs update in real time. */}
    {openPrepIng && (
      <PrepCostBreakdownModal
        ing={openPrepIng}
        item={item}
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
      <p className="text-sm font-semibold text-[var(--fg-muted)]">
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
      <div className="flex flex-wrap items-center justify-between mb-[var(--s-2)] gap-[var(--s-3)]">
        <div className="flex items-center gap-[var(--s-2)] min-w-0">
          <span
            className="inline-grid place-items-center shrink-0 rounded-r-xs text-[var(--fg-muted)]"
            style={{ width: 24, height: 24, background: 'var(--surface-2)' }}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-fs-sm font-semibold">{title}</p>
            <p className="text-xs text-[var(--fg-subtle)] mt-0.5">{sub}</p>
          </div>
        </div>
        <div className="text-end shrink-0">
          <div className="flex items-center gap-1.5 justify-end">
            {dirty && baseLabel && (
              <span className="text-fs-xs tabular-nums text-[var(--fg-subtle)] line-through">
                {baseLabel}
              </span>
            )}
            <span
              className="text-fs-lg font-semibold tabular-nums"
              style={{ color: dirty ? 'var(--brand-ink)' : 'var(--fg)' }}
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
          for accessibility & keyboard support. dir="ltr" is required: in RTL
          documents browsers reverse the native range (drag right = decrease)
          while the visual track + thumb use physical `left`/`width`, so the
          two would run opposite each other. Pinning the slider to LTR keeps
          drag-right = increase and matches the fill direction. */}
      <div className="relative rounded-r-sm focus-within:shadow-ring" style={{ height: 44, marginTop: 8 }} dir="ltr">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={Number(value.toFixed(2))}
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

      {/* tick labels — pinned to LTR to stay aligned with the slider's
          physical fill direction (min on the left, max on the right). */}
      <div
        className="flex items-center justify-between mt-1.5 text-xs text-[var(--fg-subtle)]"
        dir="ltr"
      >
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
  const { symbol } = useCurrency();
  const { t } = useI18n();
  if (!Number.isFinite(value) || Math.abs(value) < 0.001) return null;
  const isDown = value < 0;
  const good = inverse ? isDown : !isDown;
  const color = good ? 'var(--success-500)' : 'var(--danger-500)';
  const sign = isDown ? '−' : '+';
  const abs = Math.abs(value);
  const decimals = unit === 'pt' || unit === '%' ? 1 : 2;
  return (
    <span
      dir="ltr" className="inline-flex items-center gap-0.5 text-fs-xs font-semibold tabular-nums"
      style={{ color }}
    >
      {isDown ? <ArrowDown className="w-2.5 h-2.5" /> : <ArrowUp className="w-2.5 h-2.5" />}
      {sign}
      {unit === symbol ? unit : ''}
      {abs.toFixed(decimals)}
      {unit === 'pt' ? t('simulatorPoints') : unit !== symbol ? unit : ''}
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
  const { symbol } = useCurrency();
  const dirty = base != null && delta != null;
  return (
    <div
      className="p-[var(--s-4)] rounded-r-md"
      style={{ background: 'var(--surface)', border: '1px solid var(--line)' }}
    >
      <p className="text-xs font-medium text-[var(--fg-subtle)]">
        {label}
      </p>
      <div className="flex flex-wrap items-baseline gap-[var(--s-2)] mt-[var(--s-2)]">
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
          <span className="text-xs tabular-nums text-[var(--fg-subtle)] line-through">
            {base}
          </span>
          <Delta value={delta!} unit={symbol} inverse={inverse} />
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
      className="inline-flex items-center gap-1.5 min-h-11 px-[var(--s-3)] rounded-r-xl text-fs-xs font-medium border border-[var(--line)] bg-[var(--surface)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--line-strong,var(--line))] transition-colors"
    >
      {children}
    </button>
  );
}
