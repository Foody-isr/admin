'use client';

// Send the customer their order without downloading and re-uploading anything:
// the full confirmation recap, WhatsApp and email device deep-links pre-filled
// with a short summary plus a link to the hosted receipt page, and a copy-link
// shortcut. No backend call — the receipt link is built from receipt_token.
//
// Rebuilt on ds/Menu, same reasons as PrintTicketMenu.

import { useState } from 'react';
import {
  SendIcon, ChevronDownIcon, ClipboardListIcon, MessageCircleIcon,
  MailIcon, LinkIcon, CheckIcon,
} from 'lucide-react';
import { Button, Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import type { Order } from '@/lib/api';
import {
  receiptShareUrl,
  buildShareMessage,
  buildWhatsAppUrl,
  buildMailtoUrl,
} from '@/lib/receipt-share';

export function SendToCustomerMenu({
  order,
  onSendConfirmation,
}: {
  order: Order;
  /** Opens the WhatsApp order-confirmation preview (full recap, not just the receipt link). */
  onSendConfirmation: () => void;
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
  const waUrl = buildWhatsAppUrl(order.customer_phone, body);
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
    <Menu>
      <MenuTrigger asChild>
        <Button variant="secondary" size="md" className="flex-1 md:flex-none justify-center">
          <SendIcon /> {t('sendToCustomer') || 'Envoyer au client'}
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </Button>
      </MenuTrigger>
      <MenuContent side="top" align="start">
        {/* The full order recap (type, items, slot, totals, payment) is the
            message staff actually want to send. The receipt link below stays as
            the short "here is your receipt" share. */}
        <MenuItem onSelect={onSendConfirmation}>
          <ClipboardListIcon />
          {t('sendOrderConfirmation') || 'Confirmation de commande'}
        </MenuItem>
        <MenuSeparator />
        {waUrl && (
          <MenuItem asChild>
            <a href={waUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircleIcon />
              {t('sendReceiptWhatsApp') || 'Envoyer par WhatsApp'}
            </a>
          </MenuItem>
        )}
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
      </MenuContent>
    </Menu>
  );
}
