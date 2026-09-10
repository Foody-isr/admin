'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { CakeSlice, Clock3, Eye } from 'lucide-react';
import { Button, NumberField, PageHead, Section } from '@/components/ds';
import {
  getRestaurantSettings,
  getServiceGuidanceRules,
  updateRestaurantSettings,
  updateServiceGuidanceRules,
  type ServiceGuidanceRule,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

const DEFAULT_MAX_REQUESTS = 5;
const DEFAULT_WINDOW_MINUTES = 10;
const DEFAULT_GUIDANCE: ServiceGuidanceRule[] = [
  { type: 'check_in', enabled: false, delay_minutes: 5, overdue_minutes: 10 },
  { type: 'offer_dessert', enabled: false, delay_minutes: 20, overdue_minutes: 10 },
];

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
  const [guidance, setGuidance] = useState<ServiceGuidanceRule[]>(DEFAULT_GUIDANCE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getRestaurantSettings(rid), getServiceGuidanceRules(rid)])
      .then(([settings, rules]) => {
        setPolicy({
          enabled: settings.table_assistance_rate_limit_enabled ?? true,
          maxRequests:
            settings.table_assistance_rate_limit_max_requests ?? DEFAULT_MAX_REQUESTS,
          windowMinutes:
            settings.table_assistance_rate_limit_window_minutes ?? DEFAULT_WINDOW_MINUTES,
        });
        if (rules.length === DEFAULT_GUIDANCE.length) setGuidance(rules);
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
      const [settings, savedGuidance] = await Promise.all([
        updateRestaurantSettings(rid, {
          table_assistance_rate_limit_enabled: policy.enabled,
          table_assistance_rate_limit_max_requests: policy.maxRequests,
          table_assistance_rate_limit_window_minutes: policy.windowMinutes,
        }),
        updateServiceGuidanceRules(rid, guidance),
      ]);
      setPolicy({
        enabled: settings.table_assistance_rate_limit_enabled ?? policy.enabled,
        maxRequests:
          settings.table_assistance_rate_limit_max_requests ?? policy.maxRequests,
        windowMinutes:
          settings.table_assistance_rate_limit_window_minutes ?? policy.windowMinutes,
      });
      setGuidance(savedGuidance);
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
        title={t('tableServiceSettings')}
        desc={t('tableServiceSettingsDesc')}
      />

      <Section title={t('serviceGuidanceTitle')} desc={t('serviceGuidanceDesc')}>
        <div className="space-y-[var(--s-3)]">
          {guidance.map((rule) => (
            <GuidanceRuleCard
              key={rule.type}
              rule={rule}
              canEdit={canEdit}
              title={t(rule.type === 'check_in' ? 'serviceGuidanceCheckIn' : 'serviceGuidanceDessert')}
              description={t(rule.type === 'check_in' ? 'serviceGuidanceCheckInDesc' : 'serviceGuidanceDessertDesc')}
              icon={rule.type === 'check_in' ? <Eye className="h-5 w-5" /> : <CakeSlice className="h-5 w-5" />}
              onChange={(next) => setGuidance((rules) => rules.map((item) => item.type === next.type ? next : item))}
              t={t}
            />
          ))}
          <div className="flex items-start gap-2 border-s-4 border-[var(--info-500)] bg-[var(--surface-2)] px-[var(--s-3)] py-[var(--s-2)] text-fs-xs leading-relaxed text-[var(--fg-muted)]">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--info-500)]" />
            <span>{t('serviceGuidanceCalmNote')}</span>
          </div>
        </div>
      </Section>

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

function GuidanceRuleCard({
  rule,
  canEdit,
  title,
  description,
  icon,
  onChange,
  t,
}: {
  rule: ServiceGuidanceRule;
  canEdit: boolean;
  title: string;
  description: string;
  icon: ReactNode;
  onChange: (rule: ServiceGuidanceRule) => void;
  t: (key: string) => string;
}) {
  const labelId = `guidance-${rule.type}`;
  const patch = (next: Partial<ServiceGuidanceRule>) => onChange({ ...rule, ...next });
  return (
    <div className="rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-[var(--s-4)]">
      <div className="flex items-start gap-[var(--s-3)]">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-r-md bg-[var(--surface-2)] text-[var(--fg-muted)]">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div id={labelId} className="text-fs-sm font-semibold text-[var(--fg)]">{title}</div>
          <p className="mt-1 max-w-[62ch] text-fs-xs leading-relaxed text-[var(--fg-muted)]">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={rule.enabled}
          aria-labelledby={labelId}
          disabled={!canEdit}
          onClick={() => patch({ enabled: !rule.enabled })}
          className="relative h-6 w-11 shrink-0 rounded-full border border-[var(--line)] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: rule.enabled ? 'var(--brand-500)' : 'var(--surface-3)' }}
        >
          <span aria-hidden="true" className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ insetInlineStart: rule.enabled ? 22 : 2 }} />
        </button>
      </div>
      <div className="mt-[var(--s-4)] grid gap-[var(--s-4)] sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="block text-fs-xs font-medium text-[var(--fg-muted)]">{t('serviceGuidanceDelay')}</span>
          <NumberField integer min={1} max={180} value={rule.delay_minutes} disabled={!canEdit || !rule.enabled} onChange={(delay_minutes) => patch({ delay_minutes })} />
        </label>
        <label className="space-y-1.5">
          <span className="block text-fs-xs font-medium text-[var(--fg-muted)]">{t('serviceGuidanceOverdue')}</span>
          <NumberField integer min={1} max={120} value={rule.overdue_minutes} disabled={!canEdit || !rule.enabled} onChange={(overdue_minutes) => patch({ overdue_minutes })} />
        </label>
      </div>
    </div>
  );
}
