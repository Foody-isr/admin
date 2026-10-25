'use client';

import { useEffect, useRef, useState } from 'react';
import { Heart, Plus } from 'lucide-react';
import { Badge, Button, ConfirmDialog, Drawer, Field, Input } from '@/components/ds';
import { configureMetaSatisfaction, getMetaWhatsAppStatus, type MetaSatisfactionSettings, type MetaWhatsAppStatus, type MetaWhatsAppTemplate } from '@/lib/api';
import { defaultWhatsAppAttachment, metaTemplateHeader, validWhatsAppAttachment, compatibleMetaTemplate } from '@/lib/whatsapp-meta-templates';
import { useI18n } from '@/lib/i18n';

import { WhatsAppTemplatePreview } from '@/components/settings/WhatsAppTemplatePreview';
import { WhatsAppAttachmentPicker } from './WhatsAppAttachmentPicker';

const inputClass = 'w-full rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-sm';
function settings(status: MetaWhatsAppStatus): MetaSatisfactionSettings {
  const c = status.connection;
  return { mode: c?.satisfaction_mode || 'disabled', delay_hours: c?.satisfaction_delay_hours || 24, sunday_time: c?.satisfaction_sunday_time || '10:00', template: { name: c?.satisfaction_name || '', language: c?.satisfaction_language || '',attachment:c?.message_attachments?.satisfaction ?? {source:'none',asset_id:''} } };
}

/** Configure one post-fulfillment notification with a reviewed trigger and native template. */
export function MetaWhatsAppSatisfaction({ rid, status, templates, canEdit, disabled, onChanged, onCreate, onLockChange }: {
  rid: number; status: MetaWhatsAppStatus; templates: MetaWhatsAppTemplate[]; canEdit: boolean; disabled: boolean;
  onChanged: (value: MetaWhatsAppStatus) => void; onCreate: () => void; onLockChange: (locked: boolean) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MetaSatisfactionSettings>(() => settings(status));
  const [attachmentBusy,setAttachmentBusy]=useState(false);
 const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [createAfterDiscard, setCreateAfterDiscard] = useState(false);
  const lock = useRef(false);
  const lifetime = useRef({ active: true });
  useEffect(() => { const current = { active: true }; lifetime.current = current; return () => { current.active = false; }; }, [rid]);
  useEffect(() => { onLockChange(open || busy); return () => onLockChange(false); }, [open, busy, onLockChange]);
  const saved = settings(status);
  const dirty = open && JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => {
    if (!dirty && !busy) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, busy]);
  const selected = templates.find(item => item.name === draft.template.name && item.language === draft.template.language);
  const current = templates.find(item => item.name === saved.template.name && item.language === saved.template.language);
  const valid = draft.mode === 'disabled' || (!!selected && compatibleMetaTemplate('satisfaction', selected) && validWhatsAppAttachment(selected,draft.template.attachment) && (draft.mode !== 'delay' || (Number.isInteger(draft.delay_hours) && draft.delay_hours >= 1 && draft.delay_hours <= 168)) && (draft.mode !== 'sunday' || /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(draft.sunday_time)));
  const close = () => { if (busy) return; if (dirty) setDiscard(true); else setOpen(false); };
  const save = async () => {
    if (!canEdit || disabled || busy || uncertain || lock.current || !valid) return;
    lock.current = true; setBusy(true); setError('');
    const generation = lifetime.current;
    try {
      const next = await configureMetaSatisfaction(rid, { ...draft, delay_hours: draft.mode === 'delay' ? draft.delay_hours : saved.delay_hours, sunday_time: draft.mode === 'sunday' ? draft.sunday_time : saved.sunday_time });
      if (generation.active) { onChanged(next); setOpen(false); }
    } catch {
      if (generation.active) {
        setError(t('waSatisfactionSaveFailed')); setUncertain(true);
        try {
          const next = await getMetaWhatsAppStatus(rid);
          if (generation.active) { onChanged(next); setDraft(settings(next)); setUncertain(false); }
        } catch { /* Keep the write locked until an explicit readback. */ }
      }
    } finally { lock.current = false; if (generation.active) setBusy(false); }
  };
  const description = saved.mode === 'delay' ? t('waSatisfactionDelaySummary').replace('{n}', String(saved.delay_hours)) : saved.mode === 'sunday' ? t('waSatisfactionSundaySummary').replace('{time}', saved.sunday_time) : t(saved.mode === 'manual' ? 'waSatisfactionManualSummary' : 'waWorkspaceTrigger_satisfaction');
  return <>
    <div className="wa-template-row">
      <span className="wa-icon"><Heart aria-hidden="true" /></span>
      <div className="min-w-0"><h3>{t('waSatisfactionTitle')} <span className="ms-2 text-xs font-normal text-[var(--fg-muted)]">{t('waWorkspaceOptional')}</span></h3><p className="wa-muted">{description}</p><div className="wa-template-value">{current && saved.mode !== 'disabled' ? <><bdi>{current.name}</bdi><Badge tone={compatibleMetaTemplate('satisfaction', current) ? 'success' : 'neutral'}>{t(compatibleMetaTemplate('satisfaction', current) ? 'waWorkspaceApproved' : 'waWorkspaceCheck')}</Badge></> : t('waSatisfactionDisabled')}</div></div>
      <Button variant="secondary" disabled={disabled || busy} aria-label={`${t(canEdit ? 'waWorkspaceConfigure' : 'waWorkspaceView')} · ${t('waSatisfactionTitle')}`} onClick={() => { setDraft(settings(status)); setError(''); setOpen(true); }}>{t(canEdit ? 'waWorkspaceConfigure' : 'waWorkspaceView')}</Button>
    </div>
    <Drawer open={open} onOpenChange={value => { if (!value) close(); }} closeDisabled={busy} title={t('waSatisfactionTitle')} width={600} className="wa-editor" primaryAction={canEdit ? <Button disabled={busy || attachmentBusy || disabled || uncertain || !valid} onClick={() => void save()}>{t('save')}</Button> : undefined}>
      {error && <p role="alert" className="wa-feedback text-[var(--danger-500)]">{error}</p>}
      <section className="wa-editor-section space-y-5">
        <Field label={t('waSatisfactionWhen')}><select className={inputClass} aria-label={t('waSatisfactionWhen')} value={draft.mode} disabled={!canEdit || busy || uncertain} onChange={event => setDraft(old => ({ ...old, mode: event.target.value as MetaSatisfactionSettings['mode'] }))}>{(['disabled', 'manual', 'sunday', 'delay'] as const).map(mode => <option key={mode} value={mode}>{t(`waSatisfactionMode_${mode}`)}</option>)}</select></Field>
        {draft.mode === 'sunday' && <Field label={t('waSatisfactionTime')}><Input type="time" aria-label={t('waSatisfactionTime')} value={draft.sunday_time} disabled={!canEdit || busy || uncertain} onChange={event => setDraft(old => ({ ...old, sunday_time: event.target.value }))} /></Field>}
        {draft.mode === 'delay' && <Field label={t('waSatisfactionDelay')} hint={t('waSatisfactionDelayHint')}><Input type="number" min={1} max={168} step={1} aria-label={t('waSatisfactionDelay')} value={draft.delay_hours} disabled={!canEdit || busy || uncertain} onChange={event => setDraft(old => ({ ...old, delay_hours: Number(event.target.value) }))} /></Field>}
        <p className="wa-muted">{t(draft.mode === 'manual' ? 'waSatisfactionManualHint' : draft.mode === 'disabled' ? 'waSatisfactionDisabledHint' : 'waSatisfactionAutomaticHint')}</p>
      </section>
      {draft.mode !== 'disabled' && <>
        <section className="wa-editor-section space-y-4"><Field label={t('waWorkspaceSelect')}><select className={inputClass} aria-label={t('waWorkspaceSelect')} value={draft.template.name ? `${draft.template.name}|${draft.template.language}` : ''} disabled={!canEdit || busy || uncertain} onChange={event => { const [name = '', language = ''] = event.target.value.split('|'); setDraft(old => ({ ...old, template: { name, language,attachment:defaultWhatsAppAttachment(templates.find(row=>row.name===name && row.language===language)) } })); }}><option value="">{t('waMetaNoTemplate')}</option>{!!draft.template.name && !selected && <option disabled value={`${draft.template.name}|${draft.template.language}`}>{draft.template.name}</option>}{templates.map(item => <option key={item.id} value={`${item.name}|${item.language}`} disabled={!compatibleMetaTemplate('satisfaction', item)}>{item.name} · {item.language}</option>)}</select></Field>
          {selected && metaTemplateHeader(selected) && <WhatsAppAttachmentPicker key={`${rid}:satisfaction:${selected.id}`} rid={rid} template={selected} format={metaTemplateHeader(selected) as 'IMAGE'|'DOCUMENT'} value={draft.template.attachment} disabled={!canEdit || busy || uncertain} onBusyChange={setAttachmentBusy} onChange={attachment=>setDraft(old=>({...old,template:{...old.template,attachment}}))}/>}
 {canEdit && <Button variant="ghost" disabled={busy || attachmentBusy} onClick={() => { if (dirty) { setCreateAfterDiscard(true); setDiscard(true); } else { setOpen(false); onCreate(); } }}><Plus aria-hidden="true" />{t('waWorkspaceCreateFor')}</Button>}
          {dirty && <p className="wa-muted">{t('waWorkspaceDirty')}</p>}
        </section>
        <section className="wa-editor-section"><h3>{t('waWorkspacePreview')}</h3>{selected ? <WhatsAppTemplatePreview rid={rid} template={selected} attachment={draft.template.attachment} /> : <p className="wa-muted">{t('waWorkspaceNoPreview')}</p>}</section>
        <p className="wa-muted mt-4">{t('waSatisfactionTitleHint')}</p>
        {!status.notifications_active && <p className="wa-feedback wa-muted">{t('waSatisfactionNeedsProvider')}</p>}
      </>}
    </Drawer>
    <ConfirmDialog open={discard} onOpenChange={value => { setDiscard(value); if (!value) setCreateAfterDiscard(false); }} title={t('discardUnsavedChanges')} confirmLabel={t('discardChanges')} cancelLabel={t('cancel')} onConfirm={() => { setDiscard(false); setOpen(false); setDraft(settings(status)); if (createAfterDiscard) onCreate(); setCreateAfterDiscard(false); }} />
  </>;
}
