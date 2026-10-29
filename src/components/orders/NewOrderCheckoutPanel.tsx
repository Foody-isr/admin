'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Chip, Field, Input } from '@/components/ds';
import { useI18n, useCurrency } from '@/lib/i18n';
import { ChoiceRow } from '@/components/ds/Selection';
import { cn } from '@/lib/utils';
import {
  ShoppingBagIcon, TruckIcon, BanknoteIcon, CreditCardIcon, LinkIcon, CheckIcon, TagIcon, XIcon, ArrowLeftIcon, ClockIcon, ChevronDownIcon,
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
import { CustomerDeliveryFields } from '@/components/customers/CustomerDeliveryFields';
import type { DraftCustomer } from '@/lib/orders/orderDraft';
import styles from './order-checkout.module.css';
import { internalOrderPayment, type InternalPaymentIntent, type InternalPaymentMethod } from '@/lib/orders/internal-order-payment';

export type OrderType = 'pickup' | 'delivery';
/** Existing payment choices sent to the restaurant-scoped create endpoint. */
export type PaymentMethodChoice = InternalPaymentMethod;

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

/** La part de la finalisation qui entre dans le brouillon. Le paiement, les remises et
 *  les frais de livraison en sont volontairement absents : les restaurer
 *  périmés créerait une commande faussement payée ou facturée au mauvais tarif. */
export interface DrawerDraftState {
  customer: DraftCustomer;
  linked: CustomerSearchResult | null;
  orderType: OrderType;
  fulfillment: FulfillmentValue;
}

interface NewOrderCheckoutPanelProps {
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
   *  l'enregistrement complet ; le panneau n'écrit rien lui-même. */
  onStateChange?: (state: DrawerDraftState) => void;
  /** État repris d'un brouillon, appliqué une seule fois au montage. */
  initialState?: DrawerDraftState;
  itemsSummary?: React.ReactNode;
  sumitCheckoutEnabled?: boolean;
  sumitCardEnabled?: boolean;
}

/** Finalizes the current basket inline, preserving its draft and explicit payment intent. */
export function NewOrderCheckoutPanel({
  open, onClose, total, itemCount, submitting, error, onConfirm, batchConfig, defaultDate,
  restaurantId, discountItems, onStateChange, initialState, itemsSummary, sumitCheckoutEnabled = false, sumitCardEnabled = false,
}: NewOrderCheckoutPanelProps) {
  const { money } = useCurrency();
  const { t } = useI18n();
  const { hasAnyPermission } = usePermissions();
  const canManualDiscount = hasAnyPermission('orders.discount');
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (open) headingRef.current?.focus(); }, [open]);

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
  const [intent, setIntent] = useState<InternalPaymentIntent | null>(null);
  const [recordedMethod, setRecordedMethod] = useState<'cash' | 'card'>('cash');
  const [received, setReceived] = useState(false);
  const [optionalCustomer, setOptionalCustomer] = useState(false);
  const payment = internalOrderPayment(intent, recordedMethod, received);
  const payMethod = payment?.paymentMethod ?? 'cash';
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
  // A restored service date is consumed on first opening before any default.
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
  const discountRequest = useRef(0);
  const discountContext = JSON.stringify([restaurantId, discountItems, orderType, payMethod === 'link' ? 0 : deliveryFee, customerPhone]);
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

  // A quote belongs to the basket, delivery fee and customer it was requested for.
  useEffect(() => {
    discountRequest.current += 1;
    setDiscountValidating(false);
    setAppliedCoupon(null);
    setDiscountError(null);
  }, [open, discountContext]);

  // Preserve the chosen date while returning to articles; refresh changed series windows.
  const targets = useMemo(() => buildFulfillmentTargets(batchConfig, orderType), [batchConfig, orderType]);
  const fulfillmentContext = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      setReceived(false);
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
    const context = `${orderType}:${defaultDate ?? ''}`;
    if (fulfillmentContext.current === context) {
      if (fulfillment.timing === 'immediate' || targets.length === 0) return;
      const current = targets.find(target => target.date === fulfillment.scheduledFor);
      if (current) {
        if (current.windowStart !== fulfillment.windowStart || current.windowEnd !== fulfillment.windowEnd) {
          setFulfillment({ timing: 'scheduled', scheduledFor: current.date, windowStart: current.windowStart, windowEnd: current.windowEnd });
        }
        return;
      }
    }
    fulfillmentContext.current = context;
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
  }, [open, targets, defaultDate, orderType, fulfillment]);

  // Load active coupons once per restaurant (silently; no error shown on failure).
  useEffect(() => {
    listDiscounts(restaurantId, { active: true }).then(setCoupons).catch(() => {});
  }, [restaurantId]);

  // Prefill the delivery fee from the matched delivery zone once the address
  // settles (debounced). Only while staff haven't hand-edited the fee, and only
  // when the address resolves inside a zone with a fee — otherwise the field is
  // left for staff to fill in. Staff can always override the prefilled value.
  useEffect(() => {
    if (!open || !intent || payMethod === 'link' || orderType !== 'delivery' || feeTouched) return;
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
  }, [open, intent, payMethod, orderType, address, city, feeTouched, restaurantId]);

  // ── Discount helpers ──────────────────────────────────────────────────────
  async function applyDiscountCode() {
    const code = couponCode.trim();
    if (!code) return;
    const request = ++discountRequest.current;
    setDiscountValidating(true);
    setDiscountError(null);
    setAppliedCoupon(null);
    setAppliedManual(null); // coupon and manual are mutually exclusive
    try {
      const res = await validateDiscount(restaurantId, {
        code,
        items: discountItems,
        delivery_fee: orderType === 'delivery' && payMethod !== 'link' ? Math.max(0, parseFloat(deliveryFee) || 0) : 0,
        phone: customerPhone.trim() || undefined,
      });
      if (request !== discountRequest.current) return;
      if (res.valid && res.discount) {
        setAppliedCoupon({ code, amount: res.discount.amount, newTotal: res.discount.new_total });
      } else {
        setDiscountError(t(reasonKey(res.reason ?? 'not_found')));
      }
    } catch {
      if (request === discountRequest.current) setDiscountError(t('invalidCode'));
    } finally {
      if (request === discountRequest.current) setDiscountValidating(false);
    }
  }

  function applyManualDiscount() {
    const val = parseFloat(manualValue);
    if (!Number.isFinite(val) || val <= 0 || (manualType === 'percent' && val > 100) || !manualReason.trim()) return;
    const amount =
      manualType === 'fixed'
        ? Math.min(val, total)
        : Math.round(total * (Math.min(100, Math.max(0, val)) / 100) * 100) / 100;
    setAppliedManual({ type: manualType, value: val, reason: manualReason.trim(), amount });
    setAppliedCoupon(null); // mutually exclusive
    setDiscountError(null);
  }

  function clearDiscount() {
    discountRequest.current += 1;
    setDiscountValidating(false);
    setManualValue('');
    setManualReason('');
    setAppliedCoupon(null);
    setAppliedManual(null);
    setDiscountError(null);
  }

  // Delivery fee in ₪ (only for delivery; negatives/blank → 0). Added to the
  // order total the same way the server does (subtotal + fee - discount).
  const feeValue = orderType === 'delivery' && payMethod !== 'link' ? Math.max(0, parseFloat(deliveryFee) || 0) : 0;

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

  const hosted = payMethod === 'link' || payMethod === 'sumit_card';
  const capabilityReady = intent !== 'link' || sumitCheckoutEnabled;
  const cardReady = intent !== 'charge_card' || sumitCardEnabled;
  const contactReady = intent === 'link' || !!(customerName.trim() && customerPhone.trim());
  const addressReady = intent === 'link' || orderType !== 'delivery' || !!address.trim();
  const fulfillmentReady = fulfillment.timing === 'immediate' || !!(fulfillment.scheduledFor && /^\d{4}-\d{2}-\d{2}$/.test(fulfillment.scheduledFor) &&
    ((!fulfillment.windowStart && !fulfillment.windowEnd) || (fulfillment.windowStart && fulfillment.windowEnd && fulfillment.windowStart < fulfillment.windowEnd)));
  const manualStarted = canManualDiscount && !appliedCoupon && !appliedManual && !!(manualValue.trim() || manualReason.trim());
  const manualReady = !manualStarted || (Number.isFinite(manualValNum) && manualValNum > 0 && (manualType !== 'percent' || manualValNum <= 100) && !!manualReason.trim());
  const validationHint = !intent || !capabilityReady || !cardReady ? t('orderCheckoutChoose')
    : !fulfillmentReady ? t('orderCheckoutFulfillmentRequired')
    : !contactReady ? t('orderCheckoutContactRequired')
    : !addressReady ? t('orderCheckoutAddressRequired')
    : !manualReady ? t('orderCheckoutDiscountInvalid')
    : hosted && discountedTotal <= 0 ? t('orderCheckoutPositiveTotal')
    : intent === 'record' && !received ? t('orderCheckoutReceivedRequired') : '';
  const canConfirm = !validationHint && !submitting && !discountValidating && total > 0;
  const showCustomer = intent && (intent !== 'link' || optionalCustomer || customerName || customerPhone);
  const actionLabel = intent === 'link' ? t('orderCheckoutCreateLink') : intent === 'charge_card' ? t('orderCheckoutOpenCard')
    : intent === 'record' ? t('orderCheckoutRecordAction') : t('createOrder');
  const intents: { key: InternalPaymentIntent; icon: React.ReactNode; label: string; hint: string }[] = [
    ...(sumitCheckoutEnabled ? [{ key: 'link' as const, icon: <LinkIcon />, label: t('orderCheckoutLink'), hint: t('orderCheckoutLinkHint') }] : []),
    ...(sumitCardEnabled ? [{ key: 'charge_card' as const, icon: <CreditCardIcon />, label: t('orderCheckoutCard'), hint: t('orderCheckoutCardHint') }] : []),
    { key: 'record', icon: <BanknoteIcon />, label: t('orderCheckoutRecord'), hint: t('orderCheckoutRecordHint') },
    { key: 'later', icon: <ClockIcon />, label: t('orderCheckoutLater'), hint: t('orderCheckoutLaterHint') },
  ];
  function chooseIntent(value: InternalPaymentIntent) {
    setIntent(value);
    setReceived(false);
    setAddToProduction(false);
  }
  // Any amount or recorded-method change needs a fresh receipt acknowledgement.
  useEffect(() => { setReceived(false); }, [discountedTotal, recordedMethod]);

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

  function confirm() {
    if (!canConfirm || !payment) return;
    onConfirm({
      customerName, customerPhone, orderType,
      address: intent === 'link' ? '' : address, city: intent === 'link' ? '' : city,
      floor: intent === 'link' ? '' : floor, apt: intent === 'link' ? '' : apt,
      entryCode: intent === 'link' ? '' : entryCode, deliveryNotes: intent === 'link' ? '' : deliveryNotes,
      deliveryFee: feeValue, ...payment, fulfillment, addToProduction: hosted ? false : addToProduction,
      ...(appliedCoupon ? { discountCode: appliedCoupon.code } : {}),
      ...(effectiveManual ? { manualDiscount: { type: effectiveManual.type, value: effectiveManual.value, reason: effectiveManual.reason } } : {}),
    });
  }

  return <section aria-labelledby="order-finalization-title" data-order-finalization className={cn(styles.panel, 'min-h-0 flex-1 flex-col', open ? 'flex' : 'hidden')}>
    <header className="flex shrink-0 items-center gap-3 border-b border-[var(--line)] px-4 py-4">
      <Button variant="ghost" icon size="sm" onClick={onClose} disabled={submitting} aria-label={t('orderCheckoutBack')}><ArrowLeftIcon className="rtl:rotate-180" /></Button>
      <div className="flex min-w-0 items-center gap-2"><h2 ref={headingRef} tabIndex={-1} id="order-finalization-title" className="text-fs-md font-semibold focus:outline-none">{t('orderCheckoutTitle')}</h2><Badge>{itemCount}</Badge></div>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-4">
      <fieldset disabled={submitting} className="min-w-0 divide-y divide-[var(--line)]">
        {itemsSummary && <details className="py-4"><summary className="flex cursor-pointer list-none items-center justify-between text-fs-sm font-medium">{t('orderItems')}<ChevronDownIcon className="size-4" /></summary><div className="pt-3">{itemsSummary}</div></details>}
        <section className="space-y-4 py-5">
          <h3 className="text-fs-sm font-semibold">{t('orderCheckoutFulfillmentTitle')}</h3>
          <div className={cn(styles.paired, 'grid grid-cols-2 gap-2')}>
            <ChoiceRow type="radio" name="order-reception" checked={orderType === 'pickup'} onChange={() => setOrderType('pickup')} label={<span className="inline-flex items-center gap-2"><ShoppingBagIcon className="size-4" />{t('pickup')}</span>} />
            <ChoiceRow type="radio" name="order-reception" checked={orderType === 'delivery'} onChange={() => setOrderType('delivery')} label={<span className="inline-flex items-center gap-2"><TruckIcon className="size-4" />{t('delivery')}</span>} />
          </div>
          <FulfillmentSection serviceLabels orderType={orderType} batchConfig={batchConfig} value={fulfillment} onChange={setFulfillment} />
        </section>
        <fieldset className="min-w-0 py-5">
          <legend className="float-start mb-2 w-full text-fs-sm font-semibold">{t('orderCheckoutIntent')}</legend>
          <div className="clear-both divide-y divide-[var(--line)]">{intents.map(option => <ChoiceRow key={option.key} type="radio" name="order-payment-intent" aria-label={option.label} checked={intent === option.key} onChange={() => chooseIntent(option.key)}
            label={<span className="flex items-center gap-2"><span className="shrink-0 [&_svg]:size-4">{option.icon}</span>{option.label}</span>} description={option.hint} />)}</div>
          {(intent === 'record' || intent === 'later') && <div className="mt-4 space-y-3 rounded-lg bg-[var(--surface-2)] p-3">
            <p className="text-fs-xs font-medium text-[var(--fg-muted)]">{t(intent === 'record' ? 'orderCheckoutReceivedMethod' : 'orderCheckoutExpectedMethod')}</p>
            <div className={cn(styles.paired, 'grid grid-cols-2 gap-2')}>
              <ChoiceRow type="radio" name="order-recorded-method" checked={recordedMethod === 'cash'} onChange={() => setRecordedMethod('cash')} label={t('payMethodCash')} />
              <ChoiceRow type="radio" name="order-recorded-method" checked={recordedMethod === 'card'} onChange={() => setRecordedMethod('card')} label={t(intent === 'record' ? 'orderCheckoutExternalCard' : 'payMethodCard')} />
            </div>
            {intent === 'record' && <ChoiceRow type="checkbox" checked={received} onChange={event => setReceived(event.target.checked)} label={t('orderCheckoutReceived').replace('{amount}', money(discountedTotal))} />}
          </div>}
        </fieldset>
        {intent === 'link' && !showCustomer && <div className="py-4"><Button variant="ghost" size="sm" onClick={() => setOptionalCustomer(true)}>{t('orderCheckoutOptionalCustomer')}</Button></div>}
        {showCustomer && <section className="space-y-3 py-5"><h3 className="text-fs-sm font-semibold">{t('customer')}</h3>
        <div className="flex flex-col gap-[var(--s-3)]">
          <Field label={t('customerName')}>
            <CustomerPicker
              restaurantId={restaurantId}
              field="name"
              value={customerName}
              onChange={(v) => { setCustomerName(v); setLinked(null); }}
              onPick={applyCustomer}
              placeholder={t('customerNamePlaceholder')}
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

          {orderType === 'delivery' && payMethod !== 'link' && (
            <>
              <CustomerDeliveryFields
                value={{ address, city, floor, apt, entryCode, deliveryNotes }}
                onChange={(p) => {
                  if (p.address !== undefined) setAddress(p.address);
                  if (p.city !== undefined) setCity(p.city);
                  if (p.floor !== undefined) setFloor(p.floor);
                  if (p.apt !== undefined) setApt(p.apt);
                  if (p.entryCode !== undefined) setEntryCode(p.entryCode);
                  if (p.deliveryNotes !== undefined) setDeliveryNotes(p.deliveryNotes);
                }}
                underAddress={
                  linked && linked.addresses.length > 1 ? (
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
                  ) : null
                }
              />
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


        </section>}
        <details className="py-4"><summary className="flex cursor-pointer list-none items-center gap-2 text-fs-sm font-medium"><TagIcon className="size-4" /><span className="flex-1">{t('applyDiscount')}</span>{appliedAmount > 0 && <span className="tabular-nums">−{money(appliedAmount)}</span>}<ChevronDownIcon className="size-4" /></summary><div className="pt-4">
        <div className="flex flex-col gap-2">

          {/* Applied discount summary */}
          {(appliedCoupon || appliedManual) ? (
            <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--success-200)] bg-[var(--success-50)] px-[var(--s-3)] py-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-fs-sm font-semibold text-[var(--success-700)]">
                  {appliedCoupon
                    ? `${t('discountLine')} (${appliedCoupon.code})`
                    : t('manualDiscount')}
                  {' '}
                  <span className="tabular-nums">−{money(appliedAmount)}</span>
                </span>
                <span className="tabular-nums text-fs-xs text-[var(--success-500)]">
                  {t('total')}: {money(discountedTotal)}
                </span>
              </div>
              <button
                type="button"
                onClick={clearDiscount}
                className="text-fs-sm font-medium text-[var(--fg-muted)] underline-offset-2 hover:text-[var(--danger-500)] hover:underline"
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
                  className="h-9 shrink-0 rounded-lg border border-[var(--action)] bg-[var(--action)] px-[var(--s-3)] text-fs-sm font-medium text-[var(--action-fg)] transition-colors hover:bg-[var(--action-hover)] disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="self-end rounded-lg border border-[var(--action)] bg-[var(--action)] px-[var(--s-3)] py-1 text-fs-sm font-medium text-[var(--action-fg)] transition-colors hover:bg-[var(--action-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('apply')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>


        </div></details>
        {hosted ? <p className="flex items-center gap-2 py-4 text-fs-xs text-[var(--fg-muted)]"><ClockIcon className="size-4 shrink-0" />{t('orderCheckoutProductionAfterPayment')}</p>
          : <details className="py-4"><summary className="flex cursor-pointer list-none items-center justify-between text-fs-sm font-medium">{t('orderCheckoutProduction')}<ChevronDownIcon className="size-4" /></summary><div className="pt-4">
        {/* Force onto the production sheet, bypassing the scheduled/paid gates. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={addToProduction}
          onClick={() => setAddToProduction((v) => !v)}
          className="flex items-start gap-[var(--s-3)] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--s-3)] py-2 text-start"
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


          </div></details>}
      </fieldset>
    </div>
    <footer className="shrink-0 space-y-3 border-t border-[var(--line)] bg-[var(--surface)] p-4">
      {feeValue > 0 && <div className="flex justify-between text-fs-xs text-[var(--fg-muted)]"><span>{t('deliveryFee')}</span><span className="tabular-nums">{money(feeValue)}</span></div>}
      {appliedAmount > 0 && <div className="flex justify-between text-fs-xs text-[var(--fg-muted)]"><span>{t('discountLine')}</span><span className="tabular-nums">−{money(appliedAmount)}</span></div>}
      <div className="flex items-center justify-between gap-3"><span className="text-fs-sm text-[var(--fg-muted)]">{t(intent === 'link' && orderType === 'delivery' ? 'subtotal' : 'total')}</span><strong className="tabular-nums text-fs-xl">{money(discountedTotal)}</strong></div>
      {intent === 'link' && orderType === 'delivery' && <p className="text-fs-xs text-[var(--fg-muted)]">{t('sumitDeliveryCalculated')}</p>}
      {error && <p role="alert" className="text-fs-sm text-[var(--danger-500)]">{error}</p>}
      {validationHint && !submitting && <p id="order-finalization-hint" role="status" className="text-fs-xs text-[var(--fg-muted)]">{validationHint}</p>}
      <Button className="min-h-12 w-full whitespace-normal text-center" onClick={confirm} disabled={!canConfirm} aria-describedby={validationHint ? 'order-finalization-hint' : undefined}>{submitting ? `${t('creating')}…` : actionLabel}</Button>
    </footer>
  </section>;
}
