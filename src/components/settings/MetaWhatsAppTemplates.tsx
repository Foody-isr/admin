'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCheck, ChevronDown, MessageSquareText, Plus, ReceiptText, RefreshCw, Truck } from 'lucide-react';
import { Badge, Button, ConfirmDialog, Drawer, Field, Input } from '@/components/ds';
import { configureMetaWhatsAppNotifications, createMetaWhatsAppTemplate, getMetaWhatsAppStatus, getMetaWhatsAppTemplates, type MetaTemplateKind, type MetaTemplateRef, type MetaWhatsAppStatus, type MetaWhatsAppTemplate } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { orderNotificationTemplate } from '@/lib/orders/twilio-templates';
import { compatibleMetaTemplate, validMetaTemplateBody } from '@/lib/whatsapp-meta-templates';

const kinds: MetaTemplateKind[] = ['order_recap', 'delivery_reminder', 'order_status', 'receipt'];
const labels: Record<MetaTemplateKind, string> = { order_recap: 'waPersonalRecap', delivery_reminder: 'waPersonalReminder', order_status: 'waPersonalReady', receipt: 'waPersonalReceipt' };
const key = (ref: MetaTemplateRef) => ref.name ? `${ref.name}|${ref.language}` : '';
const parse = (value: string): MetaTemplateRef => { const [name = '', language = ''] = value.split('|'); return { name, language }; };
const selectClass = 'w-full rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm';

/** Manage native Meta Utility templates and explicitly select the restaurant's notification provider. */
export function MetaWhatsAppTemplates({ rid, status, canEdit, disabled, onChanged, onLockChange }: {
  rid: number; status: MetaWhatsAppStatus; canEdit: boolean; disabled: boolean;
  onChanged: (status: MetaWhatsAppStatus) => void; onLockChange: (locked: boolean) => void;
}) {
  const { t, locale } = useI18n();
  const language = locale === 'en' ? 'en_US' : locale;
  const [templates, setTemplates] = useState<MetaWhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState<Record<MetaTemplateKind, string>>({ order_recap: '', delivery_reminder: '', order_status: '', receipt: '' });
  const [dirty, setDirty] = useState(false);
  const [creation, setCreation] = useState({ kind: 'order_recap' as MetaTemplateKind, name: `foody_order_recap_${language.toLowerCase()}`, language, body: orderNotificationTemplate('order_recap', locale) });
  const [bodyDirty, setBodyDirty] = useState(false);
  const [editor, setEditor] = useState<MetaTemplateKind | null>(null);
  const [creating, setCreating] = useState(false);
  const [discardCreation, setDiscardCreation] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const life = useRef({ active: true });
  const lock = useRef(false);
  const copy = useRef(t); copy.current = t;
  const sequence = useRef(0);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;

  const refresh = useCallback(async (readStatus = false) => {
    const current = life.current, version = ++sequence.current;
    setLoading(true); setLoadFailed(false);
    try {
      const list = await getMetaWhatsAppTemplates(rid);
      if (!Array.isArray(list.templates)) throw new Error('Invalid template catalogue');
      const next = readStatus ? await getMetaWhatsAppStatus(rid) : null;
      if (current.active && version === sequence.current) { setTemplates(list.templates); setUncertain(false); if (next) onChanged(next); }
    } catch { if (current.active && version === sequence.current) { setLoadFailed(true); setError(copy.current('waMetaCatalogFailed')); } }
    finally { if (current.active && version === sequence.current) setLoading(false); }
  }, [rid, onChanged]);
  useEffect(() => {
    const current = { active: true }; life.current = current;
    void refresh(); return () => { current.active = false; };
  }, [refresh]);
  useEffect(() => { onLockChange(busy || editor !== null || creating); return () => onLockChange(false); }, [busy, editor, creating, onLockChange]);
  useEffect(() => {
    if (dirtyRef.current || !status.connection) return;
    const c = status.connection;
    setSelected({ order_recap: key({ name: c.order_recap_name ?? '', language: c.order_recap_language ?? '' }), delivery_reminder: key({ name: c.delivery_reminder_name ?? '', language: c.delivery_reminder_language ?? '' }), order_status: key({ name: c.order_status_name ?? '', language: c.order_status_language ?? '' }), receipt: key({ name: c.receipt_name ?? '', language: c.receipt_language ?? '' }) });
  }, [status]);
  useEffect(() => {
    if (!dirty && !bodyDirty && !busy) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, bodyDirty, busy]);

  const run = async (work: () => Promise<void>) => {
    if (!canEdit || disabled || lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } finally { lock.current = false; if (life.current.active) setBusy(false); }
  };
  const submit = () => void run(async () => {
    const current = life.current;
    try {
      await createMetaWhatsAppTemplate(rid, creation);
      if (!current.active) return;
      setNotice(t('waMetaSubmitted')); setBodyDirty(false); setCreating(false); setCatalogueOpen(true); await refresh();
    } catch { if (current.active) { setError(t('waMetaCreateUnconfirmed')); await refresh(); } }
  });
  const save = (enabled: boolean) => void run(async () => {
    const current = life.current;
    const refs = Object.fromEntries(kinds.map(kind => [kind, parse(selected[kind])])) as Record<MetaTemplateKind, MetaTemplateRef>;
    try {
      const next = await configureMetaWhatsAppNotifications(rid, enabled ? { enabled: true, templates: refs } : { enabled: false });
      if (!current.active) return;
      setDirty(false); dirtyRef.current = false; setUncertain(false); onChanged(next); setNotice(t(enabled ? 'waMetaActivated' : 'waMetaTwilioRestored'));
    } catch {
      if (!current.active) return;
      setUncertain(true); setError(t('waMetaSaveUnconfirmed'));
      try { const next = await getMetaWhatsAppStatus(rid); if (current.active) { onChanged(next); setUncertain(false); } } catch { /* Keep the uncertain write locked until explicit readback. */ }
    }
  });
  const resetCreation = (kind: MetaTemplateKind, code: string) => {
    const lang = code.startsWith('en') ? 'en' : code.startsWith('he') ? 'he' : 'fr';
    setCreation({ kind, name: `foody_${kind}_${code.toLowerCase()}`, language: code, body: orderNotificationTemplate(kind, lang) }); setBodyDirty(false);
  };
  const pendingCount = templates.filter(item => item.status === 'PENDING').length;
  const ready = status.connection?.status === 'ready';
  const selectedApproved = kinds.every(kind => {
    if (!selected[kind]) return !['order_recap', 'delivery_reminder'].includes(kind);
    const template = templates.find(row => key(row) === selected[kind]); return !!template && compatibleMetaTemplate(kind, template);
  });
  const locked = disabled || busy || !canEdit;
  const createdAlready = templates.some(row => row.name === creation.name && row.language === creation.language);

  const selectedTemplate = editor ? templates.find(row => key(row) === selected[editor]) : undefined;
  const icons = { order_recap: CheckCheck, delivery_reminder: Truck, order_status: MessageSquareText, receipt: ReceiptText };
  const stateLabel = (row: MetaWhatsAppTemplate) => t(row.status === 'APPROVED' && row.category === 'UTILITY' ? 'waWorkspaceApproved' : row.status === 'PENDING' ? 'waWorkspacePending' : row.status === 'REJECTED' ? 'waWorkspaceRejected' : 'waWorkspaceCheck');
  const openCreation = (kind?: MetaTemplateKind) => {
    if (kind && !bodyDirty) resetCreation(kind, language);
    setEditor(null); setCreating(true);
  };
  const closeCreation = () => { if (bodyDirty) setDiscardCreation(true); else setCreating(false); };
  const row = (kind: MetaTemplateKind) => {
    const Icon = icons[kind];
    const template = templates.find(item => key(item) === selected[kind]);
    return <div className="wa-template-row" key={kind}>
      <span className="wa-icon"><Icon aria-hidden="true" /></span>
      <div className="min-w-0">
        <h3>{t(labels[kind])}{['order_status', 'receipt'].includes(kind) && <span className="ms-2 text-xs font-normal text-[var(--fg-muted)]">{t('waWorkspaceOptional')}</span>}</h3>
        <p className="wa-muted">{t(`waWorkspaceTrigger_${kind}`)}</p>
        <div className="wa-template-value">{template ? <><bdi>{template.name}</bdi><Badge tone={compatibleMetaTemplate(kind, template) ? 'success' : 'neutral'}>{stateLabel(template)}</Badge></> : <span>{selected[kind] || t('waWorkspaceUnassigned')}</span>}</div>
      </div>
      <Button variant="secondary" disabled={disabled || busy || loading || loadFailed || uncertain} onClick={() => setEditor(kind)} aria-label={`${t(canEdit ? 'waWorkspaceConfigure' : 'waWorkspaceView')} · ${t(labels[kind])}`}>{t(canEdit ? 'waWorkspaceConfigure' : 'waWorkspaceView')}</Button>
    </div>;
  };

  return <section className="wa-section" role="region" aria-label={t('waMetaTemplatesTitle')}>
    <div className="wa-heading"><div><h2>{t('waWorkspaceMessages')}</h2><p className="wa-muted mt-1">{t('waWorkspaceMessagesHint')}</p></div><Button variant="ghost" icon aria-label={t('waMetaRefresh')} disabled={disabled || busy || loading} onClick={() => { setError(''); void refresh(true); }}><RefreshCw aria-hidden="true" /></Button></div>
    <p className="wa-notification-state"><span className="wa-dot" data-active={status.notifications_active === true} aria-hidden="true" />{t(status.notifications_active ? 'waWorkspaceNotificationsOn' : 'waWorkspaceNotificationsOff')}{pendingCount > 0 && <Badge>{t('waWorkspacePendingCount').replace('{n}', String(pendingCount))}</Badge>}</p>
    {status.outbound_enabled === false && <p role="status" className="wa-feedback">{t('waWorkspaceSuspended')}</p>}
    {error && !creating && <p role="alert" className="wa-feedback text-[var(--danger-500)]">{error}</p>}
    {notice && <p role="status" className="wa-feedback">{notice}</p>}
    {loading && <p role="status" className="wa-muted">{t('loading')}</p>}
    <div className="wa-template-list mt-5">{kinds.map(row)}</div>
    <div className="wa-actions">
      {canEdit && <Button disabled={locked || loading || loadFailed || uncertain || !ready || !selectedApproved} onClick={() => save(true)}>{t(status.connection?.notifications_enabled ? 'save' : 'waMetaActivate')}</Button>}
      {dirty && <span className="wa-muted">{t('waWorkspaceDirty')}</span>}
      {canEdit && <Button variant="ghost" disabled={locked || loading || loadFailed} onClick={() => openCreation()}><Plus aria-hidden="true" />{t('waWorkspaceCreate')}</Button>}
    </div>
    {!ready ? <p className="wa-feedback wa-muted">{t('waWorkspaceWait')}</p> : !selectedApproved && <p className="wa-feedback wa-muted">{t('waWorkspaceChooseRequired')}</p>}
    <details className="wa-details wa-catalogue" open={catalogueOpen} onToggle={event => { if (event.target === event.currentTarget) setCatalogueOpen(event.currentTarget.open); }}>
      <summary><span>{t('waWorkspaceCatalogue')} <span className="font-normal text-[var(--fg-muted)]">({templates.length})</span></span><ChevronDown aria-hidden="true" /></summary>
      <div className="wa-details-body">
        {templates.length === 0 && !loading && !loadFailed && <p className="wa-muted">{t('waWorkspaceLibraryEmpty')}</p>}
        {templates.map(item => <div key={`${item.id}-${key(item)}`} className="wa-catalogue-row"><div className="min-w-0"><bdi>{item.name}</bdi><span className="ms-2 text-xs text-[var(--fg-muted)]">{item.language}</span></div><Badge tone={item.status === 'APPROVED' && item.category === 'UTILITY' ? 'success' : 'neutral'}>{stateLabel(item)}</Badge></div>)}
        {status.connection?.notifications_enabled && canEdit && <div className="wa-actions"><Button variant="secondary" disabled={locked || uncertain} onClick={() => save(false)}>{t('waMetaUseTwilio')}</Button></div>}
      </div>
    </details>
    <Drawer open={editor !== null} onOpenChange={open => { if (!open) setEditor(null); }} title={editor ? t(labels[editor]) : ''} width={600} className="wa-editor" primaryAction={<Button onClick={() => setEditor(null)}>{t('waWorkspaceDone')}</Button>}>
      {editor && <>
        <section className="wa-editor-section"><h3>{t('waWorkspaceTrigger')}</h3><p className="wa-muted">{t(`waWorkspaceTrigger_${editor}`)}</p></section>
        <section className="wa-editor-section space-y-4">
          <Field label={t('waWorkspaceSelect')}><select className={selectClass} aria-label={t(labels[editor])} value={selected[editor]} disabled={locked || loading || loadFailed || uncertain} onChange={event => { setSelected(old => ({ ...old, [editor]: event.target.value })); setDirty(true); }}>
            <option value="">{t('waMetaNoTemplate')}</option>
            {!!selected[editor] && !templates.some(item => key(item) === selected[editor]) && <option value={selected[editor]} disabled>{selected[editor]}</option>}
            {templates.map(item => <option key={`${item.id}-${key(item)}`} value={key(item)} disabled={!compatibleMetaTemplate(editor, item)}>{item.name} · {item.language} · {stateLabel(item)}</option>)}
          </select></Field>
          {canEdit && <p className="wa-muted">{t('waWorkspaceEditorHint')}</p>}
          <Button variant="ghost" disabled={locked || loading || loadFailed} onClick={() => openCreation(editor)}><Plus aria-hidden="true" />{t('waWorkspaceCreateFor')}</Button>
        </section>
        <section className="wa-editor-section"><h3>{t('waWorkspacePreview')}</h3>{selectedTemplate ? <p dir={selectedTemplate.language.startsWith('he') ? 'rtl' : 'ltr'} className="wa-preview">{selectedTemplate.components.find(component => component.type === 'BODY')?.text}</p> : <p className="wa-muted">{t('waWorkspaceNoPreview')}</p>}</section>
        <details className="wa-details"><summary>{t('waWorkspaceVariables')}<ChevronDown aria-hidden="true" /></summary><p className="wa-muted pb-5">{t(`${labels[editor]}Hint`)}</p></details>
      </>}
    </Drawer>
    <Drawer open={creating} onOpenChange={open => { if (!open) closeCreation(); }} closeDisabled={busy} title={t('waWorkspaceCreate')} width={640} className="wa-editor" primaryAction={<Button type="submit" form={`wa-meta-template-${rid}`} disabled={locked || loading || loadFailed || createdAlready || !/^[a-z][a-z0-9_]{0,127}$/.test(creation.name) || !validMetaTemplateBody(creation.kind, creation.body)}>{t('waMetaSubmit')}</Button>}>
      <form id={`wa-meta-template-${rid}`} className="space-y-5" onSubmit={event => { event.preventDefault(); submit(); }}>
        <p className="wa-muted">{t('waWorkspaceCreateHint')}</p>
        {error && <p role="alert" className="text-sm text-[var(--danger-500)]">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('waMetaTemplateKind')}><select className={selectClass} aria-label={t('waMetaTemplateKind')} value={creation.kind} disabled={locked} onChange={event => resetCreation(event.target.value as MetaTemplateKind, creation.language)}>{kinds.map(kind => <option key={kind} value={kind}>{t(labels[kind])}</option>)}</select></Field>
          <Field label={t('whatsappRecapLanguage')}><select className={selectClass} aria-label={t('waMetaTemplateLanguage')} value={creation.language} disabled={locked} onChange={event => resetCreation(creation.kind, event.target.value)}><option value="fr">Français</option><option value="he">עברית</option><option value="en_US">English</option></select></Field>
        </div>
        <Field label={t('waMetaTemplateName')} hint={t('waMetaTemplateNameHint')}><Input aria-label={t('waMetaTemplateName')} dir="ltr" value={creation.name} disabled={locked} onChange={event => { setCreation(old => ({ ...old, name: event.target.value })); setBodyDirty(true); }} /></Field>
        <Field label={t('waMetaTemplateBody')} hint={t('waMetaVariablesHint')}><textarea className={`${selectClass} leading-6`} aria-label={t('waMetaTemplateBody')} dir={creation.language === 'he' ? 'rtl' : 'ltr'} value={creation.body} maxLength={1024} disabled={locked} onChange={event => { setCreation(old => ({ ...old, body: event.target.value })); setBodyDirty(true); }} /></Field>
        <section className="wa-editor-section"><h3>{t('waWorkspacePreview')}</h3><p dir={creation.language === 'he' ? 'rtl' : 'ltr'} className="wa-preview">{creation.body}</p></section>
        <details className="wa-details"><summary>{t('waWorkspaceVariables')}<ChevronDown aria-hidden="true" /></summary><p className="wa-muted pb-5">{t(`${labels[creation.kind]}Hint`)}</p></details>
        <p className="wa-muted">{t('waMetaSubmitHint')}</p>
        {createdAlready && <p className="wa-muted">{t('waMetaAlreadyExists')}</p>}
      </form>
    </Drawer>
    <ConfirmDialog open={discardCreation} onOpenChange={setDiscardCreation} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { setDiscardCreation(false); setBodyDirty(false); setCreating(false); }} />
  </section>;
}
