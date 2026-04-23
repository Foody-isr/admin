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
import { Button, Field, Input, PageHead, Section } from '@/components/ds';

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
    <div className="space-y-[var(--s-5)] max-w-2xl">
      <PageHead
        title={t('settings') || 'Paramètres'}
        desc={t('settingsGeneralDesc') || 'Informations générales du restaurant'}
      />

      <Section title={t('language')}>
        <div className="flex gap-[var(--s-2)]">
          {SUPPORTED_LOCALES.map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={`px-[var(--s-4)] h-9 rounded-r-md text-fs-sm font-medium transition-colors border ${
                locale === l
                  ? 'border-[var(--brand-500)] text-[var(--brand-500)] bg-[color-mix(in_oklab,var(--brand-500)_5%,transparent)]'
                  : 'border-[var(--line)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--line-strong)]'
              }`}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('restaurantInfo')}>
        <div className="flex flex-col gap-[var(--s-4)]">
          {[
            { label: t('name'), key: 'name' as const },
            { label: t('address'), key: 'address' as const },
            { label: t('phone'), key: 'phone' as const },
            { label: t('description'), key: 'description' as const },
          ].map(({ label, key }) => (
            <Field key={key} label={label}>
              <Input
                value={info[key]}
                onChange={(e) => setInfo((p) => ({ ...p, [key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
      </Section>

      <div className="flex items-center gap-[var(--s-3)]">
        <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </Button>
        {saved && (
          <span className="text-fs-sm text-[var(--success-500)] font-medium">
            {t('saved')}
          </span>
        )}
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
