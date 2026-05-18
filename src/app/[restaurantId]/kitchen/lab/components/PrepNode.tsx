'use client';

import { useState } from 'react';
import type { Component } from '../types';
import { useI18n } from '@/lib/i18n';
import { IngredientRow } from './IngredientRow';

const UNITS = ['g', 'kg', 'ml', 'l'];

/**
 * PrepNode — a collapsible card for a preparation component
 * (kind: `prep_existing` or `prep_new`).
 *
 * When collapsed: shows header row with name, qty, unit, and line cost.
 * When expanded: reveals nested ingredients, each rendered as an `IngredientRow`.
 *
 * Fully controlled: callers own state and propagate edits via `onChange`.
 */
export function PrepNode({
  c,
  onChange,
  onRemove,
}: {
  c: Component;
  onChange: (next: Component) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ings = c.ingredients ?? [];

  return (
    <div
      style={{
        borderRadius: 8,
        border: '1px solid var(--line)',
        background: 'var(--bg-subtle,var(--surface-2,#f9fafb))',
        padding: 8,
      }}
    >
      {/* Header row — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Expand/collapse toggle */}
        <button
          onClick={() => setOpen(!open)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            fontSize: 12,
            padding: '0 4px',
            lineHeight: 1,
          }}
          aria-label={open ? 'Collapse' : 'Expand'}
          aria-expanded={open}
        >
          {open ? '▾' : '▸'}
        </button>

        {/* Prep name + "(prep)" label */}
        <span style={{ flex: 1, fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.name_primary || c.name_he}{' '}
          <span style={{ fontWeight: 400, color: 'var(--fg-muted)' }}>
            ({t('labPrep')})
          </span>
        </span>

        {/* Quantity input */}
        <input
          type="number"
          value={c.qty}
          min={0}
          step="any"
          onChange={(e) =>
            onChange({ ...c, qty: parseFloat(e.target.value) || 0 })
          }
          style={{
            width: 80,
            padding: '4px 6px',
            borderRadius: 6,
            border: '1px solid var(--line)',
            fontSize: 13,
            background: 'var(--surface-2,#fff)',
            color: 'var(--fg)',
          }}
          aria-label="Quantity"
        />

        {/* Unit select */}
        <select
          value={c.unit}
          onChange={(e) => onChange({ ...c, unit: e.target.value })}
          style={{
            width: 70,
            padding: '4px 6px',
            borderRadius: 6,
            border: '1px solid var(--line)',
            fontSize: 13,
            background: 'var(--surface-2,#fff)',
            color: 'var(--fg)',
          }}
          aria-label="Unit"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        {/* Line cost */}
        <span
          style={{
            width: 80,
            textAlign: 'right',
            fontWeight: 500,
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          ₪{(c.line_cost ?? 0).toFixed(2)}
        </span>

        {/* Remove button */}
        <button
          onClick={onRemove}
          aria-label={t('labRemoveIngredient')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fg-muted)',
            fontSize: 18,
            padding: '0 6px',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Expanded body: batch info + nested ingredient rows */}
      {open && (
        <div style={{ marginTop: 8, paddingLeft: 24 }}>
          {/* Batch yield hint */}
          <p
            style={{
              marginBottom: 4,
              fontSize: 11,
              color: 'var(--fg-muted)',
            }}
          >
            {t('labForBatch')
              .replace('{qty}', String(c.yield_per_batch ?? '?'))
              .replace('{unit}', c.yield_unit ?? c.unit)}
          </p>

          {/* Nested ingredient rows */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ings.map((ing, idx) => (
              <IngredientRow
                key={
                  ing.tmp_id ??
                  ing.stock_item_id ??
                  `${idx}-${ing.name_primary ?? ing.name_he}`
                }
                c={ing}
                onChange={(next) => {
                  const newIngs = [...ings];
                  newIngs[idx] = next;
                  onChange({ ...c, ingredients: newIngs });
                }}
                onRemove={() => {
                  const newIngs = ings.filter((_, i) => i !== idx);
                  onChange({ ...c, ingredients: newIngs });
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
