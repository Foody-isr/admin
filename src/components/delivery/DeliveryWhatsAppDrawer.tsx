'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { MessageCircleIcon, RefreshCwIcon } from 'lucide-react';
import { Badge, Button, Drawer, EmptyState } from '@/components/ds';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ApiError, previewOrderWhatsApp, sendOrderWhatsApp, type OrderWhatsAppPreview } from '@/lib/api';
import type { DeliveryRoute } from '@/lib/delivery';
import { isOpenDeliveryRoute, isPendingDeliveryStop } from '@/lib/delivery-planning';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

interface Recipient { orderId: number; name: string }
interface Row extends Recipient { state: 'loading' | 'ready' | 'failed' | 'sending'; preview?: OrderWhatsAppPreview }

function sendable(row: Row): boolean {
  return row.state === 'ready' && row.preview?.status === 'ready' && !row.preview.send_blocked_reason;
}

/** Reviews server-rendered route reminders, then sends individually or for the selected date. */
export function DeliveryWhatsAppDrawer({ open, onOpenChange, restaurantId, date, routes, orderId }: {
  open: boolean; onOpenChange: (open: boolean) => void; restaurantId: number; date: string; routes: DeliveryRoute[]; orderId?: number;
}) {
  const { t, locale } = useI18n();
  const params = useParams();
  const { hasAnyPermission } = usePermissions();
  const allowed = Number(params.restaurantId) === restaurantId && hasAnyPermission('orders.manage');
  const recipients = useMemo(() => {
    const seen = new Set<number>();
    return routes.filter(route => route.date.slice(0, 10) === date && isOpenDeliveryRoute(route)).flatMap(route => route.stops)
      .filter(stop => isPendingDeliveryStop(stop) && (!orderId || orderId === stop.order_id) && !seen.has(stop.order_id) && Boolean(seen.add(stop.order_id)))
      .map(stop => ({ orderId: stop.order_id, name: stop.customer_name }));
  }, [routes, date, orderId]);
  const signature = useMemo(() => JSON.stringify([restaurantId, date, orderId, routes], (key, value) => key === 'route_geometry' ? undefined : value), [restaurantId, date, orderId, routes]);
  const currentSignature = useRef(signature);
  currentSignature.current = signature;
  const loadedSignature = useRef('');
  const alive = useRef(true);
  const generation = useRef(0);
  const controller = useRef<AbortController>();
  const sending = useRef(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const version = generation, abort = controller;
    alive.current = true;
    return () => { alive.current = false; ++version.current; abort.current?.abort(); };
  }, []);

  const prepare = async () => {
    if (!allowed || sending.current) return;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const version = ++generation.current;
    loadedSignature.current = currentSignature.current;
    setRows(recipients.map(recipient => ({ ...recipient, state: 'loading' })));
    setLoading(true); setStale(false); setConfirm(false);
    let next = 0;
    const worker = async () => {
      while (alive.current && generation.current === version && next < recipients.length) {
        const recipient = recipients[next++];
        try {
          const preview = await previewOrderWhatsApp(restaurantId, recipient.orderId, 'delivery_reminder', abort.signal);
          if (alive.current && generation.current === version) setRows(old => old.map(row => row.orderId === recipient.orderId ? { ...row, state: 'ready', preview } : row));
        } catch {
          if (alive.current && generation.current === version) setRows(old => old.map(row => row.orderId === recipient.orderId ? { ...row, state: 'failed' } : row));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, recipients.length) }, worker));
    if (alive.current && generation.current === version) setLoading(false);
  };
  const prepareRef = useRef(prepare); prepareRef.current = prepare;
  useEffect(() => {
    const version = generation, abort = controller, loaded = loadedSignature;
    if (open && allowed) void prepareRef.current();
    return () => { ++version.current; abort.current?.abort(); loaded.current = ''; };
  }, [open, allowed, restaurantId, date, orderId]);
  useEffect(() => {
    if (open && loadedSignature.current && loadedSignature.current !== signature) {
      ++generation.current; controller.current?.abort(); setLoading(false); setStale(true); setConfirm(false);
    }
  }, [open, signature]);

  const send = async (targets: Row[]) => {
    if (!allowed || sending.current || loading || stale || !targets.length || loadedSignature.current !== currentSignature.current) return;
    sending.current = true; setBusy(true); setConfirm(false);
    const reviewed = loadedSignature.current;
    try {
      for (const target of targets) {
        if (!alive.current || currentSignature.current !== reviewed) break;
        if (!sendable(target) || !target.preview) continue;
        setRows(old => old.map(row => row.orderId === target.orderId ? { ...row, state: 'sending' } : row));
        try {
          const result = await sendOrderWhatsApp(restaurantId, target.orderId, target.preview.id);
          if (alive.current) setRows(old => old.map(row => row.orderId === target.orderId && row.preview ? { ...row, state: 'ready', preview: { ...row.preview, status: result.status } } : row));
        } catch (error) {
          if (error instanceof ApiError && error.message === 'whatsapp_preview_changed') {
            if (alive.current) {
              setStale(true);
              setRows(old => old.map(row => row.orderId === target.orderId ? { ...row, state: 'ready' } : row));
            }
            break;
          }
          // A lost response may follow provider acceptance. Never retry it automatically.
          if (alive.current) setRows(old => old.map(row => row.orderId === target.orderId && row.preview ? { ...row, state: 'ready', preview: { ...row.preview, status: 'unknown' } } : row));
        }
      }
    } finally { sending.current = false; if (alive.current) setBusy(false); }
  };
  if (!allowed) return null;
  const ready = rows.filter(sendable);
  const groupSendLabel = ready.length === 1 ? t('deliveryWhatsAppSendSingle') : t('deliveryWhatsAppSendAll').replace('{count}', String(ready.length));
  const unavailable = rows.filter(row => row.state === 'failed').length;
  const labelDate = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(`${date}T12:00:00`));
  const statusLabels: Record<string, string> = { ready: 'deliveryWhatsAppReady', not_due: 'deliveryWhatsAppWaiting', sending: 'deliveryWhatsAppSending', accepted: 'deliveryWhatsAppAccepted', sent: 'deliveryWhatsAppSent', delivered: 'deliveryWhatsAppDelivered', read: 'deliveryWhatsAppRead', failed: 'deliveryWhatsAppFailed', unknown: 'deliveryWhatsAppUnknown' };
  return <>
    <Drawer open={open} onOpenChange={onOpenChange} closeDisabled={busy} title={t('deliveryWhatsAppTitle')} subtitle={labelDate} width={760}
      footer={<div className="flex flex-wrap items-center justify-between gap-3">
        <span role="status" className="text-fs-xs text-[var(--fg-muted)]">{t(busy ? 'deliveryWhatsAppSending' : loading ? 'loading' : 'deliveryWhatsAppSummary').replace('{ready}', String(ready.length)).replace('{total}', String(rows.length))}</span>
        <Button disabled={busy || loading || stale || !ready.length} onClick={() => orderId ? void send(ready) : setConfirm(true)}><MessageCircleIcon />{orderId ? t('deliveryWhatsAppSendOne') : groupSendLabel}</Button>
      </div>}>
      <div className="space-y-4">
        <p className="text-fs-sm leading-relaxed text-[var(--fg-muted)]">{t('deliveryWhatsAppIntro')}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {hasAnyPermission('settings.view', 'settings.edit') && <Link href={`/${restaurantId}/settings/orders/workflow`} className="text-fs-sm underline">{t('deliveryWhatsAppAutomatic')}</Link>}
          <Button variant="secondary" disabled={busy || loading} onClick={() => void prepare()}><RefreshCwIcon />{t('deliveryWhatsAppRefresh')}</Button>
        </div>
        {stale && <p role="alert" className="rounded-r-md bg-[var(--surface-2)] p-3 text-fs-sm">{t('deliveryWhatsAppStale')}</p>}
        {unavailable > 0 && <p role="alert" className="text-fs-sm text-[var(--warning-600)]">{t('deliveryWhatsAppUnavailable').replace('{count}', String(unavailable))}</p>}
        {!rows.length && !loading && <EmptyState icon={<MessageCircleIcon />} title={t('deliveryWhatsAppEmpty')} />}
        {rows.map((row, index) => {
          const preview = row.preview;
          const status = row.state === 'sending' ? 'sending' : preview?.send_blocked_reason === 'not_due' ? 'not_due' : preview?.previous_status ?? preview?.status;
          return <section key={row.orderId} aria-label={`${row.name} #${row.orderId}`} className="space-y-3 rounded-r-lg border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-fs-sm font-semibold">{row.name}</p><p className="text-fs-xs text-[var(--fg-muted)]">#{row.orderId}</p></div>
              {status && <Badge tone={['accepted', 'sent', 'delivered', 'read'].includes(status) ? 'success' : ['unknown', 'failed'].includes(status) ? 'warning' : 'neutral'}>{t(statusLabels[status] ?? 'deliveryWhatsAppUnknown')}</Badge>}
            </div>
            {row.state === 'loading' && <p role="status" className="text-fs-sm">{t('loading')}</p>}
            {row.state === 'failed' && <p className="text-fs-sm text-[var(--warning-600)]">{t('deliveryWhatsAppPreviewFailed')}</p>}
            {preview && <>
              {preview.send_blocked_reason && <p className="text-fs-sm text-[var(--fg-muted)]">{t(preview.send_blocked_reason === 'not_due' ? 'deliveryWhatsAppNotDue' : 'deliveryWhatsAppAlreadyAttempted')}</p>}
              {status === 'unknown' && <p className="text-fs-sm">{t('deliveryWhatsAppUnknownHint')}</p>}
              <p className="text-fs-xs text-[var(--fg-muted)]"><bdi dir="ltr">{preview.recipient}</bdi> · {preview.language.toUpperCase()} · {preview.provider === 'meta' ? 'WhatsApp Business' : 'Twilio'}</p>
              <details open={Boolean(orderId) || index === 0}>
                <summary className="min-h-11 cursor-pointer py-2 text-fs-sm font-medium">{t('deliveryWhatsAppPreview')}</summary>
                <textarea aria-label={t('deliveryWhatsAppPreviewFor').replace('{name}', row.name)} readOnly value={preview.message} dir={preview.language.startsWith('he') ? 'rtl' : 'ltr'} rows={7} className="w-full resize-y rounded-r-md border border-[var(--line)] bg-[var(--surface-2)] p-3 text-fs-sm leading-relaxed" />
                {preview.attachment && <p className="mt-2 text-fs-xs">{t('waAttachmentTitle')} · <bdi>{preview.attachment.filename}</bdi></p>}
              </details>
              {!orderId && sendable(row) && <Button variant="secondary" disabled={busy || loading || stale} onClick={() => void send([row])}>{t('deliveryWhatsAppSendOne')}</Button>}
            </>}
          </section>;
        })}
        <p className="text-fs-xs leading-relaxed text-[var(--fg-muted)]">{t('deliveryWhatsAppEvidence')}</p>
      </div>
    </Drawer>
    <AlertDialog open={confirm} onOpenChange={setConfirm}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{t('deliveryWhatsAppConfirmTitle')}</AlertDialogTitle><AlertDialogDescription>{t('deliveryWhatsAppConfirmBody').replace('{count}', String(ready.length)).replace('{date}', labelDate)}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{t('cancel')}</AlertDialogCancel><AlertDialogAction disabled={busy || stale || !ready.length} onClick={() => void send(ready)}>{groupSendLabel}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
