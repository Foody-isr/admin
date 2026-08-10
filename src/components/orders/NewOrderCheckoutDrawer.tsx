'use client';

import { useEffect, useRef, useState } from 'react';
import { Chip, Drawer, Field, Input, Textarea } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  ShoppingBagIcon, TruckIcon, BanknoteIcon, CreditCardIcon, LinkIcon, CheckIcon, TagIcon, XIcon,
} from 'lucide-react';
import { FulfillmentSection } from './FulfillmentSection';
import {
  buildFulfillmentTargets,
  defaultFulfillment,
  type FulfillmentValue,
} from '@/lib/orders/fulfillment';
import {
  listDiscounts, validateDiscount, checkDeliverable,
  type Discount, type BatchFulfillmentConfigResponse,
  type CustomerSearchResult, type CustomerSearchAddress,
} from '@/lib/api';
import { reasonKey } from '@/lib/discounts';
import { usePermissions } from '@/lib/permissions-context';
import { CustomerPicker } from './CustomerPicker';
import type { DraftCustomer } from '@/lib/orders/orderDraft';

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
  entryCode: string;
  deliveryNotes: string;
  /** Delivery fee in ₪ (0 for pickup). Prefilled from the matched delivery zone,
   *  editable by staff. */
  deliveryFee: number;
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

/** La part du drawer qui entre dans le brouillon. Le paiement, les remises et
 *  les frais de livraison en sont volontairement absents : les restaurer
 *  périmés créerait une commande faussement payée ou facturée au mauvais tarif. */
export interface DrawerDraftState {
  customer: DraftCustomer;
  linked: CustomerSearchResult | null;
  orderType: OrderType;
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
  /** Restaurant id — needed to load coupons and validate a discount code. */
  restaurantId: number;
  /** Cart lines in the shape required by POST /discounts/validate. */
  discountItems: DiscountItem[];
  /** Appelé quand la part brouillonnable de l'état change. La page compose
   *  l'enregistrement complet ; le drawer n'écrit rien lui-même. */
  onStateChange?: (state: DrawerDraftState) => void;
  /** État repris d'un brouillon, appliqué une seule fois au montage. */
  initialState?: DrawerDraftState;
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
  restaurantId, discountItems, onStateChange, initialState,
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
  const [entryCode, setEntryCode] = useState('');
  // Customer linked from the picker. Only used to show the chip and offer
  // their other addresses; it locks no field.
  const [linked, setLinked] = useState<CustomerSearchResult | null>(null);
  // A pick rewrites both the name and the phone field at once, so both
  // pickers' "don't re-search the value I just wrote" refs have to be armed
  // together (see CustomerPicker's skipNextSearchRef doc comment).
  const nameSkipSearchRef = useRef(false);
  const phoneSkipSearchRef = useRef(false);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  // Delivery fee (₪). Prefilled from the matched zone via checkDeliverable, but
  // fully editable — once staff type a value, `feeTouched` stops the auto-prefill
  // from overwriting it.
  const [deliveryFee, setDeliveryFee] = useState('');
  const [feeTouched, setFeeTouched] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethodChoice>('cash');
  // "déjà encaissé ?" — has the payment already been collected. Defaults to yes
  // (the common POS case: staff take payment in hand). Ignored for `link`.
  const [collected, setCollected] = useState(true);
  // "Ajouter au plan de production" override: pins the order onto the production
  // sheet even when it wouldn't normally qualify (unscheduled / unpaid).
  const [addToProduction, setAddToProduction] = useState(false);

  const [fulfillment, setFulfillment] = useState<FulfillmentValue>({ timing: 'immediate' });

  // ── Draft restore / report ──────────────────────────────────────────────────
  // Applies a restored draft exactly once, on mount. Ref-guarded rather than an
  // `initialState !== null` check alone: `initialState` can stay the same object
  // across re-renders (the page only sets it once), but the guard is what
  // guarantees a late-arriving prop never re-applies over what the staff has
  // since typed — this is the WhatsApp-recap-dialog bug, avoided on purpose.
  const didApplyInitial = useRef(false);
  // Le créneau repris attend d'être consommé par la première ouverture. Sans
  // ce drapeau, la branche d'ouverture ci-dessous écrasait le créneau restauré
  // par le créneau par défaut (la première série à venir, ou « Immédiat ») :
  // `didInitFulfillment` est remis à false à chaque rendu fermé, y compris le
  // tout premier, donc la première ouverture se croyait toujours la première
  // ouverture d'un formulaire vierge. L'effet de remontée persistait ensuite le
  // créneau écrasé dans le brouillon, si bien que le créneau était capturé,
  // restauré, puis jeté sur le seul chemin qui le consomme.
  const draftFulfillmentPending = useRef<FulfillmentValue | null>(null);
  useEffect(() => {
    if (didApplyInitial.current || !initialState) return;
    didApplyInitial.current = true;
    draftFulfillmentPending.current = initialState.fulfillment;
    // Le nom et le téléphone repris ne sont pas une frappe du staff : sans
    // armer les deux refs, l'effet de recherche de CustomerPicker partirait sur
    // la valeur restaurée et ouvrirait sa liste par-dessus un champ autofocus,
    // où Entrée sélectionne la ligne surlignée.
    nameSkipSearchRef.current = true;
    phoneSkipSearchRef.current = true;
    setCustomerName(initialState.customer.name);
    setCustomerPhone(initialState.customer.phone);
    setAddress(initialState.customer.address);
    setCity(initialState.customer.city);
    setFloor(initialState.customer.floor);
    setApt(initialState.customer.apt);
    setEntryCode(initialState.customer.entryCode);
    setDeliveryNotes(initialState.customer.deliveryNotes);
    setLinked(initialState.linked);
    setOrderType(initialState.orderType);
    setFulfillment(initialState.fulfillment);
  }, [initialState]);

  // Reports the draftable slice of state up on every change, so the page can
  // fold it into the persisted draft. `onStateChange` is `setDrawerState` from
  // the page — a `useState` setter, stable across renders — so this effect
  // never loops.
  useEffect(() => {
    onStateChange?.({
      customer: {
        name: customerName, phone: customerPhone,
        address, city, floor, apt, entryCode, deliveryNotes,
      },
      linked, orderType, fulfillment,
    });
  }, [customerName, customerPhone, address, city, floor, apt, entryCode,
      deliveryNotes, linked, orderType, fulfillment, onStateChange]);

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
      // Deliberately does NOT touch customer-sheet fields (name, phone, address,
      // city, floor, apt, entryCode, deliveryNotes, linked): those are meant to
      // survive a close/reopen exactly like the rest of the sheet, and since
      // Task 3 they're also what a persisted draft records. Resetting entryCode
      // or linked here used to silently drop them from the draft on every close.
      setCouponCode('');
      setDiscountError(null);
      setAppliedCoupon(null);
      setManualType('fixed');
      setManualValue('');
      setManualReason('');
      setAppliedManual(null);
      setDeliveryFee('');
      setFeeTouched(false);
      return;
    }
    if (didInitFulfillment.current) return;
    didInitFulfillment.current = true;
    // Un créneau repris d'un brouillon a déjà été posé au montage : le défaut
    // ne doit pas passer par-dessus. Consommé une fois, pour que les
    // ouvertures suivantes retrouvent le comportement habituel.
    //
    // Sauf s'il n'est plus proposable : douze heures suffisent à faire passer
    // une série. Un créneau repris qui ne figure plus parmi les cibles ne peut
    // pas être choisi dans le sélecteur — il partirait tel quel, sur une date
    // que le restaurant ne sert plus. Dans ce cas seulement, le défaut reprend
    // la main.
    const pending = draftFulfillmentPending.current;
    draftFulfillmentPending.current = null;
    if (pending && (pending.timing === 'immediate' || targets.length === 0)) return;
    if (pending) {
      // La date suffit à retrouver la série, mais pas à la décrire : ses heures
      // ont pu bouger depuis. On garde la date reprise et on relit ses heures
      // sur la cible fraîche — sinon le sélecteur affiche le nouveau créneau
      // pendant que la commande part avec l'ancien.
      const match = targets.find((tg) => tg.date === pending.scheduledFor);
      if (match) {
        setFulfillment({
          timing: 'scheduled',
          scheduledFor: match.date,
          windowStart: match.windowStart,
          windowEnd: match.windowEnd,
        });
        return;
      }
    }
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

  // Prefill the delivery fee from the matched delivery zone once the address
  // settles (debounced). Only while staff haven't hand-edited the fee, and only
  // when the address resolves inside a zone with a fee — otherwise the field is
  // left for staff to fill in. Staff can always override the prefilled value.
  useEffect(() => {
    if (orderType !== 'delivery' || feeTouched) return;
    const addr = address.trim();
    if (!addr) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      checkDeliverable(restaurantId, addr, city.trim() || undefined)
        .then((res) => {
          if (cancelled || feeTouched) return;
          if (res.deliverable && typeof res.delivery_fee === 'number' && res.delivery_fee > 0) {
            setDeliveryFee(String(res.delivery_fee));
          }
        })
        .catch(() => {});
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderType, address, city, feeTouched, restaurantId]);

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
        delivery_fee: orderType === 'delivery' ? Math.max(0, parseFloat(deliveryFee) || 0) : 0,
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
        : Math.round(total * (Math.min(100, Math.max(0, val)) / 100) * 100) / 100;
    setAppliedManual({ type: manualType, value: val, reason: manualReason.trim(), amount });
    setAppliedCoupon(null); // mutually exclusive
    setDiscountError(null);
  }

  function clearDiscount() {
    setAppliedCoupon(null);
    setAppliedManual(null);
    setDiscountError(null);
  }

  // Delivery fee in ₪ (only for delivery; negatives/blank → 0). Added to the
  // order total the same way the server does (subtotal + fee - discount).
  const feeValue = orderType === 'delivery' ? Math.max(0, parseFloat(deliveryFee) || 0) : 0;

  // A manual discount typed into the fields but not yet confirmed with the inner
  // "Apply" button. Honouring it makes that button optional: staff who fill the
  // amount + reason and go straight to "Create order" still get the discount,
  // instead of silently losing it. Mirrors applyManualDiscount's math.
  const manualValNum = parseFloat(manualValue);
  const pendingManual =
    canManualDiscount && !appliedCoupon && !appliedManual && manualValNum > 0 && manualReason.trim()
      ? {
          type: manualType,
          value: manualValNum,
          reason: manualReason.trim(),
          amount:
            manualType === 'fixed'
              ? Math.min(manualValNum, total)
              : Math.round(total * (Math.min(100, Math.max(0, manualValNum)) / 100) * 100) / 100,
        }
      : null;
  // The manual discount that actually applies: an explicitly-applied one wins,
  // else the pending typed one. A coupon takes precedence over both.
  const effectiveManual = appliedCoupon ? null : (appliedManual ?? pendingManual);

  // The applied discount amount (0 if none). Clamped so total never goes negative.
  const appliedAmount = appliedCoupon?.amount ?? effectiveManual?.amount ?? 0;
  const discountedTotal = Math.max(0, total + feeValue - appliedAmount);

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

  // Fill the sheet from an existing customer. The most recent address is
  // prefilled; the others stay reachable under the Address field. Arms both
  // pickers' skip-ref before writing either field, so neither one mistakes
  // this fill for a fresh search.
  const applyCustomer = (customer: CustomerSearchResult) => {
    nameSkipSearchRef.current = true;
    phoneSkipSearchRef.current = true;
    setLinked(customer);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone);
    if (customer.addresses.length > 0) applyAddress(customer.addresses[0]);
  };

  const applyAddress = (a: CustomerSearchAddress) => {
    setAddress(a.address);
    setCity(a.city);
    setFloor(a.floor);
    setApt(a.apt);
    setEntryCode(a.entry_code);
    setDeliveryNotes(a.delivery_notes);
    // The new address's fee must be recomputed, not inherited.
    setFeeTouched(false);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('checkout')}
      subtitle={`${itemCount} ${t('orderItems').toLowerCase()} · ₪${discountedTotal.toFixed(2)}`}
      width={480}
      onSave={() =>
        onConfirm({
          customerName, customerPhone, orderType, address, city, floor, apt, entryCode,
          deliveryNotes, deliveryFee: feeValue, paymentMethod: payMethod, paymentCollected: collected,
          fulfillment, addToProduction,
          ...(appliedCoupon ? { discountCode: appliedCoupon.code } : {}),
          ...(effectiveManual
            ? { manualDiscount: { type: effectiveManual.type, value: effectiveManual.value, reason: effectiveManual.reason } }
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
            <CustomerPicker
              restaurantId={restaurantId}
              field="name"
              value={customerName}
              onChange={(v) => { setCustomerName(v); setLinked(null); }}
              onPick={applyCustomer}
              placeholder={t('customerNamePlaceholder')}
              autoFocus
              skipNextSearchRef={nameSkipSearchRef}
            />
          </Field>
          <Field label={t('customerPhone')}>
            <CustomerPicker
              restaurantId={restaurantId}
              field="phone"
              value={customerPhone}
              onChange={(v) => { setCustomerPhone(v); setLinked(null); }}
              onPick={applyCustomer}
              placeholder="05X-XXXXXXX"
              skipNextSearchRef={phoneSkipSearchRef}
            />
          </Field>
          {linked && (
            // The whole chip unlinks on click (its trailing × is decorative,
            // not a nested button) — a single interactive element stays valid
            // HTML and mirrors correctly in RTL for free.
            <Chip
              onClick={() => setLinked(null)}
              trailing={<XIcon className="size-3.5" aria-hidden="true" />}
              aria-label={`${t('customerPickerLinked')} · ${t('customerPickerOrders').replace('{n}', String(linked.order_count))}. ${t('close')}`}
              className="self-start"
            >
              {t('customerPickerLinked')} · {t('customerPickerOrders').replace('{n}', String(linked.order_count))}
            </Chip>
          )}

          {orderType === 'delivery' && (
            <>
              <Field label={t('deliveryAddress')}>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>

              {linked && linked.addresses.length > 1 && (
                <div className="flex flex-wrap items-center gap-[var(--s-2)]">
                  <span className="text-fs-sm text-[var(--fg-muted)]">
                    {t('customerPickerKnownAddresses').replace('{n}', String(linked.addresses.length))}
                  </span>
                  {linked.addresses.map((a) => (
                    <Chip
                      key={`${a.address}|${a.city}|${a.floor}|${a.apt}`}
                      onClick={() => applyAddress(a)}
                    >
                      {[a.address, a.city].filter(Boolean).join(', ')}
                    </Chip>
                  ))}
                </div>
              )}

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
              <Field label={t('buildingCode')}>
                <Input value={entryCode} onChange={(e) => setEntryCode(e.target.value)} />
              </Field>
              <Field label={t('deliveryNotes')}>
                <Textarea value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)} />
              </Field>
              <Field label={t('deliveryFee')}>
                <Input
                  value={deliveryFee}
                  onChange={(e) => { setDeliveryFee(e.target.value); setFeeTouched(true); }}
                  inputMode="decimal"
                  placeholder="0.00"
                />
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
                      <option key={c.id} value={c.code}>{c.code}{c.name ? ` (${c.name})` : ''}</option>
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
