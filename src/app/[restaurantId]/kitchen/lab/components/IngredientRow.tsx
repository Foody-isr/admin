'use client';

import type { Component } from '../types';
import { useI18n } from '@/lib/i18n';
import { EstimatedPriceBadge } from './EstimatedPriceBadge';

const UNITS = ['g', 'kg', 'ml', 'l', 'piece', 'unit', 'tsp', 'tbsp', 'cup'];

/**
 * IngredientRow — a single editable row for a stock ingredient component
 * (kind: `stock_existing` or `stock_new`).
 *
 * Columns: origin badge | name | qty input | unit select | line cost | target hint | remove button.
 *
 * Fully controlled: callers own the component state and propagate edits via `onChange`.
 */
export function IngredientRow({
  c,
  onChange,
  onRemove,
}: {
  c: Component;
  onChange: (next: Component) => void;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const isExisting = c.kind === 'stock_existing';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr 80px 70px 80px 1fr auto',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
      }}
    >
      {/* Origin badge: "real" for linked stock items, "est" for new/unlinked */}
      <span>
        {isExisting ? (
          <RealBadge />
        ) : (
          <EstimatedPriceBadge confidence={c.price_confidence} />
        )}
      </span>

      {/* Item name — truncated if too long */}
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: 13,
        }}
      >
        {c.name_primary || c.name_he || '—'}
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
        style={inputStyle}
        aria-label="Quantity"
      />

      {/* Unit select */}
      <select
        value={c.unit}
        onChange={(e) => onChange({ ...c, unit: e.target.value })}
        style={inputStyle}
        aria-label="Unit"
      >
        {UNITS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>

      {/* Line cost */}
      <span style={{ textAlign: 'right', fontWeight: 500, fontSize: 13 }}>
        ₪{(c.line_cost ?? 0).toFixed(2)}
      </span>

      {/* Optional target hint — shown when item costs more than its target */}
      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
        {c.target_cost_per_unit != null &&
        c.cost_per_unit != null &&
        c.target_cost_per_unit < c.cost_per_unit
          ? `${t('labTargetLeq')} ₪${c.target_cost_per_unit.toFixed(2)}/${c.unit}`
          : null}
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
  );
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '4px 6px',
  borderRadius: 6,
  border: '1px solid var(--line)',
  fontSize: 13,
  background: 'var(--surface-2,#fff)',
  color: 'var(--fg)',
  width: '100%',
};

/**
 * RealBadge — green badge indicating the ingredient is linked to an actual
 * stock item with a known cost_per_unit.
 */
function RealBadge() {
  return (
    <span
      style={{
        display: 'inline-block',
        borderRadius: 4,
        padding: '1px 6px',
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '.04em',
        background: 'rgba(16,185,129,.1)',
        color: 'rgb(4,120,87)',
      }}
    >
      real
    </span>
  );
}
