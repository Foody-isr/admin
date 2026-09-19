'use client';

import type { DraftPayload, Component } from '../types';
import { IngredientRow } from './IngredientRow';
import { PrepNode } from './PrepNode';
import { PlusIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

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
}: {
  payload: DraftPayload;
  onChange: (next: DraftPayload) => void;
  canManage: boolean;
}) {
  const { t } = useI18n();
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
    <div className="space-y-6 py-4">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--fg)]">{t('labIngredients')}</h3>
          <span className="text-xs text-[var(--fg-muted)]">{payload.components.length} {t('labLines')}</span>
        </div>
        <div className="space-y-2 overflow-x-auto">
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
      </section>

      <section className="rounded-xl border border-[var(--line)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--fg)]">{t('labMethod')}</h3>
          {canManage && (
            <button type="button" onClick={() => onChange({ ...payload, recipe_steps: [...payload.recipe_steps, { order: payload.recipe_steps.length + 1, instruction_primary: '', instruction_he: '' }] })} className="flex items-center gap-1 text-xs font-medium text-[var(--brand-500)]">
              <PlusIcon className="h-3.5 w-3.5" />{t('labAddStep')}
            </button>
          )}
        </div>
        <div className="space-y-2">
          {payload.recipe_steps.map((step, index) => (
            <div key={`${step.order}-${index}`} className="flex items-start gap-2">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-semibold text-[var(--fg-muted)]">{index + 1}</span>
              {canManage ? (
                <textarea value={step.instruction_primary || step.instruction_he} onChange={(e) => {
                  const recipe_steps = [...payload.recipe_steps];
                  recipe_steps[index] = { ...step, order: index + 1, instruction_primary: e.target.value };
                  onChange({ ...payload, recipe_steps });
                }} rows={2} className="min-w-0 flex-1 resize-y rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--fg)]" />
              ) : <p className="py-2 text-sm text-[var(--fg)]">{step.instruction_primary || step.instruction_he}</p>}
              {canManage && <button type="button" onClick={() => onChange({ ...payload, recipe_steps: payload.recipe_steps.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })) })} className="mt-1 p-1 text-lg text-[var(--fg-muted)]" aria-label={t('labRemoveStep')}>×</button>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
