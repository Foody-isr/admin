'use client';

// Message templates settings — where a restaurant owner rewrites the WhatsApp
// order confirmation their customers receive. One Section per entry in
// TEMPLATE_REGISTRY (today just order_recap), each with three language tabs.
//
// The body shown per language is the restaurant's own customization if one
// exists, otherwise the registry's shipped default — so a restaurant that
// never opens this screen keeps receiving exactly the text it gets today.
// Saving reloads the list so languages the server just auto-translated show
// up immediately, without ever clobbering a draft the owner is mid-typing in
// another tab (tracked via `dirtyRef`).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Badge, Button, PageHead, Section, Tab, Tabs, TabsContent, TabsList } from '@/components/ds';
import { useI18n, i18nOr } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import {
  listMessageTemplates,
  saveMessageTemplate,
  resetMessageTemplate,
  type MessageTemplate,
} from '@/lib/api';
import { TEMPLATE_REGISTRY, type TemplateDefinition } from '@/lib/messages/registry';
import { RECAP_LOCALES, type RecapLocale } from '@/lib/orders/whatsapp-recap';
import { TemplateEditor } from './TemplateEditor';
import { hasUnsavedDraft, runSaveFlow, type DraftStatus } from './draft-state';

const LOCALE_LABEL: Record<RecapLocale, string> = {
  fr: 'Français',
  he: 'עברית',
  en: 'English',
};

function compositeKey(key: string, locale: RecapLocale): string {
  return `${key}::${locale}`;
}

export default function MessageTemplatesPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t, locale: uiLocale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canEdit = hasAnyPermission('settings.edit');

  const [rows, setRows] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Editor content per "key::locale". Initialized from the server row when one
  // exists, else the registry default (behaviour: never a blank box).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeLocale, setActiveLocale] = useState<Record<string, RecapLocale>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [resetting, setResetting] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Record<string, DraftStatus>>({});

  // Mirror of `drafts`, always current. handleSave has to read the draft as it
  // stands AFTER its request resolves, to decide whether the owner kept typing
  // meanwhile; `drafts` captured in that closure is a snapshot from before the
  // request. Kept in step by applyDrafts(), the single writer.
  const draftsRef = useRef<Record<string, string>>({});

  // Composite keys the owner has typed into since the last server sync. Reload
  // must never overwrite one of these with a freshly fetched value, or a
  // background refresh (triggered by saving a DIFFERENT language) would wipe
  // out an in-progress edit. A ref (not state) because reload() reads it
  // synchronously without wanting to re-render on every keystroke.
  const dirtyRef = useRef<Set<string>>(new Set());

  // Monotonic generation counter guarding against a stale reload's response
  // landing after a newer one. Saving two locales back to back kicks off two
  // overlapping GETs (each save awaits its PUT, then calls reload()); network
  // timing gives no guarantee the first GET's response arrives first. Without
  // this guard, an older response can resolve after a newer save and
  // overwrite that locale's just-saved body and "translated automatically"
  // badge with a pre-save snapshot — wrong, on the one screen whose entire
  // job is telling the owner what is actually saved. Only the response
  // belonging to the most recently STARTED reload is ever applied; an older
  // one that resolves late is silently dropped (a subsequent reload, if any,
  // is still authoritative and unaffected).
  const reloadSeqRef = useRef(0);

  // The only writer of `drafts`, so `draftsRef` cannot drift from the state.
  // Both are updated synchronously here rather than via a setState updater:
  // an updater must stay pure, and mutating the ref inside one would break
  // that (React may invoke it twice).
  const applyDrafts = useCallback(
    (update: (prev: Record<string, string>) => Record<string, string>) => {
      const next = update(draftsRef.current);
      draftsRef.current = next;
      setDrafts(next);
    },
    [],
  );

  const reload = useCallback(async () => {
    const seq = ++reloadSeqRef.current;
    const list = await listMessageTemplates(rid);
    if (seq !== reloadSeqRef.current) return; // superseded by a newer reload — drop this stale response
    setRows(list);
    applyDrafts((prev) => {
      const next = { ...prev };
      for (const def of TEMPLATE_REGISTRY) {
        for (const locale of RECAP_LOCALES) {
          const ck = compositeKey(def.key, locale);
          if (dirtyRef.current.has(ck)) continue;
          const row = list.find((r) => r.key === def.key && r.locale === locale);
          next[ck] = row ? row.body : def.defaults[locale];
        }
      }
      return next;
    });
  }, [rid, applyDrafts]);

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    reload()
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
    // reload() itself is stable per `rid`; re-running it on every identity
    // change would refetch pointlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rid]);

  // Default each template's active tab to the admin's own UI language (when it
  // is one of the three recap locales) so staff start editing in the language
  // they read fastest.
  useEffect(() => {
    const initial: RecapLocale = (RECAP_LOCALES as readonly string[]).includes(uiLocale)
      ? (uiLocale as RecapLocale)
      : 'fr';
    setActiveLocale((prev) => {
      const next = { ...prev };
      for (const def of TEMPLATE_REGISTRY) {
        if (!next[def.key]) next[def.key] = initial;
      }
      return next;
    });
    // Only seed once per template key, on mount — must not fight the owner's
    // own tab clicks afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowFor = (key: string, locale: RecapLocale) =>
    rows.find((r) => r.key === key && r.locale === locale);

  const setDraft = (key: string, locale: RecapLocale, value: string) => {
    const ck = compositeKey(key, locale);
    dirtyRef.current.add(ck);
    applyDrafts((prev) => ({ ...prev, [ck]: value }));
  };

  const bodyFor = (def: TemplateDefinition, locale: RecapLocale) =>
    drafts[compositeKey(def.key, locale)] ?? def.defaults[locale];

  const clearStatus = (ck: string) => {
    setStatus((prev) => {
      if (!(ck in prev)) return prev;
      const next = { ...prev };
      delete next[ck];
      return next;
    });
  };

  // The sequencing here is the whole point, and it lives in runSaveFlow so it
  // can be tested: the verdict shown to the staff is decided by the SAVE's
  // outcome and applied before the follow-up read is awaited, and the dirty
  // flag is only released if the textarea still holds exactly what was sent.
  const handleSave = async (def: TemplateDefinition, locale: RecapLocale) => {
    const ck = compositeKey(def.key, locale);
    const body = bodyFor(def, locale);
    setSaving((prev) => ({ ...prev, [ck]: true }));
    clearStatus(ck);

    await runSaveFlow({
      sent: body,
      save: () => saveMessageTemplate(rid, def.key, locale, body),
      currentDraft: () => draftsRef.current[ck] ?? def.defaults[locale],
      translationFailed: (result) => !!result.translation_error,
      labels: {
        saved: t('messageTemplatesSaved'),
        translateFailed: t('messageTemplatesTranslateFailed'),
      },
      commit: ({ clearDirty, status: outcome }) => {
        // Released only when the draft still matches: if the owner kept typing
        // during the request, the flag must stay so reload() leaves their
        // keystrokes alone.
        if (clearDirty) dirtyRef.current.delete(ck);
        setStatus((prev) => ({ ...prev, [ck]: outcome }));
      },
      reload,
    });

    setSaving((prev) => ({ ...prev, [ck]: false }));
  };

  const handleReset = async (def: TemplateDefinition, locale: RecapLocale) => {
    const ck = compositeKey(def.key, locale);
    setResetting((prev) => ({ ...prev, [ck]: true }));
    try {
      await resetMessageTemplate(rid, def.key, locale);
      dirtyRef.current.delete(ck);
      clearStatus(ck);
    } catch (e) {
      setStatus((prev) => ({
        ...prev,
        [ck]: { tone: 'danger', text: e instanceof Error ? e.message : String(e) },
      }));
      setResetting((prev) => ({ ...prev, [ck]: false }));
      return;
    }

    // Same rule as saving: the DELETE succeeded, so a failing refresh must not
    // be dressed up as a failed reset.
    try {
      await reload();
    } catch {
      /* the customization is gone from the server; the screen is one refresh behind */
    }
    setResetting((prev) => ({ ...prev, [ck]: false }));
  };

  return (
    <div>
      <PageHead title={t('messageTemplates')} desc={t('messageTemplatesDesc')} />

      {loading ? (
        <p className="text-fs-sm text-[var(--fg-muted)]">…</p>
      ) : loadError ? (
        <p className="text-fs-sm text-[var(--danger-500)]">{loadError}</p>
      ) : (
        TEMPLATE_REGISTRY.map((def) => {
          const active = activeLocale[def.key] ?? 'fr';
          const ck = compositeKey(def.key, active);
          const activeRow = rowFor(def.key, active);
          const isAutoTranslated = !!activeRow?.is_auto_translated;
          const st = status[ck];
          const statusClass =
            st?.tone === 'danger'
              ? 'text-[var(--danger-500)]'
              : st?.tone === 'warning'
                ? 'text-[var(--warning-500)]'
                : 'text-[var(--success-500)]';

          return (
            <Section key={def.key} title={i18nOr(t, `template_${def.key}`, def.key)}>
              <Tabs
                value={active}
                onValueChange={(v) =>
                  setActiveLocale((prev) => ({ ...prev, [def.key]: v as RecapLocale }))
                }
              >
                <TabsList>
                  {RECAP_LOCALES.map((loc) => {
                    const locRow = rowFor(def.key, loc);
                    // One Save button, three languages, and Save writes only
                    // the active one. Editing French then Hebrew and pressing
                    // Save once persists French alone; the Hebrew draft merely
                    // survives in its box because the dirty flag shields it
                    // from the reload, which LOOKS retained right up until the
                    // page is left and it is gone. The indicator is the fix:
                    // it does not change what Save writes, it stops the loss
                    // from being invisible.
                    const unsaved = hasUnsavedDraft(bodyFor(def, loc), locRow, def.defaults[loc]);
                    return (
                      <Tab key={loc} value={loc}>
                        {LOCALE_LABEL[loc]}
                        {locRow?.is_auto_translated && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-[var(--brand-500)]"
                            aria-hidden
                            title={t('messageTemplatesAutoTranslated')}
                          />
                        )}
                        {unsaved && (
                          // Deliberately a different shape AND colour from the
                          // "translated automatically" dot: a tab can carry
                          // both at once, and two identical dots would say
                          // nothing.
                          <span
                            className="w-1.5 h-1.5 shrink-0 rounded-full border border-[var(--warning-500)] bg-transparent"
                            title={t('messageTemplatesUnsaved')}
                          >
                            <span className="sr-only">{t('messageTemplatesUnsaved')}</span>
                          </span>
                        )}
                      </Tab>
                    );
                  })}
                </TabsList>

                {RECAP_LOCALES.map((loc) => (
                  <TabsContent key={loc} value={loc} className="mt-[var(--s-3)]">
                    <TemplateEditor
                      definition={def}
                      locale={loc}
                      body={bodyFor(def, loc)}
                      onChange={(value) => setDraft(def.key, loc, value)}
                      readOnly={!canEdit}
                    />
                  </TabsContent>
                ))}
              </Tabs>

              <div className="flex items-center gap-[var(--s-3)] mt-[var(--s-4)] flex-wrap">
                {isAutoTranslated && <Badge tone="brand">{t('messageTemplatesAutoTranslated')}</Badge>}
                {st && <span className={`text-fs-sm ${statusClass}`}>{st.text}</span>}
                <div className="flex-1" />
                {canEdit && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => handleReset(def, active)}
                      disabled={!!resetting[ck] || !!saving[ck]}
                    >
                      {t('messageTemplatesReset')}
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => handleSave(def, active)}
                      disabled={!!saving[ck] || !!resetting[ck]}
                    >
                      {saving[ck] ? t('saving') : t('save')}
                    </Button>
                  </>
                )}
              </div>
            </Section>
          );
        })
      )}
    </div>
  );
}
