'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Input, Select } from '@/components/ds';
import { getMetaWhatsAppStatus, getMetaWhatsAppTemplates, type MetaTemplateKind, type MetaWhatsAppStatus, type MetaWhatsAppTemplate, type WorkflowOrderType, type WorkflowStage, type WorkflowWhatsAppTemplate } from '@/lib/api';
import { compatibleMetaTemplate } from '@/lib/whatsapp-meta-templates';
import { useI18n } from '@/lib/i18n';

const kindKeys: Record<MetaTemplateKind, string> = { order_status: 'waPersonalReady', order_recap: 'waPersonalRecap', delivery_reminder: 'waPersonalReminder', receipt: 'waPersonalReceipt', satisfaction: 'waSatisfactionTitle' };
const empty: WorkflowWhatsAppTemplate = { name: '', language: '', kind: '', timing: '', send_time: '' };

/** Load the active tenant's catalogue independently of unsaved workflow drafts. */
export function useWorkflowMetaCatalog(rid: number) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ rid: number; loading: boolean; error: boolean; status: MetaWhatsAppStatus | null; templates: MetaWhatsAppTemplate[] }>({ rid, loading: true, error: false, status: null, templates: [] });
  useEffect(() => {
    let alive = true;
    setState({ rid, loading: true, error: false, status: null, templates: [] });
    void (async () => {
      try {
        const status = await getMetaWhatsAppStatus(rid);
        if (!status || !('connection' in status)) throw new Error('Incomplete WhatsApp status');
        const templates = status.connection ? (await getMetaWhatsAppTemplates(rid)).templates : [];
        if (!Array.isArray(templates)) throw new Error('Incomplete WhatsApp catalogue');
        if (alive) setState({ rid, loading: false, error: false, status, templates });
      } catch { if (alive) setState({ rid, loading: false, error: true, status: null, templates: [] }); }
    })();
    return () => { alive = false; };
  }, [rid, revision]);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  return { ...state, loading: state.rid !== rid || state.loading, refresh };
}

/** Select a message and its timing alongside the event that advances this stage. */
export function WorkflowStageMessage({ rid, meta, stage, orderType, frozen, fieldId, invalid, onChange }: { rid: number; meta: ReturnType<typeof useWorkflowMetaCatalog>; stage: WorkflowStage; orderType: WorkflowOrderType; frozen: boolean; fieldId: string; invalid?: boolean; onChange: (patch: Partial<WorkflowStage>) => void }) {
  const { t } = useI18n();
  const ref = stage.whatsapp_template ?? empty;
  const kind = ref.kind || 'order_status';
  const kinds = (Object.keys(kindKeys) as MetaTemplateKind[]).filter(value => (value !== 'delivery_reminder' || orderType === 'delivery') && (value !== 'satisfaction' || (stage.kind === 'completed' && orderType !== 'dine_in')));
  const choices = meta.templates.filter(template => compatibleMetaTemplate(kind, template));
  const fallback = meta.status?.connection;
  const selectedName = ref.name || (kind === 'order_status' ? fallback?.order_status_name : '') || '';
  const selectedLanguage = ref.language || (kind === 'order_status' ? fallback?.order_status_language : '') || '';
  const selected = choices.find(template => template.name === selectedName && template.language === selectedLanguage);
  const key = ref.name ? `${ref.name}|${ref.language}` : '';
  const update = (patch: Partial<WorkflowWhatsAppTemplate>) => onChange({ whatsapp_template: { ...ref, ...patch }, customer_message: '' });
  if (meta.loading) return <p role="status" className="text-sm text-[var(--fg-muted)]">{t('loading')}</p>;
  if (meta.error) return <div role="alert" className="space-y-2 text-sm"><p>{t('wfWhatsAppLoadError')}</p><Button variant="secondary" size="sm" onClick={meta.refresh}>{t('retry')}</Button></div>;
  if (!meta.status?.connection && !ref.name) return <><Field label={t('wfCustomerMessage')}><textarea dir="auto" rows={3} value={stage.customer_message ?? ''} readOnly={frozen} onChange={event => onChange({ customer_message: event.target.value })} className="w-full rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)]" /></Field><p className="text-xs leading-5 text-[var(--fg-muted)]">{t('wfMessageHint')}</p></>;
  const examples: Record<MetaTemplateKind, string[]> = {
    order_status: ['1234', t('restaurant'), ref.name ? stage.name : stage.customer_message || stage.name],
    order_recap: [t('restaurant'), '1234', 'Anael', '23/10/2026, 09:00–10:30', t('address'), '150.00 ILS', t('paid'), 'https://example.com/receipt/1234'],
    delivery_reminder: selected?.components[0]?.text?.includes('{{5}}') ? ['Anael', t('restaurant'), '23/10/2026, 09:00–10:30', t('wfPreviewCourier'), '+12025550123'] : ['Anael', '09:00–10:30', `${t('wfPreviewCourier')} : +12025550123`, t('restaurant')],
    receipt: ['1234', t('restaurant'), '150.00 ILS', 'https://example.com/receipt/1234'],
    satisfaction: ['Anael', '1234'],
  };
  const body = (ref.name ? selected?.components[0]?.text : '')?.replace(/\{\{(\d+)\}\}/g, (_, position: string) => examples[kind][Number(position) - 1] ?? '') ?? '';
  return <div className="space-y-4">
    <p className="max-w-prose text-sm leading-6 text-[var(--fg-muted)]">{t('wfWhatsAppAtStageHint')}</p>
    {!meta.status?.notifications_active && <p className="text-sm text-[var(--fg-muted)]">{t('wfWhatsAppInactive')}</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('wfWhatsAppMessageType')}><Select disabled={frozen} value={kind} onChange={event => onChange({ whatsapp_template: { ...empty, kind: event.target.value as MetaTemplateKind, timing: 'stage' }, customer_message: '' })}>{!kinds.includes(kind) && <option value={kind}>{t(kindKeys[kind])}</option>}{kinds.map(value => <option key={value} value={value}>{t(kindKeys[value])}</option>)}</Select></Field>
      <Field label={t('wfWhatsAppTemplate')}><Select id={fieldId} aria-invalid={invalid || undefined} disabled={frozen} value={key} onChange={event => { const template = choices.find(template => `${template.name}|${template.language}` === event.target.value); onChange({ whatsapp_template: template ? { ...ref, kind, timing: ref.timing || 'stage', name: template.name, language: template.language } : kind === 'order_status' ? empty : { ...ref, name: '', language: '' }, customer_message: template ? '' : stage.customer_message }); }}><option value="">{t(kind === 'order_status' ? 'wfWhatsAppDefault' : 'waMetaNoTemplate')}</option>{ref.name && !choices.some(template => `${template.name}|${template.language}` === key) && <option value={key}>{ref.name} · {t('wfWhatsAppUnavailable')}</option>}{choices.map(template => <option key={template.id + template.language} value={`${template.name}|${template.language}`}>{template.name} · {template.language}</option>)}</Select></Field>
    </div>
    {choices.length === 0 && <p className="text-sm text-[var(--fg-muted)]">{t('wfWhatsAppEmpty')}</p>}
    {ref.name && kind === 'delivery_reminder' && <div className="grid gap-4 sm:grid-cols-2"><Field label={t('wfWhatsAppWhen')}><Select disabled={frozen} value={ref.timing || 'stage'} onChange={event => update({ timing: event.target.value as 'stage' | 'day_before', send_time: event.target.value === 'day_before' ? '09:00' : '' })}><option value="stage">{t('wfWhatsAppAtStage')}</option>{kind === 'delivery_reminder' && <option value="day_before">{t('wfWhatsAppDayBefore')}</option>}</Select></Field>{ref.timing === 'day_before' && <Field label={t('wfWhatsAppTime')}><Input type="time" readOnly={frozen} value={ref.send_time} onChange={event => update({ send_time: event.target.value })} /></Field>}</div>}
    {kind === 'delivery_reminder' && <p className="max-w-prose text-xs leading-5 text-[var(--fg-muted)]">{t(ref.timing === 'day_before' ? 'wfWhatsAppScheduleHint' : 'wfWhatsAppImmediateHint')}</p>}
    {body && <details className="border-t border-[var(--line)] pt-3"><summary className="cursor-pointer text-sm font-medium">{t('waWorkspacePreview')} · {t('wfWhatsAppExample')}</summary><p dir="auto" className="mt-3 max-w-prose whitespace-pre-wrap break-words rounded-r-md bg-[var(--surface)] p-4 text-sm leading-6">{body}</p></details>}
    {!selected && selectedName && <p role="alert" className="text-sm text-[var(--danger-500)]">{t('wfWhatsAppUnavailable')}</p>}
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm"><Link href={`/${rid}/settings/whatsapp`} className="font-medium underline underline-offset-4">{t('wfWhatsAppLibrary')}</Link><button type="button" onClick={meta.refresh} className="underline underline-offset-4">{t('refresh')}</button></div>
  </div>;
}
