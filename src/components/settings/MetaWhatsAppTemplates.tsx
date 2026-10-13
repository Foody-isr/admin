'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Field, Input } from '@/components/ds';
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
  useEffect(() => { onLockChange(busy); return () => onLockChange(false); }, [busy, onLockChange]);
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
      setNotice(t('waMetaSubmitted')); setBodyDirty(false); await refresh();
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
  const ready = status.connection?.status === 'ready';
  const selectedApproved = kinds.every(kind => {
    if (!selected[kind]) return !['order_recap', 'delivery_reminder'].includes(kind);
    const template = templates.find(row => key(row) === selected[kind]); return !!template && compatibleMetaTemplate(kind, template);
  });
  const locked = disabled || busy || !canEdit;
  const createdAlready = templates.some(row => row.name === creation.name && row.language === creation.language);

  return <div className="space-y-4 border-t border-[var(--line)] pt-4" role="region" aria-label={t('waMetaTemplatesTitle')}>
    <h3 className="font-semibold">{t('waMetaTemplatesTitle')}</h3>
    <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('waMetaTemplatesHint')}</p>
    <p className="text-sm leading-6">{t(status.connection?.notifications_enabled ? 'waMetaProviderSelected' : 'waMetaProviderUnselected')}</p>
    {status.outbound_enabled === false && <p role="status" className="text-sm">{t('waMetaOutboundDisabled')}</p>}
    {error && <p role="alert" className="text-sm text-[var(--danger-500)]">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      {kinds.map(kind => <Field key={kind} label={`${t(labels[kind])}${['order_recap', 'delivery_reminder'].includes(kind) ? ' *' : ''}`} hint={t(`${labels[kind]}Hint`)}>
        <select className={selectClass} aria-label={t(labels[kind])} value={selected[kind]} disabled={locked || loading || loadFailed || uncertain} onChange={event => { setSelected(old => ({ ...old, [kind]: event.target.value })); setDirty(true); }}>
          <option value="">{t('waMetaNoTemplate')}</option>
          {!!selected[kind] && !templates.some(row => key(row) === selected[kind]) && <option value={selected[kind]} disabled>{selected[kind]}</option>}
          {templates.map(row => <option key={`${row.id}-${key(row)}`} value={key(row)} disabled={!compatibleMetaTemplate(kind, row)}>{row.name} · {row.language} · {row.status}</option>)}
        </select>
      </Field>)}
    </div>
    {canEdit && <div className="flex flex-wrap gap-2">
      <Button disabled={locked || loading || loadFailed || uncertain || !ready || !selectedApproved} onClick={() => save(true)}>{t(status.connection?.notifications_enabled ? 'save' : 'waMetaActivate')}</Button>
      {status.connection?.notifications_enabled && <Button variant="secondary" disabled={locked || uncertain} onClick={() => save(false)}>{t('waMetaUseTwilio')}</Button>}
    </div>}
    {!ready && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('waMetaWaitForConnection')}</p>}
    <Button variant="secondary" disabled={disabled || busy || loading} onClick={() => { setError(''); void refresh(true); }}>{t('waMetaRefresh')}</Button>
    {templates.length > 0 && <ul className="space-y-2 text-sm">{templates.map(row => <li key={`${row.id}-${key(row)}`} className="flex flex-wrap items-center gap-2"><bdi className="min-w-0 break-all">{row.name}</bdi><span>{row.language}</span><Badge tone={row.status === 'APPROVED' && row.category === 'UTILITY' ? 'success' : 'neutral'}>{row.status} · {row.category}</Badge></li>)}</ul>}
    {canEdit && <details className="rounded-r-md border border-[var(--line)] p-3">
      <summary className="cursor-pointer font-semibold text-sm">{t('waMetaCreate')}</summary>
      <form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); submit(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('waMetaTemplateKind')}><select className={selectClass} aria-label={t('waMetaTemplateKind')} value={creation.kind} disabled={locked} onChange={event => resetCreation(event.target.value as MetaTemplateKind, creation.language)}>{kinds.map(kind => <option key={kind} value={kind}>{t(labels[kind])}</option>)}</select></Field>
          <Field label={t('whatsappRecapLanguage')}><select className={selectClass} aria-label={t('waMetaTemplateLanguage')} value={creation.language} disabled={locked} onChange={event => resetCreation(creation.kind, event.target.value)}><option value="fr">Français</option><option value="he">עברית</option><option value="en_US">English</option></select></Field>
        </div>
        <Field label={t('waMetaTemplateName')} hint={t('waMetaTemplateNameHint')}><Input aria-label={t('waMetaTemplateName')} dir="ltr" value={creation.name} disabled={locked} onChange={event => { setCreation(old => ({ ...old, name: event.target.value })); setBodyDirty(true); }} /></Field>
        <Field label={t('waMetaTemplateBody')} hint={t('waMetaVariablesHint')}><textarea className={`${selectClass} min-h-64 leading-6`} aria-label={t('waMetaTemplateBody')} dir={creation.language === 'he' ? 'rtl' : 'ltr'} value={creation.body} maxLength={1024} disabled={locked} onChange={event => { setCreation(old => ({ ...old, body: event.target.value })); setBodyDirty(true); }} /></Field>
        <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('waMetaSubmitHint')}</p>
        <Button type="submit" disabled={locked || loading || loadFailed || createdAlready || !/^[a-z][a-z0-9_]{0,127}$/.test(creation.name) || !validMetaTemplateBody(creation.kind, creation.body)}>{t('waMetaSubmit')}</Button>
        {createdAlready && <p className="text-sm">{t('waMetaAlreadyExists')}</p>}
      </form>
    </details>}
  </div>;
}
