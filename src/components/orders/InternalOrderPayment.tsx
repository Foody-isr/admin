'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getOrder, payInternalCheckout, getInternalCheckoutCapabilities, type Order } from '@/lib/api';
import { useI18n, useCurrency } from '@/lib/i18n';
import { Button } from '@/components/ds';
import { usePermissions } from '@/lib/permissions-context';
import { eventOrderCopy } from '@/lib/orders/event-order-copy';
import { RUNTIME_WEB_URL } from '@/lib/runtime-origins';

/** Collects card details inside Sumit's hosted frame and trusts only API settlement. */
export function InternalOrderPayment({ restaurantId, orderId, receiptToken, onOrders, autoOpen = false }: {
  restaurantId: number; orderId: number; receiptToken: string; onOrders: () => void; autoOpen?: boolean;
}) {
  const { t,locale } = useI18n();
  const {money}=useCurrency();
  const [holdReview,setHoldReview]=useState<number|null>(null);
  const [holdConsent,setHoldConsent]=useState(false);
  const [deposit,setDeposit]=useState(false);
  const [hold,setHold]=useState(false);
  const [combined,setCombined]=useState(false);
  const [url, setURL] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url || paid || closed) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const order = await getOrder(restaurantId, orderId);
        if (stopped) return;
        if(order.event_config?.hold?.status==='verified'){setHold(true);setCombined(order.event_config.payment_mode==='deposit_hold');setPaid(true);return;}
        if(order.event_config?.payment_mode==='deposit_hold'&&order.payment_status==='partially_paid'&&(order.external_metadata?.internal_checkout as {phase?:string})?.phase==='hold_pending'){
          const remaining=order.total_amount-Number(order.external_metadata?.paid_amount??0);setHoldReview(Math.round((order.event_config.hold_type==='fixed'?(order.event_config.hold_value??0):remaining*(order.event_config.hold_value??100)/100)*100));setURL(null);setDeposit(true);setHoldConsent(false);return;
        }
        if(order.payment_status==='partially_paid'&&order.event_config?.finalized_at&&(order.external_metadata?.internal_checkout as {phase?:string})?.phase==='completed'){setDeposit(true);setPaid(true);return;}
        if (order.payment_status === 'paid') { setPaid(true); return; }
        if (['cancelled', 'rejected', 'refunded'].includes(order.status)) { setClosed(true); return; }
      } catch { if (!stopped) setError(true); }
      if (!stopped) timer = setTimeout(refresh, 3000);
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [restaurantId, orderId, url, paid, closed]);

  const openingRef = useRef(false);
  const startedRef = useRef(false);
  const openPayment = useCallback(async () => {
    if (openingRef.current) return;
    openingRef.current = true;
    setBusy(true); setError(false);
    try {
      const current=await getOrder(restaurantId,orderId);
      const mustHold=current.event_config?.payment_mode==='hold'||current.event_config?.payment_mode==='deposit_hold'&&current.payment_status==='partially_paid';
      const remaining=current.total_amount-Number(current.external_metadata?.paid_amount??0);
      const amount=Math.round((current.event_config?.hold_type==='fixed'?(current.event_config.hold_value??0):remaining*(current.event_config?.hold_value??100)/100)*100);
      if(mustHold&&(!holdConsent||holdReview!==amount)){setHoldReview(amount);setHoldConsent(false);return;}
      const result = await payInternalCheckout(restaurantId, orderId, receiptToken,current.event_config?.revision??0,mustHold?{authorize_hold:true,expected_hold_amount_minor:amount}:undefined);
      if(result.completed){setPaid(true);setHold(!!current.event_config?.hold);setCombined(current.event_config?.payment_mode==='deposit_hold');return;}
      const parsed = new URL(result.payment_url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port ||
        !(parsed.hostname === 'sumit.co.il' || parsed.hostname.endsWith('.sumit.co.il'))) throw new Error('Invalid payment URL');
      setURL(result.payment_url);
    } catch { setError(true); }
    finally { openingRef.current = false; setBusy(false); }
  }, [restaurantId, orderId, receiptToken, holdConsent, holdReview]);
  useEffect(() => {
    if (!autoOpen || startedRef.current) return;
    startedRef.current = true;
    void openPayment();
  }, [autoOpen, openPayment]);

  return <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-6">
    <h1 className="text-fs-xl font-semibold">{hold?(combined?eventOrderCopy[locale].depositHoldConfirmed:eventOrderCopy[locale].holdConfirmed):deposit?eventOrderCopy[locale].depositConfirmed:t(paid ? 'sumitPaymentConfirmed' : 'sumitAdminCard')}</h1>
    <p className="text-fs-sm text-[var(--fg-muted)]">{t('sumitAdminCardHint')}</p>
    <p className="text-fs-sm">{t('orderNumber').replace('{id}', String(orderId))}</p>
    {error && <p role="alert" className="text-[var(--danger-500)]">{t('sumitPaymentError')}</p>}
    {closed && <p role="status">{t('sumitCheckoutClosed')}</p>}
    {!paid&&!closed&&holdReview!==null&&<section className="space-y-3"><p className="text-fs-sm">{eventOrderCopy[locale].holdHint}</p><label className="flex gap-3 text-fs-sm"><input type="checkbox" checked={holdConsent} onChange={e=>setHoldConsent(e.target.checked)}/>{eventOrderCopy[locale].holdConsent.replace('{amount}',money(holdReview/100))}</label></section>}
    {!paid && !closed && !url && <Button onClick={openPayment} disabled={busy || holdReview!==null&&!holdConsent}>{busy?t('loading'):holdReview!==null?eventOrderCopy[locale].reserve:t('sumitOpenPayment')}</Button>}
    {!paid && !closed && url && <>
      <p role="status" className="text-fs-sm">{t('sumitAwaitingPayment')}</p>
      <iframe title={t('sumitAdminCard')} src={url} referrerPolicy="no-referrer" className="h-[650px] w-full rounded-lg border border-[var(--line)]" allow="payment" />
      <a href={url} target="_blank" rel="noopener noreferrer" className="underline">{t('sumitOpenNewTab')}</a>
    </>}
    <Button variant="secondary" onClick={onOrders}>{t('goToOrders')}</Button>
  </section>;
}


/** Recovers a prepared checkout from its saved order after navigation or a reload. */
export function PreparedCheckoutActions({ order }: { order: Order }) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const [enabled, setEnabled] = useState(false);
  const [paying, setPaying] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const state = order.external_metadata?.internal_checkout as { mode?: string; expires_at?: string } | undefined;
  const mode = state?.mode;
  const pending = (order.payment_status === 'pending' || !!order.event_config?.finalized_at && (order.event_config.payment_mode==='hold'||order.event_config.payment_mode==='deposit_hold') && order.event_config.hold?.status!=='verified') && !['cancelled', 'rejected', 'refunded'].includes(order.status);
  useEffect(() => {
    let stopped = false;
    setEnabled(false);
    if (pending && mode) getInternalCheckoutCapabilities(order.restaurant_id).then(result => {
      if (!stopped) setEnabled(result.enabled === true);
    }).catch(() => { if (!stopped) setEnabled(false); });
    return () => { stopped = true; };
  }, [order.restaurant_id, mode, pending]);
  if (!mode || !pending || !enabled || !order.receipt_token || !hasAnyPermission('orders.manage')) return null;
  if (state?.expires_at && Date.parse(state.expires_at) <= Date.now()) return <p>{t('sumitCheckoutClosed')}</p>;
  if (mode === 'card') {
    if (!hasAnyPermission('payments.manage')) return null;
    return paying ? <InternalOrderPayment restaurantId={order.restaurant_id} orderId={order.id} receiptToken={order.receipt_token} onOrders={() => setPaying(false)} />
      : <Button variant="secondary" onClick={() => setPaying(true)}>{t('sumitOpenPayment')}</Button>;
  }
  async function copyLink() {
    const query = new URLSearchParams({ t: order.receipt_token || '' });
    const url = `${RUNTIME_WEB_URL.replace(/\/$/, '')}/r/${order.restaurant_id}/payment/checkout/${order.id}?${query}`;
    setLink(url);
    try { await navigator.clipboard.writeText(url); } catch { /* The complete link stays selectable below. */ }
  }
  return <div className="mt-3 flex flex-col gap-2"><Button variant="secondary" onClick={copyLink}>{t('sumitCustomerLink')}</Button>{link && <p className="break-all select-all text-fs-xs">{link}</p>}</div>;
}
