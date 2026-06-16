'use client';

import { useI18n } from '@/lib/i18n';
import type { DraftPayload, CostSummary } from '../types';

/**
 * CostSummaryHeader — strip at the top of the center panel showing
 * dish name, selling price input, food-cost metrics, and verdict badge.
 *
 * Fully controlled: caller owns `payload.cost_summary.selling_price` and
 * propagates edits up via `onSellingPriceChange`.
 *
 * Layout:
 * 1. Dish name (h2)
 * 2. Selling price — prominent dashed callout when not set; compact inline when set
 * 3. Cost stats row (food cost, %, target, verdict badge, suggested min when not ok)
 */
export function CostSummaryHeader({
  payload,
  onSellingPriceChange,
  canManage,
}: {
  payload: DraftPayload;
  onSellingPriceChange: (price: number | undefined) => void;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const s = payload.cost_summary;
  const hasSellPrice = s.selling_price != null && s.selling_price > 0;
  const verdict = hasSellPrice ? verdictMeta(s.verdict, t) : null;

  return (
    <header
      style={{
        borderBottom: '1px solid var(--line)',
        paddingBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      {/* Dish name */}
      <h2 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
        {payload.menu_item.name_primary || payload.menu_item.name_he}
      </h2>

      {/* Selling price — prominent when missing, compact when set */}
      {!hasSellPrice ? (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: 'var(--bg-subtle, var(--surface-2))',
            border: '1px dashed var(--accent-orange, rgb(249,115,22))',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <strong style={{ fontSize: 14 }}>{t('labAskSellingPrice')}</strong>
          {canManage && (
            <SellingPriceField value={undefined} onChange={onSellingPriceChange} large />
          )}
          {s.suggested_min_price != null && (
            <span style={{ color: 'var(--fg-muted)', fontSize: 13 }}>
              {t('labSuggestedMinPrice')} ₪{s.suggested_min_price.toFixed(0)}
            </span>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, color: 'var(--fg-muted)' }}>{t('labSellAt')}</span>
          {canManage ? (
            <SellingPriceField value={s.selling_price} onChange={onSellingPriceChange} large />
          ) : (
            <span style={{ fontSize: 18, fontWeight: 600 }}>
              ₪{(s.selling_price ?? 0).toFixed(2)}
            </span>
          )}
        </div>
      )}

      {/* Cost stats row (only the verdict badge + suggested min here, no redundant "set price" badge) */}
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

        {/* Verdict badge — only shown when we have a sell price and a real verdict */}
        {verdict != null && (
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
        )}

        {/* Suggested min price — shown inline when price is set and not on target */}
        {s.suggested_min_price != null && s.verdict !== 'ok' && hasSellPrice && (
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
 * Returns a color string for the food cost percentage.
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
      // no_price verdict is now handled via the prominent sell-price callout above;
      // suppress the redundant badge here.
      return { label: '', bg: 'transparent', fg: 'transparent' };
  }
}

/**
 * SellingPriceField — inline ₪ number input for the sell price.
 * Emits `undefined` when the field is cleared.
 * Pass `large` for the prominent entry point (bigger font + wider input).
 */
function SellingPriceField({
  value,
  onChange,
  large,
}: {
  value?: number;
  onChange: (v: number | undefined) => void;
  large?: boolean;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: large ? 18 : 14,
      }}
    >
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
          width: large ? 120 : 80,
          padding: large ? '6px 10px' : '4px 8px',
          borderRadius: 6,
          border: '1px solid var(--line)',
          fontSize: large ? 18 : 14,
          fontWeight: large ? 600 : 400,
          background: 'var(--surface-2, transparent)',
          color: 'var(--fg, inherit)',
        }}
      />
    </span>
  );
}
