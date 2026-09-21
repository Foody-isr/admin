'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import type { Component } from '../types';
import { useI18n, useCurrency } from '@/lib/i18n';
import { EstimatedPriceBadge } from './EstimatedPriceBadge';

/** Editable stock ingredient row that reflows into two levels on small screens. */
export function IngredientRow({
  c,
  onChange,
  onRemove,
  canManage,
}: {
  c: Component;
  onChange: (next: Component) => void;
  onRemove: () => void;
  canManage: boolean;
}) {
  const { money } = useCurrency();
  const { t } = useI18n();
  const isExisting = c.kind === 'stock_existing';
  const units = unitsFor(c);
  const costLabel = c.cost_status === 'verified' ? t('labCostVerified') : c.cost_status === 'estimated' ? t('labCostEstimated') : t('labCostUnknown');

  return (
    <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2 rounded-[9px] px-2 py-2 hover:bg-[var(--surface-2)] md:grid-cols-[auto_minmax(160px,1fr)_76px_68px_64px_82px_minmax(80px,auto)_auto] md:gap-2 md:py-1">
      <span className="w-9" title={costLabel}>
        {c.cost_status === 'unknown' ? <CostBadge label="?" color="var(--fg-muted)" /> : isExisting && c.cost_status !== 'estimated' ? <RealBadge /> : <EstimatedPriceBadge confidence={c.price_confidence} />}
      </span>

      <span className="truncate pe-8 text-sm font-medium text-[var(--fg)] md:pe-0 md:text-xs md:font-normal">
        {c.name_primary || c.name_he || '—'}
      </span>

      <div className="col-span-2 grid grid-cols-[76px_60px_68px_minmax(70px,1fr)] items-center gap-2 md:contents">
        {canManage ? (
          <input
            type="number"
            value={c.qty}
            min={0}
            step="any"
            onChange={(event) => onChange({ ...c, qty: parseFloat(event.target.value) || 0 })}
            className={inputClass}
            aria-label={t('labQuantity')}
          />
        ) : <span className="text-end text-xs tabular-nums">{c.qty}</span>}

        {canManage ? (
          <label className="flex items-center gap-1 text-[10px] text-[var(--fg-muted)]" title={t('labWasteHelp')}>
            <input
              type="number"
              value={c.waste_pct ?? 0}
              min={0}
              max={99}
              step={1}
              onChange={(event) => onChange({ ...c, waste_pct: Math.min(99, Math.max(0, Number(event.target.value))) })}
              className={inputClass}
              aria-label={t('labWaste')}
            />%
          </label>
        ) : <span className="text-xs text-[var(--fg-muted)]">{c.waste_pct ? `${c.waste_pct}%` : '—'}</span>}

        {canManage ? (
          <select value={c.unit} onChange={(event) => onChange({ ...c, unit: event.target.value })} className={inputClass} aria-label={t('labUnit')}>
            {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        ) : <span className="text-xs">{c.unit}</span>}

        <span className="text-end text-xs font-semibold tabular-nums text-[var(--fg)]">{money(c.line_cost ?? 0)}</span>

        <span className="col-span-4 text-[10px] text-[var(--fg-muted)] md:col-auto">
          {c.target_cost_per_unit != null && c.cost_per_unit != null && c.target_cost_per_unit < c.cost_per_unit
            ? `${t('labTargetLeq')} ${money(c.target_cost_per_unit)}/${c.unit}`
            : null}
        </span>
      </div>

      {canManage ? (
        <button onClick={onRemove} aria-label={t('labRemoveIngredient')} className="absolute end-2 top-2 rounded-[6px] p-1 text-[var(--fg-subtle)] hover:bg-[var(--surface-3)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] md:static">
          <XIcon className="h-3.5 w-3.5" />
        </button>
      ) : <span />}
    </div>
  );
}

function CostBadge({ label, color }: { label: string; color: string }) {
  return <span className="inline-flex h-5 min-w-7 items-center justify-center rounded-[5px] px-1.5 text-[10px] font-bold" style={{ background: `color-mix(in oklab, ${color} 12%, transparent)`, color }}>{label}</span>;
}

function RealBadge() {
  return (
    <span className="inline-flex h-5 min-w-7 items-center justify-center rounded-[5px] bg-[var(--success-50)] px-1 text-[var(--success-500)]" title="Stock">
      <CheckIcon className="h-3 w-3" />
    </span>
  );
}

const inputClass = 'h-8 w-full min-w-0 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-2 text-xs tabular-nums text-[var(--fg)] outline-none focus:border-[var(--brand-500)] focus:shadow-[var(--focus-ring)]';

function unitsFor(component: Component): string[] {
  const configured = [...(component.available_units ?? []), component.unit].filter(Boolean);
  if (configured.some((unit) => unit === 'g' || unit === 'kg')) return Array.from(new Set(['g', 'kg', ...configured]));
  if (configured.some((unit) => unit === 'ml' || unit === 'l')) return Array.from(new Set(['ml', 'l', ...configured]));
  return Array.from(new Set(configured));
}
