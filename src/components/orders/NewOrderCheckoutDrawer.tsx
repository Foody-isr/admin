'use client';

import { useState } from 'react';
import { Drawer, Field, Input, Textarea } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  ShoppingBagIcon, TruckIcon, BanknoteIcon, CreditCardIcon, ClockIcon, LinkIcon,
} from 'lucide-react';

export type OrderType = 'pickup' | 'delivery';
export type PaymentChoice = 'cash_paid' | 'card_paid' | 'unpaid' | 'link';

export interface CheckoutData {
  customerName: string;
  customerPhone: string;
  orderType: OrderType;
  address: string;
  city: string;
  floor: string;
  apt: string;
  deliveryNotes: string;
  payment: PaymentChoice;
}

interface NewOrderCheckoutDrawerProps {
  open: boolean;
  onClose: () => void;
  total: number;
  itemCount: number;
  submitting: boolean;
  error: string | null;
  onConfirm: (data: CheckoutData) => void;
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

export function NewOrderCheckoutDrawer({
  open, onClose, total, itemCount, submitting, error, onConfirm,
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
  const [payment, setPayment] = useState<PaymentChoice>('cash_paid');

  const canConfirm =
    customerName.trim().length > 0 &&
    customerPhone.trim().length > 0 &&
    (orderType !== 'delivery' || address.trim().length > 0) &&
    !submitting;

  const payChoices: { key: PaymentChoice; icon: React.ReactNode; label: string }[] = [
    { key: 'cash_paid', icon: <BanknoteIcon />, label: t('payCashPaid') },
    { key: 'card_paid', icon: <CreditCardIcon />, label: t('payCardPaid') },
    { key: 'unpaid', icon: <ClockIcon />, label: t('payUnpaid') },
    { key: 'link', icon: <LinkIcon />, label: t('paySendLink') },
  ];

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('checkout')}
      subtitle={`${itemCount} ${t('orderItems').toLowerCase()} · ₪${total.toFixed(2)}`}
      width={480}
      onSave={() =>
        onConfirm({ customerName, customerPhone, orderType, address, city, floor, apt, deliveryNotes, payment })
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

        {/* Payment */}
        <div className="flex flex-col gap-2">
          <span className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
            {t('payment')}
          </span>
          <div className="grid grid-cols-2 gap-2">
            {payChoices.map((p) => (
              <OptionTile key={p.key} active={payment === p.key} onClick={() => setPayment(p.key)} icon={p.icon} label={p.label} />
            ))}
          </div>
        </div>

        {error && <p className="text-fs-sm text-[var(--danger-500)]">{error}</p>}
      </div>
    </Drawer>
  );
}
