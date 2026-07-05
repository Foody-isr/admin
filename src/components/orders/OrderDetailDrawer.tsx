'use client';

// Rich order-detail slide-over (1060px) — the canonical order details view.
// Extracted from the orders board so it can be reused anywhere an order needs
// the full recap (orders page, production planning, …). Purely presentational:
// all mutations are delegated to the on* callback props supplied by the host.

import { useEffect, useState, useRef, Fragment } from 'react';
import {
  XIcon, PrinterIcon, ChevronDownIcon,
  CreditCardIcon, CheckCircle2Icon,
  CheckIcon, ClockIcon, GlobeIcon, EditIcon,
  CopyIcon, MessageCircleIcon, LinkIcon, Trash2Icon, MapPinIcon,
  SendIcon, MailIcon, FileTextIcon, DownloadIcon, MoreHorizontalIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { formatDeliveryAddress } from '@/lib/delivery-address';
import { printOrderTicket, type PrintTicketRestaurant, type TicketKind } from '@/lib/print-ticket';
import {
  receiptShareUrl,
  buildShareMessage,
  buildWhatsAppUrl,
  buildMailtoUrl,
} from '@/lib/receipt-share';
import { cancellationInfo, CANCELLATION_REASON_KEY } from '@/lib/orders/cancellation';
import { CashTag } from '@/components/orders/CashTag';
import {
  initOrderPaymentLink, getOrderInvoice, sendOrderInvoice, fetchOrderInvoicePdf,
  type Order, type OrderItem, type CheckoutConfig, type CheckoutFieldConfig,
} from '@/lib/api';
import { Badge, Button, Drawer, Section } from '@/components/ds';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export const STATUS_TONE: Record<string, BadgeTone> = {
  pending_review: 'warning',
  accepted: 'info',
  in_kitchen: 'warning',
  ready: 'info',
  ready_for_pickup: 'info',
  ready_for_delivery: 'info',
  out_for_delivery: 'info',
  served: 'success',
  received: 'success',
  picked_up: 'success',
  delivered: 'success',
  rejected: 'danger',
  // Legacy status for abandoned-payment orders; rendered like `rejected`
  // ("Annulée") so cancellations read as one status. New abandonments use
  // `rejected` (see foodyserver abandonment sweeper).
  cancelled: 'danger',
  scheduled: 'neutral',
};

export const PAYMENT_TONE: Record<string, BadgeTone> = {
  paid: 'success',
  pending: 'warning',
  unpaid: 'warning',
  refunded: 'neutral',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

// Simple hash to pick a muted color for item avatars
function itemColor(name: string): string {
  const colors = ['#F18A47', '#60A5FA', '#D89B35', '#77BA4B', '#A78BFA', '#F472B6', '#34D399', '#FB7185'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ─── Localization helpers ──────────────────────────────────────────────────

const STATUS_KEY: Record<string, string> = {
  pending_review: 'statusPendingReview',
  accepted: 'statusAccepted',
  in_kitchen: 'statusInKitchen',
  ready: 'statusReady',
  ready_for_pickup: 'statusReadyForPickup',
  ready_for_delivery: 'statusReadyForDelivery',
  out_for_delivery: 'statusOutForDelivery',
  served: 'statusServed',
  received: 'statusReceived',
  picked_up: 'statusPickedUp',
  delivered: 'statusDelivered',
  rejected: 'statusRejected',
  // Legacy abandoned-payment status — same label as `rejected` ("Annulée").
  cancelled: 'statusRejected',
  scheduled: 'statusScheduled',
};

// `t()` returns the key itself when missing — treat that as "not translated".
export function localizeStatus(status: string, t: (k: string) => string): string {
  const key = STATUS_KEY[status];
  if (!key) return status.replace(/_/g, ' ');
  const value = t(key);
  return value === key ? status.replace(/_/g, ' ') : value;
}

const SOURCE_KEY: Record<string, string> = {
  website_order: 'sourceWebsiteOrder',
  online: 'sourceOnline',
  counter: 'sourceCounter',
  tablet_pos: 'sourceTabletPos',
};

function localizeSource(source: string | undefined, t: (k: string) => string): string {
  if (!source) return t('sourceOnline');
  const key = SOURCE_KEY[source];
  if (key) {
    const value = t(key);
    if (value !== key) return value;
  }
  return source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatScheduledFor(iso: string): string {
  try {
    return new Date(iso).toLocaleString([], {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatScheduledDateLong(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString([], {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return iso;
  }
}

function formatScheduledTimeOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

// Returns "Today" / "Tomorrow" / "in 3 days" / null when date is too far out.
// Used by ScheduledBanner to give the staff an at-a-glance sense of urgency.
function relativeDayLabel(iso: string, t: (k: string) => string): string | null {
  try {
    const target = new Date(iso);
    const t0 = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((t0.getTime() - today.getTime()) / 86400000);
    if (days === 0) return t('today') || 'Today';
    if (days === 1) return t('tomorrow') || 'Tomorrow';
    if (days > 1 && days < 14) {
      const tmpl = t('inDaysShort');
      const fallback = `in ${days} days`;
      const used = tmpl && tmpl !== 'inDaysShort' ? tmpl : fallback;
      return used.replace('{n}', String(days));
    }
    return null;
  } catch {
    return null;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function localizeOrderType(type: Order['order_type'], t: (k: string) => string): string {
  if (type === 'dine_in') return t('dineIn');
  if (type === 'pickup') return t('pickup');
  if (type === 'delivery') return t('delivery');
  return String(type).replace(/_/g, ' ');
}

// ─── Custom checkout-field label helpers ─────────────────────────────────────

// Turn a snake_case field id into a readable fallback label ("code_immeuble" →
// "Code immeuble"). Used only when the owner left the field label blank.
export function humanizeFieldId(id: string): string {
  return id
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
    .trim();
}

// Best display label for a checkout field: the owner's fr label, then en, then
// any locale, falling back to a humanized id.
function bestFieldLabel(field: CheckoutFieldConfig): string {
  const l = field.label;
  return l?.fr || l?.en || (l && Object.values(l)[0]) || humanizeFieldId(field.id);
}

// Flatten a restaurant's checkout config into an id→label map across both
// order-type forms, so the orders board can label custom-field answers stored
// on an order (which are keyed by field id, not label).
export function buildCustomFieldLabels(cfg: CheckoutConfig | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cfg) return out;
  for (const form of [cfg.delivery, cfg.pickup]) {
    for (const f of form?.fields ?? []) out[f.id] = bestFieldLabel(f);
  }
  return out;
}

// ─── Timeline ────────────────────────────────────────────────────────────────

const TIMELINE_STEPS = [
  { key: 'received', labelKey: 'orderReceived', statuses: [] as string[] },
  { key: 'accepted', labelKey: 'statusAccepted', statuses: ['accepted'] },
  { key: 'in_kitchen', labelKey: 'inKitchen', statuses: ['in_kitchen'] },
  { key: 'ready', labelKey: 'statusReady', statuses: ['ready', 'ready_for_pickup', 'ready_for_delivery'] },
  { key: 'served', labelKey: 'served', statuses: ['served', 'picked_up', 'delivered'] },
];

function statusIndex(status: string) {
  // Map status to the furthest reached step (0..4).
  // Step 0 "Reçue" means "a new order arrived", so every live order (including
  // pending_review and scheduled) starts there — that first dot is the current
  // step until staff accept the order. Only `rejected` sits before step 0 (-1):
  // it's a terminal/negative outcome shown with its own danger banner, so the
  // progression stays empty.
  if (['served', 'received', 'picked_up', 'delivered'].includes(status)) return 4;
  if (['ready', 'ready_for_pickup', 'ready_for_delivery', 'out_for_delivery'].includes(status)) return 3;
  if (status === 'in_kitchen') return 2;
  if (status === 'accepted') return 1;
  if (status === 'rejected') return -1;
  return 0; // pending_review, scheduled, and any other live status → "Reçue"
}

// ─── Order Detail Drawer — 1060px, matches design-reference/order-details.jsx ────

export function OrderDetailDrawer({
  order, canManage, canDelete, isLoading, onClose, onAccept, onReject, onDelete, onSendToKitchen, onMarkReady, onMarkServed,
  onOutForDelivery, onMarkDelivered,
  onTakePayment, onCloseOrder, onEdit,
  restaurantInfo, customFieldLabels,
}: {
  order: Order | null;
  canManage: boolean;
  canDelete?: boolean;
  isLoading: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  onDelete?: () => void;
  onSendToKitchen: () => void;
  onMarkReady: () => void;
  onMarkServed: () => void;
  onOutForDelivery: () => void;
  onMarkDelivered: () => void;
  onTakePayment: () => void;
  onCloseOrder: () => void;
  onEdit: () => void;
  restaurantInfo: PrintTicketRestaurant;
  customFieldLabels: Record<string, string>;
}) {
  const { t, locale, direction } = useI18n();

  // Payment-link retrieval (for orders awaiting online payment). The link is
  // regenerated on demand — not stored — so staff can re-share it any time.
  const [payLink, setPayLink] = useState<string | null>(null);
  const [payLinkLoading, setPayLinkLoading] = useState(false);
  const [payLinkError, setPayLinkError] = useState<string | null>(null);
  const [payLinkCopied, setPayLinkCopied] = useState(false);

  // Reset the fetched link whenever a different order is opened in this drawer.
  useEffect(() => {
    setPayLink(null);
    setPayLinkError(null);
    setPayLinkCopied(false);
  }, [order?.id]);

  if (!order) {
    // Still render a closed Drawer so the transition works cleanly when toggling.
    return <Drawer open={false} onOpenChange={(v) => { if (!v) onClose(); }} title="" width={1060}> </Drawer>;
  }

  const fetchPayLink = async () => {
    setPayLinkLoading(true);
    setPayLinkError(null);
    try {
      const res = await initOrderPaymentLink(order.restaurant_id, order.id);
      if (res.payment_url) setPayLink(res.payment_url);
      else setPayLinkError(t('noPaymentUrl') || 'No payment link available');
    } catch (err) {
      setPayLinkError(err instanceof Error ? err.message : String(err));
    } finally {
      setPayLinkLoading(false);
    }
  };

  const copyPayLink = async () => {
    if (!payLink) return;
    try {
      await navigator.clipboard.writeText(payLink);
      setPayLinkCopied(true);
      setTimeout(() => setPayLinkCopied(false), 2000);
    } catch {
      /* clipboard unavailable — link stays visible for manual copy */
    }
  };

  const payLinkWhatsApp = payLink
    ? `https://wa.me/${(order.customer_phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`${t('paymentLinkHint')} ${payLink}`)}`
    : '';

  const currentStep = statusIndex(order.status);
  const isCancelled = order.status === 'rejected';
  const isScheduled = order.status === 'scheduled';
  const isActive = currentStep === 2;
  const bannerTone: 'warning' | 'success' | 'info' | 'danger' =
    isCancelled ? 'danger' : isActive ? 'warning' : currentStep >= 4 ? 'success' : 'info';

  const createdMins = Math.max(
    0,
    Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000),
  );

  // Split items into regular vs combo groups (items sharing a combo_group).
  // Combo step items are stored with price = price_delta (0 for non-premium picks),
  // so the combo's base price lives only in the order total. We mirror the combo
  // grouping logic from foodyweb's receipt and foodypos's order details page.
  const allItems: OrderItem[] = order.items ?? [];
  const regularItems = allItems.filter((i) => !i.combo_group);
  const comboGroupsMap = new Map<string, OrderItem[]>();
  for (const item of allItems) {
    if (item.combo_group) {
      const group = comboGroupsMap.get(item.combo_group) ?? [];
      group.push(item);
      comboGroupsMap.set(item.combo_group, group);
    }
  }
  const comboGroups: Array<[string, OrderItem[]]> = Array.from(comboGroupsMap.entries());

  // Group regular items by their snapshotted category. Preserve first-seen
  // order so the visual order matches how the customer composed the order.
  // Items with no category snapshot (older/fake rows that pre-date the
  // snapshot migration) fall into a single "Other" bucket at the end.
  const categoryOrder: string[] = [];
  const itemsByCategory = new Map<string, OrderItem[]>();
  for (const it of regularItems) {
    const key = it.category_name && it.category_name.trim() !== '' ? it.category_name : '__other__';
    if (!itemsByCategory.has(key)) {
      itemsByCategory.set(key, []);
      categoryOrder.push(key);
    }
    itemsByCategory.get(key)!.push(it);
  }
  // Move __other__ to the end if both labelled and other groups exist, so
  // labelled categories always come first.
  const otherIdx = categoryOrder.indexOf('__other__');
  if (otherIdx >= 0 && categoryOrder.length > 1) {
    categoryOrder.splice(otherIdx, 1);
    categoryOrder.push('__other__');
  }
  const categoryGroups: Array<{ key: string; label: string; items: OrderItem[] }> = categoryOrder.map((key) => ({
    key,
    label: key === '__other__' ? (t('uncategorized') || 'Autres') : key,
    items: itemsByCategory.get(key)!,
  }));

  const regularTotal = regularItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const comboDeltasTotal = comboGroups.reduce(
    (s, [, items]) => s + items.reduce((gs: number, i: OrderItem) => gs + i.price * i.quantity, 0),
    0,
  );
  // Fallback when server hasn't sent combo_price (older clients): split the
  // remainder of order.total_amount evenly across combos.
  const remainingForCombos = Math.max(
    0,
    (order.total_amount ?? 0) - regularTotal - comboDeltasTotal,
  );
  const comboCount = comboGroups.length;
  const comboPriceFor = (items: OrderItem[]): number => {
    const fromServer = items[0]?.combo_price;
    if (fromServer && fromServer > 0) return fromServer;
    return comboCount > 0 ? remainingForCombos / comboCount : 0;
  };
  const combosSubtotal = comboGroups.reduce((s, [, items]) => {
    const deltas = items.reduce((gs: number, i: OrderItem) => gs + i.price * i.quantity, 0);
    return s + comboPriceFor(items) + deltas;
  }, 0);

  const totalsLine = order.total_amount ?? regularTotal + combosSubtotal;
  const deliveryFee = order.delivery_fee ?? 0;
  // When a delivery fee applies, derive the subtotal from the total so the three
  // displayed lines (subtotal + fee = total) always reconcile exactly.
  const subtotal = deliveryFee > 0 ? totalsLine - deliveryFee : regularTotal + combosSubtotal;

  const displayedLineCount = regularItems.length + comboGroups.length;
  const totalUnits = allItems.reduce((s, i) => s + i.quantity, 0);

  const handlePrint = (kind: TicketKind) => {
    printOrderTicket({
      order,
      kind,
      restaurant: restaurantInfo,
      locale,
      dir: direction,
      labels: {
        receiptHeading: t('receiptHeading') || 'RECEIPT',
        kitchenHeading: t('kitchenHeading') || 'KITCHEN',
        orderNumber: t('orderNumber').replace('{id}', String(order.id)),
        date: t('date'),
        type: t('type'),
        typeValue: localizeOrderType(order.order_type, t),
        table: t('tableHeading') || 'Table',
        customer: t('customer'),
        phone: t('phone'),
        subtotal: t('subtotal') || 'Sous-total',
        deliveryFee: t('delivery_fee') || 'Frais de livraison',
        total: t('total'),
        uncategorized: t('uncategorized') || 'Autres',
        comboFallback: t('comboMenuFallback') || 'Combo',
      },
    });
  };

  const primaryBtn = (() => {
    const isDelivery = order.order_type === 'delivery';
    switch (order.status) {
      case 'scheduled':
      case 'pending_review':
        return { label: t('accept'), onClick: onAccept };
      case 'accepted':
        return { label: t('sendToKitchen'), onClick: onSendToKitchen };
      case 'in_kitchen':
        return { label: t('markReady'), onClick: onMarkReady };
      case 'ready':
      case 'ready_for_pickup':
        return { label: t('markServed'), onClick: onMarkServed };
      case 'ready_for_delivery':
        return isDelivery
          ? { label: t('markOutForDelivery'), onClick: onOutForDelivery }
          : { label: t('markServed'), onClick: onMarkServed };
      case 'out_for_delivery':
        return { label: t('markDelivered'), onClick: onMarkDelivered };
      default:
        return null;
    }
  })();

  const customerInitials = order.customer_name
    ? order.customer_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : 'C';

  const isTerminal = ['served', 'received', 'picked_up', 'delivered', 'rejected'].includes(order.status);
  const canTakePayment = !isCancelled && order.payment_status !== 'paid' && order.payment_status !== 'refunded';
  // "Close order" transitions a paid in-progress order to served/delivered.
  // Once already terminal there is nothing to do, so hide the button — clicking
  // it was a no-op (the action early-exits) which read as a bug.
  const canCloseOrder = !isCancelled && !isTerminal && order.payment_status === 'paid';
  const canCancelOrder = !isCancelled && !isTerminal;
  // Items can be edited while the order is still in progress (not cancelled or
  // already served/delivered/rejected).
  const canEditOrder = !isCancelled && !isTerminal;

  const toneVar: 'warning' | 'success' | 'danger' | 'info' =
    bannerTone === 'warning' ? 'warning'
    : bannerTone === 'success' ? 'success'
    : bannerTone === 'danger' ? 'danger'
    : 'info';

  const headerSubtitle = (
    <span className="flex items-center gap-1.5 min-w-0">
      <span
        className="relative inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: `var(--${toneVar}-500)` }}
      >
        {isActive && (
          <span
            className="absolute inset-0 rounded-full opacity-70 animate-ping"
            style={{ background: 'var(--warning-500)' }}
          />
        )}
      </span>
      <span
        className="font-semibold tracking-[-0.005em] truncate"
        style={{ color: `var(--${toneVar}-500)` }}
      >
        {localizeStatus(order.status, t)}
      </span>
      {!isScheduled && !isTerminal && (
        <>
          <span className="opacity-40">·</span>
          <span className="tabular-nums shrink-0">
            {createdMins} {t('minShort') || 'min'}
          </span>
        </>
      )}
      <span className="opacity-40">·</span>
      <span className="shrink-0">{localizeOrderType(order.order_type, t)}</span>
      {order.table_number && (
        <>
          <span className="opacity-40">·</span>
          <span className="shrink-0">Table {order.table_number}</span>
        </>
      )}
      {/* Scheduled date intentionally NOT rendered here — it lives in the
          dedicated ScheduledBanner inside the body so it stays visible and
          prominent on both mobile and desktop instead of being truncated. */}
    </span>
  );

  return (
    <Drawer
      open={order != null}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={t('orderNumber').replace('{id}', String(order.id))}
      subtitle={headerSubtitle}
      width={1060}
      // The single "next step" primary lives in the footer command bar (below),
      // so the header stays purely informational — no competing top-right CTA.
      primaryAction={null}
      footer={
        // Command bar. Left: quiet utilities (edit / print / send). Right: a
        // contextual secondary (Encaisser when unpaid, Clôturer when paid —
        // mutually exclusive by payment state), an overflow menu for the rare
        // and destructive actions, and ONE dominant primary = the order's next
        // step. Mobile: the right cluster stacks with the primary on top
        // (col-reverse), each button full-width so labels never truncate.
        <div className="flex flex-col-reverse gap-[var(--s-2)] md:flex-row md:items-center md:justify-between md:gap-[var(--s-3)]">
          {/* Left — quiet utilities */}
          <div className="flex flex-wrap items-center gap-[var(--s-2)]">
            {canManage && canEditOrder && (
              <Button variant="secondary" size="md" onClick={onEdit} className="flex-1 md:flex-none justify-center">
                <EditIcon /> {t('edit') || 'Modifier'}
              </Button>
            )}
            <PrintTicketMenu onSelect={handlePrint} />
            <SendToCustomerMenu order={order} />
          </div>

          {/* Right — contextual secondary · overflow · single primary */}
          <div className="flex flex-col-reverse gap-[var(--s-2)] md:flex-row md:flex-nowrap md:items-center">
            {canManage && canTakePayment && (
              <Button
                variant="secondary"
                size="md"
                onClick={onTakePayment}
                disabled={isLoading}
                style={{
                  color: 'var(--success-600)',
                  borderColor: 'color-mix(in oklab, var(--success-500) 45%, var(--line-strong))',
                }}
                className="flex-1 md:flex-none justify-center"
              >
                <CreditCardIcon /> {t('takePayment')}
              </Button>
            )}
            {canManage && canCloseOrder && (
              <Button
                variant="secondary"
                size="md"
                onClick={onCloseOrder}
                disabled={isLoading}
                className="flex-1 md:flex-none justify-center"
              >
                <CheckCircle2Icon /> {t('closeOrder')}
              </Button>
            )}
            {canManage && (canCancelOrder || (canDelete && !!onDelete)) && (
              <OrderOverflowMenu
                canCancel={canCancelOrder}
                canDelete={!!(canDelete && onDelete)}
                onCancel={onReject}
                onDelete={onDelete}
                disabled={isLoading}
              />
            )}
            {canManage && primaryBtn && (
              <Button
                variant="primary"
                size="md"
                onClick={primaryBtn.onClick}
                disabled={isLoading}
                className="flex-1 md:flex-none justify-center"
              >
                {primaryBtn.label}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* Two-pane on desktop: the grid fills the drawer body's height and each
          column scrolls independently, so reading the Facture on the right never
          scrolls the Progression on the left out of view (and vice-versa). The
          columns hold exactly the body height, so the Drawer's own scroll stays
          idle — no second scrollbar. Mobile stays a single natural scroll. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-[var(--s-5)] lg:h-full lg:min-h-0">
        {/* LEFT — timeline + items */}
        <div className="flex flex-col gap-[var(--s-4)] lg:min-h-0 lg:overflow-y-auto lg:pe-[var(--s-2)]">
          {/* Scheduled banner — prominent date/time when the order is scheduled.
              Lives at the top of the body so staff see it immediately on both
              desktop and mobile (whereas the drawer subtitle truncates). */}
          {isScheduled && order.scheduled_for && (
            <ScheduledBanner
              iso={order.scheduled_for}
              windowStart={order.scheduled_pickup_window_start}
              windowEnd={order.scheduled_pickup_window_end}
              orderType={order.order_type}
              t={t}
            />
          )}

          {/* Cancellation reason — shown when an order was rejected by staff or
              auto-cancelled as an abandoned payment. */}
          {(['rejected', 'cancelled'] as string[]).includes(order.status) && (() => {
            const { code, note } = cancellationInfo(order);
            if (!code && !note) return null;
            return (
              <div className="rounded-r-md border border-[var(--line)] bg-[var(--danger-50)] px-[var(--s-4)] py-[var(--s-3)]">
                <div className="text-fs-sm font-semibold text-[var(--danger-500)]">
                  {t('cancellationReason')}
                </div>
                <div className="text-fs-sm text-[var(--fg)] mt-0.5">
                  {code ? t(CANCELLATION_REASON_KEY[code]) : note}
                </div>
                {code && note && (
                  <div className="text-fs-sm text-[var(--fg-muted)] mt-0.5">{note}</div>
                )}
              </div>
            );
          })()}

          {/* Timeline */}
          <Section title={t('progress') || 'Progression'}>
            <div
              className="grid relative"
              style={{ gridTemplateColumns: `repeat(${TIMELINE_STEPS.length}, 1fr)` }}
            >
              {TIMELINE_STEPS.map((step, i) => {
                const reached = currentStep >= i;
                const active = currentStep === i;
                const stamp =
                  step.key === 'received' ? order.created_at
                  : step.key === 'accepted' ? order.accepted_at
                  : step.key === 'in_kitchen' ? order.in_kitchen_at
                  : step.key === 'ready' ? order.ready_at
                  : step.key === 'served' ? order.completed_at
                  : undefined;
                return (
                  <div key={step.key} className="text-center relative">
                    {i < TIMELINE_STEPS.length - 1 && (
                      <div
                        className="absolute top-[14px] start-1/2 end-[-50%] h-[2px]"
                        style={{ background: currentStep > i ? 'var(--brand-500)' : 'var(--line)' }}
                      />
                    )}
                    <div
                      className="w-7 h-7 rounded-full mx-auto mb-2 grid place-items-center relative z-[1] transition-shadow"
                      style={{
                        background: active
                          ? 'var(--brand-500)'
                          : reached
                          ? 'var(--success-500)'
                          : 'var(--surface-3)',
                        color: reached || active ? '#fff' : 'var(--fg-muted)',
                        boxShadow: active
                          ? '0 0 0 4px color-mix(in oklab, var(--brand-500) 22%, transparent)'
                          : undefined,
                      }}
                    >
                      {reached && !active ? <CheckIcon className="w-3.5 h-3.5" /> : null}
                      {active && (
                        <span
                          aria-hidden
                          className="absolute inset-0 rounded-full opacity-50 animate-ping"
                          style={{ background: 'var(--brand-500)' }}
                        />
                      )}
                    </div>
                    {/* Reserve a constant 2-line height so labels that wrap
                        on narrow widths (e.g. "In kitchen") don't shift the
                        timestamp row out of alignment with neighbouring steps. */}
                    <div
                      className={`text-fs-xs font-medium leading-tight min-h-[2.4em] flex items-start justify-center px-0.5 ${reached || active ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)]'}`}
                    >
                      {t(step.labelKey)}
                    </div>
                    {stamp && reached && (
                      <div className="text-[10px] font-mono tabular-nums text-[var(--fg-subtle)] mt-0.5">
                        {formatTime(stamp)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Items — grouped by snapshotted category, then a Combos section. */}
          <Section
            title={`${displayedLineCount} ${displayedLineCount === 1 ? t('item') : t('items')} · ${totalUnits} ${totalUnits === 1 ? (t('unit') || 'unité') : (t('units') || 'unités')}`}
          >
            <div className="-mx-[var(--s-5)] -mb-[var(--s-5)]">
              {categoryGroups.map((group, gi) => (
                <Fragment key={group.key}>
                  <CategoryHeader
                    label={group.label}
                    count={group.items.length}
                    countLabel={group.items.length === 1 ? t('item') : t('items')}
                    showTopBorder={gi > 0}
                  />
                  {group.items.map((item, ii) => (
                    <OrderLineRow key={item.id} item={item} showTopBorder={ii > 0} />
                  ))}
                </Fragment>
              ))}
              {comboGroups.length > 0 && (
                <>
                  <CategoryHeader
                    label={(t('combos') || 'Combos').toUpperCase()}
                    count={comboGroups.length}
                    countLabel={comboGroups.length === 1 ? t('combo') || 'Combo' : t('combos') || 'Combos'}
                    showTopBorder={categoryGroups.length > 0}
                  />
                  {comboGroups.map(([groupKey, comboItems], gi) => {
                    const comboName = comboItems[0]?.combo_name || t('comboMenuFallback') || 'Combo Menu';
                    const deltas = comboItems.reduce((s: number, i: OrderItem) => s + i.price * i.quantity, 0);
                    const comboTotal = comboPriceFor(comboItems) + deltas;
                    const totalPicks = comboItems.reduce((s: number, i: OrderItem) => s + i.quantity, 0);
                    const picksLabel = totalPicks === 1 ? t('selection') : t('selections');
                    return (
                      <div
                        key={groupKey}
                        className={`px-[var(--s-5)] py-[var(--s-3)] ${gi > 0 ? 'border-t border-[var(--line)]' : ''}`}
                      >
                        <ComboCard
                          comboName={comboName}
                          comboTotal={comboTotal}
                          comboItems={comboItems}
                          totalPicks={totalPicks}
                          picksLabel={picksLabel}
                          comboLabel={(t('combo') || 'Combo').toUpperCase()}
                        />
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </Section>
        </div>

        {/* RIGHT — customer + totals + activity */}
        <div className="flex flex-col gap-[var(--s-4)] lg:min-h-0 lg:overflow-y-auto lg:pe-[var(--s-2)]">
          {/* Customer card */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg shadow-1 p-[var(--s-5)]">
            <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-4)]">
              <div
                className="w-12 h-12 rounded-full grid place-items-center text-white font-semibold tracking-tight"
                style={{ background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))' }}
              >
                {customerInitials}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-fs-md truncate">
                  {order.customer_name || t('guestCustomer') || 'Client'}
                </div>
                {/* Source is shown once, in the structured rows below — no
                    duplicate subtitle here. */}
                {order.customer_phone && (
                  <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5 font-mono tabular-nums truncate">
                    {order.customer_phone}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-[var(--s-2)] text-fs-sm">
              {/* Phone is shown under the name above; the rows below carry the
                  remaining metadata (type, source, custom fields). */}
              <div className="flex items-center justify-between">
                <span className="text-[var(--fg-subtle)]">{t('type')}</span>
                <span>{localizeOrderType(order.order_type, t)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--fg-subtle)]">{t('source')}</span>
                <span className="inline-flex items-center gap-1.5">
                  <GlobeIcon className="w-3 h-3 text-[var(--fg-muted)]" />
                  {localizeSource(order.order_source, t)}
                </span>
              </div>
              {order.table_number && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--fg-subtle)]">Table</span>
                  <span className="font-mono tabular-nums">{order.table_number}</span>
                </div>
              )}

              {/* Answers to the owner's custom checkout-form fields (e.g.
                  "Code Immeuble"). Labels resolved from the checkout config;
                  empty/false answers are already omitted server-side. */}
              {order.custom_fields &&
                Object.entries(order.custom_fields)
                  .filter(([, v]) => v !== '' && v !== false && v != null)
                  .map(([id, v]) => (
                    <div key={id} className="flex items-start justify-between gap-3">
                      <span className="text-[var(--fg-subtle)] shrink-0">
                        {customFieldLabels[id] || humanizeFieldId(id)}
                      </span>
                      <span className="text-right break-words">
                        {typeof v === 'boolean' ? '✓' : String(v)}
                      </span>
                    </div>
                  ))}
            </div>
          </div>

          {/* Delivery address — same field set the Clients column and the
              Deliveries dispatcher show, via the shared formatter. */}
          {order.order_type === 'delivery' && (() => {
            const addr = formatDeliveryAddress(
              {
                address: order.delivery_address,
                city: order.delivery_city,
                floor: order.delivery_floor,
                apt: order.delivery_apt,
                entryCode: order.delivery_entry_code,
              },
              t,
            );
            const notes = order.delivery_notes?.trim();
            if (!addr && !notes) return null;
            return (
              <Section title={t('deliveryAddress')}>
                <div className="flex flex-col gap-[var(--s-2)] text-fs-sm">
                  {addr && (
                    <div className="flex items-start gap-1.5">
                      <MapPinIcon className="w-3.5 h-3.5 text-[var(--fg-muted)] mt-0.5 shrink-0" />
                      <div className="flex flex-col leading-tight">
                        <span>{addr.line1}</span>
                        {addr.line2 && (
                          <span className="text-[var(--fg-subtle)]">{addr.line2}</span>
                        )}
                      </div>
                    </div>
                  )}
                  {notes && (
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[var(--fg-subtle)] shrink-0">{t('deliveryNotes')}</span>
                      <span className="text-right break-words">{notes}</span>
                    </div>
                  )}
                </div>
              </Section>
            );
          })()}

          {/* Courier — read-only. Assignment happens on the Deliveries page. */}
          {order.order_type === 'delivery' && (
            <Section title={t('courier')}>
              <div className="text-fs-sm text-[var(--fg-subtle)]">
                {order.courier_name || t('courierNone')}
              </div>
            </Section>
          )}

          {/* Totals */}
          <Section title={t('total') || 'Total'}>
            <div className="flex flex-col gap-[var(--s-2)] text-fs-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--fg-subtle)]">{t('subtotal') || 'Sous-total'}</span>
                <span className="font-mono tabular-nums">₪{subtotal.toFixed(2)}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--fg-subtle)]">{t('delivery_fee') || 'Frais de livraison'}</span>
                  <span className="font-mono tabular-nums">₪{deliveryFee.toFixed(2)}</span>
                </div>
              )}
              <div className="h-px bg-[var(--line)] my-[var(--s-2)]" />
              <div className="flex items-center justify-between text-fs-lg font-semibold tracking-tight">
                <span>{t('total')}</span>
                <span className="font-mono tabular-nums">₪{totalsLine.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between mt-[var(--s-2)] gap-2">
                <Badge tone={PAYMENT_TONE[order.payment_status] ?? 'neutral'} dot>
                  {(() => {
                    const tv = t(order.payment_status);
                    return tv === order.payment_status ? order.payment_status : tv;
                  })()}
                </Badge>
                <CashTag
                  paymentMethod={order.payment_method}
                  paymentStatus={order.payment_status}
                  variant="full"
                />
              </div>

              {/* Payment link — for orders awaiting online payment. Lets staff
                  re-fetch and re-share the link any time. */}
              {order.payment_status === 'pending' && (
                <div className="mt-[var(--s-2)] flex flex-col gap-[var(--s-2)] rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-[var(--s-3)]">
                  <span className="flex items-center gap-1.5 text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
                    <LinkIcon className="size-3.5" /> {t('paymentLink')}
                  </span>
                  {payLink ? (
                    <>
                      <div className="flex items-center gap-2 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] p-[var(--s-2)]">
                        <span className="flex-1 truncate font-mono text-fs-xs">{payLink}</span>
                        <Button variant="secondary" size="sm" onClick={copyPayLink}>
                          {payLinkCopied ? <CheckIcon /> : <CopyIcon />}
                          {payLinkCopied ? t('copied') : t('copyLink')}
                        </Button>
                      </div>
                      {(order.customer_phone || '').replace(/\D/g, '') && (
                        <a
                          href={payLinkWhatsApp}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-r-md border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--s-3)] text-fs-xs font-medium text-[var(--fg)] hover:bg-[var(--surface-2)]"
                        >
                          <MessageCircleIcon className="size-3.5" /> {t('shareWhatsApp')}
                        </a>
                      )}
                    </>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={fetchPayLink} disabled={payLinkLoading}>
                      <LinkIcon />
                      {payLinkLoading ? `${t('loading')}…` : t('getPaymentLink')}
                    </Button>
                  )}
                  {payLinkError && <span className="text-fs-xs text-[var(--danger-500)]">{payLinkError}</span>}
                </div>
              )}
            </div>
          </Section>

          {/* Invoice — official Summit fiscal document, for Summit-paid orders */}
          {order.external_metadata?.document_number ? (
            <Section title={t('invoiceHeading') || 'Invoice'}>
              <InvoiceSection order={order} />
            </Section>
          ) : null}

          {/* Activity */}
          <Section title={t('activity') || 'Activité'}>
            <ActivityTimeline order={order} t={t} />
          </Section>
        </div>
      </div>
    </Drawer>
  );
}

// ─── Scheduled banner — prominent date/time callout for scheduled orders ──────

function ScheduledBanner({
  iso, windowStart, windowEnd, orderType, t,
}: {
  iso: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  orderType?: Order['order_type'];
  t: (k: string) => string;
}) {
  const rel = relativeDayLabel(iso, t);
  // Prefer the fulfillment window (e.g. "14:00-18:00") over the raw scheduled_for
  // clock time — for batch orders that timestamp is a meaningless near-midnight
  // value, so a delivery/pickup window is what staff actually need to see.
  const win = windowStart && windowEnd ? `${windowStart}-${windowEnd}` : null;
  const typeLabel =
    orderType === 'delivery' ? t('delivery')
    : orderType === 'pickup' ? t('pickup')
    : null;
  const timeText = win
    ? (typeLabel ? `${typeLabel} · ${win}` : win)
    : formatScheduledTimeOnly(iso);
  return (
    <div
      className="flex items-center gap-[var(--s-4)] rounded-r-lg p-[var(--s-4)]"
      style={{
        background: 'color-mix(in oklab, var(--brand-500) 8%, var(--surface))',
        border: '1px solid color-mix(in oklab, var(--brand-500) 28%, var(--line))',
      }}
    >
      <div
        className="w-11 h-11 rounded-r-md grid place-items-center shrink-0"
        style={{
          background: 'color-mix(in oklab, var(--brand-500) 18%, transparent)',
          color: 'var(--brand-500)',
        }}
      >
        <ClockIcon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[var(--s-2)] text-fs-xs uppercase tracking-[.06em] font-semibold text-[var(--brand-500)]">
          <span className="truncate">{t('scheduledForLabel') || 'Scheduled for'}</span>
          {rel && (
            <span
              className="inline-flex items-center px-1.5 h-[18px] rounded-r-sm text-[10px] tracking-[.04em] shrink-0"
              style={{
                background: 'color-mix(in oklab, var(--brand-500) 16%, transparent)',
                color: 'var(--brand-500)',
              }}
            >
              {rel}
            </span>
          )}
        </div>
        <div className="text-fs-lg sm:text-fs-xl font-semibold tracking-tight text-[var(--fg)] mt-0.5 break-words">
          {formatScheduledDateLong(iso)}
        </div>
        <div className="text-fs-sm tabular-nums text-[var(--fg-muted)] mt-0.5">
          {timeText}
        </div>
      </div>
    </div>
  );
}

// ─── Variant chip text — name + recipe-derived portion, dedup'd ──────────────
//
// Returns the text to show in the variant chip on an order line. Combines the
// variant name (e.g. "Normal") with the snapshotted portion (e.g. "250 g")
// into "Normal · 250 g". Skips the portion when the variant name is itself a
// numeric portion ("250g"), since the recipe-derived snapshot would otherwise
// be a duplicate.
function variantChipText(item: { selected_variant_name?: string; variant_portion?: string }): string | null {
  const name = (item.selected_variant_name || '').trim();
  const portion = (item.variant_portion || '').trim();
  if (!name && !portion) return null;
  const nameIsNumericPortion = /^\d+(?:[.,]\d+)?\s*(?:g|kg)?$/i.test(name);
  if (!portion || nameIsNumericPortion) return name || portion;
  if (!name) return portion;
  return `${name} · ${portion}`;
}

// ─── Category / section header — the small uppercase eyebrow above each group ─

function CategoryHeader({
  label,
  count,
  countLabel,
  showTopBorder,
}: {
  label: string;
  count: number;
  countLabel: string;
  showTopBorder: boolean;
}) {
  return (
    <div
      className={`px-[var(--s-5)] py-[var(--s-2)] flex items-center justify-between gap-2 ${
        showTopBorder ? 'border-t border-[var(--line)]' : ''
      }`}
      style={{ background: 'color-mix(in oklab, var(--fg) 3%, transparent)' }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--fg-subtle)] truncate">
        {label}
      </span>
      <span className="text-[10px] text-[var(--fg-subtle)] tabular-nums shrink-0">
        {count} {countLabel}
      </span>
    </div>
  );
}

// ─── Quantity badge — the colored "{n}×" square shared by lines and combos ────

function QtyBadge({ count, seed }: { count: number; seed: string }) {
  return (
    <div
      className="w-11 h-11 rounded-r-md grid place-items-center text-white font-semibold text-fs-sm tracking-[-0.02em] shrink-0"
      style={{ background: itemColor(seed) }}
    >
      {count}×
    </div>
  );
}

// ─── Regular order line row (shared across the items list) ────────────────────

function OrderLineRow({ item, showTopBorder }: { item: OrderItem; showTopBorder: boolean }) {
  const variantText = variantChipText(item);
  const hasMods = !!(item.modifiers && item.modifiers.length > 0);
  return (
    <div
      className={`px-[var(--s-5)] py-[var(--s-3)] grid grid-cols-[44px_1fr_auto] gap-[var(--s-3)] items-start ${
        showTopBorder ? 'border-t border-[var(--line)]' : ''
      }`}
    >
      <QtyBadge count={item.quantity} seed={item.name} />
      <div className="min-w-0">
        <div className="text-fs-sm font-medium truncate tracking-[-0.005em]">
          {item.name}
        </div>
        {(variantText || hasMods) && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {variantText && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tracking-[-0.005em]"
                style={{
                  background: 'color-mix(in oklab, var(--brand-500) 12%, transparent)',
                  color: 'var(--brand-500)',
                }}
              >
                {variantText}
              </span>
            )}
            {item.modifiers?.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-[var(--surface-2)] text-[var(--fg-muted)]"
              >
                {m.name}
              </span>
            ))}
          </div>
        )}
        {item.notes && (
          <div className="flex items-center gap-1 mt-1.5 text-fs-xs text-[var(--fg-muted)] italic">
            <EditIcon className="w-3 h-3 shrink-0" />
            <span className="truncate">&ldquo;{item.notes}&rdquo;</span>
          </div>
        )}
      </div>
      <div className="text-end">
        <div className="font-mono tabular-nums font-medium">
          ₪{(item.price * item.quantity).toFixed(2)}
        </div>
        {item.quantity > 1 && (
          <div className="font-mono tabular-nums text-fs-xs text-[var(--fg-subtle)]">
            ₪{item.price.toFixed(2)} × {item.quantity}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Combo group card — same row format as a line, with a "COMBO" badge ───────

function ComboCard({
  comboName,
  comboTotal,
  comboItems,
  totalPicks,
  picksLabel,
  comboLabel,
}: {
  comboName: string;
  comboTotal: number;
  comboItems: OrderItem[];
  totalPicks: number;
  picksLabel: string;
  comboLabel: string;
}) {
  return (
    <div>
      {/* Header — identical layout to OrderLineRow (badge · name · price). A combo
          is one unit, so the badge reads "1×" like any other line. */}
      <div className="grid grid-cols-[44px_1fr_auto] gap-[var(--s-3)] items-start">
        <QtyBadge count={1} seed={comboName} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-fs-sm font-medium truncate tracking-[-0.005em]">
              {comboName}
            </span>
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.08em]"
              style={{
                background: 'color-mix(in oklab, var(--brand-500) 12%, transparent)',
                color: 'var(--brand-500)',
              }}
            >
              {comboLabel}
            </span>
          </div>
          <div className="text-fs-xs text-[var(--fg-subtle)] tabular-nums mt-0.5">
            {totalPicks} {picksLabel}
          </div>
        </div>
        <div className="text-end font-mono tabular-nums font-medium">
          ₪{comboTotal.toFixed(2)}
        </div>
      </div>

      {/* Sub-items — nested under the name column with a neutral guide rail */}
      <div className="mt-[var(--s-2)] ms-14 ps-[var(--s-3)] border-s border-[var(--line)] flex flex-col gap-[var(--s-2)]">
        {comboItems.map((ci) => {
          const lineDelta = ci.price * ci.quantity;
          const hasMods = ci.modifiers && ci.modifiers.length > 0;
          const subVariantText = variantChipText(ci);
          return (
            <div
              key={ci.id}
              className="grid grid-cols-[14px_1fr_auto] gap-[var(--s-2)] items-baseline text-fs-xs"
            >
              <span
                className="block w-1.5 h-1.5 rounded-full mt-[7px]"
                style={{ background: 'var(--fg-muted)' }}
              />
              <div className="min-w-0">
                <span className="text-[var(--fg)] font-medium">
                  {ci.quantity > 1 ? `${ci.quantity}× ` : ''}
                  {ci.name}
                </span>
                {subVariantText && (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 ms-2 rounded-full text-[10px] font-medium align-middle"
                    style={{
                      background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
                      color: 'var(--brand-500)',
                    }}
                  >
                    {subVariantText}
                  </span>
                )}
                {hasMods && (
                  <span className="ms-2 text-[var(--fg-muted)]">
                    {ci.modifiers!.map((m) => m.name).join(' · ')}
                  </span>
                )}
                {ci.notes && (
                  <div className="mt-0.5 flex items-center gap-1 text-[var(--fg-muted)] italic">
                    <EditIcon className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">&ldquo;{ci.notes}&rdquo;</span>
                  </div>
                )}
              </div>
              <div className="text-end font-mono tabular-nums text-[var(--fg-subtle)]">
                {lineDelta > 0 ? `+₪${lineDelta.toFixed(2)}` : ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Activity timeline — events from order timestamps ────────────────────────

function ActivityTimeline({ order, t }: { order: Order; t: (k: string) => string }) {
  const events: Array<{ at: string; label: string; future?: boolean }> = [];
  events.push({
    at: order.created_at,
    label: order.order_source
      ? (t('activityCreatedFrom') || 'Created from {source}').replace('{source}', localizeSource(order.order_source, t))
      : (t('activityCreatedSimple') || 'Order created'),
  });
  if (order.scheduled_for) {
    events.push({
      at: order.scheduled_for,
      label: `${t('scheduledForLabel') || 'Scheduled for'} ${formatScheduledFor(order.scheduled_for)}`,
      future: true,
    });
  }
  if (order.accepted_at) {
    events.push({ at: order.accepted_at, label: t('activityAccepted') || 'Order accepted' });
  }
  if (order.in_kitchen_at) {
    events.push({ at: order.in_kitchen_at, label: t('activityKitchen') || 'Sent to kitchen' });
  }
  if (order.ready_at) {
    events.push({ at: order.ready_at, label: t('activityReady') || 'Marked ready' });
  }
  if (order.completed_at) {
    const isCancelled = order.status === 'rejected';
    events.push({
      at: order.completed_at,
      label: isCancelled
        ? t('activityCancelled') || 'Order cancelled'
        : t('activityCompleted') || 'Order completed',
    });
  }

  return (
    <div className="flex flex-col gap-[var(--s-3)] text-fs-xs relative">
      {events.map((e, i) => (
        <div key={`${e.at}-${i}`} className="flex items-start gap-[var(--s-3)] relative">
          {/* Connector line */}
          {i < events.length - 1 && (
            <span
              aria-hidden
              className="absolute start-[18px] top-3 bottom-[-12px] w-px"
              style={{ background: 'var(--line)' }}
            />
          )}
          {/* Timestamp */}
          <span className="font-mono text-[var(--fg-subtle)] text-[11px] shrink-0 w-[34px] tabular-nums pt-px">
            {formatTime(e.at)}
          </span>
          {/* Dot */}
          <span
            className="block w-1.5 h-1.5 rounded-full shrink-0 mt-[6px] relative z-[1]"
            style={{
              background: e.future
                ? 'color-mix(in oklab, var(--brand-500) 50%, var(--fg-muted))'
                : 'var(--brand-500)',
              boxShadow: e.future
                ? 'none'
                : '0 0 0 3px color-mix(in oklab, var(--brand-500) 14%, transparent)',
            }}
          />
          <div className="flex-1 min-w-0">
            <span className={e.future ? 'text-[var(--fg-muted)] italic' : 'text-[var(--fg)]'}>
              {e.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Print Ticket Menu ───────────────────────────────────────────────────────
// Lets staff pick which ticket to print: customer receipt (with prices, mirrors
// foodyweb) or kitchen ticket (no prices). Opens upward since it lives in the
// drawer footer. Printing itself is browser-based (see lib/print-ticket.ts).

function PrintTicketMenu({ onSelect }: { onSelect: (kind: TicketKind) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const choose = (kind: TicketKind) => {
    setOpen(false);
    onSelect(kind);
  };

  return (
    <div className="relative flex-1 md:flex-none" ref={ref}>
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen((v) => !v)}
        className="w-full md:w-auto justify-center"
      >
        <PrinterIcon /> {t('printReceipt') || 'Imprimer ticket'}
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </Button>
      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 rounded-standard py-1 min-w-[200px] z-50 shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          <button
            onClick={() => choose('receipt')}
            className="block w-full text-left px-3 py-2 text-sm text-fg-secondary hover:text-fg-primary transition-colors"
          >
            {t('printCustomerReceipt') || 'Reçu client'}
          </button>
          <button
            onClick={() => choose('kitchen')}
            className="block w-full text-left px-3 py-2 text-sm text-fg-secondary hover:text-fg-primary transition-colors"
          >
            {t('printKitchenTicket') || 'Ticket cuisine'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Send To Customer Menu ───────────────────────────────────────────────────
// Lets staff send the customer their receipt without downloading + re-uploading:
// WhatsApp / email device deep-links pre-filled with a short summary + a link to
// the hosted receipt page, plus a copy-link shortcut. Mirrors PrintTicketMenu.
// No backend call — the receipt link is built from the order's receipt_token.

function SendToCustomerMenu({ order }: { order: Order }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const url = receiptShareUrl(order.receipt_token);
  const body = buildShareMessage({
    template: t('receiptShareMessage'),
    name: order.customer_name,
    id: order.id,
    total: order.total_amount ?? 0,
    url,
  });
  const subject = t('receiptEmailSubject').replace('{id}', String(order.id));
  const waUrl = buildWhatsAppUrl(order.customer_phone, body);
  const mailUrl = buildMailtoUrl(order.customer_email, subject, body);

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — link stays available via the other actions */
    }
  };

  const itemClass =
    'flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-fg-secondary hover:text-fg-primary transition-colors';

  return (
    <div className="relative flex-1 md:flex-none" ref={ref}>
      <Button
        variant="secondary"
        size="md"
        onClick={() => setOpen((v) => !v)}
        className="w-full md:w-auto justify-center"
      >
        <SendIcon /> {t('sendToCustomer') || 'Envoyer au client'}
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </Button>
      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 rounded-standard py-1 min-w-[220px] z-50 shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <MessageCircleIcon className="size-4" />
              {t('sendReceiptWhatsApp') || 'Envoyer par WhatsApp'}
            </a>
          )}
          <a href={mailUrl} onClick={() => setOpen(false)} className={itemClass}>
            <MailIcon className="size-4" />
            {t('sendReceiptEmail') || 'Envoyer par email'}
          </a>
          <button
            onClick={copyLink}
            disabled={!url}
            className={`${itemClass} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {copied ? <CheckIcon className="size-4" /> : <LinkIcon className="size-4" />}
            {copied ? (t('linkCopied') || 'Lien copié') : (t('copyLink') || 'Copier le lien')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Order Overflow Menu — rare + destructive actions ────────────────────────
// Keeps Cancel / Delete out of the primary command bar so they can't be
// mis-clicked next to constructive actions. Opens upward (it lives in the
// footer); both items are danger-colored.

function OrderOverflowMenu({
  canCancel, canDelete, onCancel, onDelete, disabled,
}: {
  canCancel: boolean;
  canDelete: boolean;
  onCancel: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const itemClass =
    'flex items-center gap-2 w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[var(--surface-2)]';

  return (
    <div className="relative flex-1 md:flex-none" ref={ref}>
      <Button
        variant="ghost"
        size="md"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-label={t('moreActions') || 'More'}
        className="w-full md:w-auto justify-center"
      >
        <MoreHorizontalIcon />
      </Button>
      {open && (
        <div
          className="absolute bottom-full end-0 mb-1 rounded-standard py-1 min-w-[220px] z-50 shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          {canCancel && (
            <button
              onClick={() => { setOpen(false); onCancel(); }}
              className={itemClass}
              style={{ color: 'var(--danger-500)' }}
            >
              <XIcon className="size-4" /> {t('cancelOrder') || 'Annuler la commande'}
            </button>
          )}
          {canDelete && onDelete && (
            <button
              onClick={() => { setOpen(false); onDelete(); }}
              className={itemClass}
              style={{ color: 'var(--danger-500)' }}
            >
              <Trash2Icon className="size-4" /> {t('deleteOrder') || 'Supprimer la commande'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Invoice Section (Summit) ────────────────────────────────────────────────
// For a Summit-paid order, fetches the official invoice (number + downloadable
// PDF URL) and lets staff view/download it, email it via Summit (recipient
// editable), or share the link (WhatsApp / copy). Rendered only when the order
// carries a Summit document_id. No fiscal document is generated here — Summit
// already created it at payment.

function InvoiceSection({ order }: { order: Order }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [invoice, setInvoice] = useState<{ document_number: number; document_url: string } | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState(order.customer_email || '');
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState<false | 'view' | 'download'>(false);
  const [pdfError, setPdfError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailed(false);
    getOrderInvoice(order.restaurant_id, order.id)
      .then((inv) => { if (active) { setInvoice(inv); setLoading(false); } })
      .catch(() => { if (active) { setFailed(true); setLoading(false); } });
    return () => { active = false; };
  }, [order.restaurant_id, order.id]);

  // Reset the send panel + recipient when a different order is shown in the
  // same reused drawer instance.
  useEffect(() => {
    setEmailDraft(order.customer_email || '');
    setSendOpen(false);
    setSendState('idle');
  }, [order.id, order.customer_email]);

  if (loading) {
    return <div className="text-fs-sm text-[var(--fg-subtle)]">{t('invoiceLoading') || 'Chargement de la facture…'}</div>;
  }
  if (failed || !invoice) {
    return <div className="text-fs-sm text-[var(--danger-500)]">{t('invoiceUnavailable') || 'Facture indisponible'}</div>;
  }

  const url = invoice.document_url;
  const waText = t('invoiceShareMessage')
    .replace('{name}', order.customer_name ? ` ${order.customer_name}` : '')
    .replace('{number}', String(invoice.document_number))
    .replace('{id}', String(order.id))
    .replace('{url}', url)
    .trim();
  const waUrl = buildWhatsAppUrl(order.customer_phone, waText);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — link still reachable via the other actions */
    }
  };

  const doSend = async () => {
    setSendState('sending');
    try {
      await sendOrderInvoice(order.restaurant_id, order.id, emailDraft.trim() || undefined);
      setSendState('sent');
      setSendOpen(false);
    } catch {
      setSendState('error');
    }
  };

  // Fetch the PDF through our server (Summit forces a download + blocks
  // cross-origin), then either open it inline in a new tab or save it.
  const openPdf = async (mode: 'view' | 'download') => {
    setPdfBusy(mode);
    setPdfError(false);
    try {
      const blob = await fetchOrderInvoicePdf(order.restaurant_id, order.id);
      const blobUrl = URL.createObjectURL(blob);
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `facture-${invoice.document_number}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        window.open(blobUrl, '_blank', 'noopener');
      }
      // Give the new tab / download time to read the blob before revoking.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      setPdfError(true);
    } finally {
      setPdfBusy(false);
    }
  };

  const shareBtn =
    'inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-[var(--s-3)] text-fs-xs font-medium hover:bg-[var(--surface-2)]';

  return (
    <div className="flex flex-col gap-[var(--s-2)] text-fs-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium">#{invoice.document_number}</span>
        <span className="text-fs-xs text-[var(--fg-muted)]">Summit</span>
      </div>
      <div className="flex flex-wrap items-center gap-[var(--s-2)]">
        <Button variant="secondary" size="sm" onClick={() => openPdf('view')} disabled={pdfBusy !== false}>
          <FileTextIcon className="size-3.5" /> {pdfBusy === 'view' ? `${t('loading')}…` : (t('invoiceView') || 'Voir')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => openPdf('download')} disabled={pdfBusy !== false}>
          <DownloadIcon className="size-3.5" /> {pdfBusy === 'download' ? `${t('loading')}…` : (t('invoiceDownload') || 'Télécharger')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setSendOpen((v) => !v)}>
          <SendIcon className="size-3.5" /> {t('invoiceSend') || 'Envoyer la facture'}
          <ChevronDownIcon className="w-3.5 h-3.5" />
        </Button>
      </div>
      {sendOpen && (
        <div className="flex flex-col gap-[var(--s-2)] rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-[var(--s-3)]">
          <label htmlFor="invoice-recipient" className="text-fs-xs text-[var(--fg-muted)]">{t('invoiceRecipient') || 'Destinataire'}</label>
          <div className="flex flex-wrap items-center gap-[var(--s-2)]">
            <input
              id="invoice-recipient"
              type="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="client@email.com"
              className="flex-1 min-w-[180px] rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-1 text-fs-sm"
            />
            <Button variant="primary" size="sm" onClick={doSend} disabled={sendState === 'sending'}>
              <MailIcon className="size-3.5" />
              {sendState === 'sending' ? (t('invoiceSending') || 'Envoi…') : (t('invoiceSendEmail') || 'Par email (via Summit)')}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-[var(--s-2)]">
            {waUrl && (
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className={shareBtn}>
                <MessageCircleIcon className="size-3.5" /> {t('shareWhatsApp')}
              </a>
            )}
            <button onClick={copyLink} className={shareBtn}>
              {copied ? <CheckIcon className="size-3.5" /> : <LinkIcon className="size-3.5" />}
              {copied ? (t('linkCopied') || 'Lien copié') : (t('copyLink') || 'Copier le lien')}
            </button>
          </div>
        </div>
      )}
      {sendState === 'sent' && <span className="text-fs-xs text-[var(--success-500)]">{t('invoiceSent') || 'Facture envoyée'}</span>}
      {sendState === 'error' && <span className="text-fs-xs text-[var(--danger-500)]">{t('invoiceSendError') || "Échec de l'envoi de la facture"}</span>}
      {pdfError && <span className="text-fs-xs text-[var(--danger-500)]">{t('invoiceUnavailable') || 'Facture indisponible'}</span>}
    </div>
  );
}
