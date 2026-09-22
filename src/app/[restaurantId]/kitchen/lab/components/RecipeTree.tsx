'use client';

import { useMemo, useState } from 'react';
import type { DraftPayload, Component } from '../types';
import { IngredientRow } from './IngredientRow';
import { PrepNode } from './PrepNode';
import { PackagePlusIcon, PlusIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { safeRecipeSteps } from '../normalizePayload';
import { IngredientLibraryPicker } from './IngredientLibraryPicker';

/**
 * RecipeTree — top-level renderer mapping a draft's component list
 * to either `IngredientRow` (stock items) or `PrepNode` (preparations).
 *
 * Stateless: callers own `payload` and propagate mutations via `onChange`.
 * State management (e.g. TanStack Query integration, optimistic updates) is
 * handled by the parent page (Task 7).
 */
export function RecipeTree({
  payload,
  onChange,
  canManage,
  restaurantId,
}: {
  payload: DraftPayload;
  onChange: (next: DraftPayload) => void;
  canManage: boolean;
  restaurantId: number;
}) {
  const { t } = useI18n();
  const [pickerOpen, setPickerOpen] = useState(false);
  const recipeSteps = safeRecipeSteps(payload.recipe_steps);
  const usedStockIds = useMemo(() => new Set(payload.components.map((component) => component.stock_item_id).filter((id): id is string => Boolean(id))), [payload.components]);
  const usedPrepIds = useMemo(() => new Set(payload.components.map((component) => component.prep_item_id).filter((id): id is string => Boolean(id))), [payload.components]);
  /** Replace component at `idx` with `next`. */
  const setComponentAt = (idx: number, next: Component) => {
    const components = [...payload.components];
    components[idx] = next;
    onChange({ ...payload, components });
  };

  /** Remove component at `idx`. */
  const removeAt = (idx: number) => {
    onChange({
      ...payload,
      components: payload.components.filter((_, i) => i !== idx),
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-base font-semibold text-[var(--fg)]">{t('labIngredients')}</h3>
            <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{t('labIngredientsHelp')}</p>
          </div>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
            <span className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-xs tabular-nums text-[var(--fg-muted)]">{payload.components.length} {t('labLines')}</span>
            {canManage && (
              <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex h-11 items-center gap-1.5 rounded-[8px] bg-[var(--brand-500)] px-3 text-xs font-semibold text-white hover:bg-[var(--brand-600)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] sm:h-9">
                <PackagePlusIcon className="h-3.5 w-3.5" /> {t('labAddIngredient')}
              </button>
            )}
          </div>
        </div>
        <div className="overflow-visible px-3 py-3 sm:px-6 sm:py-4 md:overflow-x-auto">
          <div className="mb-1 hidden min-w-[660px] grid-cols-[auto_minmax(140px,1fr)_76px_68px_64px_82px_minmax(72px,auto)_auto] gap-2 px-2 text-[10px] font-medium text-[var(--fg-subtle)] md:grid">
            <span className="w-9" />
            <span>{t('labIngredient')}</span>
            <span>{t('labQuantity')}</span>
            <span>{t('labWaste')}</span>
            <span>{t('labUnit')}</span>
            <span className="text-end">{t('labCost')}</span>
            <span />
            <span className="w-7" />
          </div>
          <div className="space-y-2 md:min-w-[660px] md:space-y-1">
        {payload.components.length === 0 && (
          <button type="button" onClick={() => canManage && setPickerOpen(true)} disabled={!canManage} className="flex w-full flex-col items-center rounded-[12px] border border-dashed border-[var(--line-strong)] px-5 py-10 text-center focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-default">
            <span className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--surface-2)] text-[var(--brand-500)]"><PackagePlusIcon className="h-5 w-5" /></span>
            <span className="mt-3 text-sm font-semibold text-[var(--fg)]">{t('labEmptyRecipeTitle')}</span>
            <span className="mt-1 max-w-md text-xs leading-5 text-[var(--fg-muted)]">{t('labEmptyRecipeHelp')}</span>
          </button>
        )}
        {payload.components.map((c, idx) => {
        const isPrep = c.kind === 'prep_new' || c.kind === 'prep_existing';
        // Build a stable React key: prefer server-assigned IDs over positional fallback.
        const key =
          c.tmp_id ??
          c.prep_item_id ??
          c.stock_item_id ??
          `${idx}-${c.name_primary ?? c.name_he}`;

        return isPrep ? (
          <PrepNode
            key={key}
            c={c}
            onChange={(next) => setComponentAt(idx, next)}
            onRemove={() => removeAt(idx)}
            canManage={canManage}
          />
        ) : (
          <IngredientRow
            key={key}
            c={c}
            onChange={(next) => setComponentAt(idx, next)}
            onRemove={() => removeAt(idx)}
            canManage={canManage}
          />
        );
        })}
          </div>
        </div>
      </section>

      <section className="rounded-[18px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-base font-semibold text-[var(--fg)]">{t('labMethod')}</h3>
            <p className="mt-0.5 text-xs text-[var(--fg-muted)]">{t('labMethodHelp')}</p>
          </div>
          {canManage && (
            <button type="button" onClick={() => onChange({ ...payload, recipe_steps: [...recipeSteps, { order: recipeSteps.length + 1, instruction_primary: '', instruction_he: '' }] })} className="flex min-h-11 shrink-0 items-center gap-1 rounded-[8px] px-2 text-xs font-medium text-[var(--brand-500)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
              <PlusIcon className="h-3.5 w-3.5" />{t('labAddStep')}
            </button>
          )}
        </div>
        <div className="space-y-3 px-5 py-5 sm:px-6">
          {recipeSteps.map((step, index) => (
            <div key={`${step.order}-${index}`} className="flex items-start gap-2">
              <span className="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-xs font-semibold tabular-nums text-[var(--fg-muted)]">{index + 1}</span>
              {canManage ? (
                <textarea value={step.instruction_primary || step.instruction_he} onChange={(e) => {
                  const recipe_steps = [...recipeSteps];
                  recipe_steps[index] = { ...step, order: index + 1, instruction_primary: e.target.value };
                  onChange({ ...payload, recipe_steps });
                }} rows={2} className="min-w-0 flex-1 resize-y rounded-[9px] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-base leading-6 text-[var(--fg)] focus:border-[var(--brand-500)] focus:outline-none focus:shadow-[var(--focus-ring)] sm:text-sm" />
              ) : <p className="py-2 text-sm text-[var(--fg)]">{step.instruction_primary || step.instruction_he}</p>}
              {canManage && <button type="button" onClick={() => onChange({ ...payload, recipe_steps: recipeSteps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })) })} className="flex h-11 w-9 shrink-0 items-center justify-center rounded-[8px] text-lg text-[var(--fg-muted)] hover:bg-[var(--surface-2)]" aria-label={t('labRemoveStep')}>×</button>}
            </div>
          ))}
        </div>
      </section>

      {pickerOpen && (
        <IngredientLibraryPicker
          restaurantId={restaurantId}
          usedStockIds={usedStockIds}
          usedPrepIds={usedPrepIds}
          onAdd={(component) => {
            onChange({ ...payload, components: [...payload.components, component] });
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
