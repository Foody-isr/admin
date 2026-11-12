'use client';

import { useEffect, useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { XIcon, InfoIcon } from 'lucide-react';
import { Button, Field, Input } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import type { Order, OrderCustomerDetailsInput } from '@/lib/api';
import { CustomerDeliveryFields, EMPTY_DELIVERY, type CustomerDeliveryValue } from '@/components/customers/CustomerDeliveryFields';
import { RouteAddressField } from '@/components/delivery/RouteAddressField';
import type { AddressSuggestion } from '@/lib/delivery';
import { checkoutStepCopy } from '@/lib/orders/checkout-step-copy';
import { formatRouteAddress } from '@/lib/route-address';

interface EditCustomerDialogProps {
  restaurantId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The order whose customer is being corrected — supplies the prefill values. */
  order: Order | null;
  onConfirm: (input: OrderCustomerDetailsInput, selectedFromGoogle: boolean) => Promise<void> | void;
}

/** Corrects the customer details on an existing order from Orders or Deliveries. */
export function EditCustomerDialog({ restaurantId, open, onOpenChange, order, onConfirm }: EditCustomerDialogProps) {
  const { locale, t } = useI18n();
  const copy = checkoutStepCopy[locale];
  const isDelivery = order?.order_type === 'delivery';
  const hasPhone = !!order?.customer_phone?.trim();
  const addressHintId = useId();

  const [name, setName] = useState('');
  const [delivery, setDelivery] = useState<CustomerDeliveryValue>(EMPTY_DELIVERY);
  const [addressQuery, setAddressQuery] = useState<string | null>(null);
  const [manualAddress, setManualAddress] = useState(false);
  const [addressResolving, setAddressResolving] = useState(false);
  const [addressSelection, setAddressSelection] = useState<{ position?: { lat: number; lng: number } }>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Prefill from the order each time the dialog opens (or the order changes).
  useEffect(() => {
    if (!open || !order) return;
    setName(order.customer_name ?? '');
    setDelivery({
      address: order.delivery_address ?? '',
      city: order.delivery_city ?? '',
      floor: order.delivery_floor ?? '',
      apt: order.delivery_apt ?? '',
      entryCode: order.delivery_entry_code ?? '',
      deliveryNotes: order.delivery_notes ?? '',
    });
    setAddressQuery(null);
    setManualAddress(false);
    setAddressResolving(false);
    setAddressSelection(undefined);
    setSubmitting(false);
    setSubmitError('');
  }, [open, order]);

  const addressComplete = addressQuery === null && delivery.address.trim() !== '' && delivery.city.trim() !== '';
  const showAddressHint = !manualAddress && !addressComplete;
  const canConfirm = !!order && name.trim() !== '' && !submitting &&
    (!isDelivery || (addressComplete && !addressResolving));

  const changeDelivery = (patch: Partial<CustomerDeliveryValue>) => {
    setDelivery(previous => ({ ...previous, ...patch }));
    if (patch.address !== undefined || patch.city !== undefined) {
      setAddressSelection(undefined);
      setSubmitError('');
    }
  };

  const searchAddress = (query: string) => {
    setAddressQuery(query);
    setAddressSelection(undefined);
    setSubmitError('');
  };

  const selectAddress = ({ address, city, lat, lng }: AddressSuggestion) => {
    setDelivery(previous => ({ ...previous, address, city }));
    const position = typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng } : undefined;
    setAddressSelection({ position });
    setAddressQuery(null);
    setSubmitError('');
  };

  const toggleAddressEntry = () => {
    if (!manualAddress && addressQuery !== null) changeDelivery({ address: addressQuery, city: '' });
    setAddressQuery(null);
    setManualAddress(!manualAddress);
    setSubmitError('');
  };

  const close = () => {
    if (submitting) return;
    onOpenChange(false);
  };

  const confirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const input: OrderCustomerDetailsInput = { name: name.trim() };
      if (isDelivery) {
        input.delivery_address = delivery.address.trim();
        input.delivery_city = delivery.city.trim();
        input.delivery_floor = delivery.floor.trim();
        input.delivery_apt = delivery.apt.trim();
        input.delivery_entry_code = delivery.entryCode.trim();
        input.delivery_notes = delivery.deliveryNotes.trim();
        if (addressSelection?.position) {
          input.delivery_latitude = addressSelection.position.lat;
          input.delivery_longitude = addressSelection.position.lng;
        }
      }
      await onConfirm(input, addressSelection !== undefined);
      onOpenChange(false);
    } catch (cause) {
      setSubmitError((cause as Error)?.message || t('couldNotSave'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) close(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1000] bg-black/55 backdrop-blur-[4px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[1001] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-r-lg border border-[var(--line)] bg-[var(--bg)] text-[var(--fg)] shadow-3 focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          <div className="p-[var(--s-5)] max-h-[calc(100dvh-64px-var(--safe-top)-var(--safe-bottom))] overflow-y-auto">
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
                  disabled={submitting}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
                />
              </Field>

              {isDelivery && (
                <div className="flex flex-col gap-[var(--s-3)] rounded-r-md border border-[var(--line)] p-[var(--s-4)]">
                  <CustomerDeliveryFields
                    value={delivery}
                    onChange={changeDelivery}
                    disabled={submitting}
                    addressControl={manualAddress ? undefined : (
                      <RouteAddressField
                        restaurantId={restaurantId}
                        locale={locale}
                        label={t('deliveryAddress')}
                        placeholder={copy.addressPlaceholder}
                        value={addressQuery ?? formatRouteAddress(delivery)}
                        onChange={searchAddress}
                        onSelectAddress={selectAddress}
                        onResolvingChange={setAddressResolving}
                        inputProps={{ 'aria-describedby': showAddressHint ? addressHintId : undefined }}
                        disabled={submitting}
                        t={t}
                      />
                    )}
                    underAddress={<>
                      {showAddressHint && <p id={addressHintId} className="text-fs-xs text-[var(--fg-muted)]">{copy.addressSearchHint}</p>}
                      <Button type="button" variant="ghost" size="sm" className="self-start" onClick={toggleAddressEntry} disabled={submitting}>
                        {manualAddress ? copy.addressSearch : copy.addressManual}
                      </Button>
                    </>}
                  />
                </div>
              )}
            </div>

            {hasPhone && isDelivery && (
              <div className="mt-[var(--s-4)] flex items-start gap-[var(--s-2)] rounded-r-md border border-[var(--line)] bg-[var(--surface)] px-[var(--s-3)] py-[var(--s-2)]">
                <InfoIcon className="w-4 h-4 mt-0.5 shrink-0 text-[var(--fg-muted)]" />
                <p className="text-fs-sm text-[var(--fg-muted)]">{t('editCustomerReflectNote')}</p>
              </div>
            )}

            {submitError && (
              <p role="alert" className="mt-[var(--s-3)] text-fs-sm text-[var(--danger-500)]">
                {submitError}
              </p>
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
