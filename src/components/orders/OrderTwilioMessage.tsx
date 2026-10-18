'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ds';
import { getOrderWhatsAppStatus, getWhatsAppMediaFile, getWhatsAppReceiptFile, previewOrderWhatsApp, sendOrderWhatsApp, type OrderWhatsAppPreview } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';

/** Reviews the active provider's approved template separately from the editable manual WhatsApp message. */
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
  const [trackingError, setTrackingError] = useState(false);
  const lifetime = useRef({ active: true });
  const lock = useRef(false);
  useEffect(() => {
    const current = { active: true };
    lifetime.current = current;
    setPreview(null); setError(''); setTrackingError(false);
    return () => { current.active = false; };
  }, [restaurantId, orderId, kind]);
  useEffect(() => {
    if (activeRestaurantId !== restaurantId || !hasAnyPermission('orders.manage') || preview?.provider !== 'meta' || !['accepted', 'sent', 'sending', 'unknown'].includes(preview.status)) return;
    const generation = lifetime.current, id = preview.id;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const row = await getOrderWhatsAppStatus(restaurantId, orderId, id);
        if (!cancelled && generation.active) { setPreview(old => old?.id === id ? { ...old, status: row.status } : old); setTrackingError(false); if (['accepted', 'sent', 'delivered', 'read'].includes(row.status)) setError(''); }
      } catch { if (!cancelled && generation.active) setTrackingError(true); }
    }, 10000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeRestaurantId, restaurantId, orderId, preview, hasAnyPermission]);
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
      if (generation.active) { setPreview({ ...preview, status: 'unknown' }); setError(t(preview.provider === 'meta' ? 'waMetaUnknown' : 'waOrderSendUnknown')); }
    } finally { lock.current = false; if (generation.active) setBusy(false); }
  };
  const refreshTracking = async () => {
    if (!preview || preview.provider !== 'meta' || lock.current) return;
    const generation = lifetime.current, id = preview.id;
    lock.current = true; setBusy(true); setTrackingError(false);
    try {
      const row = await getOrderWhatsAppStatus(restaurantId, orderId, id);
      if (generation.active) { setPreview(old => old?.id === id ? { ...old, status: row.status } : old); if (['accepted', 'sent', 'delivered', 'read'].includes(row.status)) setError(''); }
    } catch { if (generation.active) setTrackingError(true); }
    finally { lock.current = false; if (generation.active) setBusy(false); }
  };
  const previewAttachment=async()=>{
   const attachment=preview?.attachment;if(!attachment || lock.current)return;
   const tab=window.open('about:blank','_blank');if(!tab){setError(t('waAttachmentPreviewFailed'));return}tab.opener=null;
   const generation=lifetime.current;lock.current=true;setBusy(true);setError('');
   try{const blob=attachment.source==='receipt'?await getWhatsAppReceiptFile(restaurantId,orderId,preview.language):await getWhatsAppMediaFile(restaurantId,attachment.asset_id ?? '');if(!generation.active){tab.close();return}const url=URL.createObjectURL(blob);tab.location.replace(url);setTimeout(()=>URL.revokeObjectURL(url),60000)}catch{tab.close();if(generation.active)setError(t('waAttachmentPreviewFailed'))}finally{lock.current=false;if(generation.active)setBusy(false)}
  };
  const deliveryLabels: Record<string, string> = { accepted: 'waMetaAccepted', sent: 'waMetaSent', delivered: 'waMetaDelivered', read: 'waMetaRead', failed: 'waMetaFailed', unknown: 'waMetaUnknown', sending: 'waMetaUnknown' };
  return <section aria-label={t(kind === 'satisfaction' ? 'waSatisfactionTitle' : 'waOrderTwilio')} className="mt-5 space-y-3 rounded-r-md border border-[var(--line)] p-3">
    <p className="font-semibold text-sm">{t(kind === 'satisfaction' ? 'waSatisfactionTitle' : 'waOrderTwilio')}</p>
    {kind !== 'satisfaction' && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('waOrderTwilioHint')}</p>}
    {kind === 'delivery_reminder' && <p className="text-sm leading-6 text-[var(--fg-muted)]">{t('waOrderReminderTomorrowHint')}</p>}
    {error && <p role="alert" className="text-sm leading-6 text-[var(--danger-500)]">{error}</p>}
    {preview && <>
      <p className="text-sm text-[var(--fg-muted)]">{t(preview.provider === 'meta' ? 'waOrderProviderMeta' : 'waOrderProviderTwilio')}</p>
      <p className="text-sm break-words"><span>{t('waOrderFrom')}: <bdi dir="ltr">{preview.from}</bdi></span><br /><span>{t('waOrderTo')}: <bdi dir="ltr">{preview.recipient}</bdi></span><br /><span>{t('whatsappRecapLanguage')}: {preview.language.toUpperCase()}</span></p>
      <textarea aria-label={t('waOrderExactPreview')} readOnly value={preview.message} dir={preview.language.split('_')[0] === 'he' ? 'rtl' : 'ltr'} rows={10} className="w-full rounded-r-md border border-[var(--line)] bg-[var(--surface)] p-3 text-sm leading-6" />
      {preview.attachment && <div className="flex flex-wrap items-center gap-2 text-sm"><span>{t('waAttachmentTitle')} · <bdi>{preview.attachment.filename}</bdi></span><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={()=>void previewAttachment()}>{t('waAttachmentOrderPreview')}</Button></div>}
      {preview.provider === 'meta' && deliveryLabels[preview.status] ? <p role="status" className="text-sm leading-6">{t(deliveryLabels[preview.status])}</p> : <>
        {preview.status === 'accepted' && <p role="status" className="text-sm">{t('waOrderAccepted')}</p>}
        {(preview.status === 'unknown' || preview.status === 'sending') && <p role="status" className="text-sm leading-6">{t('waOrderSendUnknown')}</p>}
      </>}
      {trackingError && <p role="alert" className="text-sm">{t('waMetaTrackingFailed')}</p>}
    </>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={busy} onClick={() => void prepare()}>{t(busy ? 'loading' : preview ? 'waOrderRefresh' : 'waOrderPrepare')}</Button>
      {preview?.status === 'ready' && <Button type="button" disabled={busy} onClick={() => void send()}>{t('waOrderConfirmSend')}</Button>}
      {preview?.provider === 'meta' && preview.status !== 'ready' && <Button type="button" variant="secondary" disabled={busy} onClick={() => void refreshTracking()}>{t('waMetaRefreshTracking')}</Button>}
    </div>
  </section>;
}
