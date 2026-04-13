'use client';

import { useState } from 'react';
import type { StockItem, StockUnit } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { XMarkIcon } from '@heroicons/react/24/outline';

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

  const labelCls = compact
    ? 'text-xs font-medium text-fg-primary mb-1 block'
    : 'text-sm font-medium text-fg-primary mb-1 block';
  const stackCls = compact ? 'space-y-2.5' : 'space-y-3';

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
      <div className={stackCls}>
        <SentenceBuilder
          value={value}
          onChange={onChange}
          onStep1UnitChange={onStep1UnitChange}
          d={d}
          labelCls={labelCls}
          t={t}
        />

        <PriceSentence value={value} d={d} onChange={onChange} t={t} />

        <LiveSummary input={value} d={d} vm={vm} outerLabel="" innerLabel="" t={t} />
      </div>
    );
  }

  // ─── Packaged (direct or nested) ────────────────────────────────────────
  const outerLabel = labelFor(value.outerUnit, t);
  const innerLabel = value.type === 'packaged-nested' ? labelFor(value.innerUnit, t) : '';

  return (
    <div className={stackCls}>
      <SentenceBuilder
        value={value}
        onChange={onChange}
        onStep1UnitChange={onStep1UnitChange}
        d={d}
        labelCls={labelCls}
        t={t}
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

      <PriceSentence value={value} d={d} onChange={onChange} t={t} />

      <LiveSummary input={value} d={d} vm={vm} outerLabel={outerLabel} innerLabel={innerLabel} t={t} />
    </div>
  );
}

// ─── Sentence Builder ─────────────────────────────────────────────────────
// Renders the packaging spec as one inline sentence:
//   simple:   [qty] [unit ▾]
//   direct:   [outerQty] [outerUnit ▾]   de   [contentQty] [contentUnit ▾]
//   nested:   [outerQty] [outerUnit ▾]   contenant   [innerQty] [innerUnit ▾] [×]   de   [contentQty] [contentUnit ▾]

// Inline-sentence inputs intentionally bypass the global `.input` class because
// it pins `width: 100%` and large padding via @apply, which would force every
// segment onto its own line and defeat the sentence layout.
const fieldBase = 'rounded-standard border px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent';
const fieldStyle: React.CSSProperties = {
  background: 'var(--surface)',
  color: 'var(--text-primary)',
  borderColor: 'var(--divider)',
};
const numCls = `${fieldBase} w-16 text-center`;
const priceNumCls = `${fieldBase} w-24 text-center`;
const selectCls = `${fieldBase} pr-7 max-w-[8rem]`;
const connectorCls = 'text-sm text-fg-secondary whitespace-nowrap';
// Each [number][unit] pair wraps as one atomic unit so the unit can't break
// onto a line by itself when the row gets tight.
const pairCls = 'inline-flex items-center gap-1.5';

function SentenceBuilder({
  value, onChange, onStep1UnitChange, d, labelCls, t,
}: {
  value: StockInput;
  onChange: (v: StockInput) => void;
  onStep1UnitChange: (u: string) => void;
  d: Totals;
  labelCls: string;
  t: (k: string) => string;
}) {
  const containing = t('containing') || 'contenant';
  const of = t('of') || 'de';

  return (
    <div>
      <label className={labelCls}>{t('youBought') || 'Vous avez acheté'}</label>
      <div className="flex flex-wrap items-center gap-2">
        {value.type === 'simple' ? (
          <span className={pairCls}>
            <input
              type="number" step="any" min="0" className={numCls} style={fieldStyle}
              value={fmtNum(value.quantity)}
              onChange={(e) => onChange({ ...value, quantity: +e.target.value })}
              placeholder="0"
            />
            <Step1UnitSelect unit={value.unit} onChange={onStep1UnitChange} t={t} />
          </span>
        ) : (
          <>
            {/* Outer */}
            <span className={pairCls}>
              <input
                type="number" step={1} min="0" className={numCls} style={fieldStyle}
                value={fmtNum(value.outerQuantity)}
                onChange={(e) => {
                  const q = +e.target.value;
                  const total = d.pricePerOuter > 0 ? d.pricePerOuter * q : value.totalPrice;
                  onChange({ ...value, outerQuantity: q, totalPrice: total });
                }}
                placeholder="0"
              />
              <Step1UnitSelect unit={value.outerUnit} onChange={onStep1UnitChange} t={t} />
            </span>

            {/* Inner (nested only) */}
            {value.type === 'packaged-nested' && (
              <>
                <span className={connectorCls}>{containing}</span>
                <span className={pairCls}>
                  <input
                    type="number" step={1} min="0" className={numCls} style={fieldStyle}
                    value={fmtNum(value.innerQuantity)}
                    onChange={(e) => onChange({ ...value, innerQuantity: +e.target.value })}
                    placeholder="0"
                  />
                  <select
                    className={selectCls}
                    style={fieldStyle}
                    value={value.innerUnit}
                    onChange={(e) => {
                      const u = e.target.value as PackagingUnit;
                      onChange({
                        ...value,
                        innerUnit: u,
                        contentUnit: PACKAGING_CONTENT_DEFAULT[u] || value.contentUnit,
                      });
                    }}
                  >
                    {INNER_UNITS.map((u) => <option key={u} value={u}>{labelFor(u, t)}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => onChange(demoteToDirect(value))}
                    className="text-fg-tertiary hover:text-fg-primary transition-colors p-1 -ml-1"
                    aria-label={t('removeLevel') || 'Retirer ce niveau'}
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </span>
              </>
            )}

            {/* Content */}
            <span className={connectorCls}>{of}</span>
            <span className={pairCls}>
              <input
                type="number" step="any" min="0" className={numCls} style={fieldStyle}
                value={fmtNum(value.contentQuantity)}
                onChange={(e) => onChange({ ...value, contentQuantity: +e.target.value })}
                placeholder="0"
              />
              <select
                className={selectCls}
                style={fieldStyle}
                value={value.contentUnit}
                onChange={(e) => onChange({ ...value, contentUnit: e.target.value as BaseUnit })}
              >
                {BASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function Step1UnitSelect({
  unit, onChange, t,
}: {
  unit: string;
  onChange: (u: string) => void;
  t: (k: string) => string;
}) {
  return (
    <select className={selectCls} style={fieldStyle} value={unit} onChange={(e) => onChange(e.target.value)}>
      <optgroup label={t('measurableUnits') || 'Mesurables'}>
        {BASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </optgroup>
      <optgroup label={t('packagingUnits') || 'Conditionnements'}>
        {Array.from(new Set([...OUTER_UNITS, ...INNER_UNITS])).map((u) => (
          <option key={u} value={u}>{labelFor(u, t)}</option>
        ))}
      </optgroup>
    </select>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────


type PriceLevel = 'total' | 'outer' | 'inner' | 'base';

// Sentence-form price input that auto-picks the natural level and lets the
// user click the unit label to cycle through the other levels (no dropdown).
//   simple:    "Prix au [kg ↻]  [ N ] ₪"
//   packaged:  "Chaque [carton ↻] coûte  [ N ] ₪"
function PriceSentence({
  value, d, onChange, t,
}: {
  value: StockInput;
  d: Totals;
  onChange: (v: StockInput) => void;
  t: (k: string) => string;
}) {
  const isPackaged = value.type !== 'simple';
  const hasInner = value.type === 'packaged-nested';
  const hasBase = isPackaged
    ? (value as Extract<StockInput, { type: 'packaged-direct' | 'packaged-nested' }>).contentQuantity > 0
    : true;

  const cycle: PriceLevel[] = isPackaged
    ? [
        'outer',
        ...(hasInner ? (['inner'] as PriceLevel[]) : []),
        ...(hasBase ? (['base'] as PriceLevel[]) : []),
        'total',
      ]
    : ['base', 'total'];

  const defaultLevel: PriceLevel = cycle[0];
  const [level, setLevel] = useState<PriceLevel>(defaultLevel);
  const effective: PriceLevel = cycle.includes(level) ? level : defaultLevel;

  const cycleNext = () => {
    const i = cycle.indexOf(effective);
    setLevel(cycle[(i + 1) % cycle.length]);
  };

  const displayed = (() => {
    switch (effective) {
      case 'outer': return d.pricePerOuter;
      case 'inner': return d.pricePerInner;
      case 'base':  return d.costPerBase;
      case 'total': return d.totalPrice;
    }
  })();

  const setFromInput = (n: number) => {
    if (value.type === 'simple') {
      const total = effective === 'base' ? n * value.quantity : n;
      onChange({ ...value, totalPrice: total });
      return;
    }
    let total = n;
    if (effective === 'outer') total = n * value.outerQuantity;
    else if (effective === 'inner' && value.type === 'packaged-nested') {
      total = n * (value.outerQuantity * value.innerQuantity);
    } else if (effective === 'base') total = n * d.totalBase;
    onChange({ ...value, totalPrice: total });
  };

  const labelForLevel = (l: PriceLevel): string => {
    if (l === 'outer' && isPackaged) {
      return labelFor(
        (value as Extract<StockInput, { type: 'packaged-direct' | 'packaged-nested' }>).outerUnit,
        t,
      );
    }
    if (l === 'inner' && value.type === 'packaged-nested') return labelFor(value.innerUnit, t);
    if (l === 'base') return d.baseUnit;
    return t('total') || 'Total';
  };

  const cycleBtn = (label: React.ReactNode) => (
    <button
      type="button"
      onClick={cycleNext}
      title={t('changeLevel') || 'Changer le niveau'}
      className="font-medium text-fg-primary border-b border-dashed border-fg-tertiary hover:border-brand-500 hover:text-brand-500 transition-colors"
    >
      {label}
    </button>
  );

  const renderLeading = () => {
    const name = labelForLevel(effective);
    if (effective === 'outer' || effective === 'inner') {
      const tmpl = t('eachCosts') || 'Chaque {name} coûte';
      const [before, after] = tmpl.split('{name}');
      return (
        <>
          {before && <span className={connectorCls}>{before.trim()}</span>}
          {cycleBtn(name.toLowerCase())}
          {after && <span className={connectorCls}>{after.trim()}</span>}
        </>
      );
    }
    if (effective === 'base') {
      const tmpl = t('pricePer') || 'Prix au {name}';
      const [before, after] = tmpl.split('{name}');
      return (
        <>
          {before && <span className={connectorCls}>{before.trim()}</span>}
          {cycleBtn(name)}
          {after && <span className={connectorCls}>{after.trim()}</span>}
        </>
      );
    }
    return cycleBtn(t('totalPrice') || 'Prix total');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {renderLeading()}
      <span className={pairCls}>
        <input
          type="number" step="any" min="0" className={priceNumCls} style={fieldStyle}
          value={fmtNum(displayed)}
          onChange={(e) => setFromInput(+e.target.value)}
          placeholder="0.00"
        />
        <span className={connectorCls}>&#8362;</span>
      </span>
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

  // A packaging level is "redundant" when its price equals the base price —
  // e.g. "1 carton = 1 kg" makes /carton and /kg the same number.
  const samePrice = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const showOuterPrice = isPackaged && d.pricePerOuter > 0 && !samePrice(d.pricePerOuter, d.costPerBase);
  const showInnerPrice = isNested && d.pricePerInner > 0
    && !samePrice(d.pricePerInner, d.costPerBase)
    && !samePrice(d.pricePerInner, d.pricePerOuter);

  // Résumé rows collapse too: when total count at a level equals the base total
  // (pack/content = 1 of the base unit), that row adds no information.
  const showOuterCount = d.totalOuterCount > 0 && d.totalOuterCount !== d.totalBase;
  const showInnerCount = isNested && d.totalInnerCount > 0 && d.totalInnerCount !== d.totalBase;
  const showTotalStock = d.totalBase > 0 && (showOuterCount || showInnerCount || !isPackaged);

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
      {d.totalBase > 0 && isPackaged && (showOuterCount || showInnerCount || showTotalStock) && (
        <div>
          <div className="text-xs text-fg-secondary uppercase tracking-wider font-medium mb-1.5">
            📦 {t('summary') || 'Résumé'}
          </div>
          <div className="space-y-1 text-sm">
            {showOuterCount && (
              <div className="flex items-center justify-between">
                <span className="text-fg-secondary">{outerLabel}</span>
                <span className="text-fg-primary font-medium">{d.totalOuterCount.toLocaleString()}</span>
              </div>
            )}
            {showInnerCount && (
              <div className="flex items-center justify-between">
                <span className="text-fg-secondary">{innerLabel}</span>
                <span className="text-fg-primary font-medium">{d.totalInnerCount.toLocaleString()}</span>
              </div>
            )}
            {showTotalStock && (
              <div className="flex items-center justify-between">
                <span className="text-fg-secondary">{t('totalStock') || 'Total'}</span>
                <span className="text-fg-primary font-semibold">{fmtNum(d.totalBase, 3)} {d.baseUnit}</span>
              </div>
            )}
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
            {showOuterPrice && priceRow(`/ ${outerLabel.toLowerCase()}`, d.pricePerOuter)}
            {showInnerPrice && priceRow(`/ ${innerLabel.toLowerCase()}`, d.pricePerInner)}
            {d.costPerBase > 0 && priceRow(`/ ${d.baseUnit}`, d.costPerBase)}
          </div>
        </div>
      )}
    </div>
  );
}

