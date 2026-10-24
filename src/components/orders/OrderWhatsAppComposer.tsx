'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, CheckCheck, Copy, ExternalLink, FileText, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { Button, ConfirmDialog, Drawer } from '@/components/ds';
import { ChoiceRow } from '@/components/ds/Selection';
import {
  ApiError, getOrder, getOrderWhatsAppStatus, getWhatsAppMediaFile, getWhatsAppReceiptFile,
  listMessageTemplates, previewOrderWhatsApp, sendOrderWhatsApp,
  type CheckoutConfig, type MessageTemplate, type Order,
} from '@/lib/api';
import { getDeliveryCustomerWindow } from '@/lib/delivery';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import { buildWhatsAppUrl, receiptShareUrl } from '@/lib/receipt-share';
import { buildOrderRecap, RECAP_LOCALES, resolveRecapLocale, type RecapLocale } from '@/lib/orders/whatsapp-recap';
import { buildDeliveryReminder } from '@/lib/orders/delivery-reminder';
import { canSendWhatsApp, receiptWhatsAppMessage, scopeWhatsAppOrders, whatsappPhone, type WhatsAppChannel, type WhatsAppMessageKind, type WhatsAppRecipient } from '@/lib/orders/whatsapp-composer';
import styles from './order-whatsapp.module.css';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restaurantId: number;
  orders: Order[];
  restaurantName: string;
  restaurantDefaultLocale?: string;
  checkoutConfig?: CheckoutConfig | null;
  initialKind?: WhatsAppMessageKind;
  initialChannel?: WhatsAppChannel;
  onViewHistory?: () => void;
}

interface Draft { message: string; locale: RecapLocale; edited: boolean }
const LANGUAGE = { fr: 'Français', he: 'עברית', en: 'English' };

/** One review surface for approved API messages and editable, individual app handoffs. */
export function OrderWhatsAppComposer(props: Props) {
  const { open, onOpenChange, restaurantId, orders, restaurantName, restaurantDefaultLocale, checkoutConfig, initialKind = 'order_recap', initialChannel = 'business', onViewHistory } = props;
  const { t } = useI18n();
  const params = useParams();
  const { hasAnyPermission } = usePermissions();
  const allowed = Number(params.restaurantId) === restaurantId && hasAnyPermission('orders.manage');
  const optionName = useId();
  const scoped = scopeWhatsAppOrders(orders, restaurantId);
  const signature = JSON.stringify([restaurantId, scoped.map(order => order.id), initialKind, initialChannel]);
  const [channel, setChannel] = useState<WhatsAppChannel>(initialChannel);
  const [kind, setKind] = useState<WhatsAppMessageKind>(initialKind);
  const [rows, setRows] = useState<WhatsAppRecipient[]>([]);
  const [activeId, setActiveId] = useState<number>();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const [pendingChange, setPendingChange] = useState<(() => void) | null>(null);
  const generation = useRef(0);
  const sending = useRef(false);
  const controller = useRef<AbortController>();
  const currentScope = useRef('');
  currentScope.current = open && allowed ? signature : '';
  const rowsRef = useRef(rows); rowsRef.current = rows;
  const ordersRef = useRef(scoped); ordersRef.current = scoped;
  const loadedKind = useRef('');
  const attempts = useRef(new Map<string, NonNullable<WhatsAppRecipient['preview']>>());

  useEffect(() => {
    if (!open) return;
    setChannel(initialChannel); setKind(initialKind); setDrafts({}); setError(''); setConfirmSend(false); setPendingChange(null); setBusy(false);
    setActiveId(ordersRef.current[0]?.id);
    attempts.current.clear();
  }, [open, signature, initialChannel, initialKind]);

  const prepare = useCallback(async () => {
    if (!allowed || !open || sending.current) return;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const version = ++generation.current;
    const valid = () => generation.current === version && !abort.signal.aborted;
    const recipients = ordersRef.current;
    // A lost response is checked against its original dispatch, never a new preview.
    const previous = loadedKind.current === `${channel}:${kind}` ? rowsRef.current : [];
    loadedKind.current = `${channel}:${kind}`;
    setLoading(true); setError(''); setConfirmSend(false);
    setRows(recipients.map(order => ({ order, state: 'loading' })));
    let savedTemplates: MessageTemplate[] = [];
    if (channel === 'app') {
      try {
        savedTemplates = await listMessageTemplates(restaurantId);
        if (valid()) setTemplates(savedTemplates);
      } catch {
        if (valid()) { setRows(recipients.map(order => ({ order, state: 'unavailable' }))); setLoading(false); }
        return;
      }
    }
    let next = 0;
    const worker = async () => {
      while (valid() && next < recipients.length) {
        const order = recipients[next++];
        try {
          if (channel === 'business') {
            if (kind === 'receipt') throw new Error('Unsupported API action');
            const attemptKey = `${kind}:${order.id}`;
            const attempted = attempts.current.get(attemptKey) ?? previous.find(row => row.order.id === order.id)?.preview;
            const preview = attempted && attempted.status !== 'ready'
              ? { ...attempted, ...(await getOrderWhatsAppStatus(restaurantId, order.id, attempted.id)) }
              : await previewOrderWhatsApp(restaurantId, order.id, kind, abort.signal);
            if (valid()) {
              if (preview.status !== 'ready') attempts.current.set(attemptKey, preview);
              setRows(old => old.map(row => row.order.id === order.id ? { order, state: 'ready', preview } : row));
            }
          } else {
            const saved = await getOrder(restaurantId, order.id);
            if (saved.restaurant_id !== restaurantId || !whatsappPhone(saved.customer_phone)) throw new Error('Unavailable recipient');
            const locale = resolveRecapLocale(saved.customer_locale, restaurantDefaultLocale);
            const body = savedTemplates.find(template => template.key === kind && template.locale === locale)?.body;
            let message: string;
            if (kind === 'delivery_reminder') {
              const window = await getDeliveryCustomerWindow(restaurantId, order.id);
              message = buildDeliveryReminder({ order: saved, restaurantName, locale, body, customerWindow: window });
            } else if (kind === 'receipt') {
              const url = receiptShareUrl(saved.receipt_token);
              if (!url) throw new Error('Unavailable receipt');
              message = receiptWhatsAppMessage(saved, locale, url);
            } else {
              message = buildOrderRecap({ order: saved, restaurantName, locale, receiptUrl: receiptShareUrl(saved.receipt_token), checkoutConfig, body });
            }
            if (valid()) {
              setDrafts(old => old[order.id]?.edited ? old : { ...old, [order.id]: { message, locale, edited: false } });
              setRows(old => old.map(row => row.order.id === order.id ? { order: saved, state: 'ready' } : row));
            }
          }
        } catch {
          if (valid()) setRows(old => old.map(row => row.order.id === order.id ? { ...row, state: 'unavailable', preview: previous.find(item => item.order.id === order.id)?.preview } : row));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, recipients.length) }, worker));
    if (valid()) setLoading(false);
  }, [allowed, open, channel, kind, restaurantId, restaurantDefaultLocale, restaurantName, checkoutConfig]);
  const prepareRef = useRef(prepare); prepareRef.current = prepare;
  useEffect(() => {
    let active = true;
    // React's development effect replay must not create a second preview request.
    queueMicrotask(() => { if (active) void prepareRef.current(); });
    const abort = controller, version = generation;
    return () => { active = false; ++version.current; abort.current?.abort(); };
  }, [open, allowed, signature, channel, kind]);

  const change = (action: () => void) => {
    if (busy || loading) return;
    if (Object.values(drafts).some(draft => draft.edited)) setPendingChange(() => action);
    else action();
  };
  const changeChannel = (value: WhatsAppChannel) => {
    if (channel === value) return;
    change(() => { setDrafts({}); setChannel(value); if (value === 'app' && kind === 'satisfaction') setKind('order_recap'); if (value === 'business' && kind === 'receipt') setKind('order_recap'); });
  };
  const changeKind = (value: WhatsAppMessageKind) => {
    if (kind !== value) change(() => { setDrafts({}); setKind(value); });
  };
  const active = rows.find(row => row.order.id === activeId) ?? rows[0];
  const draft = active ? drafts[active.order.id] : undefined;
  const preview = active?.preview;
  const ready = rows.filter(canSendWhatsApp);
  const message = channel === 'business' ? preview?.message ?? '' : draft?.message ?? '';
  const messageLanguage = channel === 'business' ? preview?.language : draft?.locale;

  const send = async () => {
    if (!allowed || sending.current || loading || !ready.length) return;
    const reviewed = currentScope.current, version = generation.current;
    const valid = () => currentScope.current === reviewed && generation.current === version;
    sending.current = true; setBusy(true); setError(''); setConfirmSend(false);
    try {
      for (const target of ready) {
        if (!valid() || !target.preview) break;
        const attemptKey = `${kind}:${target.order.id}`;
        attempts.current.set(attemptKey, { ...target.preview, status: 'sending' });
        setRows(old => old.map(row => row.order.id === target.order.id ? { ...row, state: 'sending' } : row));
        try {
          const result = await sendOrderWhatsApp(restaurantId, target.order.id, target.preview.id);
          if (valid()) {
            attempts.current.set(attemptKey, { ...target.preview, status: result.status });
            setRows(old => old.map(row => row.order.id === target.order.id && row.preview ? { ...row, state: 'ready', preview: { ...row.preview, status: result.status } } : row));
          }
        } catch (cause) {
          if (!valid()) break;
          if (cause instanceof ApiError && cause.message === 'whatsapp_preview_changed') {
            attempts.current.delete(attemptKey);
            setRows(old => old.map(row => row.order.id === target.order.id ? { ...row, state: 'stale' } : row));
            setError(t('wcChanged')); break;
          }
          attempts.current.set(attemptKey, { ...target.preview, status: 'unknown' });
          setRows(old => old.map(row => row.order.id === target.order.id && row.preview ? { ...row, state: 'ready', preview: { ...row.preview, status: 'unknown' } } : row));
        }
      }
    } finally { sending.current = false; if (valid()) setBusy(false); }
  };

  const switchLanguage = async (locale: RecapLocale) => {
    if (!active || !draft || draft.locale === locale || busy || loading) return;
    const order = active.order, version = generation.current;
    const apply = async () => {
      setBusy(true); setError('');
      try {
        const body = templates.find(template => template.key === kind && template.locale === locale)?.body;
        const message = kind === 'delivery_reminder'
          ? buildDeliveryReminder({ order, restaurantName, locale, body, customerWindow: await getDeliveryCustomerWindow(restaurantId, order.id) })
          : kind === 'receipt' ? receiptWhatsAppMessage(order, locale, receiptShareUrl(order.receipt_token))
            : buildOrderRecap({ order, restaurantName, locale, receiptUrl: receiptShareUrl(order.receipt_token), checkoutConfig, body });
        if (generation.current === version) { setCopied(false); setDrafts(old => ({ ...old, [order.id]: { message, locale, edited: false } })); }
      } catch { if (generation.current === version) setError(t('deliveryCustomerWindowUnavailable')); }
      finally { if (generation.current === version) setBusy(false); }
    };
    if (draft.edited) setPendingChange(() => () => { void apply(); });
    else await apply();
  };
  const openApp = () => {
    if (!allowed || !active || active.state !== 'ready' || !draft?.message.trim()) return;
    const url = buildWhatsAppUrl(whatsappPhone(active.order.customer_phone), draft.message);
    if (!url) return;
    const tab = window.open('about:blank', '_blank');
    if (!tab) { setError(t('wcPopupBlocked')); return; }
    tab.opener = null; tab.location.replace(url);
    setRows(old => old.map(row => row.order.id === active.order.id ? { ...row, opened: true } : row));
  };
  const previewAttachment = async () => {
    if (!active || !preview?.attachment || busy) return;
    const tab = window.open('about:blank', '_blank');
    if (!tab) { setError(t('wcPopupBlocked')); return; }
    tab.opener = null;
    const version = generation.current, attachment = preview.attachment;
    setBusy(true); setError('');
    try {
      const blob = attachment.source === 'receipt' ? await getWhatsAppReceiptFile(restaurantId, active.order.id, preview.language) : await getWhatsAppMediaFile(restaurantId, attachment.asset_id ?? '');
      if (generation.current !== version) { tab.close(); return; }
      const url = URL.createObjectURL(blob); tab.location.replace(url); setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch { tab.close(); if (generation.current === version) setError(t('waAttachmentPreviewFailed')); }
    finally { if (generation.current === version) setBusy(false); }
  };
  const status = (row: WhatsAppRecipient) => {
    if (row.state === 'loading') return t('loading');
    if (row.state === 'unavailable') return t('wcUnavailable');
    if (row.state === 'stale') return t('wcReviewAgain');
    if (row.state === 'sending') return t('orderMessageSending');
    if (channel === 'app') return t(row.opened ? 'wcOpened' : 'deliveryWhatsAppReady');
    if (row.preview?.send_blocked_reason === 'not_due') return t('deliveryWhatsAppWaiting');
    const labels: Record<string, string> = { ready: 'deliveryWhatsAppReady', accepted: 'orderMessageAccepted', sent: 'orderMessageSent', delivered: 'orderMessageDelivered', read: 'orderMessageRead', failed: 'orderMessageFailed', unknown: 'orderMessageUnknown', sending: 'orderMessageSending' };
    return t(labels[row.preview?.previous_status ?? row.preview?.status ?? 'unknown']);
  };
  const accepted = rows.filter(row => row.preview && ['accepted', 'sent', 'delivered', 'read'].includes(row.preview.status)).length;
  const sendLabel = ready.length === 1 ? t('wcSendSingle') : t('wcSendCount').replace('{count}', String(ready.length));
  if (!allowed) return null;

  return <>
    <Drawer open={open} onOpenChange={value => {
      if (busy) return;
      if (!value && Object.values(drafts).some(draft => draft.edited)) setPendingChange(() => () => onOpenChange(false));
      else onOpenChange(value);
    }} closeDisabled={busy} title={t('wcTitle')}
      subtitle={scoped.length === 1 ? t('wcSingleOrder').replace('{id}', String(scoped[0].id)) : t('wcOrderCount').replace('{count}', String(scoped.length))} width={960} bodyClassName={styles.body}
      footer={<div className={styles.footer}>
        <p role="status">{channel === 'business' ? t('wcSummary').replace('{ready}', String(ready.length)).replace('{total}', String(rows.length)).replace('{accepted}', String(accepted)) : t('wcAppFooter')}</p>
        {channel === 'business' ? <Button disabled={busy || loading || !ready.length || rows.some(row => row.state === 'stale')} onClick={() => rows.length > 1 ? setConfirmSend(true) : void send()}><Send />{busy ? t('orderMessageSending') : sendLabel}</Button>
          : <Button disabled={busy || loading || active?.state !== 'ready' || !draft?.message.trim()} onClick={openApp}><ExternalLink />{t('whatsappRecapSend')}</Button>}
      </div>}>
      <div className={styles.layout}>
        <aside className={styles.controls}>
          <fieldset disabled={busy || loading} className={`${styles.choices} ${styles.channelChoices}`}><legend>{t('wcChannel')}</legend>
            <div className={styles.channelOptions}>
              <ChoiceRow type="radio" aria-label="WhatsApp Business" name={`${optionName}-channel`} checked={channel === 'business'} onChange={() => changeChannel('business')} label="WhatsApp Business" description={t('wcBusinessHint')} />
              <ChoiceRow type="radio" aria-label={t('wcApp')} name={`${optionName}-channel`} checked={channel === 'app'} onChange={() => changeChannel('app')} label={t('wcApp')} description={t('wcAppHint')} />
            </div>
          </fieldset>
          <fieldset disabled={busy || loading} className={`${styles.choices} ${styles.kindChoices}`}><legend>{t('wcMessage')}</legend>
            <ChoiceRow type="radio" name={`${optionName}-kind`} checked={kind === 'order_recap'} onChange={() => changeKind('order_recap')} label={t('wcConfirmation')} />
            <ChoiceRow type="radio" name={`${optionName}-kind`} checked={kind === 'delivery_reminder'} onChange={() => changeKind('delivery_reminder')} label={t('wcReminder')} />
            {channel === 'business' ? <ChoiceRow type="radio" name={`${optionName}-kind`} checked={kind === 'satisfaction'} onChange={() => changeKind('satisfaction')} label={t('waSatisfactionTitle')} />
              : <ChoiceRow type="radio" name={`${optionName}-kind`} checked={kind === 'receipt'} onChange={() => changeKind('receipt')} label={t('wcReceipt')} />}
            <select className={styles.mobileKind} aria-label={t('wcMessage')} value={kind} onChange={event => changeKind(event.target.value as WhatsAppMessageKind)}>
              <option value="order_recap">{t('wcConfirmation')}</option><option value="delivery_reminder">{t('wcReminder')}</option>
              {channel === 'business' ? <option value="satisfaction">{t('waSatisfactionTitle')}</option> : <option value="receipt">{t('wcReceipt')}</option>}
            </select>
          </fieldset>
          <p className={styles.hint}>{t(channel === 'business' ? 'wcTemplateHint' : 'wcEditableHint')}</p>
          {kind === 'delivery_reminder' && <p className={`${styles.hint} mt-3`}>{t('waOrderReminderTomorrowHint')}</p>}
          {kind === 'satisfaction' && <p className={`${styles.hint} mt-3`}>{t('waSatisfactionOrderHint')}</p>}
          {hasAnyPermission('settings.view', 'settings.edit') && <div className={styles.links}>
            <Link href={`/${restaurantId}/settings/whatsapp`}>{t('wcManageTemplates')}</Link>
            <Link href={`/${restaurantId}/settings/orders/workflow`}>{t('wcAutomations')}</Link>
          </div>}
          {onViewHistory && <Button variant="ghost" disabled={busy || loading} onClick={() => change(() => { onOpenChange(false); onViewHistory(); })}>{t('orderMessagesTitle')}</Button>}
        </aside>
        <div className={styles.review}>
          <div className={styles.reviewHead}><h2>{t('wcRecipients')}</h2><Button size="sm" variant="ghost" disabled={busy || loading} onClick={() => void prepare()}><RefreshCw />{t('refresh')}</Button></div>
          <div className={styles.recipients} role="group" aria-label={t('wcRecipients')}>
            {rows.map(row => <button key={row.order.id} type="button" aria-pressed={active?.order.id === row.order.id} disabled={busy} onClick={() => { setActiveId(row.order.id); setError(''); setCopied(false); }}>
              <span className={styles.recipientName}>{row.order.customer_name || t('guestCustomer')}<small>#{row.order.id}</small></span>
              <span className={styles.recipientStatus} data-warning={['unavailable', 'stale'].includes(row.state) || ['unknown', 'failed'].includes(row.preview?.status ?? '')}>{status(row)}</span>
            </button>)}
          </div>
          {error && <p role="alert" className={styles.notice}>{error}</p>}
          {active?.state === 'unavailable' && <div role="alert" className={styles.notice}><strong>{t('wcUnavailable')}</strong><p>{t(channel === 'business' ? 'waOrderPreviewFailed' : 'wcAppUnavailable')}</p></div>}
          {active?.state === 'stale' && <p role="alert" className={styles.notice}>{t('wcChanged')}</p>}
          {active?.state === 'loading' && <p role="status" className={styles.loading}>{t('loading')}</p>}
          {active && active.state !== 'loading' && message && <section className={styles.message} aria-label={t('waOrderExactPreview')}>
            <div className={styles.messageHead}>
              <MessageCircle aria-hidden />
              <div><strong>{active.order.customer_name || t('guestCustomer')}</strong><p><bdi dir="ltr">{channel === 'business' ? preview?.recipient : whatsappPhone(active.order.customer_phone)}</bdi></p></div>
              <span className={styles.language}>{channel === 'business' ? messageLanguage?.toUpperCase() : <select aria-label={t('whatsappRecapLanguage')} value={draft?.locale} disabled={busy || loading} onChange={event => void switchLanguage(event.target.value as RecapLocale)}>{RECAP_LOCALES.map(value => <option key={value} value={value}>{LANGUAGE[value]}</option>)}</select>}</span>
            </div>
            {channel === 'business' && preview && <p className={styles.sender}>{t('waOrderFrom')}: <bdi dir="ltr">{preview.from}</bdi><span>{t(preview.provider === 'meta' ? 'waOrderProviderMeta' : 'waOrderProviderTwilio')}</span></p>}
            <div className={styles.conversation}>
              <textarea aria-label={t('waOrderExactPreview')} readOnly={channel === 'business'} disabled={busy || active.state !== 'ready'} value={message} dir={messageLanguage?.startsWith('he') ? 'rtl' : 'ltr'} rows={12}
                onChange={event => { const value = event.target.value; setCopied(false); setDrafts(old => ({ ...old, [active.order.id]: { ...old[active.order.id], message: value, edited: true } })); }} />
              {preview?.attachment && channel === 'business' && <Button variant="secondary" disabled={busy} onClick={() => void previewAttachment()}><FileText />{preview.attachment.filename}</Button>}
            </div>
            <div className={styles.messageFoot}><span>{t(channel === 'business' ? 'wcApproved' : 'wcEditable')}</span><Button size="sm" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(message); setCopied(true); } catch { setError(t('waCopyFailed')); } }}>{copied ? <Check /> : <Copy />}{t(copied ? 'copied' : 'copy')}</Button></div>
            {channel === 'business' && preview?.send_blocked_reason && <p role="status" className={styles.notice}>{t(preview.send_blocked_reason === 'not_due' ? 'deliveryWhatsAppNotDue' : 'deliveryWhatsAppAlreadyAttempted')}</p>}
            {channel === 'business' && preview && preview.status !== 'ready' && <p role="status" className={styles.evidence}>{['delivered', 'read'].includes(preview.status) ? <CheckCheck aria-hidden /> : ['accepted', 'sent'].includes(preview.status) ? <Check aria-hidden /> : null}{t(preview.status === 'accepted' ? preview.provider === 'meta' ? 'orderMessageAcceptedHint' : 'orderMessageTwilioHint' : ['unknown', 'sending'].includes(preview.status) ? 'orderMessageUnknownHint' : preview.status === 'delivered' ? 'waMetaDelivered' : preview.status === 'read' ? 'waMetaRead' : preview.status === 'failed' ? 'waMetaFailed' : 'waMetaSent')}</p>}
            {channel === 'app' && active.opened && <p role="status" className={styles.evidence}>{t('wcAppOpenedHint')}</p>}
          </section>}
          {rows.length > 1 && <p className={styles.hint}>{t('wcIndividualHint')}</p>}
        </div>
      </div>
    </Drawer>
    <ConfirmDialog open={confirmSend} onOpenChange={setConfirmSend} title={sendLabel} description={t('wcConfirmBulk').replace('{count}', String(ready.length))} confirmLabel={sendLabel} cancelLabel={t('cancel')} onConfirm={() => void send()} />
    <ConfirmDialog open={!!pendingChange} onOpenChange={value => { if (!value) setPendingChange(null); }} title={t('wcDiscardTitle')} description={t('wcDiscardHint')} confirmLabel={t('wcDiscard')} cancelLabel={t('cancel')} onConfirm={() => { const action = pendingChange; setPendingChange(null); action?.(); }} />
  </>;
}
