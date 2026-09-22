'use client';

import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, XIcon } from 'lucide-react';
import type { Component } from '../types';
import { useI18n, useCurrency } from '@/lib/i18n';
import { IngredientRow } from './IngredientRow';

/** Collapsible preparation row with its own batch ingredients. */
export function PrepNode({
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
  const [open, setOpen] = useState(false);
  const ingredients = c.ingredients ?? [];
  const configuredUnits = [...(c.available_units ?? []), c.unit].filter(Boolean);
  const units = Array.from(new Set(configuredUnits.some((unit) => unit === 'g' || unit === 'kg') ? ['g', 'kg', ...configuredUnits] : configuredUnits.some((unit) => unit === 'ml' || unit === 'l') ? ['ml', 'l', ...configuredUnits] : configuredUnits));

  return (
    <div className="rounded-[11px] border border-[var(--line)] bg-[var(--surface-2)] px-3 py-3 md:px-2 md:py-2">
      <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-2 md:grid-cols-[auto_minmax(140px,1fr)_76px_68px_64px_82px_minmax(72px,auto)_auto] md:gap-2">
        <button type="button" onClick={() => setOpen((current) => !current)} aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open} className="flex h-9 w-9 items-center justify-center rounded-[7px] text-[var(--fg-muted)] hover:bg-[var(--surface-3)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] md:h-7 md:w-7">
          {open ? <ChevronDownIcon className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5 rtl:rotate-180" />}
        </button>

        <span className="truncate pe-12 text-sm font-semibold text-[var(--fg)] md:pe-0 md:text-xs">
          {c.name_primary || c.name_he} <span className="font-normal text-[var(--fg-muted)]">({t('labPrep')})</span>
        </span>

        <div className="col-span-2 grid grid-cols-2 items-start gap-2 md:contents">
          <label className="min-w-0 md:contents">
            <span className="mb-1 block text-[10px] font-medium text-[var(--fg-muted)] md:hidden">{t('labQuantity')}</span>
            {canManage ? (
              <input type="number" value={c.qty} min={0} step="any" onChange={(event) => onChange({ ...c, qty: parseFloat(event.target.value) || 0 })} className={inputClass} aria-label={t('labQuantity')} />
            ) : <span className="text-end text-xs tabular-nums">{c.qty}</span>}
          </label>

          <span className="hidden md:block" />

          <label className="min-w-0 md:contents">
            <span className="mb-1 block text-[10px] font-medium text-[var(--fg-muted)] md:hidden">{t('labUnit')}</span>
            {canManage ? (
              <select value={c.unit} onChange={(event) => onChange({ ...c, unit: event.target.value })} className={inputClass} aria-label={t('labUnit')}>
                {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            ) : <span className="text-xs">{c.unit}</span>}
          </label>

          <span className="col-span-2 min-w-0 md:contents">
            <span className="mb-1 block text-[10px] font-medium text-[var(--fg-muted)] md:hidden">{t('labCost')}</span>
            <span className="block h-11 rounded-[7px] bg-[var(--surface)] px-3 py-3 text-end text-sm font-semibold tabular-nums text-[var(--fg)] md:h-auto md:bg-transparent md:px-0 md:py-0 md:text-xs">{money(c.line_cost ?? 0)}</span>
          </span>
          <span className="hidden md:block" />
        </div>

        {canManage && (
          <button onClick={onRemove} aria-label={t('labRemoveIngredient')} className="absolute end-0 top-0 flex h-11 w-11 items-center justify-center rounded-[8px] text-[var(--fg-subtle)] hover:bg-[var(--surface-3)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] md:static md:h-auto md:w-auto md:p-1.5">
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 border-t border-[var(--line)] pt-3 md:ms-9">
          <p className="mb-2 text-[11px] text-[var(--fg-muted)]">
            {t('labForBatch').replace('{qty}', String(c.yield_per_batch ?? '?')).replace('{unit}', c.yield_unit ?? c.unit)}
          </p>
          <div className="space-y-1">
            {ingredients.map((ingredient, index) => (
              <IngredientRow
                key={ingredient.tmp_id ?? ingredient.stock_item_id ?? `${index}-${ingredient.name_primary ?? ingredient.name_he}`}
                c={ingredient}
                onChange={(next) => {
                  const nextIngredients = [...ingredients];
                  nextIngredients[index] = next;
                  onChange({ ...c, ingredients: nextIngredients });
                }}
                onRemove={() => onChange({ ...c, ingredients: ingredients.filter((_, itemIndex) => itemIndex !== index) })}
                canManage={canManage}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass = 'h-11 w-full min-w-0 rounded-[7px] border border-[var(--line)] bg-[var(--surface)] px-2 text-base tabular-nums text-[var(--fg)] outline-none focus:border-[var(--brand-500)] focus:shadow-[var(--focus-ring)] md:h-8 md:text-xs';
