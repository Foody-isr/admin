'use client';

/**
 * Paiements & TVA — lives inside the Settings shell (260px nav rail).
 * Mirrors /orders/settings content with the VAT rate block so this single
 * page covers the "Paiements & TVA" entry from design-reference/settings.jsx.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  getRestaurantSettings,
  updateRestaurantSettings,
  RestaurantSettings,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, Field, Input, PageHead, Section } from '@/components/ds';

export default function PaymentsSettingsPage() {
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
    vat_rate: 18,
  });

  useEffect(() => {
    getRestaurantSettings(rid)
      .then((s) => {
        setSettings(s);
        setSvc({
          require_order_approval: s.require_order_approval,
          auto_send_to_kitchen: s.auto_send_to_kitchen ?? true,
          service_mode: s.service_mode,
          scheduling_enabled: s.scheduling_enabled,
          tips_enabled: s.tips_enabled,
          rush_mode: s.rush_mode ?? false,
          vat_rate: s.vat_rate ?? 18,
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
        <div className="animate-spin w-8 h-8 border-4 border-[var(--brand-500)] border-t-transparent rounded-full" />
      </div>
    );
  }

  const paymentMethods = [
    { key: 'card', label: t('paymentCard') || 'Carte bancaire', tone: 'success' as const },
    { key: 'cash', label: t('paymentCash') || 'Espèces', tone: 'success' as const },
    { key: 'online', label: t('paymentOnline') || 'En ligne', tone: 'neutral' as const },
  ];

  return (
    <div className="max-w-3xl space-y-[var(--s-5)]">
      <PageHead
        title={t('paymentsAndVat') || 'Paiements & TVA'}
        desc={
          t('paymentsAndVatDesc') ||
          'Méthodes de paiement acceptées, règles de service et taux de TVA.'
        }
      />

      <Section title={t('paymentMethods') || 'Méthodes de paiement'}>
        <div className="flex flex-wrap gap-[var(--s-2)]">
          {paymentMethods.map((p) => (
            <Badge key={p.key} tone={p.tone} dot>
              {p.label}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title={t('vatRate') || 'TVA'} desc={t('vatRateDesc') || 'Taux standard appliqué aux articles par défaut.'}>
        <div className="flex items-end gap-[var(--s-3)]">
          <Field label={t('vatRate') || 'Taux de TVA'}>
            <div className="relative max-w-[160px]">
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={svc.vat_rate}
                onChange={(e) => setSvc((p) => ({ ...p, vat_rate: +e.target.value }))}
                className="pr-8 font-mono"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-fs-sm text-[var(--fg-muted)] pointer-events-none">
                %
              </span>
            </div>
          </Field>
        </div>
      </Section>

      <Section
        title={t('servicePolicy') || 'Règles de service'}
        desc={t('servicePolicyDesc') || 'Comment les commandes passent en cuisine, les pourboires, la planification.'}
      >
        <Field label={t('serviceMode') || 'Mode de service'}>
          <select
            className="h-9 w-full max-w-xs px-[var(--s-3)] bg-[var(--surface)] text-[var(--fg)] border border-[var(--line-strong)] rounded-r-md text-fs-sm"
            value={svc.service_mode}
            onChange={(e) => setSvc((p) => ({ ...p, service_mode: e.target.value }))}
          >
            <option value="table">{t('tableService') || 'À table'}</option>
            <option value="counter">{t('counterService') || 'Au comptoir'}</option>
          </select>
        </Field>

        <div className="flex flex-col gap-[var(--s-3)] mt-[var(--s-4)]">
          {[
            { label: t('autoSendToKitchen'), key: 'auto_send_to_kitchen' as const, desc: t('autoSendDesc') },
            { label: t('enableTips'), key: 'tips_enabled' as const, desc: t('enableTipsDesc') },
            { label: t('scheduledOrders'), key: 'scheduling_enabled' as const, desc: t('scheduledOrdersDesc') },
            { label: t('rushMode'), key: 'rush_mode' as const, desc: t('rushModeDesc') },
          ].map(({ label, key, desc }) => (
            <label key={key} className="flex items-start gap-[var(--s-3)] cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={svc[key] as boolean}
                onChange={(e) => setSvc((p) => ({ ...p, [key]: e.target.checked }))}
              />
              <div>
                <div className="text-fs-sm font-medium text-[var(--fg)]">{label}</div>
                <div className="text-fs-xs text-[var(--fg-subtle)]">{desc}</div>
              </div>
            </label>
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
    </div>
  );
}
