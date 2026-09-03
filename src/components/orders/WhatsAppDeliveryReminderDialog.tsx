'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CheckIcon, CopyIcon, MessageCircleIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { buildWhatsAppUrl } from '@/lib/receipt-share';
import { buildDeliveryReminder } from '@/lib/orders/delivery-reminder';
import { resolveRecapLocale, RECAP_LOCALES, type RecapLocale } from '@/lib/orders/whatsapp-recap';
import { listMessageTemplates, type MessageTemplate, type Order } from '@/lib/api';

const LOCALE_LABEL: Record<RecapLocale, string> = {
  fr: 'Français',
  he: 'עברית',
  en: 'English',
};

interface WhatsAppDeliveryReminderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  restaurantName: string;
  restaurantDefaultLocale?: string;
}

/** Editable J-1 delivery message handed off to WhatsApp via a wa.me link. */
export function WhatsAppDeliveryReminderDialog({
  open,
  onOpenChange,
  order,
  restaurantName,
  restaurantDefaultLocale,
}: WhatsAppDeliveryReminderDialogProps) {
  const { t } = useI18n();
  const customerLocale = useMemo(
    () => resolveRecapLocale(order.customer_locale, restaurantDefaultLocale),
    [order.customer_locale, restaurantDefaultLocale],
  );
  const [locale, setLocale] = useState<RecapLocale>(customerLocale);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [message, setMessage] = useState('');
  const [edited, setEdited] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    listMessageTemplates(order.restaurant_id)
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [open, order.restaurant_id]);

  const compose = useCallback((target: RecapLocale) => {
    const body = templates.find(
      (template) => template.key === 'delivery_reminder' && template.locale === target,
    )?.body;
    return buildDeliveryReminder({ order, restaurantName, locale: target, body });
  }, [order, restaurantName, templates]);

  useEffect(() => {
    if (!open) return;
    setLocale(customerLocale);
    setMessage(compose(customerLocale));
    setEdited(false);
    setCopied(false);
    // compose refreshes when templates arrive; the next effect updates safely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerLocale, order.id]);

  useEffect(() => {
    if (!open || edited) return;
    setMessage(compose(locale));
    setCopied(false);
  }, [compose, edited, locale, open]);

  const switchLocale = (next: RecapLocale) => {
    if (next === locale) return;
    if (edited && !window.confirm(t('whatsappRecapDiscardEdit'))) return;
    setLocale(next);
    setMessage(compose(next));
    setEdited(false);
  };

  const waUrl = buildWhatsAppUrl(order.customer_phone, message);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // The textarea remains selectable when clipboard access is unavailable.
    }
  };

  const send = () => {
    if (!waUrl) return;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[4px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(560px,calc(100vw-32px))] bg-[var(--bg)] text-[var(--fg)] border border-[var(--line)] rounded-r-lg shadow-3 focus:outline-none">
          <div className="p-[var(--s-5)] max-h-[calc(100vh-64px)] overflow-y-auto">
            <div className="flex items-start gap-[var(--s-3)] mb-[var(--s-4)]">
              <div className="flex-1 min-w-0">
                <Dialog.Title className="text-fs-lg font-semibold">
                  {t('deliveryReminderTitle') || 'Informations de livraison'}
                </Dialog.Title>
                <Dialog.Description className="text-fs-sm text-[var(--fg-muted)] mt-0.5">
                  {t('deliveryReminderSubtitle').replace('{phone}', order.customer_phone || '—')}
                </Dialog.Description>
              </div>
              <button type="button" onClick={() => onOpenChange(false)} aria-label={t('close')} className="p-1 text-[var(--fg-muted)]">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

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
                        : 'border-[var(--line)] text-[var(--fg-muted)]',
                    )}
                  >
                    {LOCALE_LABEL[code]}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                setEdited(true);
              }}
              dir={locale === 'he' ? 'rtl' : 'ltr'}
              rows={13}
              className="w-full rounded-r-md border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] text-fs-sm leading-relaxed px-[var(--s-3)] py-[var(--s-3)] font-mono focus:outline-none focus:border-[var(--brand-500)]"
            />

            <div className="flex items-center gap-[var(--s-3)] mt-[var(--s-5)]">
              <Button variant="ghost" onClick={copy}>
                {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                {copied ? t('copied') : t('copy')}
              </Button>
              <div className="flex-1" />
              <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('back')}</Button>
              <Button variant="primary" onClick={send} disabled={!waUrl}>
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
