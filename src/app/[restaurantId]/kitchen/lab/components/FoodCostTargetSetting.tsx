'use client';
import { useState, useEffect, useCallback } from 'react';
import { getFoodCostTarget, setFoodCostTarget } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/**
 * FoodCostTargetSetting — dropdown in the Recipe Lab header that lets the
 * restaurant owner set their food-cost target percentage (25/30/35/40%).
 *
 * Uses plain useState + useEffect (no TanStack Query). Fetches on mount,
 * PUTs immediately on change.
 */
export function FoodCostTargetSetting({ restaurantId }: { restaurantId: number }) {
  const { t } = useI18n();
  const [pct, setPct] = useState<number>(0.35);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFoodCostTarget(restaurantId)
      .then((r) => { if (!cancelled) setPct(r.food_cost_target_pct); })
      .catch((e: unknown) => console.error('Failed to load food cost target', e))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [restaurantId]);

  const handleChange = useCallback(async (newPct: number) => {
    setPct(newPct);
    setSaving(true);
    try {
      await setFoodCostTarget(restaurantId, newPct);
    } catch (e: unknown) {
      console.error('Failed to update food cost target', e);
    } finally {
      setSaving(false);
    }
  }, [restaurantId]);

  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8, fontSize: 14,
      opacity: loading ? 0.5 : 1,
    }}>
      <span style={{ color: 'var(--fg-muted)' }}>{t('labTargetSetting')}</span>
      <select
        value={pct}
        onChange={(e) => handleChange(parseFloat(e.target.value))}
        disabled={loading || saving}
        style={{
          padding: '4px 8px', borderRadius: 6,
          border: '1px solid var(--line)', fontSize: 14,
          background: 'var(--surface-1, white)',
        }}
      >
        <option value={0.25}>{'<='} 25%</option>
        <option value={0.30}>{'<='} 30%</option>
        <option value={0.35}>{'<='} 35%</option>
        <option value={0.40}>{'<='} 40%</option>
      </select>
    </label>
  );
}
