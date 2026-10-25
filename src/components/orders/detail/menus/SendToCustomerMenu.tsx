'use client';

// WhatsApp entries use the shared review composer. Email and copy-link keep
// their existing receipt-sharing helpers and keyboard-accessible menu behavior.

import { useState } from 'react';
import {
  MessageCircleIcon,
  MailIcon, LinkIcon, CheckIcon,
} from 'lucide-react';
import { MenuItem, MenuSeparator } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import type { Order } from '@/lib/api';
import {
  receiptShareUrl,
  buildShareMessage,
  buildMailtoUrl,
} from '@/lib/receipt-share';

/** Receipt-sharing entries embedded in the order action menu. */
export function SendToCustomerItems({
  order,
  onSendConfirmation,
  onSendReceipt,
  canManage,
}: {
  order: Order;
  /** Opens the WhatsApp order-confirmation preview (full recap, not just the receipt link). */
  onSendConfirmation: () => void;
  onSendReceipt: () => void;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const url = receiptShareUrl(order.receipt_token);
  const body = buildShareMessage({
    template: t('receiptShareMessage'),
    name: order.customer_name,
    id: order.id,
    total: order.total_amount ?? 0,
    url,
  });
  const subject = t('receiptEmailSubject').replace('{id}', String(order.id));
  const mailUrl = buildMailtoUrl(order.customer_email, subject, body);

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — link stays available via the other actions */
    }
  };

  return (
    <>
        {canManage && <>
          <MenuItem onSelect={onSendConfirmation}>
            <MessageCircleIcon />{t('wcSendMessage')}
          </MenuItem>
          <MenuItem onSelect={onSendReceipt} disabled={!url}>
            <MessageCircleIcon />{t('sendReceiptWhatsApp')}
          </MenuItem>
          <MenuSeparator />
        </>}
        <MenuItem asChild>
          <a href={mailUrl}>
            <MailIcon />
            {t('sendReceiptEmail') || 'Envoyer par email'}
          </a>
        </MenuItem>
        <MenuItem
          disabled={!url}
          // Keep the menu open so the "Lien copié" confirmation is visible.
          onSelect={(e) => {
            e.preventDefault();
            void copyLink();
          }}
        >
          {copied ? <CheckIcon /> : <LinkIcon />}
          {copied ? t('linkCopied') || 'Lien copié' : t('copyLink') || 'Copier le lien'}
        </MenuItem>
    </>
  );
}
