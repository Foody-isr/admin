'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getRestaurantSettings, updateRestaurantSettings, RestaurantSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function FulfillmentSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [svc, setSvc] = useState({
    require_order_approval: true,
    auto_send_to_kitchen: true,
    service_mode: 'table',
    scheduling_enabled: false,
    tips_enabled: true,
    rush_mode: false,
  });

  useEffect(() => {
    getRestaurantSettings(rid).then((s) => {
      setSettings(s);
      setSvc({
        require_order_approval: s.require_order_approval,
        auto_send_to_kitchen: s.auto_send_to_kitchen ?? true,
        service_mode: s.service_mode,
        scheduling_enabled: s.scheduling_enabled,
        tips_enabled: s.tips_enabled,
        rush_mode: s.rush_mode ?? false,
      });
    }).finally(() => setLoading(false));
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

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <label className="block text-sm font-medium text-fg-secondary mb-1">{t('serviceMode')}</label>
        <select
          className="input"
          value={svc.service_mode}
          onChange={(e) => setSvc((p) => ({ ...p, service_mode: e.target.value }))}
        >
          <option value="table">{t('tableService')}</option>
          <option value="counter">{t('counterService')}</option>
        </select>
      </div>

      {[
        { label: t('autoSendToKitchen'), key: 'auto_send_to_kitchen' as const, desc: t('autoSendDesc') },
        { label: t('enableTips'), key: 'tips_enabled' as const, desc: t('enableTipsDesc') },
        { label: t('scheduledOrders'), key: 'scheduling_enabled' as const, desc: t('scheduledOrdersDesc') },
        { label: t('rushMode'), key: 'rush_mode' as const, desc: t('rushModeDesc') },
      ].map(({ label, key, desc }) => (
        <label key={key} className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={svc[key] as boolean}
            onChange={(e) => setSvc((p) => ({ ...p, [key]: e.target.checked }))}
          />
          <div>
            <div className="text-sm font-medium text-fg-primary">{label}</div>
            <div className="text-xs text-fg-secondary">{desc}</div>
          </div>
        </label>
      ))}

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? t('saving') : t('saveChanges')}
        </button>
        {saved && <span className="text-sm text-status-ready font-medium">{t('saved')}</span>}
      </div>
    </div>
  );
}
