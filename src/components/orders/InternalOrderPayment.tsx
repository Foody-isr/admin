'use client';

import { useEffect, useState } from 'react';
import { getOrder, payInternalCheckout, getInternalCheckoutCapabilities, type Order } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ds';
import { usePermissions } from '@/lib/permissions-context';
import { RUNTIME_WEB_URL } from '@/lib/runtime-origins';

/** Collects card details inside Sumit's hosted frame and trusts only API settlement. */
export function InternalOrderPayment({ restaurantId, orderId, receiptToken, onOrders }: {
  restaurantId: number; orderId: number; receiptToken: string; onOrders: () => void;
}) {
  const { t } = useI18n();
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
        if (order.payment_status === 'paid') { setPaid(true); return; }
        if (['cancelled', 'rejected', 'refunded'].includes(order.status)) { setClosed(true); return; }
      } catch { if (!stopped) setError(true); }
      if (!stopped) timer = setTimeout(refresh, 3000);
    }
    void refresh();
    return () => { stopped = true; clearTimeout(timer); };
  }, [restaurantId, orderId, url, paid, closed]);

  async function openPayment() {
    setBusy(true); setError(false);
    try {
      const result = await payInternalCheckout(restaurantId, orderId, receiptToken);
      const parsed = new URL(result.payment_url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port ||
        !(parsed.hostname === 'sumit.co.il' || parsed.hostname.endsWith('.sumit.co.il'))) throw new Error('Invalid payment URL');
      setURL(result.payment_url);
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  return <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-6">
    <h1 className="text-fs-xl font-semibold">{t(paid ? 'sumitPaymentConfirmed' : 'sumitAdminCard')}</h1>
    <p className="text-fs-sm text-[var(--fg-muted)]">{t('sumitAdminCardHint')}</p>
    <p className="text-fs-sm">{t('order')} #{orderId}</p>
    {error && <p role="alert" className="text-[var(--danger-500)]">{t('sumitPaymentError')}</p>}
    {closed && <p role="status">{t('sumitCheckoutClosed')}</p>}
    {!paid && !closed && !url && <Button onClick={openPayment} disabled={busy}>{t(busy ? 'loading' : 'sumitOpenPayment')}</Button>}
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
  const pending = order.payment_status === 'pending' && !['cancelled', 'rejected', 'refunded'].includes(order.status);
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
    const url = `${RUNTIME_WEB_URL.replace(/\/$/, '')}/r/${order.restaurant_id}/checkout/${order.id}?${query}`;
    setLink(url);
    try { await navigator.clipboard.writeText(url); } catch { /* The complete link stays selectable below. */ }
  }
  return <div className="mt-3 flex flex-col gap-2"><Button variant="secondary" onClick={copyLink}>{t('sumitCustomerLink')}</Button>{link && <p className="break-all select-all text-fs-xs">{link}</p>}</div>;
}
