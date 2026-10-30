'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ds';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';
import { captureLifecycleActor, getLifecycleV2, lifecycleActorCurrent, LifecycleOperationApiError, submitLifecycleV2, verifyLifecycleV2, type LifecycleActorContext, type Order } from '@/lib/api';
import { lifecycleV2Allows, readLifecycleV2Scope, readOrderLifecycleV2, reviewHandoffSelection, type LifecycleV2HandoffAction, type LifecycleV2Scope, type OrderLifecycleV2Read } from '@/lib/orders/lifecycle-v2';
import { hasLifecycleIntents, persistLifecycleIntent, readLifecycleIntents, readLifecycleOperationResult, removeLifecycleIntent, type LifecycleIntent, type LifecycleIntentContext } from '@/lib/orders/lifecycle-operations';
import { lifecycleV2ActionReason } from '@/lib/orders/lifecycle-v2-presentation';
import { LifecycleFacts } from './context/LifecycleFacts';

type Operation = LifecycleV2HandoffAction | 'close_check';
const definitive = new Set(['lifecycle_revision_changed', 'lifecycle_units_changed', 'lifecycle_action_not_allowed']);
const handoffs = ['serve', 'pickup', 'hand_to_courier', 'deliver'] as const;
function journalContext(actor: LifecycleActorContext): LifecycleIntentContext { return { api_origin: actor.api_origin, restaurant_id: actor.restaurant_id, actor_id: actor.actor_id }; }

/** Exact-scope review and durable handoff/close operations inside the existing order drawer. */
export function LifecycleOperations({ order, canManage, disabled, onChanged }: { order: Order; canManage: boolean; disabled: boolean; onChanged?: () => void }) {
  const { user } = useAuth();
  const { t, direction } = useI18n();
  const focus = useDialogReturnFocus();
  const inline = readOrderLifecycleV2(order.lifecycle_v2, order.id);
  const [open, setOpen] = useState(false), [scope, setScope] = useState<LifecycleV2Scope | null>(null);
  const [read, setRead] = useState<OrderLifecycleV2Read>({ kind: 'unavailable' });
  const [action, setAction] = useState<Operation | null>(null), [selected, setSelected] = useState<string[]>([]);
  const [intent, setIntent] = useState<LifecycleIntent | null>(null), [resumeReviewed, setResumeReviewed] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [completed, setCompleted] = useState(false);
  const [recoveries, setRecoveries] = useState<LifecycleIntent[]>([]), [journalError, setJournalError] = useState(''), [journalVersion, setJournalVersion] = useState(0);
  const actor = useRef<LifecycleActorContext | null>(null), generation = useRef(0), lock = useRef(false);
  useEffect(() => { const guard = generation; guard.current++; actor.current = null; setOpen(false); setIntent(null); return () => { guard.current++; }; }, [order.restaurant_id, order.id, user?.id]);
  const active = (stamp: number, context: LifecycleActorContext) => generation.current === stamp && lifecycleActorCurrent(context);
  const labels: Record<Operation, string> = { serve: t('lifecycleServe'), pickup: t('lifecyclePickup'), hand_to_courier: t('lifecycleCourier'), deliver: t('lifecycleDeliver'), close_check: scope?.kind === 'order' ? t('lifecycleCloseOrder') : t('lifecycleCloseBill') };
  const parents = useMemo<LifecycleV2Scope[]>(() => { const snapshot = readOrderLifecycleV2(order.lifecycle_v2, order.id); return snapshot.kind !== 'available' ? [] : snapshot.value.identities.financial_check_ids?.length
    ? snapshot.value.identities.financial_check_ids.map(id => ({ kind: 'financial_check' as const, id }))
    : snapshot.value.identities.check_id ? [{ kind: 'check', id: snapshot.value.identities.check_id }]
    : snapshot.value.identities.session_id ? [{ kind: 'table_session', id: snapshot.value.identities.session_id }] : []; }, [order.lifecycle_v2, order.id]);
  const recoveryScopes = useMemo<LifecycleV2Scope[]>(() => {
    const scopes: LifecycleV2Scope[] = [{ kind: 'order', id: String(order.id) }];
    const snapshot = readOrderLifecycleV2(order.lifecycle_v2, order.id);
    if (snapshot.kind === 'available') {
      const ids = snapshot.value.identities;
      for (const id of [...(ids.financial_check_ids ?? []), ...(ids.financial_component_ids ?? [])]) scopes.push({ kind: 'financial_check', id });
      for (const id of [...(ids.root_check_ids ?? []), ...(ids.check_id ? [ids.check_id] : []), ...(ids.open_ticket_id ? [ids.open_ticket_id] : [])]) scopes.push({ kind: 'check', id });
      if (ids.session_id) scopes.push({ kind: 'table_session', id: ids.session_id });
    }
    return scopes.filter((scope, index) => scopes.findIndex(other => other.kind === scope.kind && other.id === scope.id) === index);
  }, [order.id, order.lifecycle_v2]);
  const scanJournals = useCallback(() => {
    if (!user) { setRecoveries([]); setJournalError(''); return; }
    try {
      if (order.lifecycle_v2 === undefined && !hasLifecycleIntents(localStorage)) { setRecoveries([]); setJournalError(''); return; }
      const current = captureLifecycleActor(order.restaurant_id, user.id);
      setRecoveries(recoveryScopes.flatMap(target => readLifecycleIntents(localStorage, journalContext(current), target)));
      setJournalError('');
    } catch (cause) { setRecoveries([]); setJournalError(cause instanceof Error && cause.message === 'lifecycleContextChanged' ? 'lifecycleContextChanged' : 'lifecycleJournalUnavailable'); }
  }, [order.restaurant_id, order.lifecycle_v2, user, recoveryScopes]);
  useEffect(() => {
    scanJournals();
    const changed = (event: StorageEvent) => { if (event.key?.startsWith('foody-lifecycle-intent-v2:')) scanJournals(); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [scanJournals, journalVersion]);


  async function load(target: LifecycleV2Scope, operation: Operation | null) {
    if (lock.current || !user) return;
    const stamp = ++generation.current;
    setOpen(true); setScope(target); setAction(operation); setRead({ kind: 'unavailable' }); setError(''); setSelected([]); setResumeReviewed(false); setBusy(true); setIntent(null); setCompleted(false); actor.current = null;
    try {
      const context = captureLifecycleActor(order.restaurant_id, user.id); actor.current = context;
      const pending = readLifecycleIntents(localStorage, journalContext(context), target)[0] ?? null;
      setIntent(pending);
      if (pending) { setAction(pending.command.action); setSelected(pending.command.unit_keys); }
      const result = await getLifecycleV2(context, target) as { lifecycle_v2?: unknown };
      if (!active(stamp, context)) return;
      const next = readLifecycleV2Scope(result?.lifecycle_v2, target);
      if (next.kind !== 'available') throw new Error('lifecycleOperationFailed');
      setRead(next);
    } catch (cause) {
      if (stamp === generation.current) setError(cause instanceof Error && ['lifecycleJournalUnavailable', 'lifecycleContextChanged'].includes(cause.message) ? cause.message : 'lifecycleOperationFailed');
    } finally { if (stamp === generation.current) setBusy(false); }
  }
  async function confirmed(pending: LifecycleIntent, stamp: number, context: LifecycleActorContext) {
    if (!active(stamp, context)) return;
    removeLifecycleIntent(localStorage, pending); setJournalVersion(value => value + 1);
    const remaining = readLifecycleIntents(localStorage, journalContext(context), pending.command.scope)[0] ?? null;
    setIntent(remaining); setCompleted(!remaining); setResumeReviewed(false); setSelected(remaining?.command.unit_keys ?? []); setError('');
    if (remaining) setAction(remaining.command.action);
    try {
      const result = await getLifecycleV2(context, pending.command.scope) as { lifecycle_v2?: unknown };
      if (!active(stamp, context)) return;
      const next = readLifecycleV2Scope(result?.lifecycle_v2, pending.command.scope);
      setRead(next.kind === 'available' ? next : { kind: 'unavailable' });
      if (next.kind !== 'available') setError('lifecycleOperationFailed');
    } catch { if (active(stamp, context)) { setRead({ kind: 'unavailable' }); setError('lifecycleOperationFailed'); } }
    onChanged?.();
  }
  async function submit(resuming = false) {
    const context = actor.current;
    if (lock.current || journalError || disabled || !canManage || !context || !scope || !action || !lifecycleActorCurrent(context) || read.kind !== 'available') { setError('lifecycleContextChanged'); return; }
    if (intent && (!resuming || !resumeReviewed)) return;
    const keys = action === 'close_check' ? [] : reviewHandoffSelection(read, action, selected);
    if (!intent && (action === 'close_check' ? !lifecycleV2Allows(read, action) : !keys)) return;
    const stamp = generation.current;
    lock.current = true; setBusy(true); setError(''); setCompleted(false);
    let pending = intent;
    try {
      if (!pending) {
        const existing = readLifecycleIntents(localStorage, journalContext(context), scope)[0];
        if (existing) { setIntent(existing); setAction(existing.command.action); setSelected(existing.command.unit_keys); setResumeReviewed(false); return; }
        pending = { version: 1, context: journalContext(context), created_at: Date.now(), command: { request_id: crypto.randomUUID(), scope: { ...scope }, expected_revision: read.value.revision, action, unit_keys: keys ?? [] } };
        try { persistLifecycleIntent(localStorage, pending); } catch { throw new Error('lifecycleJournalUnavailable'); }
        setIntent(pending); setJournalVersion(value => value + 1);
      }
      const result = readLifecycleOperationResult(await submitLifecycleV2(context, pending.command), pending.command);
      if (!active(stamp, context)) return;
      if (result.kind !== 'confirmed') throw new Error('lifecycleOperationUnconfirmed');
      await confirmed(pending, stamp, context);
    } catch (cause) {
      if (!active(stamp, context)) return;
      if (pending && cause instanceof LifecycleOperationApiError && cause.status === 409 && definitive.has(cause.code)) {
        try { removeLifecycleIntent(localStorage, pending); setIntent(null); setJournalVersion(value => value + 1); } catch { setError('lifecycleJournalUnavailable'); return; }
        setRead({ kind: 'unavailable' }); setError('lifecycleOperationChanged');
      } else setError(cause instanceof Error && cause.message === 'lifecycleJournalUnavailable' ? cause.message : cause instanceof LifecycleOperationApiError && cause.code === 'lifecycle_request_conflict' ? 'lifecycleRequestConflict' : 'lifecycleOperationUnconfirmed');
      setResumeReviewed(false);
    } finally { lock.current = false; if (stamp === generation.current) setBusy(false); }
  }
  async function verify() {
    const context = actor.current, pending = intent;
    if (lock.current || !context || !pending || !lifecycleActorCurrent(context)) { setError('lifecycleContextChanged'); return; }
    const stamp = generation.current;
    lock.current = true; setBusy(true); setError(''); setResumeReviewed(false);
    try {
      const result = readLifecycleOperationResult(await verifyLifecycleV2(context, pending.command), pending.command);
      if (!active(stamp, context)) return;
      if (result.kind === 'confirmed') await confirmed(pending, stamp, context);
      else { setError('lifecycleOperationUnconfirmed'); setResumeReviewed(result.kind === 'unconfirmed'); }
    } catch { if (active(stamp, context)) setError('lifecycleOperationUnconfirmed'); }
    finally { lock.current = false; if (stamp === generation.current) setBusy(false); }
  }
  const close = () => { generation.current++; actor.current = null; setOpen(false); setBusy(false); };
  if (inline.kind !== 'available' && !open && !recoveries.length && !journalError) return null;
  const units = read.kind === 'available' ? read.value.units ?? [] : [];
  const available = action && action !== 'close_check' ? units.filter(unit => unit.available_actions.includes(action)) : [];
  const pendingSelectionKnown = !intent || intent.command.action === 'close_check' || intent.command.unit_keys.every(key => units.some(unit => unit.key === key));
  const selectionValid = read.kind === 'available' && action && (action === 'close_check' ? lifecycleV2Allows(read, action) : reviewHandoffSelection(read, action, selected) !== null);
  return <section className="my-5 space-y-4" data-lifecycle-operations>
    {inline.kind === 'available' && <LifecycleFacts value={inline.value} showMoney={false} />}
    {recoveries.length > 0 && <div className="flex flex-wrap gap-2">{recoveries.filter((item, index, all) => all.findIndex(other => other.command.scope.kind === item.command.scope.kind && other.command.scope.id === item.command.scope.id) === index).map(item => <Button key={item.command.request_id} variant="secondary" disabled={busy} onClick={() => void load(item.command.scope, item.command.action)}>{t('lifecycleRecoverOperation')}</Button>)}</div>}
    {journalError && <p role="alert" className="text-fs-sm">{t(journalError)} <button type="button" className="underline" onClick={scanJournals}>{t('retry')}</button></p>}
    {canManage && <div className="flex flex-wrap gap-2">
      {handoffs.filter(key => lifecycleV2Allows(inline, key)).map(key => <Button key={key} variant="secondary" size="sm" disabled={disabled || busy || !!journalError} onClick={() => void load({ kind: 'order', id: String(order.id) }, key)}>{labels[key]}</Button>)}
      {!parents.length && lifecycleV2Allows(inline, 'close_check') && <Button variant="secondary" size="sm" disabled={disabled || busy || !!journalError} onClick={() => void load({ kind: 'order', id: String(order.id) }, 'close_check')}>{t('lifecycleCloseOrder')}</Button>}
      {parents.length > 0 && <Button variant="secondary" size="sm" disabled={disabled || busy || !!journalError} onClick={() => { generation.current++; setScope(null); setRead({ kind: 'unavailable' }); setAction('close_check'); setError(''); setIntent(null); setOpen(true); }}>{t('lifecycleReviewBill')}</Button>}
    </div>}
    <Dialog.Root open={open} onOpenChange={next => { if (!next) close(); }}><Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/55" />
      <Dialog.Content {...focus} dir={direction} aria-describedby={undefined} className="fixed inset-x-4 top-1/2 z-[91] mx-auto max-h-[88dvh] max-w-lg -translate-y-1/2 overflow-y-auto rounded-xl bg-[var(--surface)] p-5 text-[var(--fg)] shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-3"><Dialog.Title className="text-fs-lg font-semibold">{action ? labels[action] : t('lifecycleReviewBill')}</Dialog.Title><Button variant="ghost" icon aria-label={t('close')} onClick={close}><X /></Button></div>
        {!scope ? <div className="space-y-3">{parents.map((parent, index) => <Button key={`${parent.kind}:${parent.id}`} variant="secondary" onClick={() => void load(parent, 'close_check')}>{t('lifecycleBill')} {index + 1}</Button>)}</div> : <>
          {read.kind === 'available' && <>
            <p className="mb-4 text-fs-xs">{t('lifecycleScopeOrders').replace('{ids}', read.value.identities.order_ids.map(id => `#${id}`).join(', '))}</p>
            <LifecycleFacts value={read.value} />
            {action === 'close_check' ? <p className="my-5 text-fs-sm">{t('lifecycleConfirmClose')}</p> : (!completed || available.length > 0 || intent) && <fieldset disabled={busy || !!intent || disabled} className="my-5 space-y-3"><legend className="mb-3 text-fs-sm">{t('lifecycleSelectUnits')}</legend>
              {(intent ? units.filter(unit => intent.command.unit_keys.includes(unit.key)) : available).map((unit, index) => <label key={unit.key} className="flex items-start gap-3 border-b border-[var(--line)] py-3"><input type="checkbox" checked={selected.includes(unit.key)} onChange={event => setSelected(previous => event.target.checked ? [...previous, unit.key] : previous.filter(key => key !== unit.key))} /><span className="min-w-0 flex-1 break-words"><span>{unit.name}</span><span className="block text-fs-xs">{t('lifecycleUnitNumber').replace('{index}', String(index + 1)).replace('{total}', String(intent ? intent.command.unit_keys.length : available.length))}</span>{unit.details.map((detail, i) => <span className="block text-fs-xs" key={i}>{detail}</span>)}</span></label>)}
            </fieldset>}
          </>}
          {completed && <p role="status" className="my-4 text-fs-sm">{t('lifecycleOperationConfirmed')}</p>}
          {intent && <p role="status" className="my-4 text-fs-sm">{t('lifecycleOperationUnconfirmed')} {intent.command.action !== 'close_check' && t('lifecyclePendingSelection').replace('{count}', String(intent.command.unit_keys.length))}</p>}
          {!pendingSelectionKnown && <p role="status" className="my-4 text-fs-sm">{t('lifecycleSelectedUnavailable')}</p>}
          {!intent && !completed && read.kind === 'available' && action && !lifecycleV2Allows(read, action) && <p role="status" className="my-4 text-fs-sm">{lifecycleV2ActionReason(read.value.actions?.find(item => item.key === action)?.reason, t)}</p>}
          {error && <p role="alert" className="my-4 text-fs-sm">{t(error)}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            {intent ? <><Button variant="secondary" disabled={busy} onClick={() => void verify()}>{t('lifecycleVerifyOperation')}</Button>{resumeReviewed && pendingSelectionKnown && read.kind === 'available' && <Button disabled={busy || disabled || !canManage} onClick={() => void submit(true)}>{t('lifecycleResumeOperation')}</Button>}</> : completed && !selectionValid ? <Button onClick={close}>{t('close')}</Button> : <Button disabled={busy || disabled || !canManage || !selectionValid} onClick={() => void submit()}>{t('lifecycleConfirmOperation')}</Button>}
            {!intent && <Button variant="secondary" disabled={busy} onClick={() => void load(scope, action)}>{t('lifecycleReadAgain')}</Button>}
          </div>
        </>}
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>
  </section>;
}
