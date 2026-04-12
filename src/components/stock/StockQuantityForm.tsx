'use client';

import type { StockItem, StockUnit } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { PlusIcon, XMarkIcon, ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

const STOCK_UNITS: StockUnit[] = ['kg', 'g', 'l', 'ml', 'unit', 'pack', 'box', 'bag', 'dose', 'other'];
const OUTER_CONTAINERS = ['carton', 'pack', 'crate', 'sack', 'case'] as const;
const INNER_UNITS = ['bottle', 'can', 'jar', 'bag', 'brick', 'packet', 'box', 'sachet', 'tub'] as const;

// Smart defaults — when the user picks an inner packaging type, the most likely
// measurable unit is pre-selected. User can always override.
const INNER_TYPE_DEFAULT_UNIT: Record<string, StockUnit> = {
  bottle: 'ml',
  brick: 'ml',
  can: 'g',
  jar: 'g',
  bag: 'kg',
  packet: 'g',
  box: 'g',
  sachet: 'g',
  tub: 'g',
};

const OUTER_TYPE_DEFAULT_UNIT: Record<string, StockUnit> = {
  sack: 'kg',
};

/** Value shape for the shared stock quantity / packaging / price form.
 *  `mode`: 'basic' = simple (just qty + price). 'advanced' = structured packaging.
 *  The field is still called `mode` for data compat; the UI no longer exposes tabs. */
export interface StockQuantityValue {
  mode: 'basic' | 'advanced';
  unit: StockUnit;
  // simple (basic) mode
  basicQty: number;
  basicPrice: number;       // total paid
  // structured (advanced) — outer container (pack_count)
  outerQty: number;
  outerType: string;        // carton | pack | crate | sack | case
  // structured — inner unit per outer (pack_size)
  innerQty: number;
  innerType: string;        // bottle | can | jar | ...
  // structured — measurable content per inner (unit_content)
  contentQty: number;
  // pricing
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
  stockQty: number;
  costPerStockUnit: number;
  pricePerInner: number;
  totalInnerUnits: number;
  totalPrice: number;
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

// ─── Validation helpers ────────────────────────────────────────────────────

interface ValidationMessage {
  kind: 'warning' | 'suggestion';
  text: string;
  /** Optional action — a button to apply the fix (e.g. convert g → kg). */
  action?: { label: string; apply: () => StockQuantityValue };
}

function validateQuantity(v: StockQuantityValue, d: DerivedStockQuantity, t: (k: string) => string): ValidationMessage[] {
  const msgs: ValidationMessage[] = [];
  if (d.stockQty > 0) {
    if (v.unit === 'kg' && d.stockQty > 50) {
      msgs.push({
        kind: 'warning',
        text: (t('warnLargeKg') || 'Grande quantité — êtes-vous sûr ?').replace('{qty}', d.stockQty.toString()),
      });
    }
    if (v.unit === 'g' && d.stockQty > 5000) {
      msgs.push({
        kind: 'suggestion',
        text: (t('suggestKgFromG') || 'Passer en kg ?'),
        action: {
          label: t('convertToKg') || 'Convertir en kg',
          apply: () => convertGramsToKg(v),
        },
      });
    }
    if (v.unit === 'ml' && d.stockQty > 5000) {
      msgs.push({
        kind: 'suggestion',
        text: (t('suggestLFromMl') || 'Passer en L ?'),
        action: {
          label: t('convertToL') || 'Convertir en L',
          apply: () => convertMlToL(v),
        },
      });
    }
  }
  return msgs;
}

function convertGramsToKg(v: StockQuantityValue): StockQuantityValue {
  if (v.mode === 'basic') return { ...v, unit: 'kg', basicQty: v.basicQty / 1000 };
  return { ...v, unit: 'kg', contentQty: v.contentQty / 1000 };
}
function convertMlToL(v: StockQuantityValue): StockQuantityValue {
  if (v.mode === 'basic') return { ...v, unit: 'l', basicQty: v.basicQty / 1000 };
  return { ...v, unit: 'l', contentQty: v.contentQty / 1000 };
}

interface Props {
  value: StockQuantityValue;
  onChange: (next: StockQuantityValue) => void;
  vatRate: number;
  /** Compact layout — smaller paddings, for per-line usage inside larger modals. */
  compact?: boolean;
}

/**
 * Shared stock quantity + packaging + price form.
 * Used in: manual stock item modal, delivery import lines, recipe import (new items).
 *
 * UX: progressive disclosure. Starts in simple mode (qty + price). User clicks
 * "+ Ajouter un conditionnement" to reveal structured packaging flow
 * (outer → inner → content). Conversational copy, smart defaults on type change,
 * live summary of resolved totals, and inline warnings for out-of-range values.
 */
export default function StockQuantityForm({ value, onChange, vatRate, compact }: Props) {
  const { t } = useI18n();
  const vm = 1 + vatRate / 100;
  const v = value;
  const d = deriveStockQuantity(v);
  const warnings = validateQuantity(v, d, t);

  const inputCls = compact ? 'input w-full py-1.5 text-sm' : 'input w-full py-2.5 text-sm';
  const labelCls = 'text-sm font-medium text-fg-primary mb-1.5 block';
  const set = (patch: Partial<StockQuantityValue>) => onChange({ ...v, ...patch });

  const expand = () => {
    // Seed structured fields from simple if user had entered something
    const seed: Partial<StockQuantityValue> = { mode: 'advanced' };
    if (v.basicQty > 0 && !v.outerQty) seed.outerQty = 1;
    if (v.basicPrice > 0 && !v.totalPrice) seed.totalPrice = v.basicPrice;
    onChange({ ...v, ...seed });
  };

  const collapse = () => {
    // Carry resolved totals back into simple mode so data isn't lost
    const patch: Partial<StockQuantityValue> = {
      mode: 'basic',
      basicQty: d.stockQty || v.basicQty,
      basicPrice: d.totalPrice || v.basicPrice,
    };
    onChange({ ...v, ...patch });
  };

  // Three-way price sync: pricePerOuter × outerQty = totalPrice ; pricePerOuter = pricePerInner × innerQty
  const updateOuterPrice = (price: number) => {
    set({ pricePerOuter: price, totalPrice: v.outerQty > 0 ? price * v.outerQty : v.totalPrice });
  };
  const updateInnerPrice = (price: number) => {
    const outer = v.innerQty > 0 ? price * v.innerQty : price;
    const total = v.outerQty > 0 ? outer * v.outerQty : v.totalPrice;
    set({ pricePerOuter: outer, totalPrice: total });
  };
  const updateTotalPrice = (total: number) => {
    set({ totalPrice: total, pricePerOuter: v.outerQty > 0 ? total / v.outerQty : v.pricePerOuter });
  };

  const onOuterTypeChange = (outerType: string) => {
    const patch: Partial<StockQuantityValue> = { outerType };
    // Smart default only if no inner level is defined yet (sacks go straight to kg)
    if (v.innerQty === 0 && OUTER_TYPE_DEFAULT_UNIT[outerType]) {
      patch.unit = OUTER_TYPE_DEFAULT_UNIT[outerType];
    }
    set(patch);
  };

  const onInnerTypeChange = (innerType: string) => {
    const patch: Partial<StockQuantityValue> = { innerType };
    if (INNER_TYPE_DEFAULT_UNIT[innerType]) {
      patch.unit = INNER_TYPE_DEFAULT_UNIT[innerType];
    }
    set(patch);
  };

  // ─── Simple mode ────────────────────────────────────────────────────────
  if (v.mode === 'basic') {
    return (
      <div className="space-y-4">
        <div>
          <label className={labelCls}>{t('youBought') || 'Vous avez acheté'}</label>
          <div className="grid grid-cols-[2fr_1fr] gap-2">
            <input
              type="number" step="any" min="0" className={inputCls}
              value={v.basicQty || ''}
              onChange={(e) => set({ basicQty: +e.target.value })}
              placeholder="4"
            />
            <select className={inputCls} value={v.unit} onChange={(e) => set({ unit: e.target.value as StockUnit })}>
              {STOCK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>{t('totalPricePaid') || 'Prix total payé'} (&#8362;)</label>
          <input
            type="number" step="any" min="0" className={inputCls}
            value={v.basicPrice || ''}
            onChange={(e) => set({ basicPrice: +e.target.value })}
            placeholder="20"
          />
        </div>

        {d.costPerStockUnit > 0 && (
          <LiveFeedback cost={d.costPerStockUnit} costTTC={d.costPerStockUnit * vm} unit={v.unit} t={t} />
        )}

        <Warnings messages={warnings} onApply={onChange} t={t} />

        <button
          type="button"
          onClick={expand}
          className="flex items-center gap-1.5 text-sm font-medium text-brand-500 hover:text-brand-400 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          {t('addPackaging') || 'Ajouter un conditionnement'}
        </button>
      </div>
    );
  }

  // ─── Structured mode ────────────────────────────────────────────────────
  const outerLabel = t(`ct_${v.outerType}`) || v.outerType;
  const innerLabel = t(`ut_${v.innerType}`) || v.innerType;

  return (
    <div className="space-y-4">
      {/* Retirer le conditionnement */}
      <div className="flex justify-end -mb-2">
        <button
          type="button"
          onClick={collapse}
          className="flex items-center gap-1 text-xs text-fg-secondary hover:text-fg-primary transition-colors"
        >
          <XMarkIcon className="w-3.5 h-3.5" />
          {t('removePackaging') || 'Retirer le conditionnement'}
        </button>
      </div>

      {/* Step 1: "J'ai acheté 2 cartons" */}
      <div>
        <label className={labelCls}>{t('iBought') || "J'ai acheté"}</label>
        <div className="grid grid-cols-[2fr_1fr] gap-2">
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
          <select className={inputCls} value={v.outerType} onChange={(e) => onOuterTypeChange(e.target.value)}>
            {OUTER_CONTAINERS.map((c) => <option key={c} value={c}>{t(`ct_${c}`)}</option>)}
          </select>
        </div>
      </div>

      {/* Step 2: "Chaque carton contient 12 boîtes" */}
      <div>
        <label className={labelCls}>
          {(t('eachContains') || 'Chaque {name} contient').replace('{name}', outerLabel.toLowerCase())}
        </label>
        <div className="grid grid-cols-[2fr_1fr] gap-2">
          <input
            type="number" step="1" min="0" className={inputCls}
            value={v.innerQty || ''}
            onChange={(e) => set({ innerQty: +e.target.value })}
            placeholder="12"
          />
          <select className={inputCls} value={v.innerType} onChange={(e) => onInnerTypeChange(e.target.value)}>
            {INNER_UNITS.map((u) => <option key={u} value={u}>{t(`ut_${u}`)}</option>)}
          </select>
        </div>
      </div>

      {/* Step 3: "Chaque boîte contient 400 g" */}
      <div>
        <label className={labelCls}>
          {(t('eachContains') || 'Chaque {name} contient').replace('{name}', innerLabel.toLowerCase())}
        </label>
        <div className="grid grid-cols-[2fr_1fr] gap-2">
          <input
            type="number" step="any" min="0" className={inputCls}
            value={v.contentQty || ''}
            onChange={(e) => set({ contentQty: +e.target.value })}
            placeholder="400"
          />
          <select className={inputCls} value={v.unit} onChange={(e) => set({ unit: e.target.value as StockUnit })}>
            {STOCK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {/* Step 4: Price — three synced fields */}
      <div>
        <label className={labelCls}>{t('price') || 'Prix'}</label>
        <div className={`grid gap-2 ${v.innerQty > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          <PriceField
            label={(t('priceOf') || "Prix d'un {name}").replace('{name}', outerLabel.toLowerCase())}
            value={v.pricePerOuter}
            onChange={updateOuterPrice}
            compact={compact}
          />
          {v.innerQty > 0 && (
            <PriceField
              label={(t('priceOf') || "Prix d'un {name}").replace('{name}', innerLabel.toLowerCase())}
              value={d.pricePerInner}
              onChange={updateInnerPrice}
              compact={compact}
              readOnlyLike
            />
          )}
          <PriceField
            label={t('totalPrice') || 'Prix total'}
            value={v.totalPrice}
            onChange={updateTotalPrice}
            compact={compact}
            emphasised
          />
        </div>
      </div>

      {/* Live summary panel — the money panel that makes the math legible */}
      <LiveSummary v={v} d={d} vm={vm} outerLabel={outerLabel} innerLabel={innerLabel} t={t} />

      <Warnings messages={warnings} onApply={onChange} t={t} />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function LiveFeedback({ cost, costTTC, unit, t }: { cost: number; costTTC: number; unit: string; t: (k: string) => string }) {
  return (
    <div className="p-3 rounded-lg text-sm" style={{ background: 'var(--surface-subtle)' }}>
      <div className="flex items-center justify-between">
        <span className="text-fg-secondary">→ {t('perUnitLabel') || 'Par unité'}</span>
        <span className="font-semibold text-fg-primary">
          {cost.toFixed(cost < 1 ? 4 : 2)} &#8362;/{unit} {t('exVat')}
          <span className="text-fg-tertiary font-normal"> · {costTTC.toFixed(costTTC < 1 ? 4 : 2)} {t('incVat')}</span>
        </span>
      </div>
    </div>
  );
}

function PriceField({ label, value, onChange, compact, emphasised, readOnlyLike }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  compact?: boolean;
  emphasised?: boolean;
  readOnlyLike?: boolean;
}) {
  const base = compact ? 'input w-full py-1.5 text-sm' : 'input w-full py-2.5 text-sm';
  const cls = emphasised ? `${base} font-semibold` : readOnlyLike ? `${base} text-fg-secondary` : base;
  return (
    <div>
      <label className="text-xs text-fg-secondary block mb-1">{label} (&#8362;)</label>
      <input
        type="number" step="any" min="0"
        className={cls}
        value={value ? Number(value.toFixed(4)) : ''}
        onChange={(e) => onChange(+e.target.value)}
      />
    </div>
  );
}

function LiveSummary({
  v, d, vm, outerLabel, innerLabel, t,
}: {
  v: StockQuantityValue;
  d: DerivedStockQuantity;
  vm: number;
  outerLabel: string;
  innerLabel: string;
  t: (k: string) => string;
}) {
  if (d.stockQty <= 0 && d.totalPrice <= 0) return null;

  return (
    <div className="p-3 rounded-lg border border-brand-500/20 space-y-2.5" style={{ background: 'var(--surface-subtle)' }}>
      {/* Packaging recap */}
      {d.stockQty > 0 && (
        <div>
          <div className="text-xs text-fg-secondary uppercase tracking-wider font-medium mb-1.5">
            📦 {t('summary') || 'Résumé'}
          </div>
          <div className="space-y-1 text-sm">
            {v.outerQty > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-fg-secondary">{outerLabel}</span>
                <span className="text-fg-primary font-medium">{v.outerQty.toLocaleString()}</span>
              </div>
            )}
            {d.totalInnerUnits > 0 && v.innerQty > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-fg-secondary">{innerLabel}</span>
                <span className="text-fg-primary font-medium">{d.totalInnerUnits.toLocaleString()}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-fg-secondary">{t('totalStock') || 'Total'}</span>
              <span className="text-fg-primary font-semibold">{d.stockQty.toLocaleString()} {v.unit}</span>
            </div>
          </div>
        </div>
      )}

      {/* Price recap */}
      {d.totalPrice > 0 && (
        <div className="pt-2 border-t border-[var(--divider)]">
          <div className="text-xs text-fg-secondary uppercase tracking-wider font-medium mb-1.5">
            💰 {t('price') || 'Prix'}
          </div>
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-fg-secondary">{t('totalPrice') || 'Prix total'}</span>
              <span className="text-fg-primary font-semibold">
                {d.totalPrice.toFixed(2)} &#8362;
                <span className="text-fg-tertiary font-normal"> {t('exVat')}</span>
                {' · '}
                {(d.totalPrice * vm).toFixed(2)} &#8362;
                <span className="text-fg-tertiary font-normal"> {t('incVat')}</span>
              </span>
            </div>
            {d.costPerStockUnit > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-fg-secondary">/ {v.unit}</span>
                <span className="text-fg-primary font-medium">
                  {d.costPerStockUnit.toFixed(d.costPerStockUnit < 1 ? 4 : 2)} &#8362;
                  <span className="text-fg-tertiary font-normal"> {t('exVat')}</span>
                  {' · '}
                  {(d.costPerStockUnit * vm).toFixed(d.costPerStockUnit < 1 ? 4 : 2)} &#8362;
                  <span className="text-fg-tertiary font-normal"> {t('incVat')}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Warnings({ messages, onApply, t }: {
  messages: ValidationMessage[];
  onApply: (v: StockQuantityValue) => void;
  t: (k: string) => string;
}) {
  if (messages.length === 0) return null;
  return (
    <div className="space-y-2">
      {messages.map((m, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 p-2.5 rounded-lg text-sm ${
            m.kind === 'warning'
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
          }`}
        >
          {m.kind === 'warning' ? (
            <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          ) : (
            <ArrowPathIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{m.text}</span>
          {m.action && (
            <button
              type="button"
              onClick={() => onApply(m.action!.apply())}
              className="text-xs font-medium underline hover:no-underline"
            >
              {m.action.label}
            </button>
          )}
        </div>
      ))}
      {/* Keep `t` consumer silent when not needed */}
      <span className="sr-only">{t('warnings') || ''}</span>
    </div>
  );
}
