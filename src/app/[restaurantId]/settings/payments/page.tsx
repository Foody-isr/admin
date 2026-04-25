'use client';

/**
 * Paiements & TVA — settings sub-page.
 * Layout matches design-reference/screens/settings.jsx SettingsPayments:
 *   - Méthodes de paiement: list with status + configure/connect actions
 *   - Taux de TVA: small table of named rates
 *   - Arrondi et pourboire: rounding + tip suggestion inputs
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { DollarSign, Tag, MoreHorizontal } from 'lucide-react';
import {
  getRestaurantSettings,
  updateRestaurantSettings,
  RestaurantSettings,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, Field, Input, PageHead, Section, Select } from '@/components/ds';

interface PaymentMethod {
  key: string;
  name: string;
  desc: string;
  active: boolean;
  icon: 'dollar' | 'tag';
}

interface VatRate {
  id: string;
  name: string;
  rate: number;
  is_default: boolean;
}

export default function PaymentsSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [, setSettings] = useState<RestaurantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [vatRate, setVatRate] = useState<number>(18);
  const [tipsEnabled, setTipsEnabled] = useState(true);
  const [rounding, setRounding] = useState<'none' | '10ag' | 'whole'>('none');
  const [tipSuggestions, setTipSuggestions] = useState<[number, number, number]>([10, 12, 15]);

  useEffect(() => {
    getRestaurantSettings(rid)
      .then((s) => {
        setSettings(s);
        setVatRate(s.vat_rate ?? 18);
        setTipsEnabled(s.tips_enabled ?? true);
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRestaurantSettings(rid, {
        vat_rate: vatRate,
        tips_enabled: tipsEnabled,
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

  const methods: PaymentMethod[] = [
    {
      key: 'cash',
      name: t('paymentCash') || 'Espèces',
      desc: t('paymentCashDesc') || 'Toujours disponible',
      active: true,
      icon: 'dollar',
    },
    {
      key: 'card',
      name: t('paymentCard') || 'Carte bancaire',
      desc: t('paymentCardDesc') || 'Fournisseur configuré au niveau du restaurant',
      active: true,
      icon: 'tag',
    },
    {
      key: 'bit',
      name: 'Bit (paiement mobile)',
      desc: t('connectAccount') || 'Connecter un compte',
      active: false,
      icon: 'tag',
    },
    {
      key: 'wallet',
      name: 'Apple Pay / Google Pay',
      desc: t('viaCardProvider') || 'Via le fournisseur de carte',
      active: true,
      icon: 'tag',
    },
    {
      key: 'cibus',
      name: 'Tickets restaurant Cibus',
      desc: t('accountNotConnected') || 'Compte non connecté',
      active: false,
      icon: 'tag',
    },
  ];

  const vatRates: VatRate[] = [
    { id: 'standard', name: t('vatStandard') || 'Standard', rate: vatRate, is_default: true },
    { id: 'reduced', name: t('vatReduced') || 'Réduit (livres, journaux)', rate: 0, is_default: false },
    { id: 'exempt', name: t('vatExempt') || 'Exonéré (exports, ingrédients bruts)', rate: 0, is_default: false },
  ];

  return (
    <div className="max-w-[880px]">
      <PageHead
        title={t('paymentsAndVat') || 'Paiements & TVA'}
        desc={t('paymentsAndVatDescNew') || 'Méthodes de paiement acceptées et taux de TVA.'}
      />

      <Section title={t('paymentMethods') || 'Méthodes de paiement'}>
        <div className="flex flex-col gap-[var(--s-2)]">
          {methods.map((m) => (
            <div
              key={m.key}
              className="flex items-center justify-between gap-[var(--s-3)] p-[var(--s-4)] bg-[var(--surface)] border border-[var(--line)] rounded-r-md"
            >
              <div className="flex items-center gap-[var(--s-3)] min-w-0">
                <div
                  className="w-10 h-10 rounded-r-sm grid place-items-center bg-[var(--surface-2)]"
                  style={{ color: m.active ? 'var(--brand-500)' : 'var(--fg-subtle)' }}
                >
                  {m.icon === 'dollar' ? (
                    <DollarSign className="w-[18px] h-[18px]" />
                  ) : (
                    <Tag className="w-[18px] h-[18px]" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-fs-sm font-medium text-[var(--fg)] truncate">{m.name}</div>
                  <div className="text-fs-xs text-[var(--fg-subtle)] truncate">{m.desc}</div>
                </div>
              </div>
              <div className="flex items-center gap-[var(--s-2)] shrink-0">
                {m.active ? (
                  <>
                    <Badge tone="success" dot>
                      {t('active') || 'Actif'}
                    </Badge>
                    <Button variant="ghost" size="sm">
                      {t('configure') || 'Configurer'}
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" size="sm">
                    {t('connect') || 'Connecter'}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title={t('vatRatesTitle') || 'Taux de TVA'}
        desc={t('vatRatesDesc') || "Les taux sont appliqués automatiquement selon la catégorie de l'article."}
      >
        <div className="border border-[var(--line)] rounded-r-md overflow-hidden">
          <div
            className="grid gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] bg-[var(--surface-2)] text-fs-xs font-semibold uppercase tracking-[.06em] text-[var(--fg-muted)]"
            style={{ gridTemplateColumns: '1fr 120px 120px 32px' }}
          >
            <span>{t('name') || 'Nom'}</span>
            <span className="text-right">{t('rate') || 'Taux'}</span>
            <span className="text-right">{t('default') || 'Par défaut'}</span>
            <span />
          </div>
          {vatRates.map((v) => (
            <div
              key={v.id}
              className="grid gap-[var(--s-3)] px-[var(--s-4)] py-[var(--s-3)] items-center text-fs-sm border-t border-[var(--line)]"
              style={{ gridTemplateColumns: '1fr 120px 120px 32px' }}
            >
              <span className="font-medium">{v.name}</span>
              <span className="text-right font-mono tabular-nums">
                {v.id === 'standard' ? (
                  <span className="inline-flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={v.rate}
                      onChange={(e) => setVatRate(+e.target.value)}
                      className="font-mono h-8 text-right"
                      style={{ width: 70 }}
                    />
                    <span className="text-[var(--fg-muted)]">%</span>
                  </span>
                ) : (
                  `${v.rate}%`
                )}
              </span>
              <span className="text-right">
                {v.is_default && <Badge tone="info">{t('default') || 'Défaut'}</Badge>}
              </span>
              <button
                type="button"
                className="h-8 w-8 grid place-items-center rounded-r-md text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)]"
                aria-label={t('moreActions') || 'Plus'}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('roundingAndTip') || 'Arrondi et pourboire'}>
        <div className="flex gap-[var(--s-4)] flex-wrap">
          <Field grow label={t('totalRounding') || 'Arrondi sur total'}>
            <Select
              value={rounding}
              onChange={(e) => setRounding(e.target.value as typeof rounding)}
            >
              <option value="none">{t('roundingNone') || 'Aucun (au centime près)'}</option>
              <option value="10ag">{t('rounding10ag') || '10 agorot'}</option>
              <option value="whole">{t('roundingWhole') || 'Shekel entier'}</option>
            </Select>
          </Field>
          <Field grow label={t('tipSuggestion') || 'Pourboire suggéré'}>
            <div className="flex items-center gap-[var(--s-2)]">
              {tipSuggestions.map((tip, i) => (
                <Input
                  key={i}
                  type="number"
                  value={tip}
                  onChange={(e) => {
                    const next = [...tipSuggestions] as typeof tipSuggestions;
                    next[i] = +e.target.value;
                    setTipSuggestions(next);
                  }}
                  className="font-mono tabular-nums text-right"
                  style={{ width: 60 }}
                />
              ))}
              <span className="text-fs-sm text-[var(--fg-subtle)]">%</span>
            </div>
          </Field>
        </div>
        <label className="flex items-start gap-[var(--s-3)] cursor-pointer mt-[var(--s-4)]">
          <input
            type="checkbox"
            className="mt-1"
            checked={tipsEnabled}
            onChange={(e) => setTipsEnabled(e.target.checked)}
          />
          <div>
            <div className="text-fs-sm font-medium text-[var(--fg)]">
              {t('enableTips') || 'Activer les pourboires'}
            </div>
            <div className="text-fs-xs text-[var(--fg-subtle)]">
              {t('enableTipsDesc') ||
                'Propose un pourboire au client lors du paiement.'}
            </div>
          </div>
        </label>
      </Section>

      <div className="flex items-center gap-[var(--s-3)]">
        <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </Button>
        {saved && (
          <span className="text-fs-sm text-[var(--success-500)] font-medium">{t('saved')}</span>
        )}
      </div>
    </div>
  );
}
