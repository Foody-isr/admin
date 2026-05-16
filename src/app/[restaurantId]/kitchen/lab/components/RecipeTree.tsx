'use client';

import type { DraftPayload, Component } from '../types';
import { IngredientRow } from './IngredientRow';
import { PrepNode } from './PrepNode';

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
}: {
  payload: DraftPayload;
  onChange: (next: DraftPayload) => void;
}) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 0' }}>
      {payload.components.map((c, idx) => {
        const isPrep = c.kind === 'prep_new' || c.kind === 'prep_existing';
        // Build a stable React key: prefer server-assigned IDs over positional fallback.
        const key =
          c.tmp_id ??
          c.prep_item_id ??
          c.stock_item_id ??
          `${idx}-${c.name_en ?? c.name_he}`;

        return isPrep ? (
          <PrepNode
            key={key}
            c={c}
            onChange={(next) => setComponentAt(idx, next)}
            onRemove={() => removeAt(idx)}
          />
        ) : (
          <IngredientRow
            key={key}
            c={c}
            onChange={(next) => setComponentAt(idx, next)}
            onRemove={() => removeAt(idx)}
          />
        );
      })}
    </div>
  );
}
