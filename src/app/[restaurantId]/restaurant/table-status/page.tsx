'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getRestaurantSettings, updateRestaurantSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { PageHead } from '@/components/ds';
import { NumberInput } from '@/components/ui/NumberInput';

/// Swatch colours mirror foodypos `TableStatusStyle` so the preview here shows
/// what the floor plan actually paints. Keep them in sync with
/// foodypos/lib/features/tables/presentation/widgets/table_status.dart.
const SWATCH = {
  free: '#77BA4B',
  neutral: '#9A9AA3',
  fresh: '#34D399',
  warn: '#F59E0B',
  late: '#F0736F',
  toSettle: '#F18A47',
} as const;

export default function TableStatusPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  // The API gates PUT /restaurants/:id/settings on settings.edit, so gate the
  // Save button on the same permission — tables.manage let the button render
  // for roles whose request could only ever come back 403.
  const canEdit = hasAnyPermission('settings.edit');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [svc, setSvc] = useState({
    floor_plan_color_indicators: false,
    table_yellow_after_minutes: 30,
    table_red_after_minutes: 60,
  });

  useEffect(() => {
    getRestaurantSettings(rid)
      .then((s) => {
        setSvc({
          floor_plan_color_indicators: s.floor_plan_color_indicators ?? false,
          table_yellow_after_minutes: s.table_yellow_after_minutes ?? 30,
          table_red_after_minutes: s.table_red_after_minutes ?? 60,
        });
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRestaurantSettings(rid, svc);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const on = svc.floor_plan_color_indicators;

  // What the POS legend will list, per foodypos `tableLegendStatuses`.
  const legend = on
    ? [
        { color: SWATCH.free, label: t('tableStatusLegendFree'), outline: true },
        { color: SWATCH.fresh, label: `< ${svc.table_yellow_after_minutes} ${t('minutes')}` },
        {
          color: SWATCH.warn,
          label: `${svc.table_yellow_after_minutes}-${svc.table_red_after_minutes} ${t('minutes')}`,
        },
        { color: SWATCH.late, label: `> ${svc.table_red_after_minutes} ${t('minutes')}` },
        { color: SWATCH.toSettle, label: t('tableStatusLegendToSettle') },
      ]
    : [
        { color: SWATCH.free, label: t('tableStatusLegendFree'), outline: true },
        { color: SWATCH.neutral, label: t('tableStatusLegendOccupied'), outline: true },
        { color: SWATCH.toSettle, label: t('tableStatusLegendToSettle') },
      ];

  return (
    <div className="space-y-[var(--s-5)] max-w-2xl">
      <PageHead title={t('tableStatus')} desc={t('tableStatusDesc')} />

      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby="color-indicators-label"
            disabled={!canEdit}
            onClick={() => setSvc((p) => ({ ...p, floor_plan_color_indicators: !p.floor_plan_color_indicators }))}
            className={`relative w-10 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${on ? 'bg-brand-500' : 'bg-[var(--surface-subtle)]'}`}
            style={{ border: '1px solid var(--divider)' }}
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`}
            />
          </button>
          <div>
            <div id="color-indicators-label" className="text-sm font-medium text-fg-primary">
              {t('tableStatusColorIndicators')}
            </div>
            <div className="text-xs text-fg-secondary">{t('tableStatusColorIndicatorsDesc')}</div>
          </div>
        </div>

        {on && (
          <div className="space-y-3 pl-2" style={{ borderLeft: '3px solid var(--divider)' }}>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: SWATCH.warn }} />
              <div className="flex-1">
                <label className="text-sm font-medium text-fg-primary block mb-1" htmlFor="yellow-after">
                  {t('tableStatusYellowAfter')}
                </label>
                <div className="flex items-center gap-2">
                  <NumberInput
                    id="yellow-after"
                    integer
                    min={1}
                    max={240}
                    disabled={!canEdit}
                    value={svc.table_yellow_after_minutes}
                    onChange={(n) => setSvc((p) => ({ ...p, table_yellow_after_minutes: n }))}
                    className="input w-24 text-sm"
                  />
                  <span className="text-sm text-fg-secondary">{t('minutes')}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: SWATCH.late }} />
              <div className="flex-1">
                <label className="text-sm font-medium text-fg-primary block mb-1" htmlFor="red-after">
                  {t('tableStatusRedAfter')}
                </label>
                <div className="flex items-center gap-2">
                  <NumberInput
                    id="red-after"
                    integer
                    min={1}
                    max={480}
                    disabled={!canEdit}
                    value={svc.table_red_after_minutes}
                    onChange={(n) => setSvc((p) => ({ ...p, table_red_after_minutes: n }))}
                    className="input w-24 text-sm"
                  />
                  <span className="text-sm text-fg-secondary">{t('minutes')}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview of the POS legend. Mirrors foodypos `tableLegendStatuses`:
            with indicators off the floor plan lists only the three states its
            chips can reach, so showing the time buckets here would promise a
            key the POS never draws. */}
        <div className="flex flex-wrap gap-3 pt-1">
          {legend.map(({ color, label, outline }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full"
                style={outline ? { border: `1.5px solid ${color}` } : { background: color }}
              />
              <span className="text-xs text-fg-secondary">{label}</span>
            </div>
          ))}
        </div>

        {!on && <p className="text-xs text-fg-secondary">{t('tableStatusIndicatorsOffNote')}</p>}
      </div>

      {canEdit && (
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? t('saving') : t('saveChanges')}
          </button>
          {saved && <span className="text-sm text-status-ready font-medium">{t('saved')}</span>}
        </div>
      )}
    </div>
  );
}
