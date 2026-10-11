'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Bell, ChevronDown, Plus, RotateCcw, ShoppingBag, Sparkles, Trash2, Truck, Utensils } from 'lucide-react';
import { getOrderWorkflows, resetOrderWorkflow, updateOrderWorkflow, type OrderWorkflow, type WorkflowOrderType, type WorkflowStage } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { invalidateOrderWorkflows } from '@/lib/orders/use-order-workflows';
import { Badge, Button, ConfirmDialog, Field, Input, Select } from '@/components/ds';
import { Switch } from './_components';
import { ACTIONS, ORDER_TYPES, STAGE_KINDS, TRIGGERS, emptyWorkflow, readWorkflow, validateWorkflow, workflowSignature, type WorkflowDraft, type WorkflowIssue } from './workflow-state';

type Flows = Partial<Record<WorkflowOrderType, WorkflowDraft>>;
type PendingWrite = { type: WorkflowOrderType; operation: 'save' | 'reset'; requested: WorkflowDraft; previous: WorkflowDraft };
type Confirmation = { action: 'reset' | 'discard' | 'adopt' } | { action: 'leave'; href: string };
const typeKeys = { pickup: 'pickup', dine_in: 'dineIn', delivery: 'delivery' };
const typeIcons = { pickup: ShoppingBag, dine_in: Utensils, delivery: Truck };
const kindKeys = { received: 'wfKindReceived', in_progress: 'wfKindInProgress', ready: 'wfKindReady', out_for_delivery: 'wfKindOutForDelivery', completed: 'wfKindCompleted' };
const triggerKeys = { trigger_payment_confirmed: 'wfTrigPayment', trigger_production_done: 'wfTrigProduction', trigger_courier_assigned: 'wfTrigCourierAssigned', trigger_courier_delivered: 'wfTrigCourierDelivered' };
const actionKeys = { accept_sends_to_kitchen: 'wfAcceptSendsKitchen', accept_adds_to_production: 'wfAcceptAddsProduction', accept_prompts_whatsapp: 'wfAcceptPromptsWhatsapp', delivery_reminder_enabled: 'wfDeliveryReminder' };
const colors = { received: 'var(--fg-muted)', in_progress: 'var(--warning-500)', ready: 'var(--success-500)', out_for_delivery: 'var(--info-500)', completed: 'var(--fg-subtle)' };
const wrappingButton = 'whitespace-normal py-2 leading-5';

/** Edit each service's stages and guided actions, recovering uncertain writes before retrying. */
export function OrderWorkflowBuilder({ rid, canEdit }: { rid: number; canEdit: boolean }) {
  const { t } = useI18n(), router = useRouter();
  const [drafts, setDrafts] = useState<Flows>({}), [baselines, setBaselines] = useState<Flows>({});
  const [sources, setSources] = useState<Partial<Record<WorkflowOrderType, string>>>({});
  const [activeType, setActiveType] = useState<WorkflowOrderType>('pickup');
  const [openIndex, setOpenIndex] = useState<number | null>(null), [issue, setIssue] = useState<WorkflowIssue | null>(null);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<'save' | 'reset' | 'read' | null>(null);
  const [pending, setPending] = useState<PendingWrite | null>(null), [review, setReview] = useState<OrderWorkflow | null>(null), [readError, setReadError] = useState(false);
  const [notices, setNotices] = useState<Partial<Record<WorkflowOrderType, string>>>({});
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const lock = useRef(false), lifetime = useRef({ generation: 0, sequence: 0 });
  const draft = drafts[activeType] ?? emptyWorkflow();
  const dirtyTypes = ORDER_TYPES.filter(type => workflowSignature(drafts[type] ?? emptyWorkflow()) !== workflowSignature(baselines[type] ?? emptyWorkflow()));
  const dirty = dirtyTypes.includes(activeType), guarded = dirtyTypes.length > 0 || !!pending;
  const frozen = !canEdit || !!busy || !!pending;

  const load = useCallback(async () => {
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setLoadError(false);
    try {
      const workflows = await getOrderWorkflows(rid), next: Flows = {}, templates: Partial<Record<WorkflowOrderType, string>> = {};
      for (const wf of workflows) { if (next[wf.order_type]) throw new Error('Duplicate workflow'); next[wf.order_type] = readWorkflow(wf); templates[wf.order_type] = wf.template_source; }
      if (current()) { setDrafts(next); setBaselines(next); setSources(templates); }
    } catch { if (current()) setLoadError(true); }
    finally { if (current()) setLoading(false); }
  }, [rid]);
  useEffect(() => { const current = lifetime.current; void load(); return () => { current.generation++; }; }, [load]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => { if (guarded || lock.current) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = (event: MouseEvent) => {
      if ((!guarded && !lock.current) || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const anchor = (event.target as Element).closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.target === '_blank' || anchor.hasAttribute('download') || anchor.origin !== location.origin || anchor.href === location.href) return;
      event.preventDefault(); event.stopPropagation();
      if (!lock.current) setConfirmation({ action: 'leave', href: anchor.pathname + anchor.search + anchor.hash });
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [guarded]);
  useEffect(() => {
    if (issue) (document.getElementById(`workflow-${activeType}-${issue.index}-${issue.field}`) ?? document.getElementById('workflow-issue'))?.focus();
  }, [issue, activeType]);

  const change = (next: WorkflowDraft) => {
    if (frozen || lock.current) return;
    setDrafts(previous => ({ ...previous, [activeType]: next })); setIssue(null);
    setNotices(previous => ({ ...previous, [activeType]: undefined }));
  };
  const patchStage = (index: number, patch: Partial<WorkflowStage>) => change({ ...draft, stages: draft.stages.map((stage, i) => i === index ? { ...stage, ...patch } : stage) });
  const accept = (wf: OrderWorkflow) => {
    const next = readWorkflow(wf);
    setDrafts(previous => ({ ...previous, [wf.order_type]: next }));
    setBaselines(previous => ({ ...previous, [wf.order_type]: next }));
    setSources(previous => ({ ...previous, [wf.order_type]: wf.template_source }));
    setIssue(null); invalidateOrderWorkflows(rid);
  };
  const mutate = async (operation: 'save' | 'reset') => {
    if (frozen || lock.current) return;
    if (operation === 'save') {
      if (!dirty) return;
      const problem = validateWorkflow(draft, activeType);
      if (problem) { setOpenIndex(problem.index); setIssue(problem); return; }
    }
    const request: PendingWrite = { type: activeType, operation, requested: draft, previous: baselines[activeType] ?? emptyWorkflow() };
    const generation = lifetime.current.generation;
    lock.current = true; setBusy(operation); setNotices(previous => ({ ...previous, [activeType]: undefined }));
    try {
      const wf = operation === 'save' ? await updateOrderWorkflow(rid, activeType, draft.stages, draft.actions) : await resetOrderWorkflow(rid, activeType);
      readWorkflow(wf, request.type);
      if (generation === lifetime.current.generation) { accept(wf); setNotices(previous => ({ ...previous, [request.type]: operation === 'save' ? 'wfFlowSaved' : 'wfResetDone' })); if (operation === 'reset') setOpenIndex(null); }
    } catch { if (generation === lifetime.current.generation) { setPending(request); setReview(null); setReadError(false); } }
    finally { if (generation === lifetime.current.generation) { lock.current = false; setBusy(null); } }
  };
  const verify = async () => {
    if (!pending || lock.current) return;
    lock.current = true; setBusy('read'); setReadError(false);
    const generation = lifetime.current.generation;
    try {
      const workflows = await getOrderWorkflows(rid), matches = workflows.filter(wf => wf.order_type === pending.type);
      if (matches.length !== 1) throw new Error('Missing workflow');
      const wf = matches[0], server = readWorkflow(wf, pending.type);
      if (generation !== lifetime.current.generation) return;
      if (pending.operation === 'save' && workflowSignature(server, true) === workflowSignature(pending.requested, true)) {
        accept(wf); setPending(null); setReview(null); setNotices(previous => ({ ...previous, [pending.type]: 'wfVerifiedSaved' }));
      } else if (workflowSignature(server) === workflowSignature(pending.previous) && wf.template_source === sources[pending.type]) {
        setPending(null); setReview(null); setNotices(previous => ({ ...previous, [pending.type]: 'wfUnchangedAfterRead' }));
      } else { setReview(wf); invalidateOrderWorkflows(rid); }
    } catch { if (generation === lifetime.current.generation) setReadError(true); }
    finally { if (generation === lifetime.current.generation) { lock.current = false; setBusy(null); } }
  };
  const confirm = () => {
    const action = confirmation; setConfirmation(null);
    if (lock.current || !action) return;
    if (action.action === 'reset') void mutate('reset');
    else if (action.action === 'discard') { setDrafts(previous => ({ ...previous, [activeType]: baselines[activeType] ?? emptyWorkflow() })); setIssue(null); setOpenIndex(null); }
    else if (action.action === 'adopt' && review) { accept(review); setNotices(previous => ({ ...previous, [review.order_type]: 'wfServerAdopted' })); setReview(null); setPending(null); }
    else if (action.action === 'leave') router.push(action.href);
  };

  if (loading) return <p role="status" className="py-10 text-sm text-[var(--fg-muted)]">{t('loading')}</p>;
  if (loadError) return <div role="alert" className="space-y-3"><p className="text-sm text-[var(--danger-500)]">{t('wfLoadError')}</p><Button onClick={() => void load()}>{t('retry')}</Button></div>;
  return <div className="space-y-6">
    <div className="rounded-r-lg bg-[var(--summary-bg)] p-5 text-[var(--summary-fg)]">
      <p className="text-base font-semibold">{t('wfEditorIntro')}</p>
      <p className="mt-2 text-sm leading-6">{t('wfEditorScope')}</p>
    </div>
    {!canEdit && <p className="text-sm text-[var(--fg-muted)]">{t('pushPreferencesReadOnly')}</p>}
    <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('wfServiceChoice')}>
      {ORDER_TYPES.map(type => { const Icon = typeIcons[type]; return <button key={type} type="button" aria-pressed={activeType === type} disabled={!!busy} onClick={() => { setActiveType(type); setOpenIndex(null); setIssue(null); }} className={`flex min-w-0 flex-col items-start gap-2 rounded-r-md border p-3 text-start text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)] disabled:opacity-50 ${activeType === type ? 'border-[var(--brand-ink)] bg-[var(--surface-2)]' : 'border-[var(--line)]'}`}>
        <Icon className="size-5 text-[var(--brand-ink)]" aria-hidden="true" /><span className="font-semibold">{t(typeKeys[type])}</span>{dirtyTypes.includes(type) && <span className="text-xs text-[var(--fg-muted)]">{t('wfUnsavedFlow')}</span>}
      </button>; })}
    </div>
    {pending && <div role="alert" className="space-y-3 rounded-r-lg border border-[var(--danger-500)] p-4">
      <p className="text-sm font-semibold">{t(typeKeys[pending.type])} · {t('wfWriteUnconfirmed')}</p><p className="text-sm leading-6 text-[var(--fg-muted)]">{t('wfReadBeforeRetry')}</p>
      <Button className={wrappingButton} variant="secondary" disabled={!!busy} onClick={() => void verify()}>{t(busy === 'read' ? 'loading' : 'wfReadServer')}</Button>
      {readError && <p className="text-sm text-[var(--danger-500)]">{t('wfReadError')}</p>}
      {review && <div className="space-y-3 border-t border-[var(--line)] pt-4">
        <p className="text-sm leading-6">{t('wfServerDifferent')}</p>
        <details className="rounded-r-md bg-[var(--surface-2)] p-3"><summary className="cursor-pointer text-sm font-semibold">{t('wfServerVersion')}</summary>
          <ol className="mt-3 space-y-3">{review.stages.map((stage, index) => <li key={stage.id ?? index} className="text-sm"><p className="font-medium">{index + 1}. <bdi>{stage.name}</bdi> · {t(kindKeys[stage.kind])}</p><p className="mt-1 text-[var(--fg-muted)]">{TRIGGERS.filter(key => stage[key]).map(key => t(triggerKeys[key])).join(' · ') || t('wfTrigManual')}</p><p className="mt-1">{t('wfNotify')} : {t(stage.notify_customer ? 'yes' : 'no')}</p>{stage.customer_message && <p dir="auto" className="mt-1 whitespace-pre-wrap break-words">{stage.customer_message}</p>}</li>)}</ol>
          <ul className="mt-4 space-y-2 border-t border-[var(--line)] pt-3">{ACTIONS.map(key => <li key={key} className="text-sm">{t(actionKeys[key])} : {t(review[key] ? 'yes' : 'no')}</li>)}</ul>
        </details>
        <Button className={wrappingButton} disabled={!!busy} onClick={() => setConfirmation({ action: 'adopt' })}>{t('wfUseServerVersion')}</Button>
      </div>}
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">{t(typeKeys[activeType])} <span className="text-sm font-normal text-[var(--fg-muted)]">· {draft.stages.length}/12</span></h3>{sources[activeType] === 'custom' && <Badge>{t('wfCustomized')}</Badge>}</div>
    {issue && <p id="workflow-issue" tabIndex={-1} role="alert" className="text-sm leading-6 text-[var(--danger-500)]">{t(issue.key)}</p>}
    {draft.stages.length === 0 && <p className="rounded-r-md border border-dashed border-[var(--line-strong)] p-5 text-sm text-[var(--fg-muted)]">{t('wfEmpty')}</p>}
    <ol className="space-y-3">
      {draft.stages.map((stage, index) => {
        const expanded = openIndex === index, name = stage.name || t('wfUnnamed'), triggers = TRIGGERS.filter(key => stage[key]);
        const fieldId = (field: string) => `workflow-${activeType}-${index}-${field}`;
        return <li key={stage.id ?? `new-${index}`} data-workflow-stage={index} className="min-w-0 rounded-r-lg border border-[var(--line)] bg-[var(--surface)]">
          <button type="button" aria-expanded={expanded} aria-controls={`workflow-panel-${index}`} onClick={() => setOpenIndex(expanded ? null : index)} className="flex w-full items-start gap-3 rounded-r-lg p-4 text-start outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)]">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-xs font-semibold" style={{ color: colors[stage.kind] }}>{index + 1}</span>
            <span className="min-w-0 flex-1"><span dir="auto" className="block break-words text-base font-semibold">{name}</span><span className="mt-1 block text-xs text-[var(--fg-muted)]">{t(kindKeys[stage.kind])}</span><span className="mt-2 block text-sm leading-6 text-[var(--fg-muted)]">{triggers.map(key => t(triggerKeys[key])).join(' · ') || t('wfTrigManual')}</span>{stage.notify_customer && <span className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--fg-muted)]"><Bell className="size-3" aria-hidden="true" />{t('wfNotify')}</span>}</span>
            <ChevronDown className={`mt-1 size-4 shrink-0 text-[var(--fg-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {expanded && <div id={`workflow-panel-${index}`} className="space-y-5 border-t border-[var(--line)] p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('wfStageName')}><Input id={fieldId('name')} dir="auto" value={stage.name} readOnly={frozen} aria-invalid={issue?.index === index && issue.field === 'name' || undefined} onChange={event => patchStage(index, { name: event.target.value })} /></Field>
              <Field label={t('wfType')}><Select id={fieldId('kind')} value={stage.kind} disabled={frozen} aria-invalid={issue?.index === index && issue.field === 'kind' || undefined} onChange={event => patchStage(index, { kind: event.target.value as WorkflowStage['kind'] })}>{STAGE_KINDS.filter(kind => activeType === 'delivery' || kind !== 'out_for_delivery' || stage.kind === kind).map(kind => <option key={kind} value={kind}>{t(kindKeys[kind])}</option>)}</Select></Field>
            </div>
            <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('wfTypeHint')}</p>
            <fieldset disabled={frozen} className="space-y-3"><legend className="mb-2 text-sm font-semibold">{t('wfAutomations')}</legend><p className="text-sm leading-6 text-[var(--fg-muted)]">{t('wfMultipleTriggersHint')}</p>
              {TRIGGERS.filter(key => activeType === 'delivery' || !key.includes('courier') || stage[key]).map(key => <label key={key} className="flex min-h-10 items-start gap-3 rounded-r-md border border-[var(--line)] p-3 text-sm selection-row"><input id={fieldId(key)} type="checkbox" checked={stage[key]} aria-invalid={issue?.index === index && issue.field === key || undefined} onChange={event => patchStage(index, { [key]: event.target.checked })} className="mt-0.5 size-4 shrink-0 accent-[var(--brand-ink)]" /><span>{t(triggerKeys[key])}</span></label>)}
            </fieldset>
            <div className="space-y-3 rounded-r-md bg-[var(--surface-2)] p-4"><div className="flex items-start justify-between gap-4"><span className="text-sm font-semibold">{t('wfNotify')}</span><Switch checked={stage.notify_customer} disabled={frozen} label={t('wfNotify')} onChange={value => patchStage(index, { notify_customer: value })} /></div>
              <Field label={t('wfCustomerMessage')}><textarea dir="auto" rows={3} value={stage.customer_message ?? ''} readOnly={frozen} onChange={event => patchStage(index, { customer_message: event.target.value })} className="w-full rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-500)]" /></Field><p className="text-xs leading-5 text-[var(--fg-muted)]">{t('wfMessageHint')}</p>
            </div>
            {canEdit && <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
              {([-1, 1] as const).map(direction => { const Icon = direction === -1 ? ArrowUp : ArrowDown; return <Button key={direction} type="button" variant="secondary" size="sm" disabled={frozen || index + direction < 0 || index + direction >= draft.stages.length} onClick={() => { const next = [...draft.stages]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; change({ ...draft, stages: next }); setOpenIndex(index + direction); }}><Icon aria-hidden="true" />{t(direction === -1 ? 'wfMoveUp' : 'wfMoveDown')}</Button>; })}
              <Button type="button" variant="ghost" size="sm" disabled={frozen} className={wrappingButton} onClick={() => { change({ ...draft, stages: draft.stages.filter((_, i) => i !== index) }); setOpenIndex(null); }}><Trash2 aria-hidden="true" />{t('wfRemoveStage')}</Button>
            </div>}
          </div>}
        </li>;
      })}
    </ol>
    {canEdit && <Button type="button" variant="secondary" disabled={frozen || draft.stages.length >= 12} className={wrappingButton} onClick={() => { change({ ...draft, stages: [...draft.stages, { name: '', kind: draft.stages.at(-1)?.kind ?? 'received', trigger_payment_confirmed: false, trigger_production_done: false, trigger_courier_assigned: false, trigger_courier_delivered: false, notify_customer: false, customer_message: '' }] }); setOpenIndex(draft.stages.length); requestAnimationFrame(() => document.getElementById(`workflow-${activeType}-${draft.stages.length}-name`)?.focus()); }}><Plus aria-hidden="true" />{t('wfAddStage')}</Button>}
    <section className="space-y-4 rounded-r-lg bg-[var(--surface-2)] p-4 sm:p-5" aria-label={t('wfGuidedActionsTitle')}>
      <div><h3 className="text-base font-semibold">{t('wfGuidedActionsTitle')}</h3><p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">{t('wfGuidedActionsHint')}</p></div>
      {ACTIONS.filter(key => key !== 'delivery_reminder_enabled' || activeType === 'delivery' || draft.actions[key]).map(key => <div key={key} className="flex items-start justify-between gap-4 border-t border-[var(--line)] pt-4"><span className="text-sm leading-6">{t(actionKeys[key])}</span><Switch checked={draft.actions[key]} disabled={frozen} label={t(actionKeys[key])} onChange={value => change({ ...draft, actions: { ...draft.actions, [key]: value } })} /></div>)}
      {canEdit && <Button type="button" className={wrappingButton} variant="secondary" disabled={frozen} onClick={() => change({ ...draft, actions: { accept_sends_to_kitchen: true, accept_adds_to_production: true, accept_prompts_whatsapp: true, delivery_reminder_enabled: activeType === 'delivery' } })}><Sparkles aria-hidden="true" />{t('wfCateringPreset')}</Button>}
    </section>
    <div className="space-y-4 border-t border-[var(--line)] pt-5">
      <p role="status" className="text-sm leading-6 text-[var(--fg-muted)]">{t(busy === 'read' ? 'loading' : busy ? 'saving' : notices[activeType] ?? (dirty ? 'wfUnsavedFlow' : 'settingsUnchanged'))}</p>
      {canEdit && <><div className="grid gap-2 min-[420px]:grid-cols-2"><Button type="button" className={wrappingButton} variant="secondary" disabled={frozen || !dirty} onClick={() => setConfirmation({ action: 'discard' })}>{t('discardChanges')}</Button><Button type="button" className={wrappingButton} disabled={frozen || !dirty} onClick={() => void mutate('save')}>{t('wfSaveFlow')}</Button></div>
        {sources[activeType] === 'custom' && <Button type="button" className={wrappingButton} variant="ghost" disabled={frozen} onClick={() => setConfirmation({ action: 'reset' })}><RotateCcw aria-hidden="true" />{t('wfReset')}</Button>}
      </>}
    </div>
    <ConfirmDialog open={!!confirmation} onOpenChange={open => { if (!open) setConfirmation(null); }} title={t(confirmation?.action === 'reset' ? 'wfReset' : confirmation?.action === 'adopt' ? 'wfUseServerVersion' : 'discardUnsavedChanges')} description={t(confirmation?.action === 'reset' ? 'wfResetConfirm' : confirmation?.action === 'adopt' ? 'wfAdoptConfirm' : confirmation?.action === 'leave' && pending ? 'wfLeaveUnconfirmed' : 'wfDiscardScope')} confirmLabel={t(confirmation?.action === 'reset' ? 'reset' : confirmation?.action === 'adopt' ? 'wfUseServerVersion' : 'discardChanges')} cancelLabel={t('cancel')} danger={confirmation?.action === 'reset'} onConfirm={confirm} />
  </div>;
}
