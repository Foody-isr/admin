'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Chip, Field, Input } from '@/components/ds';
import { useI18n, useCurrency } from '@/lib/i18n';
import { ChoiceRow } from '@/components/ds/Selection';
import { cn } from '@/lib/utils';
import {
  ShoppingBagIcon, TruckIcon, BanknoteIcon, CreditCardIcon, LinkIcon, TagIcon, XIcon, ArrowLeftIcon, ClockIcon, ChevronDownIcon,
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
import { checkoutStepCopy } from '@/lib/orders/checkout-step-copy';
import { validateCheckout, checkoutFieldProps, type CheckoutStep, type CheckoutField, type CheckoutIssue, type CheckoutErrors } from '@/lib/orders/checkout-validation';
import styles from './order-checkout.module.css';
import { EventOrderFields } from './EventOrderFields';
import { eventOrderCopy } from '@/lib/orders/event-order-copy';
import type { OrderEventConfig } from '@/lib/api';
import { internalOrderPayment, type InternalPaymentIntent, type InternalPaymentMethod } from '@/lib/orders/internal-order-payment';

export type OrderType = 'pickup' | 'delivery';
/** Existing payment choices sent to the restaurant-scoped create endpoint. */
export type PaymentMethodChoice = InternalPaymentMethod;

export interface CheckoutData {
  eventConfig?: OrderEventConfig;
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
  deliveryFee?: number;
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
  eventConfig?: OrderEventConfig;
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
  cateringDetected?: boolean;
  sumitHoldEnabled?: boolean;
}

/** Finalizes the current basket inline, preserving its draft and explicit payment intent. */
export function NewOrderCheckoutPanel({
  open, onClose, total, itemCount, submitting, error, onConfirm, batchConfig, defaultDate,
  restaurantId, discountItems, onStateChange, initialState, itemsSummary, sumitCheckoutEnabled = false, sumitCardEnabled = false, sumitHoldEnabled = false, cateringDetected = false,
}: NewOrderCheckoutPanelProps) {
  const { money } = useCurrency();
  const { t, locale } = useI18n();
  const ec = eventOrderCopy[locale];
  const copy = checkoutStepCopy[locale];
  const [eventConfig,setEventConfig] = useState<OrderEventConfig | undefined>(initialState?.eventConfig);
  const eventTouched = useRef(false);
  useEffect(()=>{if(cateringDetected&&!eventTouched.current){setEventConfig(current=>current??{name:"",guests:0,event_date:"",event_time:"",venue:"",contact:"",notes:"",require_guests:true,require_date:true,require_time:true,payment_mode:"full",deposit_type:"percent",deposit_value:30,hold_type:"percent",hold_value:100,balance_due_date:""});}},[cateringDetected]);
  const { hasAnyPermission } = usePermissions();
  const canManualDiscount = hasAnyPermission('orders.discount');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<CheckoutStep>('reception');
  const [visited, setVisited] = useState<CheckoutStep[]>(['reception']);
  const [attempted, setAttempted] = useState<CheckoutStep[]>([]);
  const [focusRequest, setFocusRequest] = useState<{ field: CheckoutField; sequence: number } | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [serverIssue, setServerIssue] = useState<CheckoutIssue | null>(null);
  useEffect(() => {
    if (!open) return;
    const target = focusRequest?.field === 'intent'
      ? panelRef.current?.querySelector<HTMLElement>('input[name="order-payment-intent"]')
      : focusRequest ? panelRef.current?.querySelector<HTMLElement>(`[id="checkout-${focusRequest.field}"]`)
        ?? (focusRequest.field === 'windowStart' || focusRequest.field === 'windowEnd' ? panelRef.current?.querySelector<HTMLElement>('#checkout-scheduledFor') : null) : null;
    if (target) {
      let parent = target.parentElement;
      while (parent && parent !== panelRef.current) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
    } else {
      contentRef.current?.scrollTo({ top: 0 });
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [open, step, focusRequest]);

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
  const [feeOverrideOpen, setFeeOverrideOpen] = useState(false);
  const [feeQuote, setFeeQuote] = useState<{ key: string; status: 'loading' | 'ready' | 'error'; fee?: number } | null>(null);
  const [feeRetry, setFeeRetry] = useState(0);
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
    if (initialState.eventConfig) setEventConfig(initialState.eventConfig);
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
      linked, orderType, fulfillment, eventConfig,
    });
  }, [customerName, customerPhone, address, city, floor, apt, entryCode,
      deliveryNotes, linked, orderType, fulfillment, eventConfig, onStateChange]);

  // ── Discount state ────────────────────────────────────────────────────────
  const discountRequest = useRef(0);
  const feeInput = deliveryFee.trim().replace(',', '.');
  const parsedFee = Number(feeInput);
  const feeValid = !feeInput || (/^\d+(?:\.\d{1,2})?$/.test(feeInput) && Number.isFinite(parsedFee));
  const fixedLinkFee = feeTouched && !!feeInput;
  const feeQuoteKey = JSON.stringify([restaurantId, address.trim(), city.trim()]);
  const currentFeeQuote = feeQuote?.key === feeQuoteKey ? feeQuote : null;
  const automaticFeeReady = currentFeeQuote?.status === 'ready';
  const feeValue = orderType !== 'delivery' || !feeValid ? 0
    : feeTouched ? parsedFee
    : payMethod === 'link' ? 0 : currentFeeQuote?.status === 'ready' ? currentFeeQuote.fee ?? 0 : 0;
  const discountContext = JSON.stringify([restaurantId, discountItems, orderType, feeValue, customerPhone]);
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
  }, [discountContext]);

  // Preserve the chosen date while returning to articles; refresh changed series windows.
  const isEvent = !!eventConfig;
  const targets = useMemo(() => buildFulfillmentTargets(isEvent ? null : batchConfig, orderType), [batchConfig, orderType, isEvent]);
  const fulfillmentContext = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return;
    // An event has a staff-chosen handover date, independent of carte series.
    // Never reconcile this free calendar against the weekly batch targets.
    if (isEvent) {
      draftFulfillmentPending.current = null;
      fulfillmentContext.current = null;
      if (fulfillment.timing !== 'scheduled') {
        setFulfillment({ timing: 'scheduled', scheduledFor: defaultDate ?? '' });
      }
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
  }, [open, targets, defaultDate, orderType, fulfillment, isEvent]);

  // Load active coupons once per restaurant (silently; no error shown on failure).
  useEffect(() => {
    listDiscounts(restaurantId, { active: true }).then(setCoupons).catch(() => {});
  }, [restaurantId]);

  // Ordinary deliveries follow their current address. A deliberate fixed quote
  // takes precedence; stale, failed and pending estimates cannot become free delivery.
  useEffect(() => {
    if (!open || payMethod === 'link' || orderType !== 'delivery' || feeTouched) return;
    const addr = address.trim();
    setDeliveryFee('');
    if (!addr) { setFeeQuote(null); return; }
    setFeeQuote({ key: feeQuoteKey, status: 'loading' });
    let cancelled = false;
    const timer = setTimeout(() => {
      checkDeliverable(restaurantId, addr, city.trim() || undefined)
        .then((res) => {
          if (cancelled) return;
          const fee = res.delivery_fee ?? 0;
          if (!res.deliverable || !Number.isFinite(fee) || fee < 0) {
            setFeeQuote({ key: feeQuoteKey, status: 'error' });
            return;
          }
          setFeeQuote({ key: feeQuoteKey, status: 'ready', fee });
          setDeliveryFee(String(fee));
        })
        .catch(() => { if (!cancelled) setFeeQuote({ key: feeQuoteKey, status: 'error' }); });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, payMethod, orderType, address, city, feeTouched, restaurantId, feeQuoteKey, feeRetry]);

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
        delivery_fee: feeValue,
        phone: customerPhone.trim() || undefined,
      });
      if (request !== discountRequest.current) return;
      if (res.valid && res.discount) {
        setAppliedCoupon({ code, amount: res.discount.amount, newTotal: res.discount.new_total });
      } else {
        setDiscountError(t(reasonKey(res.reason ?? 'not_found')));
        setFocusRequest(current => ({ field: 'coupon', sequence: (current?.sequence ?? 0) + 1 }));
      }
    } catch {
      if (request === discountRequest.current) {
        setDiscountError(t('invalidCode'));
        setFocusRequest(current => ({ field: 'coupon', sequence: (current?.sequence ?? 0) + 1 }));
      }
    } finally {
      if (request === discountRequest.current) setDiscountValidating(false);
    }
  }

  function manualAmount(type: 'fixed' | 'percent', value: number): number {
    return type === 'fixed' ? Math.min(value, total)
      : Math.round(total * (Math.min(100, Math.max(0, value)) / 100) * 100) / 100;
  }

  function applyManualDiscount() {
    const val = parseFloat(manualValue);
    if (!Number.isFinite(val) || val <= 0 || (manualType === 'percent' && val > 100) || !manualReason.trim()) return;
    const amount = manualAmount(manualType, val);
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
          amount: manualAmount(manualType, manualValNum),
        }
      : null;
  // The manual discount that actually applies: an explicitly-applied one wins,
  // else the pending typed one. A coupon takes precedence over both.
  const selectedManual = appliedManual ?? pendingManual;
  const effectiveManual = appliedCoupon || !selectedManual ? null : {
    ...selectedManual, amount: manualAmount(selectedManual.type, selectedManual.value),
  };

  // The applied discount amount (0 if none). Clamped so total never goes negative.
  const appliedAmount = appliedCoupon?.amount ?? effectiveManual?.amount ?? 0;
  const discountedTotal = Math.max(0, total + feeValue - appliedAmount);

  const hosted = payMethod === 'link' || payMethod === 'sumit_card';
  const manualStarted = canManualDiscount && !appliedCoupon && !appliedManual && !!(manualValue.trim() || manualReason.trim());
  const steps: CheckoutStep[] = eventConfig ? ['reception', 'event', 'payment'] : ['reception', 'payment'];
  const stepIndex = steps.indexOf(step);
  const issues = validateCheckout({ fulfillment, orderType, customerName, customerPhone, address, intent,
    linkEnabled: sumitCheckoutEnabled, cardEnabled: sumitCardEnabled, holdEnabled: sumitHoldEnabled,
    feeValid, feeTouched, feeStatus: currentFeeQuote?.status, received, total, discountedTotal,
    manualStarted, manualValue: manualValNum, manualType, manualReason, event: eventConfig });
  const visibleIssues = [...issues.filter(issue => attempted.includes(issue.step)), ...(serverIssue ? [serverIssue] : [])];
  const fieldErrors: CheckoutErrors = Object.fromEntries(visibleIssues.map(issue => [issue.field, copy.errors[issue.code]]));
  const showCustomer = intent !== 'link' || optionalCustomer || customerName || customerPhone;
  const productionIncluded = !!intent && !hosted && (!!eventConfig || addToProduction || fulfillment.timing === 'scheduled' && (payment?.paymentCollected || recordedMethod === 'cash'));
  const timingWarning = !!(eventConfig?.event_date && eventConfig.event_time && fulfillment.scheduledFor && fulfillment.windowEnd &&
    `${fulfillment.scheduledFor}T${fulfillment.windowEnd}` > `${eventConfig.event_date}T${eventConfig.event_time}`);

  const focusIssue = useCallback((issue: CheckoutIssue) => {
    setStep(issue.step);
    setVisited(current => current.includes(issue.step) ? current : [...current, issue.step]);
    setFocusRequest(current => ({ field: issue.field, sequence: (current?.sequence ?? 0) + 1 }));
  }, []);
  function goToStep(target: CheckoutStep) {
    const targetIndex = steps.indexOf(target);
    if (targetIndex > stepIndex) {
      const checked = steps.slice(0, targetIndex);
      setAttempted(current => Array.from(new Set([...current, ...checked])));
      const first = issues.find(issue => checked.includes(issue.step));
      if (first) { focusIssue(first); return; }
    }
    setServerIssue(null);
    setFocusRequest(null);
    setVisited(current => current.includes(target) ? current : [...current, target]);
    setStep(target);
  }
  const inlineError = (field: CheckoutField) => fieldErrors[field] && <p id={`checkout-${field}-error`} className="text-fs-xs text-[var(--danger-500)]">{fieldErrors[field]}</p>;
  useEffect(() => {
    if (payMethod === 'sumit_card' && eventConfig?.payment_mode === 'none') setEventConfig(current => current ? { ...current, payment_mode: 'full' } : current);
  }, [payMethod, eventConfig?.payment_mode]);
  useEffect(() => {
    if (!error) { setServerIssue(null); setDismissedError(null); return; }
    const mappings: [string, CheckoutField, CheckoutStep, CheckoutIssue['code']][] = [
      ['event fulfillment date required', 'scheduledFor', 'reception', 'date'],
      ['invalid scheduled_for date format, expected YYYY-MM-DD', 'scheduledFor', 'reception', 'date'],
      ['invalid event time', 'event.event_time', 'event', 'eventTime'],
      ['invalid deposit', 'event.deposit_value', 'payment', 'deposit'],
      ['deposit must be below the order total', 'event.deposit_value', 'payment', 'deposit'],
      ['invalid hold amount', 'event.hold_value', 'payment', 'hold'],
      ['hold exceeds the remaining balance', 'event.hold_value', 'payment', 'hold'],
      ['invalid delivery fee', 'deliveryFee', 'reception', 'fee'],
    ];
    const match = mappings.find(([message]) => message === error);
    if (match) {
      const issue = { field: match[1], step: match[2], code: match[3] };
      setServerIssue(issue);
      focusIssue(issue);
    }
  }, [error, focusIssue]);
  const actionLabel = intent === 'link' && eventConfig?.payment_mode === 'none' ? ec.createLink : intent === 'link' ? t('orderCheckoutCreateLink') : intent === 'charge_card' ? t('orderCheckoutOpenCard')
    : intent === 'record' ? t('orderCheckoutRecordAction') : t('createOrder');
  const intents: { key: InternalPaymentIntent; icon: React.ReactNode; label: string; hint: string }[] = [
    ...(sumitCheckoutEnabled ? [{ key: 'link' as const, icon: <LinkIcon />, label: t('orderCheckoutLink'), hint: t('orderCheckoutLinkHint') }] : []),
    ...(sumitCardEnabled ? [{ key: 'charge_card' as const, icon: <CreditCardIcon />, label: t('orderCheckoutCard'), hint: t('orderCheckoutCardHint') }] : []),
    { key: 'record', icon: <BanknoteIcon />, label: t('orderCheckoutRecord'), hint: t('orderCheckoutRecordHint') },
    { key: 'later', icon: <ClockIcon />, label: t('orderCheckoutLater'), hint: t('orderCheckoutLaterHint') },
  ];
  function chooseIntent(value: InternalPaymentIntent | null) {
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
    // Selecting customer details must retain a fee staff already entered in
    // Fulfillment. Only an automatic estimate follows the new address.
    if (!feeTouched) setDeliveryFee('');
  };

  function confirm() {
    if (submitting || discountValidating) return;
    setAttempted(steps);
    setServerIssue(null);
    if (issues.length) { focusIssue(issues[0]); return; }
    if (!payment) return;
    onConfirm({
      customerName, customerPhone, orderType,
      eventConfig: eventConfig ? { ...eventConfig, payment_mode: hosted ? eventConfig.payment_mode : 'none', deposit_value: hosted ? eventConfig.deposit_value : 0 } : undefined,
      address: intent === 'link' ? '' : address, city: intent === 'link' ? '' : city,
      floor: intent === 'link' ? '' : floor, apt: intent === 'link' ? '' : apt,
      entryCode: intent === 'link' ? '' : entryCode, deliveryNotes: intent === 'link' ? '' : deliveryNotes,
      deliveryFee: orderType === 'delivery' && (intent !== 'link' || fixedLinkFee) ? feeValue : undefined, ...payment, fulfillment, addToProduction: hosted && !eventConfig ? false : addToProduction,
      ...(appliedCoupon ? { discountCode: appliedCoupon.code } : {}),
      ...(effectiveManual ? { manualDiscount: { type: effectiveManual.type, value: effectiveManual.value, reason: effectiveManual.reason } } : {}),
    });
  }

  return <section ref={panelRef} aria-labelledby="order-finalization-title" data-order-finalization className={cn(styles.panel, 'min-h-0 flex-1 flex-col', open ? 'flex' : 'hidden')}>
    <header className="shrink-0 border-b border-[var(--line)] px-4 py-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" icon size="sm" onClick={onClose} disabled={submitting} aria-label={t('orderCheckoutBack')}><ArrowLeftIcon className="rtl:rotate-180" /></Button>
        <h2 ref={headingRef} tabIndex={-1} id="order-finalization-title" className="min-w-0 flex-1 text-fs-md font-semibold focus:outline-none">{t('orderCheckoutTitle')}</h2><Badge>{itemCount}</Badge>
      </div>
      <nav aria-label={t('orderCheckoutTitle')} className="mt-4"><ol className="flex gap-2">{steps.map((key, index) => <li key={key} className="min-w-0 flex-1">
        <button type="button" disabled={submitting || !visited.includes(key)} aria-current={step === key ? 'step' : undefined} onClick={() => goToStep(key)} className={cn(styles.step, 'w-full text-start')}>
          <span className="text-fs-xs tabular-nums">{index + 1}</span><span>{copy.steps[key]}</span>
          {attempted.includes(key) && issues.some(issue => issue.step === key) && <span className="text-[var(--danger-500)]" aria-hidden="true">!</span>}
        </button>
      </li>)}</ol></nav>
    </header>
    <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-4">
      <p className="pt-4 text-fs-xs text-[var(--fg-muted)]" role="status">{copy.progress.replace('{current}', String(stepIndex + 1)).replace('{total}', String(steps.length))}</p>
      {visibleIssues.length > 0 && <div role="alert" className="my-4 rounded-md border border-[var(--danger-500)] p-3 text-fs-xs text-[var(--danger-500)]"><p className="font-semibold">{copy.errorsTitle.replace('{count}', String(visibleIssues.length))}</p><ul className="mt-2 space-y-2">{visibleIssues.map(issue => <li key={issue.field}><button type="button" onClick={() => focusIssue(issue)} className="text-start underline underline-offset-2">{copy.errors[issue.code]}</button></li>)}</ul></div>}
      <fieldset disabled={submitting} className="min-w-0" onChangeCapture={() => { setServerIssue(null); setDismissedError(error); }}>
        <div hidden={step !== 'reception'}>
          <label className="flex items-center gap-2 py-4 text-fs-sm font-semibold"><input type="checkbox" checked={!!eventConfig} onChange={e => {
            eventTouched.current = true;
            setEventConfig(e.target.checked ? { name: '', guests: 0, event_date: '', event_time: '', venue: '', contact: '', notes: '', require_guests: true, require_date: true, require_time: true, payment_mode: 'full', deposit_type: 'percent', deposit_value: 30, hold_type: 'percent', hold_value: 100, balance_due_date: '' } : undefined);
          }}/>{ec.badge}</label>
          {sumitCheckoutEnabled && <div className="border-b border-[var(--line)] pb-3"><ChoiceRow type="checkbox" checked={intent === 'link'} onChange={e => chooseIntent(e.target.checked ? 'link' : null)} label={copy.detailsByClient} aria-label={copy.detailsByClient} description={copy.detailsByClientHint}/></div>}
        <section className="space-y-4 py-5">
          <h3 className="text-fs-sm font-semibold">{t('orderCheckoutFulfillmentTitle')}</h3>
          <div className={cn(styles.paired, 'grid grid-cols-2 gap-2')}>
            <ChoiceRow type="radio" name="order-reception" checked={orderType === 'pickup'} onChange={() => setOrderType('pickup')} label={<span className="inline-flex items-center gap-2"><ShoppingBagIcon className="size-4" />{t('pickup')}</span>} />
            <ChoiceRow type="radio" name="order-reception" checked={orderType === 'delivery'} onChange={() => setOrderType('delivery')} label={<span className="inline-flex items-center gap-2"><TruckIcon className="size-4" />{t('delivery')}</span>} />
          </div>
          <FulfillmentSection serviceLabels orderType={orderType} batchConfig={isEvent ? null : batchConfig} value={fulfillment} onChange={setFulfillment} allowImmediate={!isEvent} errors={fieldErrors} />
          {orderType === 'delivery' && <div id={!(isEvent || feeOverrideOpen || feeTouched) ? 'checkout-deliveryFee' : undefined} tabIndex={-1} className="space-y-3">
            {!isEvent && !feeTouched && payMethod !== 'link' && <p className="text-fs-xs text-[var(--fg-muted)]" role="status">
              {t(!address.trim() ? 'orderCheckoutDeliveryFeeAutomatic'
                : currentFeeQuote?.status === 'error' ? 'orderCheckoutDeliveryFeeUnavailable'
                : automaticFeeReady ? 'orderCheckoutDeliveryFeeCalculated' : 'orderCheckoutDeliveryFeeCalculating')}
              {automaticFeeReady && <span className="ms-2 tabular-nums">{money(feeValue)}</span>}
            </p>}
            {!isEvent && !feeOverrideOpen && !feeTouched && <Button variant="ghost" size="sm" onClick={() => setFeeOverrideOpen(true)}>{t('orderCheckoutDeliveryFeeOverride')}</Button>}
            {!feeTouched && payMethod !== 'link' && currentFeeQuote?.status === 'error' && <Button variant="secondary" size="sm" onClick={() => setFeeRetry(n => n + 1)}>{t('retry')}</Button>}
            {(isEvent || feeOverrideOpen || feeTouched) && <Field label={t('deliveryFee')}>
            <Input
              value={payMethod === 'link' && !feeTouched ? '' : deliveryFee}
              onChange={(e) => { setDeliveryFee(e.target.value); setFeeTouched(!!e.target.value.trim()); }}
              inputMode="decimal"
              placeholder="0.00"
              {...checkoutFieldProps('deliveryFee', fieldErrors)}
              aria-label={t('deliveryFee')}
              aria-describedby={fieldErrors.deliveryFee ? 'checkout-deliveryFee-error' : 'delivery-fee-hint'}
            />
            <p id="delivery-fee-hint" className="text-fs-xs text-[var(--fg-muted)]">{t(feeValid ? 'orderCheckoutDeliveryFeeHint' : 'orderCheckoutDeliveryFeeInvalid')}</p>
            </Field>}
            {feeTouched && <Button variant="ghost" size="sm" onClick={() => { setFeeTouched(false); setFeeOverrideOpen(false); setDeliveryFee(''); }}>{t('orderCheckoutDeliveryFeeReset')}</Button>}
            {inlineError('deliveryFee')}
          </div>}
        </section>
        {intent === 'link' && !showCustomer && <div className="py-4"><Button variant="ghost" size="sm" onClick={() => setOptionalCustomer(true)}>{t('orderCheckoutOptionalCustomer')}</Button></div>}
        {showCustomer && <section className="space-y-3 py-5"><h3 className="text-fs-sm font-semibold">{t('customer')}</h3>
        <div className="flex flex-col gap-[var(--s-3)]">
          <Field label={t('customerName')}>
            <CustomerPicker
              restaurantId={restaurantId}
              field="name"
              inputProps={{ ...checkoutFieldProps('customerName', fieldErrors), 'aria-label': t('customerName') }}
              value={customerName}
              onChange={(v) => { setCustomerName(v); setLinked(null); }}
              onPick={applyCustomer}
              placeholder={t('customerNamePlaceholder')}
              skipNextSearchRef={nameSkipSearchRef}
            />
            {inlineError('customerName')}
          </Field>
          <Field label={t('customerPhone')}>
            <CustomerPicker
              restaurantId={restaurantId}
              field="phone"
              inputProps={{ ...checkoutFieldProps('customerPhone', fieldErrors), 'aria-label': t('customerPhone') }}
              value={customerPhone}
              onChange={(v) => { setCustomerPhone(v); setLinked(null); }}
              onPick={applyCustomer}
              placeholder="05X-XXXXXXX"
              skipNextSearchRef={phoneSkipSearchRef}
            />
            {inlineError('customerPhone')}
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
                addressInputProps={{ ...checkoutFieldProps('address', fieldErrors), 'aria-label': t('deliveryAddress') }}
                addressError={inlineError('address')}
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
            </>
          )}
        </div>


        </section>}

        </div>
        {eventConfig && <div hidden={step !== 'event'} className="space-y-4 py-5">
          <h3 className="text-fs-sm font-semibold">{copy.steps.event}</h3>
          <div className="flex flex-wrap gap-2">
            {fulfillment.scheduledFor && <Button variant="secondary" size="sm" onClick={() => setEventConfig(current => current ? { ...current, event_date: fulfillment.scheduledFor! } : current)}>{copy.sameDate}</Button>}
            {orderType === 'delivery' && address.trim() && <Button variant="secondary" size="sm" onClick={() => { setEventConfig(current => current ? { ...current, venue: [address, city].filter(Boolean).join(', ') } : current); focusIssue({ field: 'event.venue', step: 'event', code: 'venue' }); }}>{copy.useAddress}</Button>}
            {(customerName || customerPhone) && <Button variant="secondary" size="sm" onClick={() => { setEventConfig(current => current ? { ...current, contact: [customerName, customerPhone].filter(Boolean).join(' · ') } : current); focusIssue({ field: 'event.contact', step: 'event', code: 'contact' }); }}>{copy.useContact}</Button>}
          </div>
          <EventOrderFields value={eventConfig} onChange={setEventConfig} online={false} progressive clientRequirements={intent === 'link'} errors={fieldErrors}/>
          {timingWarning && <p role="status" className="text-fs-xs text-[var(--warning-500)]">{copy.timingWarning}</p>}
        </div>}
        <div hidden={step !== 'payment'}>
        <fieldset className="min-w-0 py-5"><span id="checkout-intent" tabIndex={-1} className="sr-only">{copy.steps.payment}</span>
          <legend className="float-start mb-2 w-full text-fs-sm font-semibold">{t('orderCheckoutIntent')}</legend>
          <div className="clear-both divide-y divide-[var(--line)]">{intents.map(option => <ChoiceRow key={option.key} type="radio" name="order-payment-intent" aria-label={option.label} aria-invalid={!!fieldErrors.intent || undefined} aria-describedby={fieldErrors.intent ? 'checkout-intent-error' : undefined} checked={intent === option.key} onChange={() => chooseIntent(option.key)}
            label={<span className="flex items-center gap-2"><span className="shrink-0 [&_svg]:size-4">{option.icon}</span>{option.label}</span>} description={option.hint} />)}</div>
          {inlineError('intent')}
          {(intent === 'record' || intent === 'later') && <div className="mt-4 space-y-3 rounded-lg bg-[var(--surface-2)] p-3">
            <p className="text-fs-xs font-medium text-[var(--fg-muted)]">{t(intent === 'record' ? 'orderCheckoutReceivedMethod' : 'orderCheckoutExpectedMethod')}</p>
            <div className={cn(styles.paired, 'grid grid-cols-2 gap-2')}>
              <ChoiceRow type="radio" name="order-recorded-method" checked={recordedMethod === 'cash'} onChange={() => setRecordedMethod('cash')} label={t('payMethodCash')} />
              <ChoiceRow type="radio" name="order-recorded-method" checked={recordedMethod === 'card'} onChange={() => setRecordedMethod('card')} label={t(intent === 'record' ? 'orderCheckoutExternalCard' : 'payMethodCard')} />
            </div>
            {intent === 'record' && <ChoiceRow {...checkoutFieldProps('received', fieldErrors)} type="checkbox" checked={received} onChange={event => setReceived(event.target.checked)} label={t('orderCheckoutReceived').replace('{amount}', money(discountedTotal))} />}
            {inlineError('received')}
          </div>}
        </fieldset>
        {eventConfig&&hosted&&<section className="space-y-3 py-5"><EventOrderFields value={eventConfig} onChange={setEventConfig} online paymentOnly errors={fieldErrors} holdEnabled={sumitHoldEnabled} allowNoPayment={payMethod==='link'}/></section>}
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
                    id="checkout-coupon-choice"
                    aria-label={t('chooseCoupon')}
                    aria-invalid={!!discountError || undefined}
                    aria-describedby={discountError ? 'checkout-coupon-error' : undefined}
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
                  id="checkout-coupon"
                  aria-label={t('enterCode')}
                  aria-invalid={!!discountError || undefined}
                  aria-describedby={discountError ? 'checkout-coupon-error' : undefined}
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
                <p id="checkout-coupon-error" className="text-fs-xs text-[var(--danger-500)]">{discountError}</p>
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
                      {...checkoutFieldProps('manualValue', fieldErrors)} aria-label={t('manualDiscount')}
                      value={manualValue}
                      onChange={(e) => setManualValue(e.target.value)}
                      placeholder={manualType === 'fixed' ? '0.00' : '0'}
                      inputMode="decimal"
                      className="w-24 shrink-0"
                    />
                  </div>
                  {inlineError('manualValue')}
                  <Field label={t('manualDiscountReason')}>
                    <Input
                      {...checkoutFieldProps('manualReason', fieldErrors)} aria-label={t('manualDiscountReason')}
                      value={manualReason}
                      onChange={(e) => setManualReason(e.target.value)}
                      placeholder={t('manualDiscountReason')}
                    />
                    {inlineError('manualReason')}
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

          <div className="py-4"><h3 className="text-fs-sm font-semibold">{t('orderItems')}</h3><div className="mt-3">{itemsSummary}</div></div>


        </div>
      </fieldset>
    </div>
    <footer className="shrink-0 space-y-3 border-t border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="border-b border-[var(--line)] pb-3 text-fs-xs" data-production-summary>
        <p className="font-semibold">{copy.production}</p>
        <p className="mt-1 text-[var(--fg-muted)]">{fulfillment.timing === 'scheduled' && fulfillment.scheduledFor ? copy.productionDate.replace('{date}', new Date(`${fulfillment.scheduledFor}T00:00:00`).toLocaleDateString(locale)) : copy.productionUnscheduled}</p>
        <p className="mt-1 text-[var(--fg-muted)]">{hosted ? (eventConfig ? copy.productionPending : t('orderCheckoutProductionAfterPayment')) : productionIncluded ? copy.productionIncluded : copy.productionAutomatic}</p>
      </div>
      {step === 'payment' && (!productionIncluded || addToProduction) && !(hosted && (!eventConfig || !hasAnyPermission('kitchen.manage'))) && <label className="flex items-start gap-2 text-fs-xs"><input type="checkbox" className="mt-0.5 shrink-0" checked={addToProduction} onChange={e => setAddToProduction(e.target.checked)} disabled={submitting}/><span>{t('addToProduction')}</span></label>}
      {feeValue > 0 && <div className="flex justify-between text-fs-xs text-[var(--fg-muted)]"><span>{t('deliveryFee')}</span><span className="tabular-nums">{money(feeValue)}</span></div>}
      {appliedAmount > 0 && <div className="flex justify-between text-fs-xs text-[var(--fg-muted)]"><span>{t('discountLine')}</span><span className="tabular-nums">−{money(appliedAmount)}</span></div>}
      <div className="flex items-center justify-between gap-3"><span className="text-fs-sm text-[var(--fg-muted)]">{t(intent === 'link' && orderType === 'delivery' && !fixedLinkFee ? 'subtotal' : 'total')}</span><strong id="checkout-total" tabIndex={-1} className="tabular-nums text-fs-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">{money(discountedTotal)}</strong></div>
      {inlineError('total')}
      {intent === 'link' && orderType === 'delivery' && <p className="text-fs-xs text-[var(--fg-muted)]">{t(fixedLinkFee ? 'orderCheckoutDeliveryFeeFixed' : 'sumitDeliveryCalculated')}</p>}

      {error && error !== dismissedError && !serverIssue && <p role="alert" className="text-fs-sm text-[var(--danger-500)]">{error}</p>}
      <div className="flex gap-2">
        {stepIndex > 0 && <Button variant="secondary" className="min-h-12" disabled={submitting} onClick={() => goToStep(steps[stepIndex - 1])}>{copy.previous}</Button>}
        <Button className="min-h-12 flex-1 whitespace-normal text-center" onClick={() => step === 'payment' ? confirm() : goToStep(steps[stepIndex + 1])} disabled={submitting || discountValidating}>{submitting ? `${t('creating')}…` : step === 'payment' ? actionLabel : copy.next}</Button>
      </div>
    </footer>
  </section>;
}
