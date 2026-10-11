'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge, Button, ConfirmDialog, PageHead, Section, Tab, Tabs, TabsContent, TabsList } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { listMessageTemplates, resetMessageTemplate, saveMessageTemplate, type MessageTemplate } from '@/lib/api';
import { TEMPLATE_REGISTRY, type TemplateDefinition } from '@/lib/messages/registry';
import { RECAP_LOCALES, type RecapLocale } from '@/lib/orders/whatsapp-recap';
import { TemplateEditor } from './TemplateEditor';
import { hasUnsavedDraft, runSaveFlow, type DraftStatus } from './draft-state';

const LOCALE_LABEL = { fr: 'Français', he: 'עברית', en: 'English' };
type Baseline = Pick<MessageTemplate, 'key' | 'locale' | 'body' | 'is_auto_translated'>;
type Busy = { kind: 'save' | 'reset' | 'refresh'; key: string } | null;
const compositeKey = (key: string, locale: RecapLocale) => `${key}::${locale}`;

/** Isolate every localized draft and saved baseline to its active restaurant. */
export default function MessageTemplatesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  return <TemplateWorkspace key={rid} rid={rid} />;
}

function TemplateWorkspace({ rid }: { rid: number }) {
  const { t, locale: uiLocale, direction } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');
  const [rows, setRows] = useState<Baseline[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeLocale, setActiveLocale] = useState<Record<string, RecapLocale>>(() => Object.fromEntries(
    TEMPLATE_REGISTRY.map(def => [def.key, RECAP_LOCALES.includes(uiLocale as RecapLocale) ? uiLocale as RecapLocale : 'fr']),
  ));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshError, setRefreshError] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [status, setStatus] = useState<Record<string, DraftStatus>>({});
  const [resetTarget, setResetTarget] = useState<{ definition: TemplateDefinition; locale: RecapLocale } | null>(null);
  const draftsRef = useRef<Record<string, string>>({});
  const dirtyRef = useRef(new Set<string>());
  const lock = useRef(false);
  const request = useRef({ sequence: 0, generation: 0 });
  const copy = useRef(t);
  copy.current = t;

  const applyDrafts = useCallback((update: (current: Record<string, string>) => Record<string, string>) => {
    const next = update(draftsRef.current);
    draftsRef.current = next;
    setDrafts(next);
  }, []);

  const reload = useCallback(async () => {
    const sequence = ++request.current.sequence;
    const list = await listMessageTemplates(rid);
    if (sequence !== request.current.sequence) return;
    setRows(list);
    applyDrafts(current => {
      const next = { ...current };
      for (const def of TEMPLATE_REGISTRY) for (const locale of RECAP_LOCALES) {
        const key = compositeKey(def.key, locale);
        if (!dirtyRef.current.has(key)) {
          next[key] = list.find(row => row.key === def.key && row.locale === locale)?.body ?? def.defaults[locale];
        }
      }
      return next;
    });
    setRefreshError('');
  }, [rid, applyDrafts]);

  const load = useCallback(async () => {
    const generation = request.current.generation;
    const sequence = request.current.sequence + 1;
    setLoading(true);
    setLoadError('');
    try { await reload(); }
    catch (cause) {
      if (generation === request.current.generation && sequence === request.current.sequence) setLoadError(cause instanceof Error ? cause.message : copy.current('loadFailed'));
    } finally {
      if (generation === request.current.generation && sequence === request.current.sequence) setLoading(false);
    }
  }, [reload]);

  useEffect(() => {
    const current = request.current;
    void load();
    return () => { current.sequence += 1; current.generation += 1; };
  }, [load]);

  const rowFor = (key: string, locale: RecapLocale) => rows.find(row => row.key === key && row.locale === locale);
  const bodyFor = (def: TemplateDefinition, locale: RecapLocale) => drafts[compositeKey(def.key, locale)] ?? def.defaults[locale];
  const isDirty = (def: TemplateDefinition, locale: RecapLocale) => hasUnsavedDraft(bodyFor(def, locale), rowFor(def.key, locale), def.defaults[locale]);
  const hasDirty = TEMPLATE_REGISTRY.some(def => RECAP_LOCALES.some(locale => isDirty(def, locale)));
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasDirty || lock.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasDirty]);

  const clearStatus = (key: string) => setStatus(current => {
    const next = { ...current }; delete next[key]; return next;
  });
  const setDraft = (def: TemplateDefinition, locale: RecapLocale, body: string) => {
    const key = compositeKey(def.key, locale);
    if (!canEdit || (busy?.kind === 'reset' && busy.key === key)) return;
    if (hasUnsavedDraft(body, rowFor(def.key, locale), def.defaults[locale])) dirtyRef.current.add(key);
    else dirtyRef.current.delete(key);
    applyDrafts(current => ({ ...current, [key]: body }));
    clearStatus(key);
  };

  const refresh = async () => {
    if (lock.current) return;
    lock.current = true;
    const generation = request.current.generation;
    setBusy({ kind: 'refresh', key: '' });
    try { await reload(); }
    catch (cause) {
      if (generation === request.current.generation) setRefreshError(cause instanceof Error ? cause.message : t('loadFailed'));
    } finally {
      if (generation === request.current.generation) { lock.current = false; setBusy(null); }
    }
  };

  const save = async (def: TemplateDefinition, locale: RecapLocale) => {
    const key = compositeKey(def.key, locale), body = bodyFor(def, locale);
    if (!canEdit || lock.current || loading || loadError || (!isDirty(def, locale) && status[key]?.tone !== 'warning')) return;
    if (new TextEncoder().encode(body).length > 8000) return;
    lock.current = true;
    const generation = request.current.generation;
    setBusy({ kind: 'save', key });
    clearStatus(key);
    await runSaveFlow({
      sent: body,
      save: () => saveMessageTemplate(rid, def.key, locale, body),
      currentDraft: () => draftsRef.current[key] ?? def.defaults[locale],
      translationFailed: response => !!response.translation_error,
      labels: { saved: t('messageTemplatesSaved'), translateFailed: t('messageTemplatesTranslateFailed') },
      commit: ({ clearDirty, status: outcome }) => {
        if (generation !== request.current.generation) return;
        if (clearDirty) dirtyRef.current.delete(key);
        else if (outcome.tone !== 'danger') dirtyRef.current.add(key);
        if (outcome.tone !== 'danger') {
          // The acknowledged source is authoritative even when the follow-up
          // GET fails. Newly typed text stays in drafts and remains unsaved.
          setRows(current => [...current.filter(row => row.key !== def.key || row.locale !== locale), { key: def.key, locale, body, is_auto_translated: false }]);
        }
        setStatus(current => ({ ...current, [key]: outcome }));
      },
      reload: async () => {
        if (generation !== request.current.generation) return;
        try { await reload(); }
        catch (cause) {
          if (generation === request.current.generation) setRefreshError(cause instanceof Error ? cause.message : t('loadFailed'));
          throw cause;
        }
      },
    });
    if (generation === request.current.generation) { lock.current = false; setBusy(null); }
  };

  const reset = async (def: TemplateDefinition, locale: RecapLocale) => {
    if (!canEdit || lock.current || loading || loadError) return;
    const key = compositeKey(def.key, locale), generation = request.current.generation;
    lock.current = true;
    setBusy({ kind: 'reset', key });
    clearStatus(key);
    try {
      await resetMessageTemplate(rid, def.key, locale);
      if (generation !== request.current.generation) return;
      dirtyRef.current.delete(key);
      setRows(current => current.filter(row => row.key !== def.key || row.locale !== locale));
      applyDrafts(current => ({ ...current, [key]: def.defaults[locale] }));
      setStatus(current => ({ ...current, [key]: { tone: 'success', text: t('messageTemplateResetDone') } }));
      try { await reload(); }
      catch (cause) {
        if (generation === request.current.generation) setRefreshError(cause instanceof Error ? cause.message : t('loadFailed'));
      }
    } catch (cause) {
      if (generation === request.current.generation) setStatus(current => ({ ...current, [key]: { tone: 'danger', text: cause instanceof Error ? cause.message : t('saveFailed') } }));
    } finally {
      if (generation === request.current.generation) { lock.current = false; setBusy(null); }
    }
  };

  return <div className="space-y-6">
    <PageHead title={t('messageTemplates')} desc={t('messageTemplatesDesc')} />
    <p className="rounded-r-lg bg-[var(--summary-bg)] p-4 text-sm leading-6 text-[var(--summary-fg)]">{t('messageTemplateSaveScope')}</p>
    {loading ? <p role="status" className="py-6 text-sm text-[var(--fg-muted)]">{t('loading')}</p> : loadError ?
      <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{loadError}</p><Button variant="secondary" onClick={() => void load()}>{t('retry')}</Button></div> : <>
        {refreshError && <div role="alert" className="space-y-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4">
          <p className="text-sm text-[var(--warning-500)]">{t('messageTemplateRefreshPending')}</p>
          <p className="text-xs text-[var(--fg-muted)]">{refreshError}</p>
          <Button variant="secondary" disabled={!!busy} onClick={() => void refresh()}>{t('refresh')}</Button>
        </div>}
        {TEMPLATE_REGISTRY.map(def => {
          const active = activeLocale[def.key] ?? 'fr', key = compositeKey(def.key, active);
          const row = rowFor(def.key, active), outcome = status[key], dirty = isDirty(def, active);
          const tooLong = new TextEncoder().encode(bodyFor(def, active)).length > 8000;
          const color = outcome?.tone === 'danger' ? 'var(--danger-500)' : outcome?.tone === 'warning' ? 'var(--warning-500)' : 'var(--success-500)';
          return <Section key={def.key} role="region" aria-label={t(`template_${def.key}`)} title={t(`template_${def.key}`)}>
            <Tabs value={active} dir={direction} onValueChange={value => setActiveLocale(current => ({ ...current, [def.key]: value as RecapLocale }))}>
              <TabsList aria-label={t(`template_${def.key}`)} className="self-start max-w-full">
                {RECAP_LOCALES.map(locale => <Tab key={locale} value={locale}>
                  {LOCALE_LABEL[locale]}
                  {isDirty(def, locale) && <span className="size-2 shrink-0 rounded-full border border-[var(--warning-500)]" title={t('messageTemplatesUnsaved')}><span className="sr-only">{t('messageTemplatesUnsaved')}</span></span>}
                </Tab>)}
              </TabsList>
              {RECAP_LOCALES.map(locale => <TabsContent key={locale} value={locale}>
                <TemplateEditor definition={def} locale={locale} body={bodyFor(def, locale)} onChange={body => setDraft(def, locale, body)} readOnly={!canEdit || (busy?.kind === 'reset' && busy.key === compositeKey(def.key, locale))} />
              </TabsContent>)}
            </Tabs>
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-4">
              {row?.is_auto_translated && <Badge tone="info">{t('messageTemplatesAutoTranslated')}</Badge>}
              {dirty && <Badge tone="warning">{t('messageTemplatesUnsaved')}</Badge>}
              <div className="ms-auto flex flex-wrap gap-2">
                {canEdit && <>
                  <Button variant="secondary" disabled={!!busy || (!row && !dirty)} onClick={() => setResetTarget({ definition: def, locale: active })}>{t('messageTemplatesReset')}</Button>
                  <Button disabled={!!busy || (!dirty && outcome?.tone !== 'warning') || tooLong} onClick={() => void save(def, active)}>{t(busy?.kind === 'save' && busy.key === key ? 'saving' : outcome?.tone === 'warning' && !dirty ? 'messageTemplateRetryTranslations' : 'save')}</Button>
                </>}
              </div>
            </div>
            {tooLong && <p role="alert" className="mt-3 text-sm text-[var(--danger-500)]">{t('messageTemplateTooLong')}</p>}
            {outcome && <p role={outcome.tone === 'danger' ? 'alert' : 'status'} className="mt-3 text-sm" style={{ color }}>{outcome.text}{dirty && outcome.tone !== 'danger' ? ` ${t('messageTemplateLaterEdits')}` : ''}</p>}
          </Section>;
        })}
      </>}
    <ConfirmDialog open={!!resetTarget} onOpenChange={open => { if (!open) setResetTarget(null); }} title={t('messageTemplatesReset')}
      description={t('messageTemplateResetConfirm').replace('{locale}', resetTarget ? LOCALE_LABEL[resetTarget.locale] : '')} confirmLabel={t('messageTemplatesReset')} cancelLabel={t('cancel')} danger
      onConfirm={() => { const target = resetTarget; setResetTarget(null); if (target) void reset(target.definition, target.locale); }} />
  </div>;
}
