'use client';

import { useEffect, useRef, useState } from 'react';
import { Drawer, Field, Input, Textarea } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  ShoppingBagIcon, TruckIcon, BanknoteIcon, CreditCardIcon, LinkIcon, CheckIcon, TagIcon,
} from 'lucide-react';
import { FulfillmentSection } from './FulfillmentSection';
import {
  buildFulfillmentTargets,
  defaultFulfillment,
  type FulfillmentValue,
} from '@/lib/orders/fulfillment';
import { listDiscounts, validateDiscount, type Discount, type BatchFulfillmentConfigResponse } from '@/lib/api';
import { reasonKey } from '@/lib/discounts';
import { usePermissions } from '@/lib/permissions-context';

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
  /** Force the order onto the production sheet regardless of scheduling/payment. */
  addToProduction: boolean;
  /** Coupon code applied by staff (mutually exclusive with manualDiscount). */
  discountCode?: string;
  /** Manual discount applied by staff with orders.discount permission (mutually exclusive with discountCode). */
  manualDiscount?: { type: 'fixed' | 'percent'; value: number; reason: string };
}

/** A single cart line in the format the discount validate endpoint expects. */
export interface DiscountItem {
  item_id: number;
  category_id: number;
  line_total: number;
  quantity: number;
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
  /** Restaurant id — needed to load coupons and validate a discount code. */
  restaurantId: number;
  /** Cart lines in the shape required by POST /discounts/validate. */
  discountItems: DiscountItem[];
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
  restaurantId, discountItems,
}: NewOrderCheckoutDrawerProps) {
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManualDiscount = hasAnyPermission('orders.discount');

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
  // "Ajouter au plan de production" override: pins the order onto the production
  // sheet even when it wouldn't normally qualify (unscheduled / unpaid).
  const [addToProduction, setAddToProduction] = useState(false);

  const [fulfillment, setFulfillment] = useState<FulfillmentValue>({ timing: 'immediate' });

  // ── Discount state ────────────────────────────────────────────────────────
  const [coupons, setCoupons] = useState<Discount[]>([]);
  const [couponCode, setCouponCode] = useState('');
  const [discountValidating, setDiscountValidating] = useState(false);
  const [discountError, setDiscountError] = useState<string | null>(null);
  // Applied coupon after a successful validate call.
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; amount: number; newTotal: number } | null>(null);
  // Manual discount inputs (requires orders.discount permission).
  const [manualType, setManualType] = useState<'fixed' | 'percent'>('fixed');
  const [manualValue, setManualValue] = useState('');
  const [manualReason, setManualReason] = useState('');
  // Applied manual discount (computed locally; server is authoritative on create).
  const [appliedManual, setAppliedManual] = useState<{ type: 'fixed' | 'percent'; value: number; reason: string; amount: number } | null>(null);

  // Default to Programmée on the first batch target when batch mode is on; falls
  // back to Immédiate otherwise. Runs once per drawer-open (ref-guarded).
  const targets = buildFulfillmentTargets(batchConfig, orderType);
  const didInitFulfillment = useRef(false);
  useEffect(() => {
    if (!open) {
      didInitFulfillment.current = false;
      // Reset discount state when the drawer closes so it starts fresh next time.
      setCouponCode('');
      setDiscountError(null);
      setAppliedCoupon(null);
      setManualType('fixed');
      setManualValue('');
      setManualReason('');
      setAppliedManual(null);
      return;
    }
    if (didInitFulfillment.current) return;
    didInitFulfillment.current = true;
    const preferred = defaultDate ? targets.find((tg) => tg.date === defaultDate) : undefined;
    setFulfillment(
      preferred
        ? { timing: 'scheduled', scheduledFor: preferred.date, windowStart: preferred.windowStart, windowEnd: preferred.windowEnd }
        : defaultFulfillment(targets),
    );
  }, [open, targets, defaultDate]);

  // Load active coupons once per restaurant (silently; no error shown on failure).
  useEffect(() => {
    listDiscounts(restaurantId, { active: true }).then(setCoupons).catch(() => {});
  }, [restaurantId]);

  // ── Discount helpers ──────────────────────────────────────────────────────
  async function applyDiscountCode() {
    const code = couponCode.trim();
    if (!code) return;
    setDiscountValidating(true);
    setDiscountError(null);
    setAppliedCoupon(null);
    setAppliedManual(null); // coupon and manual are mutually exclusive
    try {
      const res = await validateDiscount(restaurantId, {
        code,
        items: discountItems,
        delivery_fee: 0,
        phone: customerPhone.trim() || undefined,
      });
      if (res.valid && res.discount) {
        setAppliedCoupon({ code, amount: res.discount.amount, newTotal: res.discount.new_total });
      } else {
        setDiscountError(t(reasonKey(res.reason ?? 'not_found')));
      }
    } catch {
      setDiscountError(t('invalidCode'));
    } finally {
      setDiscountValidating(false);
    }
  }

  function applyManualDiscount() {
    const val = parseFloat(manualValue);
    if (!val || val <= 0 || !manualReason.trim()) return;
    const amount =
      manualType === 'fixed'
        ? Math.min(val, total)
        : Math.round(total * (val / 100) * 100) / 100;
    setAppliedManual({ type: manualType, value: val, reason: manualReason.trim(), amount });
    setAppliedCoupon(null); // mutually exclusive
    setDiscountError(null);
  }

  function clearDiscount() {
    setAppliedCoupon(null);
    setAppliedManual(null);
    setDiscountError(null);
  }

  // The applied discount amount (0 if none). Clamped so total never goes negative.
  const appliedAmount = appliedCoupon?.amount ?? appliedManual?.amount ?? 0;
  const discountedTotal = Math.max(0, total - appliedAmount);

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
      subtitle={`${itemCount} ${t('orderItems').toLowerCase()} · ₪${discountedTotal.toFixed(2)}`}
      width={480}
      onSave={() =>
        onConfirm({
          customerName, customerPhone, orderType, address, city, floor, apt,
          deliveryNotes, paymentMethod: payMethod, paymentCollected: collected,
          fulfillment, addToProduction,
          ...(appliedCoupon ? { discountCode: appliedCoupon.code } : {}),
          ...(appliedManual && !appliedCoupon
            ? { manualDiscount: { type: appliedManual.type, value: appliedManual.value, reason: appliedManual.reason } }
            : {}),
        })
      }
      saveLabel={submitting ? `${t('creating')}…` : `${t('createOrder')} · ₪${discountedTotal.toFixed(2)}`}
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

        {/* Discount: coupon code picker + manual discount (permission-gated) */}
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-[var(--s-2)] text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
            <TagIcon className="size-3.5" />
            {t('applyDiscount')}
          </span>

          {/* Applied discount summary */}
          {(appliedCoupon || appliedManual) ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--success-200)] bg-[var(--success-50)] px-[var(--s-3)] py-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-fs-sm font-semibold text-[var(--success-700)]">
                  {appliedCoupon
                    ? `${t('discountLine')} (${appliedCoupon.code})`
                    : t('manualDiscount')}
                  {' '}
                  <span className="font-mono tabular-nums">−₪{appliedAmount.toFixed(2)}</span>
                </span>
                <span className="font-mono tabular-nums text-fs-xs text-[var(--success-600)]">
                  {t('total')}: ₪{discountedTotal.toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                onClick={clearDiscount}
                className="text-fs-xs font-medium text-[var(--fg-muted)] underline-offset-2 hover:text-[var(--danger-500)] hover:underline"
              >
                {t('remove')}
              </button>
            </div>
          ) : (
            <>
              {/* Coupon select + code input */}
              <div className="flex gap-2">
                {coupons.length > 0 && (
                  <select
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value); setDiscountError(null); }}
                    className="h-9 flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] ps-[var(--s-3)] pe-[var(--s-3)] text-fs-sm outline-none focus:border-[var(--brand-500)] focus:shadow-ring"
                  >
                    <option value="">{t('chooseCoupon')}</option>
                    {coupons.map((c) => (
                      <option key={c.id} value={c.code}>{c.code}{c.name ? ` — ${c.name}` : ''}</option>
                    ))}
                  </select>
                )}
                <Input
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value); setDiscountError(null); }}
                  placeholder={t('enterCode')}
                  className={coupons.length > 0 ? 'w-32 shrink-0' : 'flex-1'}
                />
                <button
                  type="button"
                  disabled={!couponCode.trim() || discountValidating}
                  onClick={applyDiscountCode}
                  className="h-9 shrink-0 rounded-lg border border-[var(--brand-500)] bg-[var(--brand-500)] px-[var(--s-3)] text-fs-sm font-medium text-white transition-colors hover:bg-[var(--brand-600)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {discountValidating ? '…' : t('apply')}
                </button>
              </div>

              {discountError && (
                <p className="text-fs-xs text-[var(--danger-500)]">{discountError}</p>
              )}

              {/* Manual discount (owner/manager with orders.discount permission only) */}
              {canManualDiscount && (
                <div className="flex flex-col gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface-2)] p-[var(--s-3)]">
                  <span className="text-fs-xs font-semibold text-[var(--fg-muted)]">{t('manualDiscount')}</span>
                  <div className="flex gap-2">
                    <select
                      value={manualType}
                      onChange={(e) => setManualType(e.target.value as 'fixed' | 'percent')}
                      className="h-9 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] ps-[var(--s-3)] pe-[var(--s-3)] text-fs-sm outline-none focus:border-[var(--brand-500)] focus:shadow-ring"
                    >
                      <option value="fixed">{t('typeFixed')}</option>
                      <option value="percent">{t('typePercent')}</option>
                    </select>
                    <Input
                      value={manualValue}
                      onChange={(e) => setManualValue(e.target.value)}
                      placeholder={manualType === 'fixed' ? '0.00' : '0'}
                      inputMode="decimal"
                      className="w-24 shrink-0"
                    />
                  </div>
                  <Field label={t('manualDiscountReason')}>
                    <Input
                      value={manualReason}
                      onChange={(e) => setManualReason(e.target.value)}
                      placeholder={t('manualDiscountReason')}
                    />
                  </Field>
                  <button
                    type="button"
                    disabled={!manualValue || parseFloat(manualValue) <= 0 || !manualReason.trim()}
                    onClick={applyManualDiscount}
                    className="self-end rounded-lg border border-[var(--brand-500)] bg-[var(--brand-500)] px-[var(--s-3)] py-1 text-fs-sm font-medium text-white transition-colors hover:bg-[var(--brand-600)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('apply')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Force onto the production sheet, bypassing the scheduled/paid gates. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={addToProduction}
          onClick={() => setAddToProduction((v) => !v)}
          className="flex items-start gap-[var(--s-3)] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--s-3)] py-2 text-left"
        >
          <span
            className={cn(
              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
              addToProduction
                ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                : 'border-[var(--line-strong)] bg-[var(--surface-2)]',
            )}
          >
            {addToProduction && <CheckIcon className="h-3 w-3" strokeWidth={3} />}
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-fs-sm font-medium text-[var(--fg)]">{t('addToProduction')}</span>
            <span className="text-fs-xs text-[var(--fg-muted)]">{t('addToProductionHint')}</span>
          </span>
        </button>

        {fulfillment.timing === 'scheduled' && (payMethod === 'link' || !collected) && (
          <p className="text-fs-xs text-[var(--fg-muted)]">{t('fulfillmentScheduledUnpaidHint')}</p>
        )}

        {error && <p className="text-fs-sm text-[var(--danger-500)]">{error}</p>}
      </div>
    </Drawer>
  );
}
