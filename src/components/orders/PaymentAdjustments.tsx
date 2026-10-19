'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { adjustmentMinor } from '@/lib/orders/payment-adjustments';
import {
  ApiError, createOrderPaymentAdjustment, getOrderPaymentAdjustments, refreshOrderPaymentAdjustment,
  type Order, type PaymentAdjustmentSummary,
} from '@/lib/api';

/** Staff-only refund/void controls. Provider uncertainty never offers a retry debit. */
export function PaymentAdjustments({ order }: { order: Order }) {
  const { t, locale, direction } = useI18n();
  const { hasPermission } = usePermissions();
  // The API checks the effective restaurant role; display names can be localized
  // or renamed and must never serve as authorization evidence in the browser.
  const allowed = hasPermission('payments.manage');
  const [view, setView] = useState<PaymentAdjustmentSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<'refund' | 'void' | null>(null);
  const [partial, setPartial] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const commandID = useRef<string | null>(null);
  const scope = `${order.restaurant_id}:${order.id}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await getOrderPaymentAdjustments(order.restaurant_id, order.id);
      if (currentScope.current !== scope) return;
      setView(next); setError('');
      const acknowledged = next.operations.find(op => op.id === commandID.current);
      if (acknowledged?.state === 'succeeded' || acknowledged?.state === 'declined') {
        setUncertain(false);
      }
    } catch (err) {
      if (currentScope.current !== scope) return;
      setView(null);
      setError(err instanceof ApiError && (err.status === 403 || err.message === 'payment_adjustment_unsupported') ? '' : 'payment_adjustment_verification_required');
    } finally { if (currentScope.current === scope) setLoading(false); }
  }, [order.restaurant_id, order.id, scope]);

  useEffect(() => {
    setView(null); setError(''); setKind(null); setUncertain(false); commandID.current = null;
    if (allowed) void load();
  }, [allowed, load]);

  if (!allowed) return null;
  const money = (minor: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: view?.currency || 'ILS' }).format(minor / 100);
  const open = (next: 'refund' | 'void') => {
    commandID.current = null; setKind(next); setPartial(false); setReason(''); setAmount(''); setUncertain(false); setError('');
  };
  const minor = kind === 'void' ? view?.paid_minor : partial ? adjustmentMinor(amount) : view?.remaining_minor;
  const valid = Boolean(minor && view && (kind === 'refund' ? view.can_refund : view.can_void) && minor <= view.remaining_minor && reason.trim().length >= 3 && reason.length <= 300);
  const submit = async () => {
    if (!view || !kind || !valid || !minor || busy || uncertain) return;
    setBusy(true); setError('');
    commandID.current ??= crypto.randomUUID();
    try {
      const op = await createOrderPaymentAdjustment(order.restaurant_id, order.id, { request_id: commandID.current, kind, amount_minor: minor, reason: reason.trim() });
      if (currentScope.current !== scope) return;
      setKind(null);
      await load();
      if (op.state === 'unknown' || op.state === 'processing') setError('payment_adjustment_pending');
    } catch (err) {
      if (currentScope.current !== scope) return;
      const rejectedBeforeClaim = err instanceof ApiError && ['payment_adjustment_invalid', 'payment_adjustment_unavailable', 'payment_adjustment_unsupported'].includes(err.message);
      if (rejectedBeforeClaim) {
        commandID.current = null;
        await load();
        setError(err.message);
        return;
      }
      // Never offer a replacement UUID after an unacknowledged submission.
      setUncertain(true);
      setError(err instanceof ApiError && err.message.startsWith('payment_adjustment_') ? err.message : 'payment_adjustment_pending');
      await load();
      // load() does not prove a lost operation never happened.
      setError('payment_adjustment_pending');
    } finally { if (currentScope.current === scope) setBusy(false); }
  };
  const refresh = async () => {
    setBusy(true);
    try {
      for (const op of view?.operations ?? []) {
        if (op.state === 'processing' || op.state === 'unknown') await refreshOrderPaymentAdjustment(order.restaurant_id, order.id, op.id);
      }
      await load();
    } catch { setError('payment_adjustment_verification_required'); }
    finally { setBusy(false); }
  };
  if (!view?.supported && !error && !loading) return null;
  return (
    <section className="border-t border-[var(--line)] pt-4 space-y-3" aria-label={t('adjustmentTitle')}>
      <h4 className="font-semibold">{t('adjustmentTitle')}</h4>
      <p className="text-fs-xs text-[var(--fg-muted)]">{t('adjustmentIntro')}</p>
      {loading && <p role="status">{t('adjustmentLoading')}</p>}
      {view?.supported && <>
        {view.settlement_state === 'unsettled' && view.can_void && <p className="text-fs-sm" role="status">{t('adjustmentUnsettled')}</p>}
        {view.paid_minor > 0 &&
        <dl className="grid grid-cols-[1fr_auto] gap-2 text-fs-sm">
          <dt>{t('adjustmentRefunded')}</dt><dd className="tabular-nums">{money(view.refunded_minor)}</dd>
          <dt>{t(view.can_void ? 'adjustmentVoidable' : view.can_refund ? 'adjustmentRemaining' : 'adjustmentBalance')}</dt><dd className="font-semibold tabular-nums">{money(view.remaining_minor)}</dd>
        </dl>}
        <div className="flex flex-wrap gap-2">
          {view.can_refund && <Button variant="secondary" disabled={busy || loading || uncertain} onClick={() => open('refund')}>{t('adjustmentRefund')}</Button>}
          {view.can_void && <Button variant="secondary" disabled={busy || loading || uncertain} onClick={() => open('void')}>{t('adjustmentVoid')}</Button>}
        </div>
        <p className="text-fs-xs text-[var(--fg-muted)]">{t('adjustmentVoidNote')}</p>
        {view.operations.length > 0 && <div className="space-y-2">
          <h5 className="text-fs-sm font-medium">{t('adjustmentHistory')}</h5>
          {view.operations.map(op => <div key={op.id} className="border-t border-[var(--line)] pt-2 text-fs-xs space-y-1">
            <p className="flex justify-between gap-2"><span>{t(op.kind === 'void' ? 'adjustmentVoid' : 'adjustmentRefund')}</span><span className="tabular-nums">{money(op.amount_minor)}</span></p>
            <p>{t(op.state === 'succeeded' ? 'adjustmentSucceeded' : op.state === 'declined' ? 'adjustmentDeclined' : 'adjustmentUnknown')}</p>
            <p className="text-[var(--fg-muted)]">{new Date(op.created_at).toLocaleString(locale)} · {t('staff')} #{op.actor_user_id} · {op.reason}</p>
            {op.provider_transaction_id && <p className="break-all font-mono" dir="ltr">{op.provider_transaction_id}</p>}
          </div>)}
        </div>}
      </>}
      {(error || view?.blocked_reason) && <p role="alert" className="text-fs-sm">{t(error || view!.blocked_reason!)}</p>}
      <Button variant="ghost" disabled={busy || loading} onClick={() => void refresh()}>{t('adjustmentRefresh')}</Button>
      {!!view?.operations.some(op => op.state === 'succeeded') && <p className="text-fs-xs text-[var(--fg-muted)]">{t('adjustmentInvoice')}</p>}
      <Dialog.Root open={kind !== null} onOpenChange={v => { if (!v && !busy) setKind(null); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55" />
          <Dialog.Content dir={direction} className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-[min(440px,calc(100vw-32px))] max-h-[90dvh] overflow-y-auto rounded-r-lg border border-[var(--line)] bg-[var(--bg)] p-5 text-[var(--fg)] shadow-3">
            <Dialog.Title className="text-fs-lg font-semibold">{t(kind === 'void' ? 'adjustmentVoid' : 'adjustmentRefund')}</Dialog.Title>
            <Dialog.Description className="mt-3 text-fs-sm text-[var(--fg-muted)]">{t('adjustmentWarning')}</Dialog.Description>
            <p className="my-4 text-2xl font-semibold tabular-nums">{minor ? money(minor) : '—'}</p>
            {kind === 'refund' && <fieldset disabled={busy || uncertain} className="space-y-3 mb-4">
              <legend className="sr-only">{t('adjustmentAmount')}</legend>
              <label className="flex gap-2"><input type="radio" name={`refund-${scope}`} checked={!partial} onChange={() => setPartial(false)} />{t('adjustmentFull')}</label>
              <label className="flex gap-2"><input type="radio" name={`refund-${scope}`} checked={partial} onChange={() => setPartial(true)} />{t('adjustmentPartial')}</label>
              {partial && <label className="block">{t('adjustmentAmount')}<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1 w-full border border-[var(--line)] rounded-r-md bg-[var(--bg)] px-3 py-2" /></label>}
            </fieldset>}
            <label className="block text-fs-sm">{t('adjustmentReason')}<textarea disabled={busy || uncertain} value={reason} maxLength={300} onChange={e => setReason(e.target.value)} rows={3} className="mt-1 w-full border border-[var(--line)] rounded-r-md bg-[var(--bg)] px-3 py-2" /></label>
            {error && <p role="alert" className="mt-3 text-fs-sm">{t(error)}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" disabled={busy} onClick={() => setKind(null)}>{t('close')}</Button>
              <Button variant="primary" disabled={!valid || busy || uncertain} onClick={() => void submit()}>{t(busy ? 'adjustmentBusy' : 'adjustmentConfirm')}</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
}
