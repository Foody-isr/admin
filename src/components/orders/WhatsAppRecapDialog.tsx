'use client';

// Previews the WhatsApp order-confirmation recap before staff send it to the
// customer, then hands off to WhatsApp via a wa.me deep link (the message is
// composed here; the staff member presses Send in WhatsApp itself).
//
// The preview exists for two reasons the deep link alone can't cover: the
// message is written in the CUSTOMER's language, which staff must be able to
// override once inside the drawer (WhatsApp offers no way to switch it), and
// staff often want to add a word before sending — so the text is editable.

import { useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { XIcon, CopyIcon, CheckIcon, MessageCircleIcon } from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buildWhatsAppUrl, receiptShareUrl } from '@/lib/receipt-share';
import {
  buildOrderRecap,
  resolveRecapLocale,
  RECAP_LOCALES,
  type RecapLocale,
} from '@/lib/orders/whatsapp-recap';
import type { Order } from '@/lib/api';

const LOCALE_LABEL: Record<RecapLocale, string> = {
  fr: 'Français',
  he: 'עברית',
  en: 'English',
};

interface WhatsAppRecapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  restaurantName: string;
  /** Restaurant's own language — the fallback for orders with no customer_locale. */
  restaurantDefaultLocale?: string;
}

export function WhatsAppRecapDialog({
  open,
  onOpenChange,
  order,
  restaurantName,
  restaurantDefaultLocale,
}: WhatsAppRecapDialogProps) {
  const { t } = useI18n();

  // The language the customer ordered in wins; staff can still switch it below.
  const customerLocale = useMemo(
    () => resolveRecapLocale(order.customer_locale, restaurantDefaultLocale),
    [order.customer_locale, restaurantDefaultLocale],
  );

  const [locale, setLocale] = useState<RecapLocale>(customerLocale);
  const [message, setMessage] = useState('');
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);

  const compose = useMemo(
    () => (target: RecapLocale) =>
      buildOrderRecap({
        order,
        restaurantName,
        locale: target,
        receiptUrl: receiptShareUrl(order.receipt_token),
      }),
    [order, restaurantName],
  );

  // Reset to the customer's language and a freshly composed message each time the
  // dialog opens, so a previous send never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setLocale(customerLocale);
    setMessage(compose(customerLocale));
    setEdited(false);
    setCopied(false);
  }, [open, customerLocale, compose]);

  // Switching language recomposes the message — but never silently discards a
  // hand-written edit.
  const switchLocale = (next: RecapLocale) => {
    if (next === locale) return;
    if (edited && !window.confirm(t('whatsappRecapDiscardEdit') || 'Remplacer votre texte ?')) return;
    setLocale(next);
    setMessage(compose(next));
    setEdited(false);
  };

  const waUrl = buildWhatsAppUrl(order.customer_phone, message);
  const hasPhone = waUrl !== '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — the textarea is selectable as a fallback */
    }
  };

  const send = () => {
    if (!hasPhone) return;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[4px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(560px,calc(100vw-32px))] bg-[var(--bg)] text-[var(--fg)] border border-[var(--line)] rounded-r-lg shadow-3 focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <div className="p-[var(--s-5)] max-h-[calc(100vh-64px)] overflow-y-auto">
            <div className="flex items-start gap-[var(--s-3)] mb-[var(--s-4)]">
              <div className="flex-1 min-w-0">
                <Dialog.Title className="text-fs-lg font-semibold text-[var(--fg)]">
                  {t('whatsappRecapTitle')}
                </Dialog.Title>
                <Dialog.Description className="text-fs-sm text-[var(--fg-muted)] mt-0.5">
                  {order.customer_phone
                    ? t('whatsappRecapSubtitle').replace('{phone}', order.customer_phone)
                    : t('whatsappRecapNoPhone')}
                </Dialog.Description>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label={t('close')}
                className="text-[var(--fg-muted)] hover:text-[var(--fg)] p-1 rounded transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Language of the message — defaults to the language the customer ordered in. */}
            <div className="flex items-center gap-[var(--s-2)] mb-[var(--s-3)]">
              <span className="text-fs-sm text-[var(--fg-muted)]">{t('whatsappRecapLanguage')}</span>
              <div className="flex items-center gap-[var(--s-1)]">
                {RECAP_LOCALES.map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => switchLocale(code)}
                    className={cn(
                      'rounded-full px-[var(--s-3)] py-[var(--s-1)] text-fs-sm border transition-colors',
                      code === locale
                        ? 'border-[var(--brand-500)] bg-[var(--brand-50)] text-[var(--fg)]'
                        : 'border-[var(--line)] text-[var(--fg-muted)] hover:bg-[var(--surface)]',
                    )}
                  >
                    {LOCALE_LABEL[code]}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                setEdited(true);
              }}
              dir={locale === 'he' ? 'rtl' : 'ltr'}
              rows={16}
              className="w-full rounded-r-md border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] text-fs-sm leading-relaxed px-[var(--s-3)] py-[var(--s-3)] font-mono focus:outline-none focus:border-[var(--brand-500)]"
            />

            <div className="flex items-center gap-[var(--s-3)] mt-[var(--s-5)]">
              <Button variant="ghost" onClick={copy}>
                {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                {copied ? t('copied') : t('copy')}
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                {t('back')}
              </Button>
              <Button variant="primary" onClick={send} disabled={!hasPhone}>
                <MessageCircleIcon className="w-4 h-4" />
                {t('whatsappRecapSend')}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
