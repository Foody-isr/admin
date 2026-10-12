'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ds';
import { previewOrderWhatsApp, sendOrderWhatsApp, type OrderWhatsAppPreview } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

/** Reviews the actual Twilio template separately from the editable manual WhatsApp message. */
export function OrderTwilioMessage({ restaurantId, orderId, kind }: {
  restaurantId: number; orderId: number; kind: OrderWhatsAppPreview['kind'];
}) {
  const { t } = useI18n();
  const params = useParams();
  const activeRestaurantId = Number(params.restaurantId);
  const { hasAnyPermission } = usePermissions();
  const [preview, setPreview] = useState<OrderWhatsAppPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lifetime = useRef({ active: true });
  const lock = useRef(false);
  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    setPreview(null); setError('');
    return () => { current.active = false; };
  }, [restaurantId, orderId, kind]);
  if (activeRestaurantId !== restaurantId || !hasAnyPermission('orders.manage')) return null;

  const prepare = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const generation = lifetime.current;
    try {
      const row = await previewOrderWhatsApp(restaurantId, orderId, kind);
      if (generation.active) setPreview(row);
    } catch { if (generation.active) { setPreview(null); setError(t('waOrderPreviewFailed')); } }
    finally { lock.current = false; if (generation.active) setBusy(false); }
  };
  const send = async () => {
    if (!preview || preview.status !== 'ready' || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    const generation = lifetime.current;
    try {
      const result = await sendOrderWhatsApp(restaurantId, orderId, preview.id);
      if (generation.active) setPreview({ ...preview, status: result.status });
    } catch {
      if (generation.active) { setPreview({ ...preview, status: 'unknown' }); setError(t('waOrderSendUnknown')); }
    } finally { lock.current = false; if (generation.active) setBusy(false); }
  };
  return <section aria-label={t('waOrderTwilio')} className="mt-5 space-y-3 rounded-r-md border border-[var(--line)] p-3">
    <p className="font-semibold text-sm">{t('waOrderTwilio')}</p>
    <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('waOrderTwilioHint')}</p>
    {kind === 'delivery_reminder' && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('waOrderReminderTomorrowHint')}</p>}
    {error && <p role="alert" className="text-sm leading-6 text-[var(--danger-500)]">{error}</p>}
    {preview && <>
      <p className="text-sm break-words"><span>{t('waOrderFrom')}: <bdi dir="ltr">{preview.from}</bdi></span><br /><span>{t('waOrderTo')}: <bdi dir="ltr">{preview.recipient}</bdi></span><br /><span>{t('whatsappRecapLanguage')}: {preview.language.toUpperCase()}</span></p>
      <textarea aria-label={t('waOrderExactPreview')} readOnly value={preview.message} dir={preview.language === 'he' ? 'rtl' : 'ltr'} rows={10} className="w-full rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm leading-6" />
      {preview.status === 'accepted' && <p role="status" className="text-sm">{t('waOrderAccepted')}</p>}
      {(preview.status === 'unknown' || preview.status === 'sending') && <p role="status" className="text-sm leading-6">{t('waOrderSendUnknown')}</p>}
    </>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void prepare()}>{t(busy ? 'loading' : preview ? 'waOrderRefresh' : 'waOrderPrepare')}</Button>
      {preview?.status === 'ready' && <Button type="button" disabled={busy} onClick={() => void send()}>{t('waOrderConfirmSend')}</Button>}
    </div>
  </section>;
}
