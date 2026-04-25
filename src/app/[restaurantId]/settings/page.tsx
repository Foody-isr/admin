'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getRestaurant,
  updateRestaurant,
  Restaurant,
  getRestaurantSettings,
} from '@/lib/api';
import { useI18n, SUPPORTED_LOCALES, type Locale } from '@/lib/i18n';
import { Button, Field, Input, PageHead, Section, Select } from '@/components/ds';

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  he: 'עברית',
  fr: 'Français',
};

interface InfoForm {
  name: string;
  legal_name: string;
  address: string;
  phone: string;
  email: string;
  tax_id: string;
  capacity: string;
}

interface PrefsForm {
  timezone: string;
  currency: string;
  number_format: '1 234,56' | '1,234.56';
}

export default function SettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale, setLocale } = useI18n();

  const [, setRestaurant] = useState<Restaurant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [info, setInfo] = useState<InfoForm>({
    name: '',
    legal_name: '',
    address: '',
    phone: '',
    email: '',
    tax_id: '',
    capacity: '',
  });

  const [prefs, setPrefs] = useState<PrefsForm>({
    timezone: 'Asia/Jerusalem',
    currency: 'ILS',
    number_format: '1 234,56',
  });

  useEffect(() => {
    getRestaurant(rid)
      .then((r) => {
        setRestaurant(r);
        setInfo((p) => ({
          ...p,
          name: r.name ?? '',
          address: r.address ?? '',
          phone: r.phone ?? '',
        }));
        if (r.timezone) setPrefs((p) => ({ ...p, timezone: r.timezone }));
      })
      .finally(() => setLoading(false));
    getRestaurantSettings(rid).catch(() => {});
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRestaurant(rid, {
        name: info.name,
        address: info.address,
        phone: info.phone,
        timezone: prefs.timezone,
      });
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
      <PageHead
        title={t('general') || 'Général'}
        desc={t('settingsGeneralDesc') || 'Informations générales du restaurant.'}
      />

      <Section title={t('restaurantInfo') || 'Informations du restaurant'}>
        <div className="flex flex-col gap-[var(--s-4)]">
          <div className="flex gap-[var(--s-4)] flex-wrap">
            <Field grow label={t('name') || 'Nom'}>
              <Input
                value={info.name}
                onChange={(e) => setInfo((p) => ({ ...p, name: e.target.value }))}
              />
            </Field>
            <Field grow label={t('legalName') || 'Nom légal'}>
              <Input
                value={info.legal_name}
                onChange={(e) => setInfo((p) => ({ ...p, legal_name: e.target.value }))}
                placeholder="Mamie Food Ltd."
              />
            </Field>
          </div>
          <Field label={t('address') || 'Adresse'}>
            <Input
              value={info.address}
              onChange={(e) => setInfo((p) => ({ ...p, address: e.target.value }))}
            />
          </Field>
          <div className="flex gap-[var(--s-4)] flex-wrap">
            <Field grow label={t('phone') || 'Téléphone'}>
              <Input
                className="font-mono"
                value={info.phone}
                onChange={(e) => setInfo((p) => ({ ...p, phone: e.target.value }))}
              />
            </Field>
            <Field grow label={t('email') || 'Email'}>
              <Input
                type="email"
                value={info.email}
                onChange={(e) => setInfo((p) => ({ ...p, email: e.target.value }))}
                placeholder="contact@…"
              />
            </Field>
          </div>
          <div className="flex gap-[var(--s-4)] flex-wrap">
            <Field grow label={t('taxId') || 'Numéro SIRET / Tax ID'}>
              <Input
                className="font-mono"
                value={info.tax_id}
                onChange={(e) => setInfo((p) => ({ ...p, tax_id: e.target.value }))}
                placeholder="51-1234567"
              />
            </Field>
            <Field grow label={t('seatingCapacity') || 'Capacité (couverts)'}>
              <Input
                className="font-mono tabular-nums"
                value={info.capacity}
                onChange={(e) => setInfo((p) => ({ ...p, capacity: e.target.value }))}
                placeholder="48"
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section
        title={t('preferences') || 'Préférences'}
        desc={t('preferencesDesc') || 'Langue, fuseau horaire, devise et format des chiffres.'}
      >
        <div className="flex gap-[var(--s-4)] flex-wrap">
          <Field grow label={t('language') || 'Langue'}>
            <Select value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
              {SUPPORTED_LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>
          <Field grow label={t('timezone') || 'Fuseau horaire'}>
            <Select
              value={prefs.timezone}
              onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))}
            >
              <option value="Asia/Jerusalem">Asia/Jerusalem (GMT+3)</option>
              <option value="Europe/Paris">Europe/Paris (GMT+1)</option>
              <option value="America/New_York">America/New_York (GMT-5)</option>
              <option value="UTC">UTC</option>
            </Select>
          </Field>
          <Field grow label={t('currency') || 'Devise'}>
            <Select
              value={prefs.currency}
              onChange={(e) => setPrefs((p) => ({ ...p, currency: e.target.value }))}
            >
              <option value="ILS">Shekel (₪)</option>
              <option value="EUR">Euro (€)</option>
              <option value="USD">US Dollar ($)</option>
            </Select>
          </Field>
          <Field grow label={t('numberFormat') || 'Format numérique'}>
            <Select
              value={prefs.number_format}
              onChange={(e) =>
                setPrefs((p) => ({ ...p, number_format: e.target.value as PrefsForm['number_format'] }))
              }
            >
              <option value="1 234,56">1 234,56</option>
              <option value="1,234.56">1,234.56</option>
            </Select>
          </Field>
        </div>
      </Section>

      <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-5)]">
        <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </Button>
        {saved && (
          <span className="text-fs-sm text-[var(--success-500)] font-medium">{t('saved')}</span>
        )}
      </div>

      <Section
        title={t('dangerZone') || 'Zone dangereuse'}
        desc={t('dangerZoneDesc') || 'Actions irréversibles. Contactez le support en cas de doute.'}
      >
        <div className="flex flex-col gap-[var(--s-2)]">
          <div
            className="flex items-center justify-between gap-[var(--s-4)] p-[var(--s-4)] rounded-r-md border"
            style={{
              background: 'color-mix(in oklab, var(--danger-500) 6%, var(--surface))',
              borderColor: 'color-mix(in oklab, var(--danger-500) 25%, var(--line))',
            }}
          >
            <div className="min-w-0">
              <div className="text-fs-sm font-semibold text-[var(--fg)]">
                {t('exportAllData') || 'Exporter toutes les données'}
              </div>
              <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
                {t('exportAllDataDesc') ||
                  'Archive complète (commandes, articles, clients) au format CSV.'}
              </div>
            </div>
            <Button variant="secondary" size="sm">
              {t('export') || 'Exporter'}
            </Button>
          </div>
          <div
            className="flex items-center justify-between gap-[var(--s-4)] p-[var(--s-4)] rounded-r-md border"
            style={{
              background: 'color-mix(in oklab, var(--danger-500) 10%, var(--surface))',
              borderColor: 'color-mix(in oklab, var(--danger-500) 35%, var(--line))',
            }}
          >
            <div className="min-w-0">
              <div className="text-fs-sm font-semibold text-[var(--danger-500)]">
                {t('closeAccount') || 'Fermer définitivement ce compte'}
              </div>
              <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
                {t('closeAccountDesc') || 'Toutes les données seront supprimées après 30 jours.'}
              </div>
            </div>
            <button
              type="button"
              className="h-8 px-[var(--s-3)] rounded-r-md border text-fs-sm font-medium transition-colors hover:bg-[color-mix(in_oklab,var(--danger-500)_8%,transparent)]"
              style={{
                color: 'var(--danger-500)',
                borderColor: 'color-mix(in oklab, var(--danger-500) 40%, var(--line))',
                background: 'transparent',
              }}
            >
              {t('closeAccountAction') || 'Fermer le compte'}
            </button>
          </div>
        </div>
      </Section>
    </div>
  );
}
