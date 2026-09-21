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
export function FoodCostTargetSetting({
  restaurantId,
  canManage,
}: {
  restaurantId: number;
  canManage: boolean;
}) {
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
    <label className={`flex items-center gap-2 text-xs ${loading ? 'opacity-50' : ''}`}>
      <span className="text-[var(--fg-muted)]">{t('labTargetSetting')}</span>
      {canManage ? (
        <select
          value={pct}
          onChange={(e) => handleChange(parseFloat(e.target.value))}
          disabled={loading || saving}
          className="h-8 rounded-[8px] border border-[var(--line-strong)] bg-[var(--surface-2)] px-2 text-sm font-semibold tabular-nums text-[var(--fg)] focus:border-[var(--brand-500)] focus:outline-none"
        >
          <option value={0.25}>≤ 25%</option>
          <option value={0.30}>≤ 30%</option>
          <option value={0.35}>≤ 35%</option>
          <option value={0.40}>≤ 40%</option>
        </select>
      ) : (
        <span className="font-semibold tabular-nums">≤ {(pct * 100).toFixed(0)}%</span>
      )}
    </label>
  );
}
