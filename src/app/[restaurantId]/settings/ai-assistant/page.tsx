'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { getRestaurantSettings, updateRestaurantSettings, type RestaurantSettings } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { Badge, Button, ConfirmDialog, Field, NumberField, PageHead, Section, Select, Textarea } from '@/components/ds';

type Draft = Required<Pick<RestaurantSettings, 'ai_assistant_enabled' | 'ai_assistant_upsell' | 'ai_assistant_auto_order' | 'ai_assistant_guidance' | 'ai_assistant_aliases' | 'ai_assistant_pairings' | 'ai_assistant_faq' | 'ai_assistant_trigger' | 'ai_assistant_trigger_delay'>>;
const TEXT_FIELDS = [
  { key: 'ai_assistant_guidance', label: 'aiGuidance', hint: 'aiGuidanceHint', placeholder: 'aiGuidancePlaceholder', max: 1000, rows: 4 },
  { key: 'ai_assistant_aliases', label: 'aiAliases', hint: 'aiAliasesHint', placeholder: 'aiAliasesPlaceholder', max: 4000, rows: 4 },
  { key: 'ai_assistant_pairings', label: 'aiPairings', hint: 'aiPairingsHint', placeholder: 'aiPairingsPlaceholder', max: 4000, rows: 4 },
  { key: 'ai_assistant_faq', label: 'aiFaq', hint: 'aiFaqHint', placeholder: 'aiFaqPlaceholder', max: 6000, rows: 5 },
] as const;
function toDraft(settings: RestaurantSettings): Draft {
  const trigger = settings.ai_assistant_trigger ?? 'manual';
  if (!['manual', 'immediate', 'delay'].includes(trigger)) throw new Error('Unsupported assistant trigger');
  return {
    ai_assistant_enabled: settings.ai_assistant_enabled ?? false,
    ai_assistant_upsell: settings.ai_assistant_upsell ?? true,
    ai_assistant_auto_order: settings.ai_assistant_auto_order ?? true,
    ai_assistant_guidance: settings.ai_assistant_guidance ?? '',
    ai_assistant_aliases: settings.ai_assistant_aliases ?? '',
    ai_assistant_pairings: settings.ai_assistant_pairings ?? '',
    ai_assistant_faq: settings.ai_assistant_faq ?? '',
    ai_assistant_trigger: trigger,
    ai_assistant_trigger_delay: settings.ai_assistant_trigger_delay ?? 45,
  };
}

/** Configure the guest assistant without invoking a model or changing the current draft on failure. */
export default function AIAssistantSettingsPage() {
  const { restaurantId } = useParams();
  return <AssistantWorkspace key={String(restaurantId)} rid={Number(restaurantId)} />;
}
function AssistantWorkspace({ rid }: { rid: number }) {
  const { t } = useI18n();
  const router = useRouter();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const lock = useRef(false);
  const lifetime = useRef({ generation: 0, sequence: 0 });
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(baseline);
  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try { const value = toDraft(await getRestaurantSettings(rid)); if (current()) { setDraft(value); setBaseline(value); } }
    catch { if (current()) setLoadError(true); }
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
  const patch = (value: Partial<Draft>) => { if (canEdit && !lock.current) { setDraft(current => current ? { ...current, ...value } : null); setSaved(false); setSaveError(false); } };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if (!canEdit || !draft || !dirty || lock.current || loadError || loading) return;
    lock.current = true; setSaving(true); setSaveError(false); setSaved(false);
    const generation = lifetime.current.generation;
    try {
      const response = await updateRestaurantSettings(rid, draft);
      if (generation !== lifetime.current.generation) return;
      const confirmed = toDraft({ ...draft, ...response });
      setDraft(confirmed); setBaseline(confirmed); setSaved(true);
    } catch { if (generation === lifetime.current.generation) setSaveError(true); }
    finally { if (generation === lifetime.current.generation) { lock.current = false; setSaving(false); } }
  };
  const toggle = (key: 'ai_assistant_enabled' | 'ai_assistant_upsell' | 'ai_assistant_auto_order', title: string, hint: string) => draft && <label className="flex min-h-11 items-start gap-4 py-2">
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{t(title)}</span><span id={`${key}-hint`} className="mt-1 block text-sm leading-6 text-[var(--fg-muted)]">{t(hint)}</span></span>
    <input role="switch" type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--action)]" aria-label={t(title)} aria-describedby={`${key}-hint`} checked={draft[key]} disabled={!canEdit || saving || (key !== 'ai_assistant_enabled' && !draft.ai_assistant_enabled)} onChange={event => patch({ [key]: event.target.checked })} />
  </label>;
  const textField = (field: typeof TEXT_FIELDS[number]) => draft && <Field key={field.key} label={t(field.label)} hint={<span id={`${field.key}-hint`}>{t(field.hint)}</span>}>
    <Textarea aria-label={t(field.label)} aria-describedby={`${field.key}-hint`} dir="auto" rows={field.rows} readOnly={!canEdit || saving || !draft.ai_assistant_enabled} value={draft[field.key]} maxLength={Math.max(field.max, baseline?.[field.key].length ?? 0)} onChange={event => patch({ [field.key]: event.target.value })} placeholder={t(field.placeholder)} />
  </Field>;
  return <div className="max-w-4xl space-y-6">
    <PageHead title={t('aiOrderAssistant')} desc={t('aiAssistantDesc')} actions={canEdit && <Button type="submit" form="assistant-settings" disabled={loading || loadError || !dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button>} />
    {loading ? <p role="status" className="py-10 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ? <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('loadFailed')}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div> : draft && <form id="assistant-settings" onSubmit={save} className="space-y-6">
      {!canEdit && <p className="rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('pushPreferencesReadOnly')}</p>}
      <Section title={<span className="flex items-center gap-2"><Sparkles className="size-5" aria-hidden="true" />{t('aiOrderAssistant')}</span>} aside={<Badge tone={baseline?.ai_assistant_enabled ? 'success' : 'neutral'}>{t(baseline?.ai_assistant_enabled ? 'aiEnabledSaved' : 'aiDisabledSaved')}</Badge>}>
        {toggle('ai_assistant_enabled', 'aiEnable', 'aiEnableDesc')}
        {!draft.ai_assistant_enabled && <p className="mt-4 rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('aiDisabledDraftHint')}</p>}
      </Section>
      <Section title={t('aiBehavior')} desc={t('aiBehaviorDesc')}>
        <div className="space-y-5">{toggle('ai_assistant_upsell', 'aiUpsell', 'aiUpsellDesc')}{toggle('ai_assistant_auto_order', 'aiAutoOrder', 'aiAutoOrderDesc')}{textField(TEXT_FIELDS[0])}</div>
      </Section>
      <Section title={t('aiKnowledge')} desc={t('aiKnowledgeDesc')}><div className="space-y-5">{TEXT_FIELDS.slice(1).map(textField)}</div></Section>
      <Section title={t('aiTrigger')} desc={t('aiTriggerDesc')}>
        <div className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
          <Field label={t('aiTriggerMode')}><Select value={draft.ai_assistant_trigger} disabled={!canEdit || saving || !draft.ai_assistant_enabled} onChange={event => patch({ ai_assistant_trigger: event.target.value as Draft['ai_assistant_trigger'] })}>
            <option value="manual">{t('aiTriggerManual')}</option><option value="immediate">{t('aiTriggerImmediate')}</option><option value="delay">{t('aiTriggerDelay')}</option>
          </Select></Field>
          {draft.ai_assistant_trigger === 'delay' && <Field label={t('aiTriggerDelaySeconds')} hint={<span id="ai-delay-hint">{t('aiTriggerDelayHint')}</span>}><NumberField required integer min={0} max={Math.max(600, baseline?.ai_assistant_trigger_delay ?? 0)} format={String} value={draft.ai_assistant_trigger_delay} aria-label={t('aiTriggerDelaySeconds')} aria-describedby="ai-delay-hint" disabled={!canEdit || saving || !draft.ai_assistant_enabled} onChange={value => patch({ ai_assistant_trigger_delay: value })} /></Field>}
        </div>
        {draft.ai_assistant_trigger === 'delay' && draft.ai_assistant_trigger_delay === 0 && <p className="mt-4 rounded-r-md bg-[var(--summary-bg)] p-4 text-sm text-[var(--summary-fg)]">{t('aiZeroDelayHint')}</p>}
      </Section>
      {saveError && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('saveFailed')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5"><p role="status" className="text-sm text-[var(--fg-muted)]">{t(saving ? 'saving' : dirty ? 'settingsUnsaved' : saved ? 'saved' : 'settingsUnchanged')}</p>{canEdit && <div className="flex gap-2"><Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => setLeaving('reset')}>{t('reset')}</Button><Button type="submit" disabled={!dirty || saving}>{t(saving ? 'saving' : 'saveChanges')}</Button></div>}</div>
    </form>}
    <ConfirmDialog open={leaving !== null} onOpenChange={open => { if (!open) setLeaving(null); }} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { const target = leaving; setLeaving(null); setDraft(baseline); setSaveError(false); setSaved(false); if (target && target !== 'reset') router.push(target); }} />
  </div>;
}
