'use client';

import { useEffect, useRef, useState } from 'react';
import type { StockItem, StockUnit } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ChevronDownIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

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

// Curated per-level option sets. Kept short on purpose so the dropdown is
// a quick choice; legacy values not in the list are surfaced via `withCurrent`.
const OUTER_UNITS: PackagingUnit[] = ['carton', 'pack'];
const INNER_UNITS: PackagingUnit[] = ['can', 'jar', 'packet', 'brick'];

/** Render a curated option list while still surfacing a legacy value (e.g.
 *  `crate`, `bottle`) at the top so existing data isn't silently dropped. */
function withCurrent<T extends string>(list: T[], current: T | undefined): T[] {
  return current && !list.includes(current) ? [current, ...list] : list;
}

/** Canonical i18n key per packaging unit. Traditionally-outer types use `ct_`,
 *  traditionally-inner types use `ut_`. Some (bag, box, pack) can appear on
 *  either level — we pick one canonical key so the label is consistent. */
const UNIT_I18N_KEY: Record<PackagingUnit, string> = {
  carton: 'ct_carton', pack: 'ct_pack', crate: 'ct_crate', sack: 'ct_sack', case: 'ct_case',
  bottle: 'ut_bottle', can: 'ut_can', jar: 'ut_jar', bag: 'ut_bag', brick: 'ut_brick',
  packet: 'ut_packet', box: 'ut_box', sachet: 'ut_sachet', tub: 'ut_tub',
};
const labelFor = (u: PackagingUnit, t: (k: string) => string) => t(UNIT_I18N_KEY[u] || u);

/** Full human name for a base unit, used in the "Display price in" menu
 *  ("Par litre" reads better than "Par l"). Falls back to the abbreviation. */
const BASE_UNIT_NAME_KEY: Record<BaseUnit, string> = {
  g: 'unit_gram', kg: 'unit_kilogram', ml: 'unit_milliliter', l: 'unit_liter', unit: 'unit_piece',
};
const baseUnitName = (u: BaseUnit, t: (k: string) => string) => {
  const translated = t(BASE_UNIT_NAME_KEY[u]);
  return translated && translated !== BASE_UNIT_NAME_KEY[u] ? translated : u;
};

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

  // Typography scale (8px grid): labels 13px medium muted, inputs 15px, price 18px, helper 12px.
  const labelCls = 'text-[13px] font-medium text-fg-secondary mb-2 block tracking-wide';
  // Section rhythm: 20px between rows in compact (per-line in delivery review), 24px otherwise.
  const stackCls = compact ? 'space-y-5' : 'space-y-6';

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

        <PriceSentence value={value} d={d} vm={vm} onChange={onChange} t={t} />
      </div>
    );
  }

  // ─── Packaged (direct or nested) ────────────────────────────────────────
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

      {/* Grow / shrink the packaging structure — matched pair of text links.
          The "−" link replaces the old XMarkIcon next to the inner pair, which
          read as multiplication in a sentence already full of × semantics. */}
      {value.type === 'packaged-direct' && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(promoteToNested(value))}
            className="text-[13px] font-medium text-brand-500 hover:text-brand-400 transition-colors"
          >
            + {t('addIntermediateLevel') || 'Ajouter un niveau intermédiaire'}
          </button>
          <span
            className="inline-flex items-center text-fg-tertiary hover:text-fg-secondary cursor-help transition-colors"
            title={t('intermediateLevelHelp') || 'Ajoutez un niveau entre le contenant extérieur et le contenu : par exemple un carton (extérieur) contenant des conserves (niveau intermédiaire) de 400 g chacune.'}
            aria-label={t('intermediateLevelHelp') || ''}
          >
            <InformationCircleIcon className="w-4 h-4" />
          </span>
        </div>
      )}

      <PriceSentence value={value} d={d} vm={vm} onChange={onChange} t={t} />
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
// Field treatment: subtle fill, light border, 10px radius, 15px medium type.
const fieldBase = 'rounded-[10px] border px-3 py-2 text-[15px] font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors';
const fieldStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
  color: 'var(--text-primary)',
  borderColor: 'rgba(255,255,255,0.08)',
};
const numCls = `${fieldBase} w-16 text-center tabular-nums`;
// Content quantities are commonly 3–4 digits (400, 500, 1000, 1500), so the
// content-pair number gets a wider field than the outer/inner pairs.
const numClsWide = `${fieldBase} w-24 text-center tabular-nums`;
const priceNumCls = `${fieldBase} w-24 text-center text-[15px] font-semibold tabular-nums`;
const selectCls = `${fieldBase} pr-7 max-w-[9rem]`;
const connectorCls = 'text-[13px] text-fg-secondary whitespace-nowrap';
// Each [number][unit] pair wraps atomically so the unit never drops alone.
// 6px inside a pair (tight coupling), 8px between pairs/connectors (sentence rhythm).
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

  const rowCls = 'flex flex-wrap items-center gap-2';

  const outerPair = value.type !== 'simple' && (
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
  );

  const innerPair = value.type === 'packaged-nested' && (
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
          const v = e.target.value;
          // Sentinel option at the bottom of the dropdown lets the user collapse
          // the intermediate level without an extra control on the page.
          if (v === '__remove__') {
            onChange(demoteToDirect(value));
            return;
          }
          const u = v as PackagingUnit;
          onChange({
            ...value,
            innerUnit: u,
            contentUnit: PACKAGING_CONTENT_DEFAULT[u] || value.contentUnit,
          });
        }}
      >
        {withCurrent(INNER_UNITS, value.innerUnit).map((u) => (
          <option key={u} value={u}>{labelFor(u, t)}</option>
        ))}
        <option disabled>──────────</option>
        <option value="__remove__">— {t('removeIntermediateLevel') || 'Retirer le niveau intermédiaire'}</option>
      </select>
    </span>
  );

  const contentPair = value.type !== 'simple' && (
    <span className={pairCls}>
      <input
        type="number" step="any" min="0" className={numClsWide} style={fieldStyle}
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
  );

  return (
    <div>
      <label className={labelCls}>{t('youBought') || 'Vous avez acheté'}</label>
      {value.type === 'simple' && (
        <div className={rowCls}>
          <span className={pairCls}>
            <input
              type="number" step="any" min="0" className={numCls} style={fieldStyle}
              value={fmtNum(value.quantity)}
              onChange={(e) => onChange({ ...value, quantity: +e.target.value })}
              placeholder="0"
            />
            <Step1UnitSelect unit={value.unit} onChange={onStep1UnitChange} t={t} />
          </span>
        </div>
      )}
      {value.type === 'packaged-direct' && (
        <div className={rowCls}>
          {outerPair}
          <span className={connectorCls}>{of}</span>
          {contentPair}
        </div>
      )}
      {value.type === 'packaged-nested' && (
        // Break by clause, not by overflow: each "of …" clause gets its own row
        // so the connector never dangles at end-of-line when the parent wraps.
        <div className="space-y-1.5">
          <div className={rowCls}>
            {outerPair}
            <span className={connectorCls}>{containing}</span>
            {innerPair}
          </div>
          <div className={rowCls}>
            <span className={connectorCls}>{of}</span>
            {contentPair}
          </div>
        </div>
      )}
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
  // First-level select: measurables + curated outer packaging only.
  // Surface a legacy packaging value (e.g. 'crate', 'sack') if the existing
  // item uses one not in OUTER_UNITS, so nothing silently disappears.
  const currentPackaging = !isBaseUnit(unit) ? (unit as PackagingUnit) : undefined;
  const outerOptions = withCurrent(OUTER_UNITS, currentPackaging);
  return (
    <select className={selectCls} style={fieldStyle} value={unit} onChange={(e) => onChange(e.target.value)}>
      <optgroup label={t('measurableUnits') || 'Mesurables'}>
        {BASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
      </optgroup>
      <optgroup label={t('packagingUnits') || 'Conditionnements'}>
        {outerOptions.map((u) => (
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
  value, d, vm, onChange, t,
}: {
  value: StockInput;
  d: Totals;
  vm: number;
  onChange: (v: StockInput) => void;
  t: (k: string) => string;
}) {
  const isPackaged = value.type !== 'simple';
  const hasInner = value.type === 'packaged-nested';
  const hasBase = isPackaged
    ? (value as Extract<StockInput, { type: 'packaged-direct' | 'packaged-nested' }>).contentQuantity > 0
    : true;

  // Cycle only through the packaging levels; Total is always shown separately.
  const cycle: PriceLevel[] = isPackaged
    ? [
        'outer',
        ...(hasInner ? (['inner'] as PriceLevel[]) : []),
        ...(hasBase ? (['base'] as PriceLevel[]) : []),
      ]
    : ['base'];

  const defaultLevel: PriceLevel = cycle[0];
  const [level, setLevel] = useState<PriceLevel>(defaultLevel);
  const effective: PriceLevel = cycle.includes(level) ? level : defaultLevel;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Brief highlight on the price input when the display level changes, so the
  // user sees the number has been recomputed, not just renamed.
  const [flash, setFlash] = useState(false);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 450);
    return () => clearTimeout(id);
  }, [effective]);

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
    return d.baseUnit;
  };

  const canCycle = cycle.length > 1;
  // Menu rows read "Par bouteille" / "Par litre" — the user is picking a
  // display mode, not changing a unit. Packaging names are lowercased.
  const menuRowLabel = (l: PriceLevel): string => {
    const par = t('perLevel') || 'Par';
    if (l === 'base') return `${par} ${baseUnitName(d.baseUnit, t)}`;
    return `${par} ${labelForLevel(l).toLowerCase()}`;
  };
  const levelLabel = (label: React.ReactNode) => canCycle ? (
    <span className="relative inline-block" ref={menuRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={`inline-flex items-center gap-0.5 text-[13px] font-semibold rounded-md px-1.5 py-0.5 -mx-1 -my-0.5 transition-colors ${
          menuOpen
            ? 'text-brand-500 bg-brand-500/10'
            : 'text-fg-primary hover:text-brand-500 hover:bg-[var(--surface-subtle)]'
        }`}
      >
        {label}
        <ChevronDownIcon
          className={`w-3.5 h-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1.5 z-20 min-w-[11rem] rounded-lg border shadow-lg py-1"
          style={{ background: 'var(--surface)', borderColor: 'var(--divider)' }}
        >
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-fg-tertiary">
            {t('displayPriceIn') || 'Afficher le prix en'}
          </div>
          {cycle.map((l) => {
            const active = l === effective;
            return (
              <button
                key={l}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => { setLevel(l); setMenuOpen(false); }}
                className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-[13px] transition-colors ${
                  active
                    ? 'text-brand-500 font-semibold'
                    : 'text-fg-primary hover:bg-[var(--surface-subtle)]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-brand-500' : 'bg-transparent'}`} />
                {menuRowLabel(l)}
              </button>
            );
          })}
        </div>
      )}
    </span>
  ) : (
    <span className="text-[13px] font-semibold text-fg-primary">{label}</span>
  );

  const renderLeading = () => {
    const name = labelForLevel(effective);
    const tmpl = (effective === 'base')
      ? (t('pricePer') || 'Prix au {name}')
      : (t('eachCosts') || 'Chaque {name} coûte');
    const [before, after] = tmpl.split('{name}');
    const displayName = effective === 'base' ? name : name.toLowerCase();
    return (
      <>
        {before && <span className={connectorCls}>{before.trim()}</span>}
        {levelLabel(displayName)}
        {after && <span className={connectorCls}>{after.trim()}</span>}
      </>
    );
  };

  // When the user switches level, pulse the price input so it's obvious the
  // number has been recomputed (not renamed).
  const flashStyle: React.CSSProperties = flash
    ? {
        ...fieldStyle,
        background: 'rgba(241,138,71,0.12)',
        borderColor: 'rgba(241,138,71,0.45)',
      }
    : fieldStyle;

  // Secondary derived price — when the primary is per-pack, show the
  // normalised per-base price alongside (and vice-versa). Lets the user see
  // both "intuition" and "precision" without switching.
  const showSecondary = isPackaged
    && effective !== 'base'
    && d.costPerBase > 0
    && d.baseUnit
    && Math.abs(d.costPerBase - displayed) > 0.005;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {renderLeading()}
        <span className="inline-flex items-center gap-1.5">
          <input
            type="number" step="any" min="0" className={priceNumCls} style={flashStyle}
            value={fmtNum(displayed)}
            onChange={(e) => setFromInput(+e.target.value)}
            placeholder="0.00"
          />
          <span className="text-[15px] font-semibold text-fg-secondary">&#8362;</span>
        </span>
        {showSecondary && (
          <span className="text-[12px] text-fg-tertiary tabular-nums">
            ({t('equivalentTo') || 'soit'} {fmtPrice(d.costPerBase)} &#8362;&nbsp;/&nbsp;{d.baseUnit})
          </span>
        )}
      </div>
      {d.totalPrice > 0 && (
        <div className="text-[12px] tabular-nums pt-0.5">
          <span className="text-fg-tertiary">{t('totalPrice') || 'Prix total'} · </span>
          <span className="font-semibold text-fg-primary">{fmtPrice(d.totalPrice)} &#8362;</span>
          <span className="text-fg-tertiary"> {t('exVat')}</span>
          <span className="text-fg-tertiary"> · </span>
          <span className="font-semibold text-fg-primary">{fmtPrice(d.totalPrice * vm)} &#8362;</span>
          <span className="text-fg-tertiary"> {t('incVat')}</span>
        </div>
      )}
    </div>
  );
}

