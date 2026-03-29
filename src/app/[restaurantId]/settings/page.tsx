'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getRestaurant, getRestaurantSettings, updateRestaurant, updateRestaurantSettings,
  Restaurant, RestaurantSettings,
  getSpokeConfig, updateSpokeConfig, SpokeConfigResponse,
} from '@/lib/api';
import { useI18n, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n';

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  he: 'עברית',
  fr: 'Français',
};

export default function SettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale, setLocale } = useI18n();

  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [settings, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Spoke config
  const [spokeConfig, setSpokeConfig] = useState<SpokeConfigResponse | null>(null);
  const [spokeForm, setSpokeForm] = useState({
    api_key: '',
    enabled: false,
    depot_id: '',
    default_driver_name: '',
    default_driver_phone: '',
  });
  const [spokeSaving, setSpokeSaving] = useState(false);
  const [spokeSaved, setSpokeSaved] = useState(false);

  // Restaurant info form
  const [info, setInfo] = useState({ name: '', address: '', phone: '', description: '' });
  // Settings form
  const [svc, setSvc] = useState({
    require_order_approval: true,
    auto_send_to_kitchen: true,
    service_mode: 'table',
    scheduling_enabled: false,
    tips_enabled: true,
    rush_mode: false,
    floor_plan_color_indicators: false,
    table_yellow_after_minutes: 30,
    table_red_after_minutes: 60,
  });

  useEffect(() => {
    getSpokeConfig(rid).then((cfg) => {
      setSpokeConfig(cfg);
      if (cfg.configured) {
        setSpokeForm((p) => ({
          ...p,
          enabled: cfg.enabled ?? false,
          depot_id: cfg.depot_id ?? '',
          default_driver_name: cfg.default_driver_name ?? '',
          default_driver_phone: cfg.default_driver_phone ?? '',
        }));
      }
    }).catch(() => {});
    Promise.all([getRestaurant(rid), getRestaurantSettings(rid)]).then(([r, s]) => {
      setRestaurant(r);
      setSettings(s);
      setInfo({ name: r.name, address: r.address, phone: r.phone, description: r.description });
      setSvc({
        require_order_approval: s.require_order_approval,
        auto_send_to_kitchen: s.auto_send_to_kitchen ?? true,
        service_mode: s.service_mode,
        scheduling_enabled: s.scheduling_enabled,
        tips_enabled: s.tips_enabled,
        rush_mode: s.rush_mode ?? false,
        floor_plan_color_indicators: s.floor_plan_color_indicators ?? false,
        table_yellow_after_minutes: s.table_yellow_after_minutes ?? 30,
        table_red_after_minutes: s.table_red_after_minutes ?? 60,
      });
    }).finally(() => setLoading(false));
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        updateRestaurant(rid, info),
        updateRestaurantSettings(rid, svc),
      ]);
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
    <div className="space-y-8 max-w-2xl">
      {/* Language */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-fg-primary">{t('language')}</h2>
        <div className="flex gap-2">
          {SUPPORTED_LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                locale === l
                  ? 'border-brand-500 text-brand-500 bg-brand-500/5'
                  : 'border-divider text-fg-secondary hover:text-fg-primary hover:border-fg-secondary'
              }`}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      </div>

      {/* Restaurant info */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-fg-primary">{t('restaurantInfo')}</h2>
        {[
          { label: t('name'), key: 'name' as const },
          { label: t('address'), key: 'address' as const },
          { label: t('phone'), key: 'phone' as const },
          { label: t('description'), key: 'description' as const },
        ].map(({ label, key }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-fg-secondary mb-1">{label}</label>
            <input
              className="input"
              value={info[key]}
              onChange={(e) => setInfo((p) => ({ ...p, [key]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      {/* Operational settings */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-fg-primary">{t('operations')}</h2>

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
      </div>

      {/* Table status color indicators */}
      <div className="card space-y-4">
        <div>
          <h2 className="font-semibold text-fg-primary">Statut des tables</h2>
          <p className="text-xs text-fg-secondary mt-1">
            Colorez les tables du plan de salle en fonction du temps écoulé depuis l&apos;ouverture de la commande.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setSvc((p) => ({ ...p, floor_plan_color_indicators: !p.floor_plan_color_indicators }))}
            className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${svc.floor_plan_color_indicators ? 'bg-brand-500' : 'bg-[var(--surface-subtle)]'}`}
            style={{ border: '1px solid var(--divider)' }}
          >
            <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${svc.floor_plan_color_indicators ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
          <div>
            <div className="text-sm font-medium text-fg-primary">Indicateurs de couleur</div>
            <div className="text-xs text-fg-secondary">Afficher l&apos;état d&apos;occupation par couleur sur le plan de salle</div>
          </div>
        </label>

        {svc.floor_plan_color_indicators && (
          <div className="space-y-3 pl-2" style={{ borderLeft: '3px solid var(--divider)' }}>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: '#f59e0b' }} />
              <div className="flex-1">
                <label className="text-sm font-medium text-fg-primary block mb-1">Passer en jaune après</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="240"
                    value={svc.table_yellow_after_minutes}
                    onChange={(e) => setSvc((p) => ({ ...p, table_yellow_after_minutes: Number(e.target.value) }))}
                    className="input w-24 text-sm"
                  />
                  <span className="text-sm text-fg-secondary">minutes</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ background: '#ef4444' }} />
              <div className="flex-1">
                <label className="text-sm font-medium text-fg-primary block mb-1">Passer en rouge après</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="480"
                    value={svc.table_red_after_minutes}
                    onChange={(e) => setSvc((p) => ({ ...p, table_red_after_minutes: Number(e.target.value) }))}
                    className="input w-24 text-sm"
                  />
                  <span className="text-sm text-fg-secondary">minutes</span>
                </div>
              </div>
            </div>

            {/* Color legend */}
            <div className="flex flex-wrap gap-3 pt-1">
              {[
                { color: '#22c55e', label: `< ${svc.table_yellow_after_minutes} min` },
                { color: '#f59e0b', label: `${svc.table_yellow_after_minutes}–${svc.table_red_after_minutes} min` },
                { color: '#ef4444', label: `> ${svc.table_red_after_minutes} min` },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                  <span className="text-xs text-fg-secondary">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? t('saving') : t('saveChanges')}
        </button>
        {saved && <span className="text-sm text-status-ready font-medium">{t('saved')}</span>}
      </div>

      {/* Spoke delivery integration */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-fg-primary">{t('spokeDeliveryIntegration')}</h2>
        <p className="text-xs text-fg-secondary">
          {t('spokeDesc')}
        </p>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('apiKey')}</label>
          <input
            className="input"
            type="password"
            value={spokeForm.api_key}
            onChange={(e) => setSpokeForm((p) => ({ ...p, api_key: e.target.value }))}
            placeholder={spokeConfig?.configured ? t('apiKeySavedPlaceholder') : t('enterApiKey')}
          />
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={spokeForm.enabled}
            onChange={(e) => setSpokeForm((p) => ({ ...p, enabled: e.target.checked }))}
          />
          <div>
            <div className="text-sm font-medium text-fg-primary">{t('enableSpokeIntegration')}</div>
            <div className="text-xs text-fg-secondary">{t('spokeEnabledDesc')}</div>
          </div>
        </label>

        <div>
          <label className="block text-sm font-medium text-fg-secondary mb-1">{t('depotId')}</label>
          <input
            className="input"
            value={spokeForm.depot_id}
            onChange={(e) => setSpokeForm((p) => ({ ...p, depot_id: e.target.value }))}
            placeholder={t('spokeDepotId')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">{t('defaultDriverName')}</label>
            <input
              className="input"
              value={spokeForm.default_driver_name}
              onChange={(e) => setSpokeForm((p) => ({ ...p, default_driver_name: e.target.value }))}
              placeholder={t('driverName')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-fg-secondary mb-1">{t('defaultDriverPhone')}</label>
            <input
              className="input"
              value={spokeForm.default_driver_phone}
              onChange={(e) => setSpokeForm((p) => ({ ...p, default_driver_phone: e.target.value }))}
              placeholder="+972..."
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              if (!spokeForm.api_key && !spokeConfig?.configured) return;
              setSpokeSaving(true);
              try {
                await updateSpokeConfig(rid, {
                  ...spokeForm,
                  api_key: spokeForm.api_key || '__unchanged__',
                });
                setSpokeSaved(true);
                setTimeout(() => setSpokeSaved(false), 2000);
                const cfg = await getSpokeConfig(rid);
                setSpokeConfig(cfg);
                setSpokeForm((p) => ({ ...p, api_key: '' }));
              } catch (e: any) {
                alert(e.message || 'Failed to save Spoke config');
              } finally {
                setSpokeSaving(false);
              }
            }}
            disabled={spokeSaving || (!spokeForm.api_key && !spokeConfig?.configured)}
            className="btn-primary disabled:opacity-50"
          >
            {spokeSaving ? t('saving') : t('saveSpokeConfig')}
          </button>
          {spokeSaved && <span className="text-sm text-status-ready font-medium">{t('saved')}</span>}
          {spokeConfig?.configured && (
            <span className="text-xs text-fg-secondary">{t('apiKeyConfigured')}</span>
          )}
        </div>
      </div>
    </div>
  );
}
