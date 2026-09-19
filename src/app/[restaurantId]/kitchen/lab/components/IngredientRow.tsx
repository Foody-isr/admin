'use client';

import type { Component } from '../types';
import { useI18n, useCurrency } from '@/lib/i18n';
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
  const costMeta = costStatusMeta(c.cost_status ?? (isExisting ? 'verified' : 'estimated'), t);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(120px,1fr) 76px 68px 64px 82px minmax(80px,auto) auto',
        alignItems: 'center',
        gap: 8,
        padding: '4px 0',
      }}
    >
      {/* Origin badge: "real" for linked stock items, "est" for new/unlinked */}
      <span title={costMeta.label}>
        {c.cost_status === 'unknown' ? <CostBadge label="?" color="rgb(107,114,128)" /> : isExisting && c.cost_status !== 'estimated' ? <RealBadge /> : <EstimatedPriceBadge confidence={c.price_confidence} />}
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
      {canManage ? (
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
      ) : (
        <span style={{ fontSize: 13, textAlign: 'right' }}>{c.qty}</span>
      )}

      {canManage ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--fg-muted)' }} title={t('labWasteHelp')}>
          <input
            type="number"
            value={c.waste_pct ?? 0}
            min={0}
            max={99}
            step={1}
            onChange={(e) => onChange({ ...c, waste_pct: Math.min(99, Math.max(0, Number(e.target.value))) })}
            style={{ ...inputStyle, width: 44 }}
            aria-label={t('labWaste')}
          />%
        </label>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{c.waste_pct ? `${c.waste_pct}%` : '—'}</span>
      )}

      {/* Unit select */}
      {canManage ? (
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
      ) : (
        <span style={{ fontSize: 13 }}>{c.unit}</span>
      )}

      {/* Line cost */}
      <span style={{ textAlign: 'right', fontWeight: 500, fontSize: 13 }}>
        {money(c.line_cost ?? 0)}
      </span>

      {/* Optional target hint — shown when item costs more than its target */}
      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
        {c.target_cost_per_unit != null &&
        c.cost_per_unit != null &&
        c.target_cost_per_unit < c.cost_per_unit
          ? `${t('labTargetLeq')} ${money(c.target_cost_per_unit)}/${c.unit}`
          : null}
      </span>

      {/* Remove button */}
      {canManage ? (
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
      ) : (
        <span />
      )}
    </div>
  );
}

function costStatusMeta(status: Component['cost_status'], t: (key: string) => string) {
  if (status === 'verified') return { label: t('labCostVerified') };
  if (status === 'estimated') return { label: t('labCostEstimated') };
  return { label: t('labCostUnknown') };
}

function CostBadge({ label, color }: { label: string; color: string }) {
  return <span style={{ borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, background: `${color}18`, color }}>{label}</span>;
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
