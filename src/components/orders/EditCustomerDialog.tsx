'use client';

import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { XIcon, InfoIcon } from 'lucide-react';
import { Button, Field, Input } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import type { Order, OrderCustomerDetailsInput } from '@/lib/api';

interface EditCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The order whose customer is being corrected — supplies the prefill values. */
  order: Order | null;
  onConfirm: (input: OrderCustomerDetailsInput) => Promise<void> | void;
}

// EditCustomerDialog lets staff fix a misspelled customer name or delivery
// address straight from the order screen. The name is a canonical correction
// keyed by the customer's phone — it shows on this order, the customer's other
// orders, and the client page. The delivery address is corrected on THIS order
// only (a customer can deliver to many addresses over time). When the order has
// no phone, the name can only be fixed on this order. Mirrors the server
// contract (PUT /orders/:id/customer-details).
export function EditCustomerDialog({ open, onOpenChange, order, onConfirm }: EditCustomerDialogProps) {
  const { t } = useI18n();
  const isDelivery = order?.order_type === 'delivery';
  const hasPhone = !!order?.customer_phone?.trim();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [floor, setFloor] = useState('');
  const [apt, setApt] = useState('');
  const [entryCode, setEntryCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Prefill from the order each time the dialog opens (or the order changes).
  useEffect(() => {
    if (!open || !order) return;
    setName(order.customer_name ?? '');
    setAddress(order.delivery_address ?? '');
    setCity(order.delivery_city ?? '');
    setFloor(order.delivery_floor ?? '');
    setApt(order.delivery_apt ?? '');
    setEntryCode(order.delivery_entry_code ?? '');
    setSubmitting(false);
  }, [open, order]);

  const canConfirm = name.trim() !== '' && !submitting;

  const close = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const confirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      const input: OrderCustomerDetailsInput = { name: name.trim() };
      if (isDelivery) {
        input.delivery_address = address.trim();
        input.delivery_city = city.trim();
        input.delivery_floor = floor.trim();
        input.delivery_apt = apt.trim();
        input.delivery_entry_code = entryCode.trim();
      }
      await onConfirm(input);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 backdrop-blur-[4px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[min(480px,calc(100vw-32px))] bg-[var(--bg)] text-[var(--fg)] border border-[var(--line)] rounded-r-lg shadow-3 focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <div className="p-[var(--s-5)] max-h-[calc(100vh-64px)] overflow-y-auto">
            <div className="flex items-start gap-[var(--s-3)] mb-[var(--s-4)]">
              <div className="flex-1 min-w-0">
                <Dialog.Title className="text-fs-lg font-semibold text-[var(--fg)]">
                  {t('editCustomer')}
                </Dialog.Title>
                <Dialog.Description className="text-fs-sm text-[var(--fg-muted)] mt-0.5">
                  {t('editCustomerPrompt')}
                </Dialog.Description>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={t('close')}
                className="text-[var(--fg-muted)] hover:text-[var(--fg)] p-1 rounded transition-colors"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-[var(--s-4)]">
              <Field
                label={t('customerName')}
                hint={hasPhone ? t('editCustomerNameHint') : t('editCustomerNoPhoneHint')}
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
                />
              </Field>

              {isDelivery && (
                <div className="flex flex-col gap-[var(--s-3)] rounded-r-md border border-[var(--line)] p-[var(--s-4)]">
                  <div className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
                    {t('deliveryAddress')}
                  </div>
                  <Field label={t('deliveryAddress')}>
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-2 gap-[var(--s-3)]">
                    <Field label={t('city')}>
                      <Input value={city} onChange={(e) => setCity(e.target.value)} />
                    </Field>
                    <Field label={t('buildingCode')}>
                      <Input value={entryCode} onChange={(e) => setEntryCode(e.target.value)} />
                    </Field>
                    <Field label={t('floor')}>
                      <Input value={floor} onChange={(e) => setFloor(e.target.value)} />
                    </Field>
                    <Field label={t('apartment')}>
                      <Input value={apt} onChange={(e) => setApt(e.target.value)} />
                    </Field>
                  </div>
                  <p className="text-fs-xs text-[var(--fg-subtle)]">{t('editCustomerAddressHint')}</p>
                </div>
              )}
            </div>

            {hasPhone && (
              <div className="mt-[var(--s-4)] flex items-start gap-[var(--s-2)] rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-[var(--s-3)] py-[var(--s-2)]">
                <InfoIcon className="w-4 h-4 mt-0.5 shrink-0 text-[var(--fg-muted)]" />
                <p className="text-fs-sm text-[var(--fg-muted)]">{t('editCustomerReflectNote')}</p>
              </div>
            )}

            <div className="flex items-center gap-[var(--s-3)] mt-[var(--s-5)]">
              <Button variant="ghost" className="flex-1" onClick={close} disabled={submitting}>
                {t('back')}
              </Button>
              <Button variant="primary" className="flex-1" onClick={confirm} disabled={!canConfirm}>
                {t('save')}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
