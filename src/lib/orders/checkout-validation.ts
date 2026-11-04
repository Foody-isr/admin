import type { OrderEventConfig } from '../api';
import type { FulfillmentValue } from './fulfillment';
import type { InternalPaymentIntent } from './internal-order-payment';

export type CheckoutStep = 'reception' | 'event' | 'payment';
export type CheckoutField = 'scheduledFor' | 'windowStart' | 'windowEnd' | 'customerName' | 'customerPhone' | 'address' | 'deliveryFee' | 'intent' | 'received' | 'manualValue' | 'manualReason' | 'coupon' | 'total' | `event.${keyof OrderEventConfig}`;
export type CheckoutError = 'date' | 'time' | 'windowEnd' | 'windowOrder' | 'name' | 'phone' | 'address' | 'fee' | 'feePending' | 'feeUnavailable' | 'intent' | 'capability' | 'received' | 'manualValue' | 'manualReason' | 'guests' | 'eventDate' | 'eventTime' | 'eventName' | 'venue' | 'contact' | 'notes' | 'deposit' | 'hold' | 'holdUnavailable' | 'balanceDate' | 'total';
export interface CheckoutIssue { field: CheckoutField; step: CheckoutStep; code: CheckoutError }
export type CheckoutErrors = Partial<Record<CheckoutField, string>>;

interface CheckoutValidation {
  fulfillment: FulfillmentValue;
  orderType: 'pickup' | 'delivery';
  customerName: string;
  customerPhone: string;
  address: string;
  intent: InternalPaymentIntent | null;
  linkEnabled: boolean;
  cardEnabled: boolean;
  holdEnabled: boolean;
  feeValid: boolean;
  feeTouched: boolean;
  feeStatus?: 'loading' | 'ready' | 'error';
  received: boolean;
  total: number;
  discountedTotal: number;
  manualStarted: boolean;
  manualValue: number;
  manualType: 'fixed' | 'percent';
  manualReason: string;
  event?: OrderEventConfig;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
const validTime = (value: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Collects every field issue without changing the existing payment or scheduling contract. */
export function validateCheckout(value: CheckoutValidation): CheckoutIssue[] {
  const issues: CheckoutIssue[] = [];
  const add = (field: CheckoutField, step: CheckoutStep, code: CheckoutError) => issues.push({ field, step, code });
  const { fulfillment: f, event: e, intent } = value;
  const hosted = intent === 'link' || intent === 'charge_card';
  if (f.timing === 'scheduled' || e) {
    if (!f.scheduledFor || !validDate(f.scheduledFor)) add('scheduledFor', 'reception', 'date');
    if (f.windowStart || f.windowEnd) {
      if (!f.windowStart || !validTime(f.windowStart)) add('windowStart', 'reception', 'time');
      if (!f.windowEnd || !validTime(f.windowEnd)) add('windowEnd', 'reception', 'windowEnd');
      if (f.windowStart && f.windowEnd && validTime(f.windowStart) && validTime(f.windowEnd) && f.windowStart >= f.windowEnd) {
        add('windowStart', 'reception', 'windowOrder');
        add('windowEnd', 'reception', 'windowOrder');
      }
    }
  }
  if (intent !== 'link') {
    if (!value.customerName.trim()) add('customerName', 'reception', 'name');
    if (!value.customerPhone.trim()) add('customerPhone', 'reception', 'phone');
    if (value.orderType === 'delivery' && !value.address.trim()) add('address', 'reception', 'address');
  }
  if (value.orderType === 'delivery') {
    if (!value.feeValid) add('deliveryFee', 'reception', 'fee');
    else if (intent !== 'link' && !value.feeTouched && value.address.trim() && value.feeStatus !== 'ready') {
      add('deliveryFee', 'reception', value.feeStatus === 'error' ? 'feeUnavailable' : 'feePending');
    }
  }
  if (e) {
    if (!Number.isInteger(e.guests) || e.guests < 0 || e.guests > 100000 || intent !== 'link' && e.require_guests && !e.guests) add('event.guests', 'event', 'guests');
    if (e.event_date ? !validDate(e.event_date) : intent !== 'link' && e.require_date) add('event.event_date', 'event', 'eventDate');
    if (e.event_time ? !validTime(e.event_time) : intent !== 'link' && e.require_time) add('event.event_time', 'event', 'eventTime');
    for (const [field, max, code] of [['name', 120, 'eventName'], ['venue', 500, 'venue'], ['contact', 200, 'contact'], ['notes', 1000, 'notes']] as const) {
      if (Array.from(e[field]).length > max) add(`event.${field}`, 'event', code);
    }
    if (hosted) {
      if (e.balance_due_date && !validDate(e.balance_due_date)) add('event.balance_due_date', 'payment', 'balanceDate');
      const totalMinor = Math.round(value.discountedTotal * 100);
      const deposit = Math.round(e.deposit_type === 'percent' ? totalMinor * e.deposit_value / 100 : e.deposit_value * 100);
      if ((e.payment_mode === 'deposit' || e.payment_mode === 'deposit_hold') &&
        (!Number.isFinite(e.deposit_value) || e.deposit_value <= 0 || deposit <= 0 || deposit >= totalMinor)) add('event.deposit_value', 'payment', 'deposit');
      if (e.payment_mode === 'hold' || e.payment_mode === 'deposit_hold') {
        const remaining = totalMinor - (e.payment_mode === 'deposit_hold' ? deposit : 0);
        const hold = Math.round(e.hold_type === 'fixed' ? (e.hold_value ?? 0) * 100 : remaining * (e.hold_value ?? 100) / 100);
        if (!value.holdEnabled) add('event.hold_value', 'payment', 'holdUnavailable');
        else if (!Number.isFinite(hold) || hold <= 0 || hold > remaining) add('event.hold_value', 'payment', 'hold');
      }
    }
  }
  if (!intent) add('intent', 'payment', 'intent');
  else if (intent === 'link' && !value.linkEnabled || intent === 'charge_card' && !value.cardEnabled) add('intent', 'payment', 'capability');
  if (intent === 'record' && !value.received) add('received', 'payment', 'received');
  if (value.manualStarted) {
    if (!Number.isFinite(value.manualValue) || value.manualValue <= 0 || value.manualType === 'percent' && value.manualValue > 100) add('manualValue', 'payment', 'manualValue');
    if (!value.manualReason.trim()) add('manualReason', 'payment', 'manualReason');
  }
  if (!Number.isFinite(value.total) || value.total <= 0 || hosted && value.discountedTotal <= 0) add('total', 'payment', 'total');
  return issues;
}

/** Gives each control and its inline error a stable accessible association. */
export function checkoutFieldProps(field: CheckoutField, errors: CheckoutErrors) {
  return { id: `checkout-${field}`, 'aria-invalid': !!errors[field] || undefined, 'aria-describedby': errors[field] ? `checkout-${field}-error` : undefined };
}
