'use client';

import { useEffect, useRef } from 'react';
import {
  ArrowUpRightIcon,
  MapPinIcon,
  PhoneIcon,
  ReceiptTextIcon,
  XIcon,
} from 'lucide-react';
import { Badge, Button } from '@/components/ds';
import { useCurrency, useI18n } from '@/lib/i18n';
import type { Order } from '@/lib/api';
import { deriveOrderCapabilities, type PrimaryAction } from '@/lib/orders/order-actions';
import { getOrderTiming, isOperationalOrder } from '@/lib/orders/operations-board';
import {
  localizeOrderType,
  localizeSource,
  localizeStatus,
  PAYMENT_TONE,
  STATUS_TONE,
} from '@/lib/orders/status-presentation';

interface OrderQuickViewProps {
  order: Order | null;
  canManage: boolean;
  loading?: boolean;
  onClose: () => void;
  onOpenDetails: () => void;
  onPrimary: (action: PrimaryAction) => void;
}

function primaryLabel(action: PrimaryAction, order: Order, t: (key: string) => string): string {
  if (action === 'markReady' && order.order_type === 'delivery') return t('markReadyForDelivery');
  const keys: Record<PrimaryAction, string> = {
    accept: 'accept',
    sendToKitchen: 'sendToKitchen',
    markReady: 'markReady',
    markServed: 'markServed',
    markOutForDelivery: 'markOutForDelivery',
    markDelivered: 'markDelivered',
  };
  return t(keys[action]);
}

/**
 * Lightweight desktop inspection panel. It keeps the queue visible while staff
 * verify the ticket, then hands complex work to the canonical full detail view.
 */
export function OrderQuickView({
  order,
  canManage,
  loading = false,
  onClose,
  onOpenDetails,
  onPrimary,
}: OrderQuickViewProps) {
  const { t, direction } = useI18n();
  const { money } = useCurrency();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const orderId = order?.id;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!orderId) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [orderId]);

  if (!order) return null;

  const caps = deriveOrderCapabilities(order, { canManage });
  const timing = getOrderTiming(order);
  const showStageTime = isOperationalOrder(order) && !timing.scheduledForFuture;
  const wholeMoney = (value: number) =>
    money(value, { decimals: 0, grouped: true }).replace(/,/g, '\u202f');

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby="order-quick-view-title"
      className={`fixed inset-y-0 z-40 flex w-full flex-col border-[var(--line)] bg-[var(--surface)] shadow-3 motion-safe:animate-in motion-safe:duration-200 sm:w-[460px] ${
        direction === 'rtl'
          ? 'start-0 border-e motion-safe:slide-in-from-left'
          : 'end-0 border-s motion-safe:slide-in-from-right'
      }`}
    >
      <header className="flex items-start gap-3 border-b border-[var(--line)] px-5 py-4">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-r-md text-[var(--fg-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)] focus-visible:outline-none focus-visible:shadow-ring"
          aria-label={t('close')}
        >
          <XIcon className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="order-quick-view-title" className="text-fs-xl font-semibold text-[var(--fg)]">
              {t('orderNumber').replace('{id}', String(order.id))}
            </h2>
            <Badge tone={STATUS_TONE[order.status] ?? 'neutral'} dot>
              {localizeStatus(order.status, t)}
            </Badge>
          </div>
          <p className="mt-1 text-fs-sm text-[var(--fg-muted)]">
            {order.customer_name || t('guestCustomer')} · {localizeOrderType(order.order_type, t)}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="grid grid-cols-2 border-b border-[var(--line)] bg-[var(--surface-2)]">
          <div className="border-e border-[var(--line)] px-5 py-4">
            <span className="text-fs-xs text-[var(--fg-muted)]">{showStageTime ? t('ordersStageTime') : t('date')}</span>
            <p className={`mt-1 text-fs-sm font-semibold ${timing.overdue ? 'text-[var(--danger-500)]' : 'text-[var(--fg)]'}`}>
              {showStageTime
                ? `${timing.minutes} ${t('minShort')}`
                : new Date(order.scheduled_for || order.created_at).toLocaleString([], {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
            </p>
          </div>
          <div className="px-5 py-4">
            <span className="text-fs-xs text-[var(--fg-muted)]">{t('source')}</span>
            <p className="mt-1 text-fs-sm font-medium text-[var(--fg)]">{localizeSource(order.order_source, t)}</p>
          </div>
        </section>

        <section className="border-b border-[var(--line)] px-5 py-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-fs-sm font-semibold text-[var(--fg)]">{t('items')}</h3>
            <span className="text-fs-xs text-[var(--fg-muted)]">{order.items.length}</span>
          </div>
          <div className="space-y-3">
            {order.items.map((item, index) => (
              <div key={`${item.id ?? item.menu_item_id}-${index}`} className="flex items-start gap-3 text-fs-sm">
                <span className="num flex size-6 shrink-0 items-center justify-center rounded-r-sm bg-[var(--surface-2)] text-fs-xs font-semibold text-[var(--fg)]">
                  {item.quantity}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[var(--fg)]">{item.name}</p>
                  {item.selected_variant_name && (
                    <p className="text-fs-xs text-[var(--fg-muted)]">{item.selected_variant_name}</p>
                  )}
                </div>
                <span className="num shrink-0 text-[var(--fg-muted)]">
                  {wholeMoney(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-b border-[var(--line)] px-5 py-5">
          {order.customer_phone && (
            <a href={`tel:${order.customer_phone}`} className="flex items-center gap-3 text-fs-sm text-[var(--fg)] hover:text-[var(--brand-600)]">
              <PhoneIcon className="size-4 text-[var(--fg-muted)]" />
              <span dir="ltr">{order.customer_phone}</span>
            </a>
          )}
          {order.delivery_address && (
            <div className="flex items-start gap-3 text-fs-sm text-[var(--fg)]">
              <MapPinIcon className="mt-0.5 size-4 shrink-0 text-[var(--fg-muted)]" />
              <span>{[order.delivery_address, order.delivery_city].filter(Boolean).join(', ')}</span>
            </div>
          )}
        </section>

        <section className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2">
            <ReceiptTextIcon className="size-4 text-[var(--fg-muted)]" />
            <Badge tone={PAYMENT_TONE[order.payment_status] ?? 'neutral'}>{t(order.payment_status)}</Badge>
          </div>
          <span className="num text-fs-2xl font-semibold text-[var(--fg)]">
            {wholeMoney(order.total_amount)}
          </span>
        </section>
      </div>

      <footer className="flex gap-2 border-t border-[var(--line)] px-5 py-4 pb-[max(var(--s-4),env(safe-area-inset-bottom))]">
        <Button variant="secondary" size="md" className="flex-1" onClick={onOpenDetails}>
          {t('ordersOpenFullDetails')}
          <ArrowUpRightIcon />
        </Button>
        {canManage && caps.primary && (
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            disabled={loading}
            onClick={() => caps.primary === 'accept' ? onOpenDetails() : onPrimary(caps.primary!)}
          >
            {caps.primary === 'accept' ? t('ordersReview') : primaryLabel(caps.primary, order, t)}
          </Button>
        )}
      </footer>
    </aside>
  );
}
