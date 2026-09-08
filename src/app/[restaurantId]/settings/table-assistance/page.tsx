'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, NumberField, PageHead, Section } from '@/components/ds';
import { getRestaurantSettings, updateRestaurantSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

const DEFAULT_MAX_REQUESTS = 5;
const DEFAULT_WINDOW_MINUTES = 10;

interface AssistancePolicy {
  enabled: boolean;
  maxRequests: number;
  windowMinutes: number;
}

function formatPolicy(template: string, policy: AssistancePolicy): string {
  return template
    .replace('{count}', String(policy.maxRequests))
    .replace('{minutes}', String(policy.windowMinutes));
}

export default function TableAssistanceSettingsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');

  const [policy, setPolicy] = useState<AssistancePolicy>({
    enabled: true,
    maxRequests: DEFAULT_MAX_REQUESTS,
    windowMinutes: DEFAULT_WINDOW_MINUTES,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRestaurantSettings(rid)
      .then((settings) => {
        setPolicy({
          enabled: settings.table_assistance_rate_limit_enabled ?? true,
          maxRequests:
            settings.table_assistance_rate_limit_max_requests ?? DEFAULT_MAX_REQUESTS,
          windowMinutes:
            settings.table_assistance_rate_limit_window_minutes ?? DEFAULT_WINDOW_MINUTES,
        });
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : t('tableAssistanceSaveError'));
      })
      .finally(() => setLoading(false));
  }, [rid, t]);

  const preview = useMemo(
    () => policy.enabled
      ? formatPolicy(t('tableAssistancePolicyPreview'), policy)
      : t('tableAssistancePolicyDisabled'),
    [policy, t],
  );

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const settings = await updateRestaurantSettings(rid, {
        table_assistance_rate_limit_enabled: policy.enabled,
        table_assistance_rate_limit_max_requests: policy.maxRequests,
        table_assistance_rate_limit_window_minutes: policy.windowMinutes,
      });
      setPolicy({
        enabled: settings.table_assistance_rate_limit_enabled ?? policy.enabled,
        maxRequests:
          settings.table_assistance_rate_limit_max_requests ?? policy.maxRequests,
        windowMinutes:
          settings.table_assistance_rate_limit_window_minutes ?? policy.windowMinutes,
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('tableAssistanceSaveError'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--brand-500)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageHead
        title={t('tableAssistanceSettings')}
        desc={t('tableAssistanceSettingsDesc')}
      />

      <Section
        title={t('tableAssistanceProtection')}
        desc={t('tableAssistanceProtectionDesc')}
      >
        <div className="space-y-[var(--s-5)]">
          <div className="flex items-center justify-between gap-[var(--s-4)]">
            <div className="min-w-0">
              <div id="assistance-limit-label" className="text-fs-sm font-medium text-[var(--fg)]">
                {t('tableAssistanceLimitEnabled')}
              </div>
              <p className="mt-1 max-w-[62ch] text-fs-xs leading-relaxed text-[var(--fg-subtle)]">
                {t('tableAssistanceLimitEnabledDesc')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={policy.enabled}
              aria-labelledby="assistance-limit-label"
              disabled={!canEdit}
              onClick={() => setPolicy((current) => ({ ...current, enabled: !current.enabled }))}
              className="relative h-6 w-11 shrink-0 rounded-full border border-[var(--line)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: policy.enabled ? 'var(--brand-500)' : 'var(--surface-3)',
              }}
            >
              <span
                aria-hidden="true"
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                style={{ insetInlineStart: policy.enabled ? 22 : 2 }}
              />
            </button>
          </div>

          <div
            className="border-s-4 px-[var(--s-4)] py-[var(--s-3)] text-fs-sm font-medium leading-relaxed text-[var(--fg)]"
            style={{
              borderColor: policy.enabled ? 'var(--brand-500)' : 'var(--line-strong)',
              background: policy.enabled
                ? 'color-mix(in oklab, var(--brand-500) 8%, var(--surface))'
                : 'var(--surface-2)',
            }}
            aria-live="polite"
          >
            {preview}
          </div>

          <div className="grid gap-[var(--s-4)] sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="block text-fs-sm font-medium text-[var(--fg)]">
                {t('tableAssistanceMaxRequests')}
              </span>
              <NumberField
                integer
                min={1}
                max={20}
                value={policy.maxRequests}
                disabled={!canEdit || !policy.enabled}
                onChange={(maxRequests) => setPolicy((current) => ({ ...current, maxRequests }))}
                aria-describedby="assistance-limit-label"
              />
            </label>
            <label className="space-y-1.5">
              <span className="block text-fs-sm font-medium text-[var(--fg)]">
                {t('tableAssistanceWindowMinutes')}
              </span>
              <NumberField
                integer
                min={1}
                max={60}
                value={policy.windowMinutes}
                disabled={!canEdit || !policy.enabled}
                onChange={(windowMinutes) => setPolicy((current) => ({ ...current, windowMinutes }))}
              />
            </label>
          </div>
        </div>
      </Section>

      <Section title={t('tableAssistanceRulesTitle')}>
        <ul className="divide-y divide-[var(--line)] text-fs-sm leading-relaxed text-[var(--fg-muted)]">
          <li className="py-[var(--s-3)] first:pt-0">{t('tableAssistanceRuleDeduplicate')}</li>
          <li className="py-[var(--s-3)]">{t('tableAssistanceRuleAcknowledged')}</li>
          <li className="pt-[var(--s-3)]">{t('tableAssistanceRuleScope')}</li>
        </ul>
      </Section>

      <div className="flex flex-wrap items-center gap-[var(--s-3)]">
        {canEdit && (
          <Button variant="primary" size="md" onClick={handleSave} disabled={saving}>
            {saving ? t('saving') : t('saveChanges')}
          </Button>
        )}
        {saved && (
          <span className="text-fs-sm font-medium text-[var(--success-500)]">{t('saved')}</span>
        )}
        {error && (
          <span role="alert" className="text-fs-sm font-medium text-[var(--danger-500)]">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
