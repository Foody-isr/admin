'use client';

import { useState } from 'react';
import type { StockItem, StockUnit } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XMarkIcon, ExclamationTriangleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

// ─── Types ─────────────────────────────────────────────────────────────────

export type BaseUnit = 'g' | 'kg' | 'ml' | 'l' | 'unit';
export type PackagingUnit =
  | 'carton' | 'pack' | 'box' | 'bag' | 'bottle'
  | 'can' | 'jar' | 'sachet' | 'tub' | 'brick' | 'packet'
  | 'crate' | 'sack' | 'case';

export type StockInput =
  | {
      type: 'simple';
      quantity: number;
      unit: BaseUnit;
      totalPrice: number;
    }
  | {
      type: 'packaged-direct';       // outer → base (e.g. sac → 25 kg)
      outerUnit: PackagingUnit;
      outerQuantity: number;
      contentQuantity: number;
      contentUnit: BaseUnit;
      totalPrice: number;
    }
  | {
      type: 'packaged-nested';       // outer → inner → base (e.g. carton → bouteille → ml)
      outerUnit: PackagingUnit;
      outerQuantity: number;
      innerUnit: PackagingUnit;
      innerQuantity: number;
      contentQuantity: number;
      contentUnit: BaseUnit;
      totalPrice: number;
    };

const BASE_UNITS: BaseUnit[] = ['g', 'kg', 'ml', 'l', 'unit'];

const OUTER_UNITS: PackagingUnit[] = ['carton', 'crate', 'case', 'pack', 'sack', 'bag', 'box'];
const INNER_UNITS: PackagingUnit[] = ['bottle', 'can', 'jar', 'box', 'bag', 'brick', 'packet', 'sachet', 'tub', 'pack'];

/** Canonical i18n key per packaging unit. Traditionally-outer types use `ct_`,
 *  traditionally-inner types use `ut_`. Some (bag, box, pack) can appear on
 *  either level — we pick one canonical key so the label is consistent. */
const UNIT_I18N_KEY: Record<PackagingUnit, string> = {
  carton: 'ct_carton', pack: 'ct_pack', crate: 'ct_crate', sack: 'ct_sack', case: 'ct_case',
  bottle: 'ut_bottle', can: 'ut_can', jar: 'ut_jar', bag: 'ut_bag', brick: 'ut_brick',
  packet: 'ut_packet', box: 'ut_box', sachet: 'ut_sachet', tub: 'ut_tub',
};
const labelFor = (u: PackagingUnit, t: (k: string) => string) => t(UNIT_I18N_KEY[u] || u);

const BASE_UNIT_SET = new Set<BaseUnit>(BASE_UNITS);
function isBaseUnit(u: string): u is BaseUnit {
  return BASE_UNIT_SET.has(u as BaseUnit);
}

// Smart defaults: when a packaging unit is chosen, pre-fill the measurable unit below it.
const PACKAGING_CONTENT_DEFAULT: Partial<Record<PackagingUnit, BaseUnit>> = {
  bottle: 'ml', brick: 'ml',
  can: 'g', jar: 'g', box: 'g', packet: 'g', sachet: 'g', tub: 'g',
  bag: 'kg', sack: 'kg',
  carton: 'g', crate: 'kg', case: 'g', pack: 'g',
};

// ─── Defaults / constructors ──────────────────────────────────────────────

export function defaultStockInput(overrides: Partial<StockInput> = {}): StockInput {
  return { type: 'simple', quantity: 0, unit: 'kg', totalPrice: 0, ...overrides } as StockInput;
}

/** Load a server-side StockItem into the union. */
export function serverToStockInput(item: StockItem): StockInput {
  const pack = item.pack_size ?? 0;
  const content = item.unit_content ?? 0;
  const outerType = (item.container_type || '') as PackagingUnit | '';
  const innerType = (item.unit_type || '') as PackagingUnit | '';
  const base = item.unit as BaseUnit;

  // Nested: pack_size + unit_content + container_type + unit_type all present
  if (outerType && innerType && pack > 0 && content > 0) {
    const outerQuantity = Math.max(1, Math.round(item.quantity / (pack * content)));
    return {
      type: 'packaged-nested',
      outerUnit: outerType as PackagingUnit,
      outerQuantity,
      innerUnit: innerType as PackagingUnit,
      innerQuantity: pack,
      contentQuantity: content,
      contentUnit: base,
      totalPrice: item.cost_per_unit * item.quantity,
    };
  }

  // Direct: one packaging level + measurable content, no inner
  if (outerType && content > 0 && pack === 0) {
    const outerQuantity = Math.max(1, Math.round(item.quantity / content));
    return {
      type: 'packaged-direct',
      outerUnit: outerType as PackagingUnit,
      outerQuantity,
      contentQuantity: content,
      contentUnit: base,
      totalPrice: item.cost_per_unit * item.quantity,
    };
  }

  // Fallback: simple
  return {
    type: 'simple',
    quantity: item.quantity,
    unit: base,
    totalPrice: item.cost_per_unit * item.quantity,
  };
}

// ─── Totals / derivations ─────────────────────────────────────────────────

export interface Totals {
  totalBase: number;           // stock quantity in base unit → maps to StockItem.quantity
  baseUnit: BaseUnit;          // what contentUnit / unit resolves to
  costPerBase: number;         // price per base unit → maps to cost_per_unit
  pricePerOuter: number;       // display
  pricePerInner: number;       // display
  totalInnerCount: number;     // outer × inner (or outer when no inner)
  totalOuterCount: number;     // outer
  totalPrice: number;
}

export function deriveTotals(i: StockInput): Totals {
  if (i.type === 'simple') {
    return {
      totalBase: i.quantity,
      baseUnit: i.unit,
      costPerBase: i.quantity > 0 && i.totalPrice > 0 ? i.totalPrice / i.quantity : 0,
      pricePerOuter: 0,
      pricePerInner: 0,
      totalInnerCount: 0,
      totalOuterCount: 0,
      totalPrice: i.totalPrice,
    };
  }
  if (i.type === 'packaged-direct') {
    const totalBase = i.outerQuantity * i.contentQuantity;
    const costPerBase = totalBase > 0 && i.totalPrice > 0 ? i.totalPrice / totalBase : 0;
    const pricePerOuter = i.outerQuantity > 0 ? i.totalPrice / i.outerQuantity : 0;
    return {
      totalBase,
      baseUnit: i.contentUnit,
      costPerBase,
      pricePerOuter,
      pricePerInner: 0,
      totalInnerCount: 0,
      totalOuterCount: i.outerQuantity,
      totalPrice: i.totalPrice,
    };
  }
  // packaged-nested
  const totalInnerCount = i.outerQuantity * i.innerQuantity;
  const totalBase = totalInnerCount * i.contentQuantity;
  const costPerBase = totalBase > 0 && i.totalPrice > 0 ? i.totalPrice / totalBase : 0;
  const pricePerOuter = i.outerQuantity > 0 ? i.totalPrice / i.outerQuantity : 0;
  const pricePerInner = totalInnerCount > 0 ? i.totalPrice / totalInnerCount : 0;
  return {
    totalBase,
    baseUnit: i.contentUnit,
    costPerBase,
    pricePerOuter,
    pricePerInner,
    totalInnerCount,
    totalOuterCount: i.outerQuantity,
    totalPrice: i.totalPrice,
  };
}

/** Convert the union → server-side StockItem fields. */
export function stockInputToServer(i: StockInput) {
  const d = deriveTotals(i);
  if (i.type === 'simple') {
    return {
      unit: i.unit as StockUnit,
      quantity: i.quantity,
      cost_per_unit: d.costPerBase,
      unit_content: 0,
      unit_content_unit: '',
      pack_size: 0,
      container_type: '',
      unit_type: '',
    };
  }
  if (i.type === 'packaged-direct') {
    return {
      unit: i.contentUnit as StockUnit,
      quantity: d.totalBase,
      cost_per_unit: d.costPerBase,
      unit_content: i.contentQuantity,
      unit_content_unit: i.contentUnit,
      pack_size: 0,
      container_type: i.outerUnit,
      unit_type: '',
    };
  }
  return {
    unit: i.contentUnit as StockUnit,
    quantity: d.totalBase,
    cost_per_unit: d.costPerBase,
    unit_content: i.contentQuantity,
    unit_content_unit: i.contentUnit,
    pack_size: i.innerQuantity,
    container_type: i.outerUnit,
    unit_type: i.innerUnit,
  };
}

// ─── Transitions (preserve adjacent data) ─────────────────────────────────

/** From simple → packaged-direct when user picks a packaging unit in Step 1. */
function simpleToDirect(simple: Extract<StockInput, { type: 'simple' }>, outerUnit: PackagingUnit): StockInput {
  const contentUnit: BaseUnit = PACKAGING_CONTENT_DEFAULT[outerUnit] || simple.unit;
  return {
    type: 'packaged-direct',
    outerUnit,
    outerQuantity: simple.quantity > 0 ? Math.max(1, Math.round(simple.quantity)) : 1,
    contentQuantity: 0,
    contentUnit,
    totalPrice: simple.totalPrice,
  };
}

/** Demote packaged → simple when user switches Step 1 back to a base unit. */
function packagedToSimple(p: Extract<StockInput, { type: 'packaged-direct' | 'packaged-nested' }>, unit: BaseUnit): StockInput {
  return {
    type: 'simple',
    quantity: p.outerQuantity > 0 ? p.outerQuantity : 0,
    unit,
    totalPrice: p.totalPrice,
  };
}

/** Promote packaged-direct → packaged-nested. */
function promoteToNested(direct: Extract<StockInput, { type: 'packaged-direct' }>): StockInput {
  return {
    type: 'packaged-nested',
    outerUnit: direct.outerUnit,
    outerQuantity: direct.outerQuantity,
    innerUnit: 'bottle',                       // sensible starting default
    innerQuantity: 1,
    contentQuantity: direct.contentQuantity,
    contentUnit: direct.contentUnit,
    totalPrice: direct.totalPrice,
  };
}

/** Demote packaged-nested → packaged-direct (user clicked ✕ on inner row). */
function demoteToDirect(nested: Extract<StockInput, { type: 'packaged-nested' }>): StockInput {
  return {
    type: 'packaged-direct',
    outerUnit: nested.outerUnit,
    outerQuantity: nested.outerQuantity,
    contentQuantity: nested.contentQuantity,
    contentUnit: nested.contentUnit,
    totalPrice: nested.totalPrice,
  };
}

// ─── Validation ───────────────────────────────────────────────────────────

interface ValidationMessage {
  kind: 'warning' | 'suggestion';
  text: string;
  action?: { label: string; apply: () => StockInput };
}

function validate(input: StockInput, d: Totals, t: (k: string) => string): ValidationMessage[] {
  const msgs: ValidationMessage[] = [];
  const unit = d.baseUnit;
  const qty = d.totalBase;
  if (qty <= 0) return msgs;
  if (unit === 'kg' && qty > 50) {
    msgs.push({ kind: 'warning', text: (t('warnLargeKg') || 'Grande quantité ({qty} kg) — à vérifier.').replace('{qty}', qty.toString()) });
  }
  if (unit === 'g' && qty > 5000) {
    msgs.push({
      kind: 'suggestion',
      text: t('suggestKgFromG') || 'Passer en kg ?',
      action: { label: t('convertToKg') || 'Convertir en kg', apply: () => convertBase(input, 'kg', qty / 1000) },
    });
  }
  if (unit === 'ml' && qty > 5000) {
    msgs.push({
      kind: 'suggestion',
      text: t('suggestLFromMl') || 'Passer en L ?',
      action: { label: t('convertToL') || 'Convertir en L', apply: () => convertBase(input, 'l', qty / 1000) },
    });
  }
  return msgs;
}

function convertBase(input: StockInput, nextUnit: BaseUnit, nextTotal: number): StockInput {
  if (input.type === 'simple') return { ...input, unit: nextUnit, quantity: nextTotal };
  if (input.type === 'packaged-direct') {
    return { ...input, contentUnit: nextUnit, contentQuantity: nextTotal / (input.outerQuantity || 1) };
  }
  const innerTotal = input.outerQuantity * input.innerQuantity || 1;
  return { ...input, contentUnit: nextUnit, contentQuantity: nextTotal / innerTotal };
}

// ─── Display helpers ──────────────────────────────────────────────────────

function fmtNum(n: number, maxDecimals = 4): string {
  if (!isFinite(n) || n === 0) return '';
  const rounded = Number(n.toFixed(maxDecimals));
  return String(rounded);
}
function fmtPrice(n: number): string {
  if (!isFinite(n) || n === 0) return '0.00';
  return n < 1 ? n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : n.toFixed(2);
}

// ─── Component ────────────────────────────────────────────────────────────

interface Props {
  value: StockInput;
  onChange: (next: StockInput) => void;
  vatRate: number;
  /** Compact layout — smaller paddings, for per-line usage inside larger modals. */
  compact?: boolean;
}

export default function StockQuantityForm({ value, onChange, vatRate, compact }: Props) {
  const { t } = useI18n();
  const vm = 1 + vatRate / 100;
  const d = deriveTotals(value);
  const warnings = validate(value, d, t);

  const inputCls = compact ? 'input w-full py-1.5 text-sm' : 'input w-full py-2.5 text-sm';
  const labelCls = 'text-sm font-medium text-fg-primary mb-1.5 block';

  // Step 1: unit change (pivot — may change the variant type)
  const onStep1UnitChange = (u: string) => {
    if (isBaseUnit(u)) {
      // Target = simple
      if (value.type === 'simple') onChange({ ...value, unit: u });
      else onChange(packagedToSimple(value, u));
      return;
    }
    // Target = packaging
    const outerUnit = u as PackagingUnit;
    if (value.type === 'simple') {
      onChange(simpleToDirect(value, outerUnit));
    } else {
      onChange({ ...value, outerUnit });
    }
  };

  // ─── Simple ─────────────────────────────────────────────────────────────
  if (value.type === 'simple') {
    return (
      <div className="space-y-4">
        <Step1Row
          labelCls={labelCls} inputCls={inputCls}
          label={t('youBought') || 'Vous avez acheté'}
          qty={value.quantity}
          onQtyChange={(q) => onChange({ ...value, quantity: q })}
          unit={value.unit}
          onUnitChange={onStep1UnitChange}
          t={t}
        />

        <div>
          <label className={labelCls}>{t('totalPricePaid') || 'Prix total payé'} (&#8362;)</label>
          <input
            type="number" step="any" min="0" className={inputCls}
            value={fmtNum(value.totalPrice)}
            onChange={(e) => onChange({ ...value, totalPrice: +e.target.value })}
            placeholder="0.00"
          />
        </div>

        {d.costPerBase > 0 && (
          <LiveFeedback cost={d.costPerBase} costTTC={d.costPerBase * vm} unit={value.unit} t={t} />
        )}

        <Warnings messages={warnings} onApply={onChange} />
      </div>
    );
  }

  // ─── Packaged (direct or nested) ────────────────────────────────────────
  const outerLabel = labelFor(value.outerUnit, t);
  const innerLabel = value.type === 'packaged-nested' ? labelFor(value.innerUnit, t) : '';

  return (
    <div className="space-y-4">
      {/* Step 1 */}
      <Step1Row
        labelCls={labelCls} inputCls={inputCls}
        label={t('youBought') || 'Vous avez acheté'}
        qty={value.outerQuantity}
        qtyStep={1}
        onQtyChange={(q) => {
          const total = d.pricePerOuter > 0 ? d.pricePerOuter * q : value.totalPrice;
          onChange({ ...value, outerQuantity: q, totalPrice: total });
        }}
        unit={value.outerUnit}
        onUnitChange={onStep1UnitChange}
        t={t}
      />

      {/* Step 2a: inner (only if nested) */}
      {value.type === 'packaged-nested' && (
        <LevelRow
          labelCls={labelCls} inputCls={inputCls}
          label={(t('eachContains') || 'Chaque {name} contient').replace('{name}', outerLabel.toLowerCase())}
          qty={value.innerQuantity} qtyStep={1}
          onQtyChange={(q) => onChange({ ...value, innerQuantity: q })}
          unit={value.innerUnit}
          unitOptions={INNER_UNITS.map((u) => ({ value: u, label: labelFor(u, t) }))}
          onUnitChange={(u) => onChange({ ...value, innerUnit: u as PackagingUnit, contentUnit: PACKAGING_CONTENT_DEFAULT[u as PackagingUnit] || value.contentUnit })}
          onRemove={() => onChange(demoteToDirect(value))}
        />
      )}

      {/* Step 2b/3: content row (always for packaged, labelled by inner or outer) */}
      <LevelRow
        labelCls={labelCls} inputCls={inputCls}
        label={(t('eachContains') || 'Chaque {name} contient').replace(
          '{name}',
          (value.type === 'packaged-nested' ? innerLabel : outerLabel).toLowerCase(),
        )}
        qty={value.contentQuantity}
        onQtyChange={(q) => onChange({ ...value, contentQuantity: q })}
        unit={value.contentUnit}
        unitOptions={BASE_UNITS.map((u) => ({ value: u, label: u }))}
        onUnitChange={(u) => onChange({ ...value, contentUnit: u as BaseUnit })}
      />

      {/* Promote link (direct → nested) */}
      {value.type === 'packaged-direct' && (
        <button
          type="button"
          onClick={() => onChange(promoteToNested(value))}
          className="text-sm font-medium text-brand-500 hover:text-brand-400 transition-colors"
        >
          + {t('addIntermediateLevel') || 'Ajouter un niveau intermédiaire'}
        </button>
      )}

      {/* Price */}
      <PriceInputWithLevel
        input={value}
        d={d}
        outerLabel={outerLabel}
        innerLabel={innerLabel}
        onTotalChange={(total) => onChange({ ...value, totalPrice: total })}
        onOuterChange={(perOuter) => onChange({ ...value, totalPrice: perOuter * value.outerQuantity })}
        onInnerChange={value.type === 'packaged-nested'
          ? (perInner) => onChange({ ...value, totalPrice: perInner * (value.outerQuantity * value.innerQuantity) })
          : undefined}
        onBaseChange={(perBase) => onChange({ ...value, totalPrice: perBase * d.totalBase })}
        compact={compact}
        labelCls={labelCls}
        t={t}
      />

      <LiveSummary input={value} d={d} vm={vm} outerLabel={outerLabel} innerLabel={innerLabel} t={t} />
      <Warnings messages={warnings} onApply={onChange} />
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Step1Row({
  label, qty, qtyStep, onQtyChange, unit, onUnitChange, inputCls, labelCls, t,
}: {
  label: string;
  qty: number;
  qtyStep?: number | 'any';
  onQtyChange: (n: number) => void;
  unit: string;
  onUnitChange: (u: string) => void;
  inputCls: string;
  labelCls: string;
  t: (k: string) => string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <input
          type="number" step={qtyStep ?? 'any'} min="0" className={inputCls}
          value={fmtNum(qty)}
          onChange={(e) => onQtyChange(+e.target.value)}
          placeholder="0"
        />
        <select className={inputCls} value={unit} onChange={(e) => onUnitChange(e.target.value)}>
          <optgroup label={t('measurableUnits') || 'Mesurables'}>
            {BASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </optgroup>
          <optgroup label={t('packagingUnits') || 'Conditionnements'}>
            {Array.from(new Set([...OUTER_UNITS, ...INNER_UNITS])).map((u) => (
              <option key={u} value={u}>{labelFor(u, t)}</option>
            ))}
          </optgroup>
        </select>
      </div>
    </div>
  );
}

function LevelRow({
  label, qty, qtyStep, onQtyChange, unit, unitOptions, onUnitChange, onRemove, inputCls, labelCls,
}: {
  label: string;
  qty: number;
  qtyStep?: number | 'any';
  onQtyChange: (n: number) => void;
  unit: string;
  unitOptions: { value: string; label: string }[];
  onUnitChange: (u: string) => void;
  onRemove?: () => void;
  inputCls: string;
  labelCls: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className={labelCls + ' mb-0'}>{label}</label>
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-fg-secondary hover:text-fg-primary transition-colors">
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <input
          type="number" step={qtyStep ?? 'any'} min="0" className={inputCls}
          value={fmtNum(qty)}
          onChange={(e) => onQtyChange(+e.target.value)}
          placeholder="0"
        />
        <select className={inputCls} value={unit} onChange={(e) => onUnitChange(e.target.value)}>
          {unitOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>
    </div>
  );
}

function LiveFeedback({ cost, costTTC, unit, t }: { cost: number; costTTC: number; unit: string; t: (k: string) => string }) {
  return (
    <div className="p-3 rounded-lg text-sm" style={{ background: 'var(--surface-subtle)' }}>
      <div className="flex items-center justify-between">
        <span className="text-fg-secondary">→ {t('perUnitLabel') || 'Par unité'}</span>
        <span className="font-semibold text-fg-primary">
          {fmtPrice(cost)} &#8362;/{unit} {t('exVat')}
          <span className="text-fg-tertiary font-normal"> · {fmtPrice(costTTC)} {t('incVat')}</span>
        </span>
      </div>
    </div>
  );
}

type PriceLevel = 'total' | 'outer' | 'inner' | 'base';

function PriceInputWithLevel({
  input, d, outerLabel, innerLabel,
  onTotalChange, onOuterChange, onInnerChange, onBaseChange,
  compact, labelCls, t,
}: {
  input: Extract<StockInput, { type: 'packaged-direct' | 'packaged-nested' }>;
  d: Totals;
  outerLabel: string;
  innerLabel: string;
  onTotalChange: (n: number) => void;
  onOuterChange: (n: number) => void;
  onInnerChange?: (n: number) => void;
  onBaseChange: (n: number) => void;
  compact?: boolean;
  labelCls: string;
  t: (k: string) => string;
}) {
  const [level, setLevel] = useState<PriceLevel>('outer');
  const hasInner = input.type === 'packaged-nested';
  const hasBase = input.contentQuantity > 0;

  // Default gracefully if the selected level no longer applies
  const effectiveLevel: PriceLevel =
    (level === 'inner' && !hasInner) ? 'outer'
    : (level === 'base' && !hasBase) ? 'outer'
    : level;

  const displayed = (() => {
    switch (effectiveLevel) {
      case 'outer': return d.pricePerOuter;
      case 'inner': return d.pricePerInner;
      case 'base':  return d.costPerBase;
      case 'total':
      default:      return d.totalPrice;
    }
  })();

  const onInput = (n: number) => {
    switch (effectiveLevel) {
      case 'outer': onOuterChange(n); break;
      case 'inner': onInnerChange?.(n); break;
      case 'base':  onBaseChange(n); break;
      case 'total':
      default:      onTotalChange(n); break;
    }
  };

  const inputCls = compact ? 'input w-full py-1.5 text-sm' : 'input w-full py-2.5 text-sm';

  return (
    <div>
      <label className={labelCls}>{t('price') || 'Prix'} (&#8362;)</label>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <input
          type="number" step="any" min="0" className={inputCls}
          value={fmtNum(displayed)}
          onChange={(e) => onInput(+e.target.value)}
          placeholder="0.00"
        />
        <select className={inputCls} value={effectiveLevel} onChange={(e) => setLevel(e.target.value as PriceLevel)}>
          <option value="outer">{(t('perLabel') || 'par {name}').replace('{name}', outerLabel.toLowerCase())}</option>
          {hasInner && <option value="inner">{(t('perLabel') || 'par {name}').replace('{name}', innerLabel.toLowerCase())}</option>}
          {hasBase && <option value="base">{(t('perLabel') || 'par {name}').replace('{name}', d.baseUnit)}</option>}
          <option value="total">{t('perTotal') || 'Total'}</option>
        </select>
      </div>
    </div>
  );
}

function LiveSummary({
  input, d, vm, outerLabel, innerLabel, t,
}: {
  input: StockInput;
  d: Totals;
  vm: number;
  outerLabel: string;
  innerLabel: string;
  t: (k: string) => string;
}) {
  if (d.totalBase <= 0 && d.totalPrice <= 0) return null;
  const isPackaged = input.type !== 'simple';
  const isNested = input.type === 'packaged-nested';

  const priceRow = (label: string, priceEx: number) => (
    <div className="flex items-center justify-between">
      <span className="text-fg-secondary">{label}</span>
      <span className="text-fg-primary font-medium">
        {fmtPrice(priceEx)} &#8362;
        <span className="text-fg-tertiary font-normal"> {t('exVat')}</span>
        {' · '}
        {fmtPrice(priceEx * vm)} &#8362;
        <span className="text-fg-tertiary font-normal"> {t('incVat')}</span>
      </span>
    </div>
  );

  return (
    <div
      className="p-3 rounded-lg border border-brand-500/20 grid gap-3 sm:grid-cols-2"
      style={{ background: 'var(--surface-subtle)' }}
    >
      {d.totalBase > 0 && isPackaged && (
        <div>
          <div className="text-xs text-fg-secondary uppercase tracking-wider font-medium mb-1.5">
            📦 {t('summary') || 'Résumé'}
          </div>
          <div className="space-y-1 text-sm">
            {d.totalOuterCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-fg-secondary">{outerLabel}</span>
                <span className="text-fg-primary font-medium">{d.totalOuterCount.toLocaleString()}</span>
              </div>
            )}
            {d.totalInnerCount > 0 && isNested && (
              <div className="flex items-center justify-between">
                <span className="text-fg-secondary">{innerLabel}</span>
                <span className="text-fg-primary font-medium">{d.totalInnerCount.toLocaleString()}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-fg-secondary">{t('totalStock') || 'Total'}</span>
              <span className="text-fg-primary font-semibold">{fmtNum(d.totalBase, 3)} {d.baseUnit}</span>
            </div>
          </div>
        </div>
      )}

      {d.totalPrice > 0 && (
        <div>
          <div className="text-xs text-fg-secondary uppercase tracking-wider font-medium mb-1.5">
            💰 {t('price') || 'Prix'}
          </div>
          <div className="space-y-1 text-sm">
            {priceRow(t('totalPrice') || 'Prix total', d.totalPrice)}
            {isPackaged && d.pricePerOuter > 0 && priceRow(`/ ${outerLabel.toLowerCase()}`, d.pricePerOuter)}
            {isNested && d.pricePerInner > 0 && priceRow(`/ ${innerLabel.toLowerCase()}`, d.pricePerInner)}
            {d.costPerBase > 0 && priceRow(`/ ${d.baseUnit}`, d.costPerBase)}
          </div>
        </div>
      )}
    </div>
  );
}

function Warnings({ messages, onApply }: { messages: ValidationMessage[]; onApply: (v: StockInput) => void }) {
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
    </div>
  );
}
