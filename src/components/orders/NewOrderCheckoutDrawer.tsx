'use client';

import { useEffect, useRef, useState } from 'react';
import { Drawer, Field, Input, Textarea } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  ShoppingBagIcon, TruckIcon, BanknoteIcon, CreditCardIcon, LinkIcon,
} from 'lucide-react';
import { FulfillmentSection } from './FulfillmentSection';
import {
  buildFulfillmentTargets,
  defaultFulfillment,
  type FulfillmentValue,
} from '@/lib/orders/fulfillment';
import type { BatchFulfillmentConfigResponse } from '@/lib/api';

export type OrderType = 'pickup' | 'delivery';
// Payment is captured as two axes: the method (cash / card / payment link) and
// whether it has already been collected ("déjà encaissé ?"). This lets staff
// mark a cash order that will be collected on pickup — it stays UNPAID and still
// carries the cash badge — instead of forcing a choice between "already paid" and
// an ambiguous method-less "unpaid". `paymentCollected` is ignored for `link`
// (the customer pays via the provider; the order is created pending).
export type PaymentMethodChoice = 'cash' | 'card' | 'link';

export interface CheckoutData {
  customerName: string;
  customerPhone: string;
  orderType: OrderType;
  address: string;
  city: string;
  floor: string;
  apt: string;
  deliveryNotes: string;
  paymentMethod: PaymentMethodChoice;
  paymentCollected: boolean;
  fulfillment: FulfillmentValue;
}

interface NewOrderCheckoutDrawerProps {
  open: boolean;
  onClose: () => void;
  total: number;
  itemCount: number;
  submitting: boolean;
  error: string | null;
  onConfirm: (data: CheckoutData) => void;
  batchConfig: BatchFulfillmentConfigResponse | null;
  defaultDate?: string;
}

// A single selectable tile (used for order type + payment choices).
function OptionTile({
  active, onClick, icon, label, hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex flex-1 flex-col items-start gap-1 rounded-md border p-[var(--s-3)] text-start transition-colors',
        active
          ? 'border-[var(--brand-500)] bg-[var(--surface-2)] text-[var(--fg)] shadow-1 ring-1 ring-[var(--brand-500)]'
          : 'border-[var(--line-strong)] bg-[var(--surface)] hover:border-[var(--fg-subtle)]',
      )}
    >
      <span className={cn('[&_svg]:size-5', active ? 'text-[var(--brand-600)]' : 'text-[var(--fg-muted)]')}>
        {icon}
      </span>
      <span className="text-fs-sm font-medium">{label}</span>
      {hint && <span className="text-fs-xs text-[var(--fg-muted)]">{hint}</span>}
    </button>
  );
}

// Compact segmented button for the "déjà encaissé ?" yes/no toggle.
function ToggleButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-[var(--s-3)] py-1 text-fs-sm font-medium transition-colors',
        active
          ? 'bg-[var(--brand-500)] text-white shadow-1'
          : 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
      )}
    >
      {label}
    </button>
  );
}

export function NewOrderCheckoutDrawer({
  open, onClose, total, itemCount, submitting, error, onConfirm, batchConfig, defaultDate,
}: NewOrderCheckoutDrawerProps) {
  const { t } = useI18n();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderType, setOrderType] = useState<OrderType>('pickup');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [floor, setFloor] = useState('');
  const [apt, setApt] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethodChoice>('cash');
  // "déjà encaissé ?" — has the payment already been collected. Defaults to yes
  // (the common POS case: staff take payment in hand). Ignored for `link`.
  const [collected, setCollected] = useState(true);

  const [fulfillment, setFulfillment] = useState<FulfillmentValue>({ timing: 'immediate' });

  // Default to Programmée on the first batch target when batch mode is on; falls
  // back to Immédiate otherwise. Runs once per drawer-open (ref-guarded).
  const targets = buildFulfillmentTargets(batchConfig, orderType);
  const didInitFulfillment = useRef(false);
  useEffect(() => {
    if (!open) { didInitFulfillment.current = false; return; }
    if (didInitFulfillment.current) return;
    didInitFulfillment.current = true;
    const preferred = defaultDate ? targets.find((tg) => tg.date === defaultDate) : undefined;
    setFulfillment(
      preferred
        ? { timing: 'scheduled', scheduledFor: preferred.date, windowStart: preferred.windowStart, windowEnd: preferred.windowEnd }
        : defaultFulfillment(targets),
    );
  }, [open, targets, defaultDate]);

  const canConfirm =
    customerName.trim().length > 0 &&
    customerPhone.trim().length > 0 &&
    (orderType !== 'delivery' || address.trim().length > 0) &&
    !submitting;

  const payMethods: { key: PaymentMethodChoice; icon: React.ReactNode; label: string }[] = [
    { key: 'cash', icon: <BanknoteIcon />, label: t('payMethodCash') },
    { key: 'card', icon: <CreditCardIcon />, label: t('payMethodCard') },
    { key: 'link', icon: <LinkIcon />, label: t('payMethodLink') },
  ];

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('checkout')}
      subtitle={`${itemCount} ${t('orderItems').toLowerCase()} · ₪${total.toFixed(2)}`}
      width={480}
      onSave={() =>
        onConfirm({ customerName, customerPhone, orderType, address, city, floor, apt, deliveryNotes, paymentMethod: payMethod, paymentCollected: collected, fulfillment })
      }
      saveLabel={submitting ? `${t('creating')}…` : `${t('createOrder')} · ₪${total.toFixed(2)}`}
      saveDisabled={!canConfirm}
    >
      <div className="flex flex-col gap-[var(--s-5)]">
        {/* Order type */}
        <div className="flex flex-col gap-2">
          <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
            {t('orderType')}
          </span>
          <div className="flex gap-2">
            <OptionTile active={orderType === 'pickup'} onClick={() => setOrderType('pickup')} icon={<ShoppingBagIcon />} label={t('pickup')} />
            <OptionTile active={orderType === 'delivery'} onClick={() => setOrderType('delivery')} icon={<TruckIcon />} label={t('delivery')} />
          </div>
        </div>

        <FulfillmentSection
          orderType={orderType}
          batchConfig={batchConfig}
          value={fulfillment}
          onChange={setFulfillment}
        />

        {/* Customer */}
        <div className="flex flex-col gap-[var(--s-3)]">
          <Field label={t('customerName')}>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder={t('customerNamePlaceholder')} autoFocus />
          </Field>
          <Field label={t('customerPhone')}>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="05X-XXXXXXX" inputMode="tel" />
          </Field>

          {orderType === 'delivery' && (
            <>
              <Field label={t('deliveryAddress')}>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label={t('city')} className="col-span-1">
                  <Input value={city} onChange={(e) => setCity(e.target.value)} />
                </Field>
                <Field label={t('floor')} className="col-span-1">
                  <Input value={floor} onChange={(e) => setFloor(e.target.value)} />
                </Field>
                <Field label={t('apt')} className="col-span-1">
                  <Input value={apt} onChange={(e) => setApt(e.target.value)} />
                </Field>
              </div>
              <Field label={t('deliveryNotes')}>
                <Textarea value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} />
              </Field>
            </>
          )}
        </div>

        {/* Payment: method + "déjà encaissé ?" */}
        <div className="flex flex-col gap-2">
          <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
            {t('payment')}
          </span>
          <div className="grid grid-cols-3 gap-2">
            {payMethods.map((p) => (
              <OptionTile key={p.key} active={payMethod === p.key} onClick={() => setPayMethod(p.key)} icon={p.icon} label={p.label} />
            ))}
          </div>

          {/* The payment link is always paid by the customer via the provider, so
              the collected toggle only applies to cash / card. */}
          {payMethod !== 'link' && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--s-3)] py-2">
              <span className="text-fs-sm font-medium text-[var(--fg)]">{t('payAlreadyCollected')}</span>
              <div className="inline-flex rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] p-0.5">
                <ToggleButton active={collected} onClick={() => setCollected(true)} label={t('yes')} />
                <ToggleButton active={!collected} onClick={() => setCollected(false)} label={t('no')} />
              </div>
            </div>
          )}
        </div>

        {fulfillment.timing === 'scheduled' && (payMethod === 'link' || !collected) && (
          <p className="text-fs-xs text-[var(--fg-muted)]">{t('fulfillmentScheduledUnpaidHint')}</p>
        )}

        {error && <p className="text-fs-sm text-[var(--danger-500)]">{error}</p>}
      </div>
    </Drawer>
  );
}
