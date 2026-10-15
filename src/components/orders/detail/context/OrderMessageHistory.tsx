'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CheckCheckIcon, MessageCircleIcon, RefreshCwIcon } from 'lucide-react';
import { Badge, Button } from '@/components/ds';
import { getOrderWhatsAppHistory, type OrderWhatsAppHistoryEntry } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

/** Read-only order communication history. Only recorded provider evidence produces a delivery/read label. */
export function OrderMessageHistory({ restaurantId, orderId }: { restaurantId: number; orderId: number }) {
  const { t, locale } = useI18n();
  const params = useParams();
  const { hasAnyPermission } = usePermissions();
  const scoped = Number(params.restaurantId) === restaurantId;
  const allowed = scoped && hasAnyPermission('orders.view', 'orders.manage');
  const [messages, setMessages] = useState<OrderWhatsAppHistoryEntry[]>([]);
  const [cursor, setCursor] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef(0);
  const lifetime = useRef({ active: true });
  const inFlight = useRef(false);

  const load = useCallback(async (mode: 'replace' | 'more' | 'poll' = 'replace', before?: string) => {
    if (!allowed || inFlight.current) return;
    const version = ++request.current;
    const generation = lifetime.current;
    inFlight.current = true;
    setBusy(true);
    try {
      const data = await getOrderWhatsAppHistory(restaurantId, orderId, before);
      if (!generation.active || request.current !== version) return;
      setMessages(old => {
        if (mode === 'replace') return data.messages;
        const combined = mode === 'more' ? [...old, ...data.messages] : [...data.messages, ...old];
        return Array.from(new Map(combined.map(row => [row.id, row])).values()).map(row => data.messages.find(fresh => fresh.id === row.id) ?? row);
      });
      if (mode !== 'poll') setCursor(data.next_cursor);
      setLoaded(true); setError(false);
    } catch {
      if (generation.active && request.current === version) setError(true);
    } finally {
      if (generation.active && request.current === version) { inFlight.current = false; setBusy(false); }
    }
  }, [allowed, restaurantId, orderId]);

  useEffect(() => {
    const generation = { active: true };
    lifetime.current = generation;
    setMessages([]); setCursor(''); setLoaded(false); setError(false);
    inFlight.current = false;
    void load();
    return () => { generation.active = false; };
  }, [load]);

  useEffect(() => {
    if (!allowed || !loaded || error) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load('poll');
    }, 10000);
    return () => clearInterval(timer);
  }, [allowed, loaded, error, load]);

  const kindLabels: Record<string, string> = {
    order_recap: t('waPersonalRecap'), delivery_reminder: t('waPersonalReminder'),
    order_status: t('waPersonalReady'), receipt: t('waPersonalReceipt'), satisfaction: t('waSatisfactionTitle'),
  };
  const statusLabels: Record<string, string> = {
    accepted: t('orderMessageAccepted'), sent: t('orderMessageSent'), delivered: t('orderMessageDelivered'),
    read: t('orderMessageRead'), failed: t('orderMessageFailed'), unknown: t('orderMessageUnknown'), sending: t('orderMessageSending'),
  };
  const dateLabel = (at: string) => {
    const date = new Date(at);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (!allowed) return <p role="alert" className="text-sm text-[var(--fg-muted)]">{t('orderMessagesForbidden')}</p>;

  return <section aria-label={t('orderMessagesTitle')} className="space-y-5">
    <div className="flex items-start justify-between gap-3">
      <p className="max-w-prose text-sm leading-6 text-[var(--fg-muted)]">{t('orderMessagesIntro')}</p>
      <Button type="button" variant="ghost" icon size="sm" disabled={busy} aria-label={t('orderMessagesRefresh')} onClick={() => void load()}><RefreshCwIcon className={busy ? 'animate-spin motion-reduce:animate-none' : ''} /></Button>
    </div>
    {error && <div role="alert" className="text-sm leading-6 text-[var(--danger-500)]">{t('orderMessagesError')}<Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void load()}>{t('retry')}</Button></div>}
    {!loaded && !error && <p role="status" className="py-5 text-sm text-[var(--fg-muted)]">{t('loading')}</p>}
    {loaded && messages.length === 0 && <div className="flex gap-3 border-y border-[var(--line)] py-6">
      <MessageCircleIcon aria-hidden className="mt-1 size-5 shrink-0 text-[var(--fg-subtle)]" />
      <div><p className="text-sm font-semibold">{t('orderMessagesEmpty')}</p><p className="mt-1 text-sm leading-6 text-[var(--fg-muted)]">{t('orderMessagesEmptyHint')}</p></div>
    </div>}
    {messages.length > 0 && <ol className="divide-y divide-[var(--line)] border-y border-[var(--line)]" aria-live="polite" aria-busy={busy}>
      {messages.map(row => <li key={row.id} className="py-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 text-sm font-semibold">{kindLabels[row.kind] ?? t('whatsapp')}</p>
          <Badge tone={row.status === 'failed' ? 'danger' : ['delivered', 'read'].includes(row.status) ? 'success' : 'neutral'}>
            {['delivered', 'read'].includes(row.status) && <CheckCheckIcon aria-hidden className="size-3.5" />}
            {statusLabels[row.status] ?? t('orderMessageUnknown')}
          </Badge>
        </div>
        <p className="mt-2 text-xs text-[var(--fg-muted)]">{row.provider === 'meta' ? 'WhatsApp · Meta' : 'WhatsApp · Twilio'}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--fg-muted)]">{t(row.status_at ? 'orderMessageStatusAt' : 'orderMessageUpdatedAt')} <time dateTime={row.status_at ?? row.updated_at}>{dateLabel(row.status_at ?? row.updated_at)}</time></p>
        {row.status === 'accepted' && <p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">{t(row.provider === 'meta' ? 'orderMessageAcceptedHint' : 'orderMessageTwilioHint')}</p>}
        {['unknown', 'sending'].includes(row.status) && <p className="mt-2 text-sm leading-6 text-[var(--fg-muted)]">{t('orderMessageUnknownHint')}</p>}
        {row.status === 'failed' && !!row.failure_code && <p className="mt-2 text-xs text-[var(--fg-muted)]">{t('orderMessageFailureCode').replace('{code}', String(row.failure_code))}</p>}
      </li>)}
    </ol>}
    {cursor && <Button type="button" variant="secondary" disabled={busy} onClick={() => void load('more', cursor)}>{t('orderMessagesMore')}</Button>}
    <div className="space-y-3">
      <p className="text-xs leading-5 text-[var(--fg-muted)]">{t('orderMessagesScope')}</p>
      {hasAnyPermission('settings.view', 'settings.edit') && <Link className="inline-block text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:shadow-ring" href={`/${restaurantId}/settings/whatsapp`}>{t('orderMessagesConfigure')}</Link>}
    </div>
  </section>;
}
