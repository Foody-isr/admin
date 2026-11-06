'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ApiError, closeLoyaltyCheckout, getLoyaltyCheckout, getStoredUser, type LoyaltyCheckoutDetail, type LoyaltyCloseInput } from '@/lib/api';
import { canCloseLoyaltyCheckout, clearLoyaltyCommand, readLoyaltyCommand, saveLoyaltyCommand, validLoyaltyCloseReason } from '@/lib/loyalty-checkout';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, ConfirmDialog, Drawer, Field, Input } from '@/components/ds';
import { loyaltyAmount, loyaltyLoadError, loyaltyPaymentLabel, loyaltyRewardLabel } from './display';

/** Inspect a fresh snapshot, then retain the exact command through uncertain outcomes. */
export default function LoyaltyCheckoutDetailDrawer({ rid, actor, oid, onClose, onResolved }: { rid: number; actor: number; oid: number; onClose: () => void; onResolved: () => void }) {
  const { t, locale } = useI18n();
  const scope = { restaurant: rid, actor, order: oid };
  const [view, setView] = useState<LoyaltyCheckoutDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState<LoyaltyCloseInput | null>(null);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const lifetime = useRef({ generation: 0, sequence: 0 });
  const lock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    const generation = lifetime.current.generation, sequence = ++lifetime.current.sequence;
    const current = () => generation === lifetime.current.generation && sequence === lifetime.current.sequence;
    setLoading(true); setError('');
    try {
      const latest = await getLoyaltyCheckout(rid, oid, request.signal);
      if (current()) setView(latest);
    } catch (failure) { if (current() && !request.signal.aborted) { setView(null); setError(loyaltyLoadError(failure)); } }
    finally { if (current()) setLoading(false); }
  }, [rid, oid]);
  useEffect(() => {
    const state = lifetime.current; state.generation++;
    try { const stored = readLoyaltyCommand(sessionStorage, { restaurant: rid, actor, order: oid }); setSaved(stored); setReason(stored?.reason ?? ''); }
    catch { setStorageBlocked(true); }
    void load();
    return () => { state.generation++; controller.current?.abort(); };
  }, [load, rid, actor, oid]);
  useEffect(() => { const guard = (event: BeforeUnloadEvent) => { if (lock.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard); }, []);
  const terminal = view?.next_step === 'none' && ['closed', 'settled'].includes(view.reason_code ?? '');
  const otherRequest = !!view?.latest_request && view.latest_request.status === 'pending' && !saved;
  const allowed = !!view?.can_request_close && (canCloseLoyaltyCheckout(view) || !!saved && terminal) && !otherRequest;
  const submit = async () => {
    if (!view || !allowed || loading || storageBlocked || lock.current || (!saved && !validLoyaltyCloseReason(reason))) return;
    try { if (getStoredUser()?.id !== actor) { setError('loyaltyCheckoutForbidden'); return; } }
    catch { setError('loyaltyCheckoutForbidden'); return; }
    lock.current = true; setBusy(true); setConfirm(false); setError(''); setNotice('');
    const generation = lifetime.current.generation, current = () => generation === lifetime.current.generation;
    let input: LoyaltyCloseInput;
    try {
      input = saveLoyaltyCommand(sessionStorage, scope, saved ?? { request_id: crypto.randomUUID(), expected_revision: view.revision, reason });
      setSaved(input);
    } catch { lock.current = false; setBusy(false); setStorageBlocked(true); return; }
    try {
      const result = await closeLoyaltyCheckout(rid, oid, input);
      if (!current()) return;
      if (result.state) {
        setNotice(result.state === 'closed' ? 'loyaltyCheckoutClosed' : 'loyaltyCheckoutSettled');
        try { clearLoyaltyCommand(sessionStorage, scope, input.request_id); setSaved(null); }
        catch { setStorageBlocked(true); }
        onResolved();
      } else setNotice('loyaltyCheckoutPendingBody');
      await load();
    } catch (failure) {
      if (!current()) return;
      setError(failure instanceof ApiError && failure.status === 403 ? 'loyaltyCheckoutForbidden' : 'loyaltyCheckoutUncertain');
      try {
        const latest = await getLoyaltyCheckout(rid, oid);
        if (!current()) return;
        setView(latest);
        // A definitive 409 followed by no journal entry proves this first input
        // was rejected before acceptance. A new request still needs a new review.
        if (failure instanceof ApiError && failure.status === 409 && !latest.latest_request) {
          clearLoyaltyCommand(sessionStorage, scope, input.request_id); setSaved(null); setError(''); setNotice('loyaltyCheckoutStale');
        }
      } catch (readFailure) {
        if (current()) {
          if (readFailure instanceof ApiError && readFailure.status === 403) { setView(null); setError('loyaltyCheckoutForbidden'); }
          else if (readFailure instanceof Error && readFailure.message === 'loyalty_journal_unavailable') setStorageBlocked(true);
          else setError('loyaltyCheckoutUncertain');
        }
      }
    } finally { if (current()) { lock.current = false; setBusy(false); } }
  };
  return <>
    <Drawer open onOpenChange={open => { if (!open && !lock.current) onClose(); }} closeDisabled={busy} width={560} title={t('loyaltyCheckoutDetail').replace('{id}', String(oid))} subtitle={t('loyaltyCheckoutTitle')} footer={<div className="flex flex-wrap justify-between gap-3"><Button variant="secondary" disabled={busy || loading} onClick={() => void load()}><RefreshCw aria-hidden="true" />{t('loyaltyCheckoutRefresh')}</Button>{allowed && <Button variant="danger" disabled={busy || loading || storageBlocked || (!saved && !validLoyaltyCloseReason(reason))} onClick={() => setConfirm(true)}>{t(busy ? 'loyaltyCheckoutSending' : saved ? 'loyaltyCheckoutResume' : 'loyaltyCheckoutClose')}</Button>}</div>}>
      <div className="space-y-6">
        {loading && !view && <p role="status" className="text-sm text-[var(--fg-muted)]">{t('loading')}</p>}
        {notice && <p role="status" className="border-s-2 border-[var(--info-500)] ps-4 text-sm leading-6">{t(notice)}</p>}
        {error && <p role="alert" className="border-s-2 border-[var(--warning-500)] ps-4 text-sm leading-6">{t(error)}</p>}
        {storageBlocked && <p role="alert" className="text-sm leading-6 text-[var(--danger-500)]">{t('loyaltyCheckoutStorageError')}</p>}
        {view && <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-[var(--line)] pb-6 text-sm">
            <div><dt className="mb-2 text-[var(--fg-muted)]">{t('loyaltyCheckoutPayment')}</dt><dd><Badge tone={view.payment_state === 'paid' ? 'success' : 'neutral'} className="whitespace-normal">{t(loyaltyPaymentLabel(view.payment_state))}</Badge></dd></div>
            <div><dt className="mb-2 text-[var(--fg-muted)]">{t('loyaltyCheckoutReward')}</dt><dd>{t(loyaltyRewardLabel(view.reward_state))}</dd></div>
            <div className="col-span-2"><dt className="mb-2 text-[var(--fg-muted)]">{t('loyaltyCheckoutAmount')}</dt><dd className="text-2xl font-semibold tabular-nums"><bdi>{loyaltyAmount(view, t('loyaltyCheckoutUnknownAmount'))}</bdi></dd></div>
          </dl>
          <p className="max-w-[60ch] text-sm leading-6 text-[var(--fg-muted)]">{t(terminal ? view.reason_code === 'closed' ? 'loyaltyCheckoutClosed' : 'loyaltyCheckoutSettled' : view.next_step === 'review' ? 'loyaltyCheckoutBlocked' : 'loyaltyCheckoutHeld')}</p>
          {!view.can_request_close && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('loyaltyCheckoutReadOnly')}</p>}
          {view.latest_request && <div className="space-y-1 text-sm"><p className="font-medium">{t(view.latest_request.status === 'pending' ? 'loyaltyCheckoutRequestPending' : 'loyaltyCheckoutRequestDone')}</p><p className="text-[var(--fg-muted)]">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(view.latest_request.updated_at))}</p></div>}
          {otherRequest && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('loyaltyCheckoutOtherRequest')}</p>}
          {allowed && <Field label={t('loyaltyCheckoutReason')} hint={<span id={`loyalty-reason-hint-${oid}`}>{saved ? t('loyaltyCheckoutStored') : t('loyaltyCheckoutReasonHint')}</span>}><Input aria-label={t('loyaltyCheckoutReason')} aria-describedby={`loyalty-reason-hint-${oid}`} value={reason} onChange={event => setReason(event.target.value)} disabled={busy || !!saved} /></Field>}
        </>}
      </div>
    </Drawer>
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={t('loyaltyCheckoutConfirmTitle')} description={t('loyaltyCheckoutConfirmBody')} confirmLabel={t(saved ? 'loyaltyCheckoutResume' : 'loyaltyCheckoutConfirm')} cancelLabel={t('cancel')} danger onConfirm={() => void submit()} />
  </>;
}
