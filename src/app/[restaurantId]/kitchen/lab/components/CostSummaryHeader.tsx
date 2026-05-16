'use client';

import { useI18n } from '@/lib/i18n';
import type { DraftPayload, CostSummary } from '../types';

/**
 * CostSummaryHeader — strip at the top of the center panel showing
 * dish name, selling price input, food-cost metrics, and verdict badge.
 *
 * Fully controlled: caller owns `payload.cost_summary.selling_price` and
 * propagates edits up via `onSellingPriceChange`.
 */
export function CostSummaryHeader({
  payload,
  onSellingPriceChange,
}: {
  payload: DraftPayload;
  onSellingPriceChange: (price: number | undefined) => void;
}) {
  const { t } = useI18n();
  const s = payload.cost_summary;
  const verdict = verdictMeta(s.verdict, t);

  return (
    <header
      style={{
        borderBottom: '1px solid var(--line)',
        paddingBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Row 1: dish name + selling price */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
          {payload.menu_item.name_en || payload.menu_item.name_he}
        </h2>
        <SellingPriceField
          label={t('labSellAt')}
          value={s.selling_price}
          onChange={onSellingPriceChange}
        />
      </div>

      {/* Row 2: cost stats + verdict */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 16,
          fontSize: 14,
        }}
      >
        <Stat
          label={t('labEstFoodCost')}
          value={`₪${s.total_estimated_cost.toFixed(2)}`}
        />

        {s.food_cost_pct != null && (
          <Stat
            label={t('labFoodCostPct')}
            value={`${(s.food_cost_pct * 100).toFixed(0)}%`}
            color={pctColor(s.food_cost_pct, s.target_pct)}
          />
        )}

        {s.target_food_cost != null && (
          <Stat
            label={`${t('labTargetLabel')} (≤${(s.target_pct * 100).toFixed(0)}%)`}
            value={`₪${s.target_food_cost.toFixed(2)}`}
          />
        )}

        {/* Verdict badge */}
        <span
          style={{
            borderRadius: 9999,
            padding: '2px 10px',
            fontSize: 12,
            fontWeight: 500,
            background: verdict.bg,
            color: verdict.fg,
          }}
        >
          {verdict.label}
        </span>

        {/* Suggested minimum sell price (only shown when not already on target) */}
        {s.suggested_min_price != null && s.verdict !== 'ok' && (
          <span style={{ color: 'var(--fg-muted)' }}>
            {t('labSuggestedMinPrice')} ₪{s.suggested_min_price.toFixed(0)}
          </span>
        )}
      </div>
    </header>
  );
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Single labeled stat column (label on top, value below). */
function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: color ?? 'inherit' }}>{value}</span>
    </div>
  );
}

/**
 * Returns a Tailwind-compatible color string for the food cost percentage.
 * Green  → at or below target
 * Yellow → up to 15 pp above target
 * Red    → beyond that threshold
 */
function pctColor(pct: number, target: number): string {
  if (pct <= target) return 'rgb(22,163,74)'; // green-600
  if (pct <= target + 0.15) return 'rgb(202,138,4)'; // yellow-600
  return 'rgb(220,38,38)'; // red-600
}

/** Resolve display label + badge colours from a CostSummary verdict. */
function verdictMeta(
  v: CostSummary['verdict'],
  t: (key: string) => string,
): { label: string; bg: string; fg: string } {
  switch (v) {
    case 'ok':
      return {
        label: t('labOnTarget'),
        bg: 'rgba(22,163,74,.12)',
        fg: 'rgb(22,101,52)',
      };
    case 'over_budget':
      return {
        label: t('labOverBudget'),
        bg: 'rgba(202,138,4,.12)',
        fg: 'rgb(133,77,14)',
      };
    case 'loss_making':
      return {
        label: t('labLossMaking'),
        bg: 'rgba(220,38,38,.12)',
        fg: 'rgb(153,27,27)',
      };
    case 'no_price':
      return {
        label: t('labSetSellingPrice'),
        bg: 'var(--bg-subtle,#f3f4f6)',
        fg: 'var(--fg-muted,#6b7280)',
      };
  }
}

/**
 * SellingPriceField — inline ₪ number input for the sell price.
 * Emits `undefined` when the field is cleared.
 */
function SellingPriceField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <label
      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14 }}
    >
      <span style={{ color: 'var(--fg-muted)' }}>{label}</span>
      <span>₪</span>
      <input
        type="number"
        min={0}
        step={0.5}
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange(undefined);
            return;
          }
          const parsed = parseFloat(raw);
          onChange(isNaN(parsed) ? undefined : parsed);
        }}
        placeholder="—"
        style={{
          width: 80,
          padding: '4px 8px',
          borderRadius: 6,
          border: '1px solid var(--line)',
          fontSize: 14,
          background: 'var(--surface-2,#fff)',
          color: 'var(--fg)',
        }}
      />
    </label>
  );
}
