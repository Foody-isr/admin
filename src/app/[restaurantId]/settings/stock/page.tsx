'use client';

/**
 * Stock — settings sub-page.
 *   - Unité de stock par défaut: the unit new items start on when tracking a
 *     predefined stock number (Portions / g / kg). Only affects items with
 *     weighted sizes; always changeable per item.
 *   - Disponibilité automatique: auto-deactivate items when linked ingredients
 *     reach 0 (previously a backend-only flag with no UI).
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getRestaurantSettings,
  updateRestaurantSettings,
  RestaurantSettings,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Button, Field, PageHead, Section, Select } from '@/components/ds';

type StockUnit = '' | 'g' | 'kg';

export default function StockSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [defaultStockUnit, setDefaultStockUnit] = useState<StockUnit>('');
  const [autoDisableSoldout, setAutoDisableSoldout] = useState(false);

  useEffect(() => {
    getRestaurantSettings(rid)
      .then((s) => {
        setDefaultStockUnit((s.default_stock_unit as StockUnit) ?? '');
        setAutoDisableSoldout(s.auto_disable_soldout ?? false);
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRestaurantSettings(rid, {
        default_stock_unit: defaultStockUnit,
        auto_disable_soldout: autoDisableSoldout,
      } as Partial<RestaurantSettings>);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-[880px]">
      <PageHead title={t('stockSettings')} desc={t('stockSettingsDesc')} />

      <Section title={t('defaultStockUnitTitle')} desc={t('defaultStockUnitHint')}>
        <Field grow label={t('defaultStockUnitLabel')}>
          <Select
            value={defaultStockUnit}
            disabled={!canEdit}
            onChange={(e) => setDefaultStockUnit(e.target.value as StockUnit)}
          >
            <option value="">{t('manualStockUnitPortions')}</option>
            <option value="g">{t('defaultStockUnitGrams')}</option>
            <option value="kg">{t('defaultStockUnitKilograms')}</option>
          </Select>
        </Field>
      </Section>

      <Section title={t('autoDisableSoldoutTitle')}>
        <label className="flex items-start gap-[var(--s-3)] cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 accent-[var(--brand-500)]"
            checked={autoDisableSoldout}
            disabled={!canEdit}
            onChange={(e) => setAutoDisableSoldout(e.target.checked)}
          />
          <div>
            <div className="text-fs-sm font-medium text-[var(--fg)]">
              {t('autoDisableSoldoutLabel')}
            </div>
            <div className="text-fs-xs text-[var(--fg-subtle)]">{t('autoDisableSoldoutDesc')}</div>
          </div>
        </label>
      </Section>

      <div className="flex items-center gap-[var(--s-3)]">
        {canEdit && (
          <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('saveChanges')}
          </Button>
        )}
        {saved && (
          <span className="text-fs-sm text-[var(--success-500)] font-medium">{t('saved')}</span>
        )}
      </div>
    </div>
  );
}
