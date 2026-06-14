'use client';

/**
 * AI Ordering Assistant — settings sub-page.
 * Lets the restaurant enable/disable the guest-facing chat concierge on
 * foodyweb and shape how it behaves (upselling, direct ordering, and
 * free-form guidance fed into the assistant's instructions).
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import {
  getRestaurantSettings,
  updateRestaurantSettings,
  RestaurantSettings,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button, Field, PageHead, Section, Textarea } from '@/components/ds';

export default function AIAssistantSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [upsell, setUpsell] = useState(true);
  const [autoOrder, setAutoOrder] = useState(true);
  const [guidance, setGuidance] = useState('');

  useEffect(() => {
    getRestaurantSettings(rid)
      .then((s: RestaurantSettings) => {
        setEnabled(s.ai_assistant_enabled ?? false);
        setUpsell(s.ai_assistant_upsell ?? true);
        setAutoOrder(s.ai_assistant_auto_order ?? true);
        setGuidance(s.ai_assistant_guidance ?? '');
      })
      .finally(() => setLoading(false));
  }, [rid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRestaurantSettings(rid, {
        ai_assistant_enabled: enabled,
        ai_assistant_upsell: upsell,
        ai_assistant_auto_order: autoOrder,
        ai_assistant_guidance: guidance,
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
        title={t('aiOrderAssistant') || 'AI Ordering Assistant'}
        desc={
          t('aiAssistantDesc') ||
          'A chat concierge on your ordering page that helps guests pick dishes and order.'
        }
      />

      <Section title={t('aiOrderAssistant') || 'AI Ordering Assistant'}>
        <ToggleRow
          label={t('aiEnable') || 'Enable AI assistant'}
          sub={
            t('aiEnableDesc') ||
            'Show the "Ask AI" button on your foodyweb ordering page.'
          }
          checked={enabled}
          onChange={setEnabled}
        />
      </Section>

      <Section
        title={t('aiBehavior') || 'Behaviour'}
        desc={
          t('aiBehaviorDesc') ||
          'Control how the assistant guides guests through their order.'
        }
      >
        <div className={enabled ? '' : 'opacity-50 pointer-events-none'}>
          <ToggleRow
            label={t('aiUpsell') || 'Suggest add-ons (upselling)'}
            sub={
              t('aiUpsellDesc') ||
              'Let the assistant recommend drinks, sides, desserts and upgrades to grow order value — without being pushy.'
            }
            checked={upsell}
            onChange={setUpsell}
          />
          <div className="h-px bg-[var(--line)] my-[var(--s-4)]" />
          <ToggleRow
            label={t('aiAutoOrder') || 'Let the assistant place orders'}
            sub={
              t('aiAutoOrderDesc') ||
              'Allow the assistant to collect the guest’s details and submit the order with a payment link. When off, it only helps build the order and hands off to checkout.'
            }
            checked={autoOrder}
            onChange={setAutoOrder}
          />

          <Field
            grow
            label={t('aiGuidance') || 'Guidance for the assistant'}
            hint={
              t('aiGuidanceHint') ||
              'Free-form instructions, e.g. “Push the chef’s specials”, “We are a vegan kitchen”, or a tone of voice. Leave blank for the default.'
            }
            className="mt-[var(--s-5)]"
          >
            <Textarea
              rows={4}
              value={guidance}
              maxLength={1000}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder={
                t('aiGuidancePlaceholder') ||
                'e.g. Prioritise our signature pizzas and always suggest a drink.'
              }
            />
          </Field>
        </div>
      </Section>

      <div className="flex items-center gap-[var(--s-3)]">
        <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
          {saving ? t('saving') : t('saveChanges')}
        </Button>
        {saved && (
          <span className="text-fs-sm text-[var(--success-500)] font-medium">{t('saved')}</span>
        )}
        {!enabled && (
          <span className="flex items-center gap-1 text-fs-xs text-[var(--fg-subtle)]">
            <Sparkles className="w-3.5 h-3.5" />
            {t('aiDisabledHint') || 'Assistant is currently hidden from guests.'}
          </span>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-[var(--s-4)] cursor-pointer">
      <div className="min-w-0">
        <div className="text-fs-sm font-medium text-[var(--fg)]">{label}</div>
        <div className="text-fs-xs text-[var(--fg-subtle)]">{sub}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors"
        style={{ background: checked ? 'var(--brand-500)' : 'var(--surface-3)' }}
      >
        <span
          className="inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? 'translateX(22px)' : 'translateX(2px)' }}
        />
      </button>
    </label>
  );
}
