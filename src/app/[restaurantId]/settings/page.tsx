'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getRestaurant, updateRestaurant,
  Restaurant,
  getSpokeConfig, updateSpokeConfig, SpokeConfigResponse,
  getRestaurantSettings, updateRestaurantSettings,
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

  // VAT rate
  const [vatRate, setVatRate] = useState<number>(18);
  const [vatSaving, setVatSaving] = useState(false);
  const [vatSaved, setVatSaved] = useState(false);

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
    getRestaurant(rid).then((r) => {
      setRestaurant(r);
      setInfo({ name: r.name, address: r.address, phone: r.phone, description: r.description });
    }).finally(() => setLoading(false));
    getRestaurantSettings(rid).then((s) => {
      setVatRate(s.vat_rate ?? 18);
    }).catch(() => {});
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRestaurant(rid, info);
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

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? t('saving') : t('saveChanges')}
        </button>
        {saved && <span className="text-sm text-status-ready font-medium">{t('saved')}</span>}
      </div>

      {/* VAT / Tax configuration */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-fg-primary">{t('vatRate')}</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-[200px]">
            <label className="block text-sm font-medium text-fg-secondary mb-1">{t('vatRate')}</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              className="input w-full"
              value={vatRate}
              onChange={(e) => setVatRate(+e.target.value)}
            />
          </div>
          <button
            onClick={async () => {
              setVatSaving(true);
              try {
                await updateRestaurantSettings(rid, { vat_rate: vatRate });
                setVatSaved(true);
                setTimeout(() => setVatSaved(false), 2000);
              } finally {
                setVatSaving(false);
              }
            }}
            disabled={vatSaving}
            className="btn-primary disabled:opacity-50"
          >
            {vatSaving ? t('saving') : t('saveChanges')}
          </button>
          {vatSaved && <span className="text-sm text-status-ready font-medium">{t('saved')}</span>}
        </div>
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
