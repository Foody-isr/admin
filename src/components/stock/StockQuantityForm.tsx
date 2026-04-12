'use client';

import type { StockItem, StockUnit } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const STOCK_UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'unit', 'pack', 'box', 'bag', 'dose', 'other'];
const OUTER_CONTAINERS = ['carton', 'pack', 'crate', 'sack', 'case'] as const;
const INNER_UNITS = ['bottle', 'can', 'jar', 'bag', 'brick', 'packet', 'box', 'sachet', 'tub'] as const;

/** Value shape for the shared stock quantity / packaging / price form. */
export interface StockQuantityValue {
  mode: 'basic' | 'advanced';
  unit: StockUnit;
  // basic
  basicQty: number;
  basicPrice: number;       // total paid
  // advanced — outer container (pack_count)
  outerQty: number;
  outerType: string;        // carton | pack | crate | sack | case
  // advanced — inner unit (pack_size = units per outer)
  innerQty: number;
  innerType: string;        // bottle | can | jar | ...
  // advanced — content per inner (unit_content)
  contentQty: number;
  // pricing (advanced)
  pricePerOuter: number;
  totalPrice: number;
}

export function defaultStockQuantityValue(overrides: Partial<StockQuantityValue> = {}): StockQuantityValue {
  return {
    mode: 'basic',
    unit: 'kg',
    basicQty: 0,
    basicPrice: 0,
    outerQty: 0,
    outerType: 'carton',
    innerQty: 0,
    innerType: 'can',
    contentQty: 0,
    pricePerOuter: 0,
    totalPrice: 0,
    ...overrides,
  };
}

/** Map a persisted StockItem back into the form state (for edit mode). */
export function stockItemToQuantityValue(item: StockItem): StockQuantityValue {
  const ps = item.pack_size ?? 0;
  const uc = item.unit_content ?? 0;
  const isAdv = uc > 0 || ps > 0;
  const outerQty = isAdv
    ? (ps > 0 && uc > 0
      ? Math.round(item.quantity / (ps * uc))
      : uc > 0
        ? Math.round(item.quantity / uc)
        : ps > 0
          ? Math.round(item.quantity / ps)
          : 0)
    : 0;
  return {
    mode: isAdv ? 'advanced' : 'basic',
    unit: item.unit,
    basicQty: !isAdv ? item.quantity : 0,
    basicPrice: !isAdv ? item.cost_per_unit * item.quantity : 0,
    outerQty,
    outerType: item.container_type || 'carton',
    innerQty: ps,
    innerType: item.unit_type || 'can',
    contentQty: uc,
    pricePerOuter: isAdv && item.cost_per_unit > 0 ? item.cost_per_unit * (uc || 1) * (ps || 1) : 0,
    totalPrice: item.cost_per_unit * item.quantity,
  };
}

export interface DerivedStockQuantity {
  stockQty: number;          // goes into item.quantity
  costPerStockUnit: number;  // goes into item.cost_per_unit
  pricePerInner: number;     // display only
  totalInnerUnits: number;   // outerQty * innerQty (or outerQty alone)
  totalPrice: number;        // resolved
}

export function deriveStockQuantity(v: StockQuantityValue): DerivedStockQuantity {
  if (v.mode === 'basic') {
    const stockQty = v.basicQty;
    const totalPrice = v.basicPrice;
    const costPerStockUnit = stockQty > 0 && totalPrice > 0 ? totalPrice / stockQty : 0;
    return { stockQty, costPerStockUnit, pricePerInner: 0, totalInnerUnits: stockQty, totalPrice };
  }
  const totalInnerUnits = v.innerQty > 0 ? v.outerQty * v.innerQty : v.outerQty;
  const stockQty = v.contentQty > 0 ? totalInnerUnits * v.contentQty : totalInnerUnits;
  const totalPrice = v.outerQty > 0 && v.pricePerOuter > 0 ? v.outerQty * v.pricePerOuter : v.totalPrice;
  const costPerStockUnit = stockQty > 0 && totalPrice > 0 ? totalPrice / stockQty : 0;
  const pricePerInner = totalInnerUnits > 0 && totalPrice > 0 ? totalPrice / totalInnerUnits : 0;
  return { stockQty, costPerStockUnit, pricePerInner, totalInnerUnits, totalPrice };
}

/** Produce the subset of StockItemInput fields that this form controls. */
export function quantityValueToStockFields(v: StockQuantityValue) {
  const d = deriveStockQuantity(v);
  const isAdv = v.mode === 'advanced';
  return {
    unit: v.unit,
    quantity: d.stockQty,
    cost_per_unit: d.costPerStockUnit,
    unit_content: isAdv && v.contentQty > 0 ? v.contentQty : 0,
    unit_content_unit: isAdv && v.contentQty > 0 ? v.unit : '',
    pack_size: isAdv && v.innerQty > 0 ? v.innerQty : 0,
    container_type: isAdv ? v.outerType : '',
    unit_type: isAdv ? v.innerType : '',
  };
}

interface Props {
  value: StockQuantityValue;
  onChange: (next: StockQuantityValue) => void;
  vatRate: number;
  /** Compact layout — smaller paddings, for per-line usage inside larger modals. */
  compact?: boolean;
  /** Hide the Basic/Advanced toggle (always use advanced). Default false. */
  forceAdvanced?: boolean;
}

/**
 * Shared stock quantity + packaging + price form.
 * Used in: manual stock item modal, delivery import lines, recipe import (new items).
 */
export default function StockQuantityForm({ value, onChange, vatRate, compact, forceAdvanced }: Props) {
  const { t } = useI18n();
  const vm = 1 + vatRate / 100;
  const v = value;
  const d = deriveStockQuantity(v);
  const set = (patch: Partial<StockQuantityValue>) => onChange({ ...v, ...patch });

  const inputCls = compact ? 'input w-full py-1.5 text-sm' : 'input w-full py-2.5 text-sm';
  const labelCls = compact ? 'text-xs text-fg-tertiary block mb-1' : 'text-xs text-fg-secondary block mb-1';
  const cardCls = compact
    ? 'p-3 rounded-lg border border-[var(--divider)] space-y-2.5'
    : 'p-4 rounded-xl border border-[var(--divider)] space-y-3';

  // Two-way sync: price-per-outer ↔ total-price
  const updateOuterPrice = (price: number) => {
    set({ pricePerOuter: price, totalPrice: v.outerQty > 0 ? price * v.outerQty : v.totalPrice });
  };
  const updateTotalPrice = (total: number) => {
    set({ totalPrice: total, pricePerOuter: v.outerQty > 0 ? total / v.outerQty : v.pricePerOuter });
  };

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      {!forceAdvanced && (
        <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface-subtle)' }}>
          <button
            type="button"
            onClick={() => set({ mode: 'basic' })}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${v.mode === 'basic' ? 'bg-brand-500 text-white' : 'text-fg-secondary hover:text-fg-primary'}`}
          >
            {t('basic')}
          </button>
          <button
            type="button"
            onClick={() => set({ mode: 'advanced' })}
            className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${v.mode === 'advanced' ? 'bg-brand-500 text-white' : 'text-fg-secondary hover:text-fg-primary'}`}
          >
            {t('advanced')}
          </button>
        </div>
      )}

      {/* Basic mode */}
      {v.mode === 'basic' && !forceAdvanced && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('quantity')}</label>
              <input
                type="number" step="any" min="0" className={inputCls}
                value={v.basicQty || ''}
                onChange={(e) => set({ basicQty: +e.target.value })}
                placeholder="4"
              />
            </div>
            <div>
              <label className={labelCls}>{t('unit')}</label>
              <select className={inputCls} value={v.unit} onChange={(e) => set({ unit: e.target.value as StockUnit })}>
                {STOCK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={labelCls}>{t('totalPricePaid')} (&#8362;)</label>
            <input
              type="number" step="any" min="0" className={inputCls}
              value={v.basicPrice || ''}
              onChange={(e) => set({ basicPrice: +e.target.value })}
              placeholder="20"
            />
          </div>
          {d.costPerStockUnit > 0 && (
            <div className="p-3 rounded-lg space-y-2" style={{ background: 'var(--surface-subtle)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-secondary">{t('costPerUnit')} (/{v.unit})</span>
                <span className="text-sm font-semibold text-fg-primary">
                  {d.costPerStockUnit.toFixed(4)} &#8362; {t('exVat')} | {(d.costPerStockUnit * vm).toFixed(4)} &#8362; {t('incVat')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced mode */}
      {(v.mode === 'advanced' || forceAdvanced) && (
        <div className="space-y-4">
          {/* Outer container */}
          <div className={cardCls}>
            <label className="text-xs text-fg-secondary uppercase tracking-wider font-medium">{t('outerContainer')}</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('quantity')}</label>
                <input
                  type="number" step="1" min="0" className={inputCls}
                  value={v.outerQty || ''}
                  onChange={(e) => {
                    const outerQty = +e.target.value;
                    const nextTotal = v.pricePerOuter > 0 ? v.pricePerOuter * outerQty : v.totalPrice;
                    onChange({ ...v, outerQty, totalPrice: nextTotal });
                  }}
                  placeholder="2"
                />
              </div>
              <div>
                <label className={labelCls}>{t('type')}</label>
                <select className={inputCls} value={v.outerType} onChange={(e) => set({ outerType: e.target.value })}>
                  {OUTER_CONTAINERS.map((c) => <option key={c} value={c}>{t(`ct_${c}`)}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Inner unit */}
          <div className={cardCls}>
            <label className="text-xs text-fg-secondary uppercase tracking-wider font-medium">{t('innerUnit')}</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('quantity')} / {t(`ct_${v.outerType}`)}</label>
                <input
                  type="number" step="1" min="0" className={inputCls}
                  value={v.innerQty || ''}
                  onChange={(e) => set({ innerQty: +e.target.value })}
                  placeholder="12"
                />
              </div>
              <div>
                <label className={labelCls}>{t('type')}</label>
                <select className={inputCls} value={v.innerType} onChange={(e) => set({ innerType: e.target.value })}>
                  {INNER_UNITS.map((u) => <option key={u} value={u}>{t(`ut_${u}`)}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>{t('contentPer')} {t(`ut_${v.innerType}`)}</label>
                <input
                  type="number" step="any" min="0" className={inputCls}
                  value={v.contentQty || ''}
                  onChange={(e) => set({ contentQty: +e.target.value })}
                  placeholder="400"
                />
              </div>
              <div>
                <label className={labelCls}>{t('unit')}</label>
                <select className={inputCls} value={v.unit} onChange={(e) => set({ unit: e.target.value as StockUnit })}>
                  {STOCK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('pricePerPackage')} (&#8362;/{t(`ct_${v.outerType}`)})</label>
              <input
                type="number" step="any" min="0" className={inputCls}
                value={v.pricePerOuter || ''}
                onChange={(e) => updateOuterPrice(+e.target.value)}
              />
            </div>
            <div>
              <label className={labelCls}>{t('total')} (&#8362;)</label>
              <input
                type="number" step="any" min="0" className={inputCls}
                value={v.totalPrice || ''}
                onChange={(e) => updateTotalPrice(+e.target.value)}
              />
            </div>
          </div>

          {/* Summary */}
          {d.stockQty > 0 && d.totalPrice > 0 && (
            <div className="p-3 rounded-lg space-y-2" style={{ background: 'var(--surface-subtle)' }}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-secondary">{t('stockTotal')}</span>
                <span className="text-sm font-medium text-fg-primary">{d.stockQty.toLocaleString()} {v.unit}</span>
              </div>
              {v.contentQty > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-fg-secondary">/{t(`ut_${v.innerType}`)} ({v.contentQty}{v.unit})</span>
                  <span className="text-sm font-semibold text-fg-primary">
                    {d.pricePerInner.toFixed(2)} &#8362; <span className="text-fg-tertiary font-normal">{t('exVat')}</span>
                    {' | '}
                    {(d.pricePerInner * vm).toFixed(2)} &#8362; <span className="text-fg-tertiary font-normal">{t('incVat')}</span>
                  </span>
                </div>
              )}
              {v.pricePerOuter > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-fg-secondary">/{t(`ct_${v.outerType}`)}</span>
                  <span className="text-xs text-fg-secondary">
                    {v.pricePerOuter.toFixed(2)} &#8362; {t('exVat')} | {(v.pricePerOuter * vm).toFixed(2)} &#8362; {t('incVat')}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--divider)]">
                <span className="text-xs text-fg-secondary">/{v.unit}</span>
                <span className="text-xs text-fg-secondary">
                  {d.costPerStockUnit.toFixed(4)} &#8362; {t('exVat')} | {(d.costPerStockUnit * vm).toFixed(4)} &#8362; {t('incVat')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
