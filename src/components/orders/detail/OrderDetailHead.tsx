'use client';

import { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Share2, X } from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import type { Order } from '@/lib/api';
import { ORDER_STATUS_BADGE_TONE, displayedPaymentStatus as getDisplayedPaymentStatus, localizePaymentStatus, localizeStatus } from '@/lib/orders/status-presentation';
import { getOrderTiming, isOperationalOrder } from '@/lib/orders/operations-board';
import { orderDetailUrl } from '@/lib/orders/routes';
import styles from './order-detail.module.css';

/** Fixed drawer toolbar. Sharing retains Foody's canonical order link. */
export function OrderDetailHead({ order, children }: { order: Order; children: ReactNode }) {
  const { t } = useI18n();
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!linkCopied) return;
    const timer = window.setTimeout(() => setLinkCopied(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [linkCopied]);

  const shareOrder = async () => {
    const title = t('orderNumber').replace('{id}', String(order.id));
    const url = orderDetailUrl(window.location.origin, order.restaurant_id, order.id);

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
    } catch {
      window.prompt(t('copyLink') || 'Copier le lien', url);
    }
  };

  return (
    <div className={styles.toolbarActions}>
      <Dialog.Close asChild>
        <Button variant="ghost" size="md" icon className={styles.iconButton} aria-label={t('close')}>
          <X />
        </Button>
      </Dialog.Close>
      <div className={styles.toolbarEnd}>
        <Button variant="ghost" size="md" icon className={styles.iconButton}
          onClick={() => { void shareOrder(); }}
          aria-label={linkCopied ? t('linkCopied') : t('shareOrder')}
          title={linkCopied ? t('linkCopied') : t('shareOrder')}>
          {linkCopied ? <Check /> : <Share2 />}
        </Button>
        {children}
      </div>
    </div>
  );
}

/** Customer title and compact workflow/payment badges, matching the order list. */
export function OrderDetailSummary({ order, isCancelled }: { order: Order; isCancelled: boolean }) {
  const { t } = useI18n();
  const timing = getOrderTiming(order);
  const showTiming = isOperationalOrder(order) && !timing.scheduledForFuture;
  return (
    <section className={styles.summary}>
      <h2>{order.customer_name || t('guestCustomer')}</h2>
      <div className={styles.badges}>
        <span className={styles.statusBadge} data-status-tone={ORDER_STATUS_BADGE_TONE[order.status] ?? 'neutral'}>
          <span aria-hidden className={styles.statusDot} />{localizeStatus(order.status, t)}
        </span>
        <span className={styles.paymentBadge}>{localizePaymentStatus(getDisplayedPaymentStatus(order, isCancelled), t)}</span>
      </div>
      <p className={styles.orderReference}>
        {t('orderNumber').replace('{id}', String(order.id))}
        {showTiming && <> · {timing.minutes} {t('minShort')}</>}
      </p>
    </section>
  );
}

/** Close remains available while the order is still loading. */
export function OrderDetailLoadingHead() {
  const { t } = useI18n();
  return <Dialog.Close asChild><Button variant="ghost" size="md" icon className={styles.iconButton} aria-label={t('close')}><X /></Button></Dialog.Close>;
}
