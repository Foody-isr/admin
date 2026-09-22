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
    <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-3 rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-3 py-3 md:grid-cols-[auto_minmax(140px,1fr)_76px_68px_64px_82px_minmax(72px,auto)_auto] md:gap-2 md:border-transparent md:bg-transparent md:px-2 md:py-1 md:hover:bg-[var(--surface-2)]">
      <span className="w-9" title={costLabel}>
        {c.cost_status === 'unknown' ? <CostBadge label="?" color="var(--fg-muted)" /> : isExisting && c.cost_status !== 'estimated' ? <RealBadge /> : <EstimatedPriceBadge confidence={c.price_confidence} />}
      </span>

      <span className="truncate pe-12 text-sm font-medium text-[var(--fg)] md:pe-0 md:text-xs md:font-normal">
        {c.name_primary || c.name_he || '—'}
      </span>

      <div className="col-span-2 grid grid-cols-2 items-start gap-2 md:contents">
        <label className="min-w-0 md:contents">
          <span className="mb-1 block text-[10px] font-medium text-[var(--fg-muted)] md:hidden">{t('labQuantity')}</span>
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
        </label>

        <label className="min-w-0 md:contents" title={t('labWasteHelp')}>
          <span className="mb-1 block text-[10px] font-medium text-[var(--fg-muted)] md:hidden">{t('labWaste')}</span>
          {canManage ? (
            <span className="flex items-center gap-1 text-[10px] text-[var(--fg-muted)]">
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
            </span>
          ) : <span className="text-xs text-[var(--fg-muted)]">{c.waste_pct ? `${c.waste_pct}%` : '—'}</span>}
        </label>

        <label className="min-w-0 md:contents">
          <span className="mb-1 block text-[10px] font-medium text-[var(--fg-muted)] md:hidden">{t('labUnit')}</span>
          {canManage ? (
            <select value={c.unit} onChange={(event) => onChange({ ...c, unit: event.target.value })} className={inputClass} aria-label={t('labUnit')}>
              {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
            </select>
          ) : <span className="text-xs">{c.unit}</span>}
        </label>

        <span className="min-w-0 md:contents">
          <span className="mb-1 block text-[10px] font-medium text-[var(--fg-muted)] md:hidden">{t('labCost')}</span>
          <span className="block h-11 rounded-[7px] bg-[var(--surface-2)] px-3 py-3 text-end text-sm font-semibold tabular-nums text-[var(--fg)] md:h-auto md:bg-transparent md:px-0 md:py-0 md:text-xs">{money(c.line_cost ?? 0)}</span>
        </span>

        <span className="col-span-2 text-[10px] text-[var(--fg-muted)] md:col-auto">
          {c.target_cost_per_unit != null && c.cost_per_unit != null && c.target_cost_per_unit < c.cost_per_unit
            ? `${t('labTargetLeq')} ${money(c.target_cost_per_unit)}/${c.unit}`
            : null}
        </span>
      </div>

      {canManage ? (
        <button onClick={onRemove} aria-label={t('labRemoveIngredient')} className="absolute end-2 top-2 flex h-11 w-11 items-center justify-center rounded-[8px] text-[var(--fg-subtle)] hover:bg-[var(--surface-3)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] md:static md:h-auto md:w-auto md:p-1">
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

const inputClass = 'h-11 w-full min-w-0 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-2 text-base tabular-nums text-[var(--fg)] outline-none focus:border-[var(--brand-500)] focus:shadow-[var(--focus-ring)] md:h-8 md:text-xs';

function unitsFor(component: Component): string[] {
  const configured = [...(component.available_units ?? []), component.unit].filter(Boolean);
  if (configured.some((unit) => unit === 'g' || unit === 'kg')) return Array.from(new Set(['g', 'kg', ...configured]));
  if (configured.some((unit) => unit === 'ml' || unit === 'l')) return Array.from(new Set(['ml', 'l', ...configured]));
  return Array.from(new Set(configured));
}
