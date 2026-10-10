'use client';

import { BooleanInput } from '@/components/ds/Selection';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CakeSlice, Clock3, Eye } from 'lucide-react';
import { Button, ConfirmDialog, Field, NumberField, PageHead, Section } from '@/components/ds';
import { getRestaurantSettings, getServiceGuidanceRules, updateRestaurantSettings, updateServiceGuidanceRules, type RestaurantSettings, type ServiceGuidanceRule } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

type Policy = Required<Pick<RestaurantSettings, 'table_assistance_rate_limit_enabled' | 'table_assistance_rate_limit_max_requests' | 'table_assistance_rate_limit_window_minutes'>>;
type Rule = Pick<ServiceGuidanceRule, 'type' | 'enabled' | 'delay_minutes' | 'overdue_minutes'>;
function policyFrom(settings: RestaurantSettings): Policy {
  return {
    table_assistance_rate_limit_enabled: settings.table_assistance_rate_limit_enabled ?? true,
    table_assistance_rate_limit_max_requests: settings.table_assistance_rate_limit_max_requests ?? 5,
    table_assistance_rate_limit_window_minutes: settings.table_assistance_rate_limit_window_minutes ?? 10,
  };
}
function rulesFrom(rows: ServiceGuidanceRule[]): Rule[] {
  if (rows.length !== 2 || new Set(rows.map(row => row.type)).size !== 2) throw new Error('Incomplete guidance rules');
  return (['check_in', 'offer_dessert'] as const).map(type => {
    const row = rows.find(row => row.type === type);
    if (!row || !Number.isInteger(row.delay_minutes) || row.delay_minutes < 1 || row.delay_minutes > 180 || !Number.isInteger(row.overdue_minutes) || row.overdue_minutes < 1 || row.overdue_minutes > 120) throw new Error('Invalid guidance rule');
    return { type, enabled: row.enabled, delay_minutes: row.delay_minutes, overdue_minutes: row.overdue_minutes };
  });
}
const equal = (first: unknown, second: unknown) => JSON.stringify(first) === JSON.stringify(second);

/** Manage table reminders and request limits with separate receipts for their two APIs. */
export default function TableAssistanceSettingsPage() {
  const { restaurantId } = useParams();
  return <AssistanceWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function AssistanceWorkspace({ rid }: { rid: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [baselinePolicy, setBaselinePolicy] = useState<Policy | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [baselineRules, setBaselineRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const lifetime = useRef({ generation: 0, sequence: 0 });
  const lock = useRef(false);
  const dirty = !!policy && (!equal(policy, baselinePolicy) || !equal(rules, baselineRules));
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try {
      const [settings, guidance] = await Promise.all([getRestaurantSettings(rid), getServiceGuidanceRules(rid)]);
      const nextPolicy = policyFrom(settings), nextRules = rulesFrom(guidance);
      if (current()) { setPolicy(nextPolicy); setBaselinePolicy(nextPolicy); setRules(nextRules); setBaselineRules(nextRules); }
    } catch { if (current()) setLoadError(true); }
    finally { if (current()) setLoading(false); }
  }, [rid]);
  useEffect(() => { const current = lifetime.current; void load(); return () => { current.generation += 1; }; }, [load]);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty || lock.current) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: MouseEvent) => {
      if ((!dirty && !lock.current) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download') || link.origin !== location.origin || link.href === location.href) return;
      event.preventDefault(); event.stopPropagation();
      if (!lock.current) setLeaving(link.pathname + link.search + link.hash);
    };
    window.addEventListener('beforeunload', guard); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', guard); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  const patchPolicy = (patch: Partial<Policy>) => { if (!canEdit || lock.current) return; setPolicy(current => current ? { ...current, ...patch } : null); setSaved(false); setError(''); };
  const patchRule = (type: Rule['type'], patch: Partial<Rule>) => { if (!canEdit || lock.current) return; setRules(current => current.map(row => row.type === type ? { ...row, ...patch } : row)); setSaved(false); setError(''); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!canEdit || !policy || !dirty || lock.current || loadError || loading) return;
    lock.current = true; setSaving(true); setError(''); setSaved(false);
    const generation = lifetime.current.generation;
    const current = () => generation === lifetime.current.generation;
    let policyWritten = false;
    try {
      // These services have no shared transaction. A confirmed phase becomes its
      // own baseline immediately so retries touch only the remaining changes.
      if (!equal(policy, baselinePolicy)) {
        const result = policyFrom({ ...policy, ...await updateRestaurantSettings(rid, policy) });
        if (!current()) return;
        setPolicy(result); setBaselinePolicy(result); policyWritten = true;
      }
      if (!equal(rules, baselineRules)) {
        const result = rulesFrom(await updateServiceGuidanceRules(rid, rules));
        if (!current()) return;
        setRules(result); setBaselineRules(result);
      }
      if (current()) setSaved(true);
    } catch { if (current()) setError(policyWritten ? 'assistancePartialSave' : 'tableAssistanceSaveError'); }
    finally { if (current()) { lock.current = false; setSaving(false); } }
  };
  const rulesTitle = (type: Rule['type']) => t(type === 'check_in' ? 'serviceGuidanceCheckIn' : 'serviceGuidanceDessert');
  const preview = policy ? policy.table_assistance_rate_limit_enabled ? t('tableAssistancePolicyPreview').replace('{count}', String(policy.table_assistance_rate_limit_max_requests)).replace('{minutes}', String(policy.table_assistance_rate_limit_window_minutes)) : t('tableAssistancePolicyDisabled') : '';

  return <div className="max-w-4xl space-y-6">
    <PageHead title={t('tableServiceSettings')} desc={t('tableServiceSettingsDesc')} actions={canEdit && <Button type="submit" form="table-assistance-settings" disabled={loading || loadError || !dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button>} />
    {loading ? <p role="status" className="py-10 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('assistanceLoadFailed')}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div> : policy && <form id="table-assistance-settings" onSubmit={save} className="space-y-6">
      {!canEdit && <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('pushPreferencesReadOnly')}</p>}
      <Section title={t('serviceGuidanceTitle')} desc={t('serviceGuidanceDesc')}>
        <div className="grid gap-4 lg:grid-cols-2">{rules.map(rule => {
          const Icon = rule.type === 'check_in' ? Eye : CakeSlice;
          return <section key={rule.type} aria-label={rulesTitle(rule.type)} className="min-w-0 rounded-r-md border border-[var(--line)] p-4">
            <label className="flex items-start gap-3">
              <Icon className="mt-1 size-5 shrink-0 text-[var(--fg-muted)]" aria-hidden="true" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{rulesTitle(rule.type)}</span><span id={`${rule.type}-hint`} className="mt-1 block text-sm leading-6 text-[var(--fg-muted)]">{t(rule.type === 'check_in' ? 'serviceGuidanceCheckInDesc' : 'serviceGuidanceDessertDesc')}</span></span>
              <BooleanInput aria-label={rulesTitle(rule.type)} aria-describedby={`${rule.type}-hint`} checked={rule.enabled} disabled={!canEdit || saving} onChange={event => patchRule(rule.type, { enabled: event.target.checked })} />
            </label>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Field label={t('serviceGuidanceDelay')}><NumberField required integer min={1} max={180} format={String} value={rule.delay_minutes} readOnly={!canEdit || saving || !rule.enabled} onChange={delay_minutes => patchRule(rule.type, { delay_minutes })} /></Field>
              <Field label={t('serviceGuidanceOverdue')}><NumberField required integer min={1} max={120} format={String} value={rule.overdue_minutes} readOnly={!canEdit || saving || !rule.enabled} onChange={overdue_minutes => patchRule(rule.type, { overdue_minutes })} /></Field>
            </div>
          </section>;
        })}</div>
        <p className="mt-4 flex items-start gap-3 rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]"><Clock3 className="mt-1 size-4 shrink-0" aria-hidden="true" />{t('serviceGuidanceCalmNote')}</p>
      </Section>
      <Section title={t('tableAssistanceProtection')} desc={t('tableAssistanceProtectionDesc')}>
        <label className="flex items-start gap-4"><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t('tableAssistanceLimitEnabled')}</span><span id="assistance-limit-hint" className="mt-1 block text-sm leading-6 text-[var(--fg-muted)]">{t('tableAssistanceLimitEnabledDesc')}</span></span>
          <BooleanInput aria-label={t('tableAssistanceLimitEnabled')} aria-describedby="assistance-limit-hint" checked={policy.table_assistance_rate_limit_enabled} disabled={!canEdit || saving} onChange={event => patchPolicy({ table_assistance_rate_limit_enabled: event.target.checked })} />
        </label>
        <p aria-live="polite" className="my-5 rounded-r-md bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{preview}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('tableAssistanceMaxRequests')}><NumberField required integer min={1} max={20} format={String} value={policy.table_assistance_rate_limit_max_requests} readOnly={!canEdit || saving || !policy.table_assistance_rate_limit_enabled} onChange={value => patchPolicy({ table_assistance_rate_limit_max_requests: value })} /></Field>
          <Field label={t('tableAssistanceWindowMinutes')}><NumberField required integer min={1} max={60} format={String} value={policy.table_assistance_rate_limit_window_minutes} readOnly={!canEdit || saving || !policy.table_assistance_rate_limit_enabled} onChange={value => patchPolicy({ table_assistance_rate_limit_window_minutes: value })} /></Field>
        </div>
      </Section>
      <Section title={t('tableAssistanceRulesTitle')}><ul className="divide-y divide-[var(--line)] text-sm leading-6 text-[var(--fg-muted)]">{['tableAssistanceRuleDeduplicate', 'tableAssistanceRuleAcknowledged', 'tableAssistanceRuleScope'].map(key => <li key={key} className="py-3 first:pt-0 last:pb-0">{t(key)}</li>)}</ul></Section>
      {error && <p role="alert" className="text-sm text-[var(--danger-500)]">{t(error)}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5"><p role="status" className="text-sm text-[var(--fg-muted)]">{t(saving ? 'saving' : dirty ? 'settingsUnsaved' : saved ? 'saved' : 'settingsUnchanged')}</p>{canEdit && <div className="flex gap-2"><Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => setLeaving('reset')}>{t('reset')}</Button><Button type="submit" disabled={!dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button></div>}</div>
    </form>}
    <ConfirmDialog open={leaving !== null} onOpenChange={open => { if (!open) setLeaving(null); }} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { const target = leaving; setLeaving(null); setPolicy(baselinePolicy); setRules(baselineRules); setError(''); setSaved(false); if (target && target !== 'reset') router.push(target); }} />
  </div>;
}
