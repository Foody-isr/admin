'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  listOrders, acceptOrder, rejectOrder, updateOrderStatus,
  updateOrderPaymentStatus,
  markOrderServed, markOrderDelivered, markOrderOutForDelivery,
  Order, OrderStatus, ListOrdersParams,
} from '@/lib/api';
import { useWs, WsEvent } from '@/lib/ws-context';
import { useOrderSound } from '@/lib/use-order-sound';
import { useBrowserNotifications } from '@/lib/use-browser-notifications';
import { useI18n } from '@/lib/i18n';
import DateRangePicker, { DateRange } from '@/components/DateRangePicker';
import {
  SearchIcon, RefreshCwIcon, Volume2Icon, VolumeXIcon,
  BellIcon, BellOffIcon, ChevronLeftIcon, ChevronRightIcon,
  ChevronDownIcon, XIcon, PrinterIcon,
  CreditCardIcon, CheckCircle2Icon,
  CheckIcon, ClockIcon, GlobeIcon, EditIcon,
} from 'lucide-react';
import { Badge, Button, Drawer, PageHead, Section } from '@/components/ds';
import { TakePaymentDialog, PaymentMethod } from '@/components/orders/TakePaymentDialog';
import {
  DataTable,
  DataTableHead,
  DataTableHeadCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from '@/components/data-table';
import type { OrderItem } from '@/lib/api';

// ─── Tab config ────────────────────────────────────────────────────────────

interface Tab {
  key: string;
  labelKey: string;
  statuses?: string;
  active?: boolean;
}

const TABS: Tab[] = [
  { key: 'all', labelKey: 'all', active: undefined },
  { key: 'active', labelKey: 'active', active: true },
  { key: 'scheduled', labelKey: 'scheduled', statuses: 'scheduled' },
  { key: 'completed', labelKey: 'completed', statuses: 'served,received,picked_up,delivered' },
  { key: 'canceled', labelKey: 'canceled', statuses: 'rejected' },
];

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

const STATUS_TONE: Record<string, BadgeTone> = {
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
  scheduled: 'neutral',
};

const PAYMENT_TONE: Record<string, BadgeTone> = {
  paid: 'success',
  pending: 'warning',
  unpaid: 'warning',
  refunded: 'neutral',
};

const PAGE_SIZE = 25;

// ─── Helpers ───────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function defaultDateRange(): { from: Date; to: Date } {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

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
  scheduled: 'statusScheduled',
};

// `t()` returns the key itself when missing — treat that as "not translated".
function localizeStatus(status: string, t: (k: string) => string): string {
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

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function localizeOrderType(type: Order['order_type'], t: (k: string) => string): string {
  if (type === 'dine_in') return t('dineIn');
  if (type === 'pickup') return t('pickup');
  if (type === 'delivery') return t('delivery');
  return String(type).replace(/_/g, ' ');
}

// ─── Main ──────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { t } = useI18n();
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { status: wsStatus, lastEvent, addProcessingGuard, removeProcessingGuard, isProcessing } = useWs();

  const { play: playSound, isEnabled: isSoundEnabled, toggle: toggleSound } = useOrderSound();
  const { permission, requestPermission, notify } = useBrowserNotifications();
  const [soundOn, setSoundOn] = useState(true);

  const [rawOrders, setRawOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const prevEvent = useRef<WsEvent | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [searchSubmitted, setSearchSubmitted] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange);
  const [page, setPage] = useState(0);

  // Mirrors foodypos: on the "Active" tab, hide orders that have reached a
  // terminal state (served / received / picked_up / delivered / cancelled / rejected).
  // The server includes `served` in the default active filter for backward
  // compatibility with other clients, so we filter here.
  const orders = activeTab === 'active'
    ? rawOrders.filter((o) => !['served', 'received', 'picked_up', 'delivered', 'cancelled', 'rejected'].includes(o.status))
    : rawOrders;
  const setOrders = setRawOrders;

  // Selected order for right panel
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedOrder = orders.find((o) => o.id === selectedId) ?? null;

  useEffect(() => { setSoundOn(isSoundEnabled()); }, [isSoundEnabled]);

  // ─── Fetch ────────────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const tab = TABS.find((t) => t.key === activeTab)!;
    const params: ListOrdersParams = {
      from: toISODate(dateRange.from),
      to: toISODate(dateRange.to),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
      sort_by: 'created_at',
      sort_dir: 'desc',
    };
    if (tab.statuses) params.status = tab.statuses;
    if (tab.active) params.active = true;
    if (searchSubmitted) params.q = searchSubmitted;
    if (typeFilter) params.type = typeFilter;
    if (paymentFilter) params.payment_status = paymentFilter;

    try {
      const result = await listOrders(rid, params);
      setOrders(result.orders);
      setTotal(result.total);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, [rid, activeTab, searchSubmitted, typeFilter, paymentFilter, dateRange, page]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ─── WebSocket ────────────────────────────────────────────────────

  useEffect(() => {
    if (!lastEvent || lastEvent === prevEvent.current) return;
    prevEvent.current = lastEvent;

    const { type, payload } = lastEvent;
    if (!type.startsWith('order.')) return;

    const wsOrder = payload as unknown as Order;
    if (!wsOrder?.id) return;
    if (isProcessing(wsOrder.id)) return;

    if (type === 'order.created') {
      playSound();
      notify(t('newOrder'), {
        body: `${t('orderNumber').replace('{id}', String(wsOrder.id))} · ${localizeOrderType(wsOrder.order_type, t)}`,
        tag: `order-${wsOrder.id}`,
      });
    }

    setOrders((prev) => {
      const idx = prev.findIndex((o) => o.id === wsOrder.id);
      if (type === 'order.created') {
        if (idx >= 0) return prev;
        return [wsOrder, ...prev];
      }
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], ...wsOrder };
      return next;
    });
  }, [lastEvent, isProcessing, playSound, notify]);

  // ─── Actions ──────────────────────────────────────────────────────

  const runAction = async (orderId: number, action: () => Promise<void | Order>, optimisticStatus?: OrderStatus) => {
    setActionLoading(orderId);
    addProcessingGuard(orderId);
    if (optimisticStatus) {
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: optimisticStatus } : o));
    }
    try {
      await action();
    } catch {
      await fetchOrders();
    } finally {
      setActionLoading(null);
      removeProcessingGuard(orderId);
    }
  };

  const handleAccept = (orderId: number) =>
    runAction(orderId, () => acceptOrder(rid, orderId), 'accepted');
  const handleReject = (orderId: number) => {
    if (!confirm(t('rejectThisOrder'))) return;
    runAction(orderId, () => rejectOrder(rid, orderId));
  };
  const handleSendToKitchen = (orderId: number) =>
    runAction(orderId, () => updateOrderStatus(rid, orderId, 'in_kitchen').then(() => {}), 'in_kitchen');
  const handleMarkReady = (orderId: number) =>
    runAction(orderId, () => updateOrderStatus(rid, orderId, 'ready').then(() => {}), 'ready');
  const handleMarkServed = (orderId: number) =>
    runAction(orderId, () => updateOrderStatus(rid, orderId, 'served').then(() => {}), 'served');
  const handleOutForDelivery = (orderId: number) =>
    runAction(orderId, () => markOrderOutForDelivery(rid, orderId).then(() => {}), 'out_for_delivery');
  const handleMarkDelivered = (orderId: number) =>
    runAction(orderId, () => markOrderDelivered(rid, orderId).then(() => {}), 'delivered');

  // ─── Payment / Close ─────────────────────────────────────────────
  const [paymentOpen, setPaymentOpen] = useState(false);

  const handleTakePayment = (method: PaymentMethod) => {
    if (!selectedOrder) return Promise.resolve();
    const orderId = selectedOrder.id;
    setActionLoading(orderId);
    addProcessingGuard(orderId);
    // Optimistic
    setOrders((prev) => prev.map((o) =>
      o.id === orderId ? { ...o, payment_status: 'paid' } : o,
    ));
    return updateOrderPaymentStatus(rid, orderId, 'paid', method)
      .then((updated) => {
        setOrders((prev) => prev.map((o) =>
          o.id === orderId ? { ...o, ...updated } : o,
        ));
      })
      .catch(async () => { await fetchOrders(); })
      .finally(() => {
        setActionLoading(null);
        removeProcessingGuard(orderId);
      });
  };

  const handleCloseOrder = (orderId: number, orderType: string, status: string) => {
    if (!confirm(t('closeOrderConfirm'))) return;
    const isTerminalStatus = ['served', 'received', 'picked_up', 'delivered'].includes(status);
    if (!isTerminalStatus) {
      runAction(orderId, async () => {
        if (orderType === 'delivery') {
          await markOrderDelivered(rid, orderId);
        } else {
          // mark-served works from in_kitchen and ready (server validation).
          // mark-received only works from ready, so prefer mark-served here.
          await markOrderServed(rid, orderId);
        }
      });
    }
    setSelectedId(null);
  };

  // ─── Tab / search ─────────────────────────────────────────────────

  const switchTab = (key: string) => {
    setActiveTab(key);
    setPage(0);
    setSelectedId(null);
  };

  const handleSearch = () => {
    setSearchSubmitted(search);
    setPage(0);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ─── Render ───────────────────────────────────────────────────────

  const activeCount = orders.length;

  return (
    <div className="flex gap-0" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Full-width table list — detail is now in a Drawer */}
      <div className="flex-1 min-w-0 space-y-[var(--s-5)]">
        <PageHead
          title={t('orders')}
          desc={`${total} ${t('orders').toLowerCase()} · ${activeCount} ${t('shown') || 'shown'}`}
          actions={
            <>
              {wsStatus === 'connected' && (
                <Badge tone="success" dot>
                  {t('live')}
                </Badge>
              )}
              {wsStatus === 'connecting' && (
                <Badge tone="warning" dot>
                  {t('connecting')}
                </Badge>
              )}
              {wsStatus === 'disconnected' && (
                <Badge tone="danger" dot>
                  {t('offline')}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="md"
                icon
                onClick={() => {
                  const next = toggleSound();
                  setSoundOn(next);
                }}
                aria-label={soundOn ? t('muteSound') : t('unmuteSound')}
                title={soundOn ? t('muteSound') : t('unmuteSound')}
              >
                {soundOn ? <Volume2Icon /> : <VolumeXIcon />}
              </Button>
              <Button
                variant="ghost"
                size="md"
                icon
                onClick={requestPermission}
                aria-label={
                  permission === 'granted'
                    ? t('notificationsEnabled')
                    : permission === 'denied'
                      ? t('notificationsBlocked')
                      : t('enableNotifications')
                }
                title={
                  permission === 'granted'
                    ? t('notificationsEnabled')
                    : permission === 'denied'
                      ? t('notificationsBlocked')
                      : t('enableNotifications')
                }
              >
                {permission === 'granted' ? <BellIcon /> : <BellOffIcon />}
              </Button>
            </>
          }
        />

        {/* Status tabs — underline style with inline counts + dot-pulse + updated-at */}
        <div className="flex items-center justify-between border-b border-[var(--line)]">
          <div className="flex items-center gap-[var(--s-5)]">
            {TABS.map((tab) => {
              const selected = activeTab === tab.key;
              const isActive = tab.key === 'active';
              const count = selected ? total : undefined;
              return (
                <button
                  key={tab.key}
                  onClick={() => switchTab(tab.key)}
                  aria-selected={selected}
                  className={`relative py-[var(--s-3)] bg-transparent border-none text-fs-sm font-medium transition-colors inline-flex items-center gap-[var(--s-2)] ${
                    selected
                      ? 'text-[var(--fg)] after:content-[""] after:absolute after:start-0 after:end-0 after:-bottom-px after:h-[2px] after:bg-[var(--brand-500)] after:rounded-[1px]'
                      : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                  }`}
                >
                  {selected && isActive && (
                    <span
                      className="inline-block w-2 h-2 rounded-full bg-[var(--success-500)] relative"
                      aria-hidden
                    >
                      <span className="absolute inset-0 rounded-full bg-[var(--success-500)] opacity-60 animate-ping" />
                    </span>
                  )}
                  <span>{t(tab.labelKey)}</span>
                  {count !== undefined && (
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${
                        selected
                          ? 'bg-[color-mix(in_oklab,var(--brand-500)_18%,transparent)] text-[var(--brand-500)]'
                          : 'bg-[var(--surface-2)] text-[var(--fg-muted)]'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-[var(--s-2)] pe-[var(--s-2)]">
            {lastUpdated && (
              <span className="text-fs-xs text-[var(--fg-subtle)]">
                {t('lastUpdated') || 'Mise à jour'}{' '}
                {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              icon
              onClick={fetchOrders}
              aria-label={t('refresh')}
              title={t('refresh')}
            >
              <RefreshCwIcon />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center">
            <div className="relative">
              <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
              <input
                type="text"
                placeholder={t('search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="input pl-9 pr-3 py-2 text-sm w-48"
              />
            </div>
            <button onClick={handleSearch} className="btn-secondary text-sm py-2 px-4 ml-2">
              {t('search')}
            </button>
          </div>

          <DateRangePicker
            value={dateRange}
            onChange={(range) => { setDateRange(range); setPage(0); }}
          />

          <FilterDropdown
            label={t('type')}
            value={typeFilter}
            onChange={(v) => { setTypeFilter(v); setPage(0); }}
            options={[
              { value: '', label: t('all') },
              { value: 'dine_in', label: t('dineIn') },
              { value: 'pickup', label: t('pickup') },
              { value: 'delivery', label: t('delivery') },
            ]}
          />

          <FilterDropdown
            label={t('paymentStatus')}
            value={paymentFilter}
            onChange={(v) => { setPaymentFilter(v); setPage(0); }}
            options={[
              { value: '', label: t('all') },
              { value: 'paid', label: t('paid') },
              { value: 'pending', label: t('pending') },
              { value: 'unpaid', label: t('unpaid') },
              { value: 'refunded', label: t('refunded') },
            ]}
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="text-4xl">📋</div>
            <h2 className="text-lg font-semibold text-fg-primary">{t('noMatchFound')}</h2>
            <p className="text-sm text-fg-secondary">{t('trySearchAllOrders')}</p>
            <button
              onClick={() => { switchTab('all'); setSearch(''); setSearchSubmitted(''); setTypeFilter(''); setPaymentFilter(''); }}
              className="btn-primary"
            >
              {t('searchAllOrders')}
            </button>
          </div>
        ) : (
          <>
            <DataTable>
              <DataTableHead>
                <DataTableHeadCell>{t('name')}</DataTableHeadCell>
                <DataTableHeadCell>{t('source')}</DataTableHeadCell>
                <DataTableHeadCell>{t('type')}</DataTableHeadCell>
                <DataTableHeadCell>{t('date')}</DataTableHeadCell>
                <DataTableHeadCell>{t('status')}</DataTableHeadCell>
                <DataTableHeadCell>{t('payment')}</DataTableHeadCell>
                <DataTableHeadCell align="right">{t('total')}</DataTableHeadCell>
              </DataTableHead>
              <DataTableBody>
                {orders.map((order, index) => (
                  <DataTableRow
                    key={order.id}
                    index={index}
                    striped={false}
                    onClick={() => setSelectedId(selectedId === order.id ? null : order.id)}
                    className={`cursor-pointer ${selectedId === order.id ? 'bg-blue-500/10' : ''}`}
                  >
                    <DataTableCell mobilePrimary>
                      <span className="font-semibold text-fg-primary">{t('orderNumber').replace('{id}', String(order.id))}</span>
                    </DataTableCell>
                    <DataTableCell className="text-fg-secondary" mobileLabel={t('source')}>
                      {localizeSource(order.order_source, t)}
                    </DataTableCell>
                    <DataTableCell className="text-fg-secondary" mobileLabel={t('type')}>
                      {localizeOrderType(order.order_type, t)}
                    </DataTableCell>
                    <DataTableCell className="text-fg-secondary" mobileLabel={t('date')}>
                      <div className="flex md:flex-col items-baseline md:items-stretch gap-1.5 md:gap-0">
                        <span className="tabular-nums">
                          {new Date(order.created_at).toLocaleDateString([], {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </span>
                        <span className="text-fs-xs text-[var(--fg-subtle)] tabular-nums">
                          {new Date(order.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('status')}>
                      <Badge tone={STATUS_TONE[order.status] ?? 'neutral'} dot>
                        {localizeStatus(order.status, t)}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell mobileLabel={t('payment')}>
                      <Badge tone={PAYMENT_TONE[order.payment_status] ?? 'neutral'}>
                        {(() => {
                          const tv = t(order.payment_status);
                          return tv === order.payment_status ? order.payment_status : tv;
                        })()}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell align="right" className="font-medium text-fg-primary" mobileLabel={t('total')}>
                      ₪{(order.total_amount ?? 0).toFixed(0)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: '1px solid var(--divider)' }}>
                <span className="text-xs text-fg-secondary">
                  {t('showing').replace('{start}', String(page * PAGE_SIZE + 1)).replace('{end}', String(Math.min((page + 1) * PAGE_SIZE, total))).replace('{total}', String(total))}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                    className="p-1.5 rounded-standard text-fg-secondary hover:text-fg-primary disabled:opacity-30 transition-colors"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-fg-secondary px-2">
                    {t('pageOf').replace('{page}', String(page + 1)).replace('{total}', String(totalPages))}
                  </span>
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(page + 1)}
                    className="p-1.5 rounded-standard text-fg-secondary hover:text-fg-primary disabled:opacity-30 transition-colors"
                  >
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Right: order detail panel */}
      <OrderDetailDrawer
        order={selectedOrder}
        isLoading={selectedOrder != null && actionLoading === selectedOrder.id}
        onClose={() => setSelectedId(null)}
        onAccept={() => selectedOrder && handleAccept(selectedOrder.id)}
        onReject={() => selectedOrder && handleReject(selectedOrder.id)}
        onSendToKitchen={() => selectedOrder && handleSendToKitchen(selectedOrder.id)}
        onMarkReady={() => selectedOrder && handleMarkReady(selectedOrder.id)}
        onMarkServed={() => selectedOrder && handleMarkServed(selectedOrder.id)}
        onOutForDelivery={() => selectedOrder && handleOutForDelivery(selectedOrder.id)}
        onMarkDelivered={() => selectedOrder && handleMarkDelivered(selectedOrder.id)}
        onTakePayment={() => setPaymentOpen(true)}
        onCloseOrder={() => selectedOrder && handleCloseOrder(selectedOrder.id, selectedOrder.order_type, selectedOrder.status)}
      />

      {/* Take Payment dialog */}
      <TakePaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        totalAmount={selectedOrder?.total_amount ?? 0}
        onConfirm={handleTakePayment}
      />
    </div>
  );
}

// ─── Order Detail Drawer — 1060px, matches design-reference/order-details.jsx ────

const TIMELINE_STEPS = [
  { key: 'received', labelKey: 'orderReceived', statuses: [] as string[] },
  { key: 'accepted', labelKey: 'statusAccepted', statuses: ['accepted'] },
  { key: 'in_kitchen', labelKey: 'inKitchen', statuses: ['in_kitchen'] },
  { key: 'ready', labelKey: 'statusReady', statuses: ['ready', 'ready_for_pickup', 'ready_for_delivery'] },
  { key: 'served', labelKey: 'served', statuses: ['served', 'picked_up', 'delivered'] },
];

function statusIndex(status: string) {
  // Map status to the furthest reached step (0..4)
  if (['served', 'received', 'picked_up', 'delivered'].includes(status)) return 4;
  if (['ready', 'ready_for_pickup', 'ready_for_delivery', 'out_for_delivery'].includes(status)) return 3;
  if (status === 'in_kitchen') return 2;
  if (status === 'accepted') return 1;
  if (['rejected', 'pending_review', 'scheduled'].includes(status)) return -1;
  return 0;
}

function OrderDetailDrawer({
  order, isLoading, onClose, onAccept, onReject, onSendToKitchen, onMarkReady, onMarkServed,
  onOutForDelivery, onMarkDelivered,
  onTakePayment, onCloseOrder,
}: {
  order: Order | null;
  isLoading: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  onSendToKitchen: () => void;
  onMarkReady: () => void;
  onMarkServed: () => void;
  onOutForDelivery: () => void;
  onMarkDelivered: () => void;
  onTakePayment: () => void;
  onCloseOrder: () => void;
}) {
  const { t } = useI18n();

  if (!order) {
    // Still render a closed Drawer so the transition works cleanly when toggling.
    return <Drawer open={false} onOpenChange={(v) => { if (!v) onClose(); }} title="" width={1060}> </Drawer>;
  }

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

  const subtotal = regularTotal + combosSubtotal;
  const totalsLine = order.total_amount ?? subtotal;

  const displayedLineCount = regularItems.length + comboGroups.length;
  const totalUnits = allItems.reduce((s, i) => s + i.quantity, 0);

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
  const canCloseOrder = !isCancelled && order.payment_status === 'paid';
  const canCancelOrder = !isCancelled && !isTerminal;

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
      {isScheduled && order.scheduled_for && (
        <>
          <span className="opacity-40">·</span>
          <ClockIcon className="w-3 h-3 shrink-0" />
          <span className="truncate">
            {formatScheduledFor(order.scheduled_for)}
          </span>
        </>
      )}
    </span>
  );

  return (
    <Drawer
      open={order != null}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={t('orderNumber').replace('{id}', String(order.id))}
      subtitle={headerSubtitle}
      width={1060}
      primaryAction={
        primaryBtn ? (
          <Button variant="primary" size="sm" onClick={primaryBtn.onClick} disabled={isLoading}>
            {primaryBtn.label}
          </Button>
        ) : null
      }
      footer={
        <div className="flex items-center justify-between gap-[var(--s-3)]">
          <div className="flex items-center gap-[var(--s-2)]">
            <Button variant="secondary" size="md">
              <EditIcon /> {t('edit') || 'Modifier'}
            </Button>
            <Button variant="secondary" size="md">
              <PrinterIcon /> {t('printReceipt') || 'Imprimer ticket'}
            </Button>
          </div>
          <div className="flex items-center gap-[var(--s-2)]">
            {canTakePayment && (
              <Button
                variant="primary"
                size="md"
                onClick={onTakePayment}
                disabled={isLoading}
                style={{ background: 'var(--success-500)', color: '#fff' }}
              >
                <CreditCardIcon /> {t('takePayment')}
              </Button>
            )}
            {canCloseOrder && (
              <Button
                variant="primary"
                size="md"
                onClick={onCloseOrder}
                disabled={isLoading}
              >
                <CheckCircle2Icon /> {t('closeOrder')}
              </Button>
            )}
            {canCancelOrder && (
              <Button variant="ghost" size="md" onClick={onReject} disabled={isLoading}>
                <XIcon /> {t('cancelOrder') || 'Annuler la commande'}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* 2-column content */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-[var(--s-5)]">
        {/* LEFT — timeline + items */}
        <div className="flex flex-col gap-[var(--s-4)]">
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
                    <div
                      className={`text-fs-xs font-medium ${reached || active ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)]'}`}
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

          {/* Items */}
          <Section
            title={`${displayedLineCount} ${displayedLineCount === 1 ? t('item') : t('items')} · ${totalUnits} ${totalUnits === 1 ? (t('unit') || 'unité') : (t('units') || 'unités')}`}
          >
            <div className="-mx-[var(--s-5)] -mb-[var(--s-5)]">
              {regularItems.map((item, i) => (
                <OrderLineRow key={item.id} item={item} showTopBorder={i > 0} />
              ))}
              {comboGroups.map(([groupKey, comboItems], gi) => {
                const comboName = comboItems[0]?.combo_name || t('comboMenuFallback') || 'Combo Menu';
                const deltas = comboItems.reduce((s: number, i: OrderItem) => s + i.price * i.quantity, 0);
                const comboTotal = comboPriceFor(comboItems) + deltas;
                const showTopBorder = regularItems.length > 0 || gi > 0;
                const totalPicks = comboItems.reduce((s: number, i: OrderItem) => s + i.quantity, 0);
                const picksLabel = totalPicks === 1 ? t('selection') : t('selections');
                return (
                  <div
                    key={groupKey}
                    className={`px-[var(--s-5)] py-[var(--s-4)] ${showTopBorder ? 'border-t border-[var(--line)]' : ''}`}
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
            </div>
          </Section>
        </div>

        {/* RIGHT — customer + totals + activity */}
        <div className="flex flex-col gap-[var(--s-4)]">
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
                <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
                  {localizeSource(order.order_source, t)}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-[var(--s-2)] text-fs-sm">
              {order.customer_phone && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--fg-subtle)]">{t('phone')}</span>
                  <span className="font-mono tabular-nums">{order.customer_phone}</span>
                </div>
              )}
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
            </div>
          </div>

          {/* Totals */}
          <Section title={t('total') || 'Total'}>
            <div className="flex flex-col gap-[var(--s-2)] text-fs-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--fg-subtle)]">{t('subtotal') || 'Sous-total'}</span>
                <span className="font-mono tabular-nums">₪{subtotal.toFixed(2)}</span>
              </div>
              <div className="h-px bg-[var(--line)] my-[var(--s-2)]" />
              <div className="flex items-center justify-between text-fs-lg font-semibold tracking-tight">
                <span>{t('total')}</span>
                <span className="font-mono tabular-nums">₪{totalsLine.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between mt-[var(--s-2)]">
                <Badge tone={PAYMENT_TONE[order.payment_status] ?? 'neutral'} dot>
                  {(() => {
                    const tv = t(order.payment_status);
                    return tv === order.payment_status ? order.payment_status : tv;
                  })()}
                </Badge>
              </div>
            </div>
          </Section>

          {/* Activity */}
          <Section title={t('activity') || 'Activité'}>
            <ActivityTimeline order={order} t={t} />
          </Section>
        </div>
      </div>
    </Drawer>
  );
}

// ─── Regular order line row (shared across the items list) ────────────────────

function OrderLineRow({ item, showTopBorder }: { item: OrderItem; showTopBorder: boolean }) {
  return (
    <div
      className={`px-[var(--s-5)] py-[var(--s-3)] grid grid-cols-[44px_1fr_auto] gap-[var(--s-3)] items-start ${
        showTopBorder ? 'border-t border-[var(--line)]' : ''
      }`}
    >
      <div
        className="w-11 h-11 rounded-r-md grid place-items-center text-white font-semibold text-fs-sm tracking-[-0.02em] shrink-0"
        style={{ background: itemColor(item.name) }}
      >
        {item.quantity}×
      </div>
      <div className="min-w-0">
        <div className="text-fs-sm font-medium truncate tracking-[-0.005em]">
          {item.name}
        </div>
        {(item.selected_variant_name || item.variant_portion || (item.modifiers && item.modifiers.length > 0)) && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {(item.variant_portion || item.selected_variant_name) && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium tracking-[-0.005em] cursor-help"
                style={{
                  background: 'color-mix(in oklab, var(--brand-500) 12%, transparent)',
                  color: 'var(--brand-500)',
                }}
                title={
                  item.variant_portion && item.selected_variant_name
                    ? item.selected_variant_name
                    : undefined
                }
              >
                {item.variant_portion || item.selected_variant_name}
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

// ─── Combo group card — distinct visual unit with brand-tinted rail ──────────

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
    <div
      className="rounded-r-md overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, color-mix(in oklab, var(--brand-500) 7%, var(--surface)) 0%, color-mix(in oklab, var(--brand-500) 3%, var(--surface)) 100%)',
        borderInlineStart: '2px solid var(--brand-500)',
        border: '1px solid color-mix(in oklab, var(--brand-500) 18%, var(--line))',
        borderInlineStartWidth: '2px',
      }}
    >
      {/* Eyebrow row */}
      <div className="px-[var(--s-4)] pt-[var(--s-3)] flex items-center justify-between gap-2">
        <span
          className="text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: 'var(--brand-500)' }}
        >
          {comboLabel}
        </span>
        <span className="text-[11px] text-[var(--fg-subtle)] tabular-nums font-medium">
          {totalPicks} {picksLabel}
        </span>
      </div>

      {/* Title row */}
      <div className="px-[var(--s-4)] pt-[var(--s-1)] pb-[var(--s-3)] grid grid-cols-[1fr_auto] gap-[var(--s-3)] items-baseline">
        <div className="text-fs-md font-semibold truncate tracking-[-0.01em]">
          {comboName}
        </div>
        <div className="font-mono tabular-nums font-semibold text-fs-md tracking-[-0.01em]">
          ₪{comboTotal.toFixed(2)}
        </div>
      </div>

      {/* Sub-items */}
      <div
        className="px-[var(--s-4)] py-[var(--s-3)] flex flex-col gap-[var(--s-2)]"
        style={{
          borderTop: '1px solid color-mix(in oklab, var(--brand-500) 14%, transparent)',
          background: 'color-mix(in oklab, var(--brand-500) 2%, transparent)',
        }}
      >
        {comboItems.map((ci) => {
          const lineDelta = ci.price * ci.quantity;
          const hasMods = ci.modifiers && ci.modifiers.length > 0;
          return (
            <div
              key={ci.id}
              className="grid grid-cols-[14px_1fr_auto] gap-[var(--s-2)] items-baseline text-fs-xs"
            >
              <span
                className="block w-1.5 h-1.5 rounded-full mt-[7px]"
                style={{ background: 'color-mix(in oklab, var(--brand-500) 60%, var(--fg-muted))' }}
              />
              <div className="min-w-0">
                <span className="text-[var(--fg)] font-medium">
                  {ci.quantity > 1 ? `${ci.quantity}× ` : ''}
                  {ci.name}
                </span>
                {(ci.variant_portion || ci.selected_variant_name) && (
                  <span
                    className="inline-flex items-center px-1.5 py-0.5 ms-2 rounded-full text-[10px] font-medium align-middle cursor-help"
                    style={{
                      background: 'color-mix(in oklab, var(--brand-500) 14%, transparent)',
                      color: 'var(--brand-500)',
                    }}
                    title={
                      ci.variant_portion && ci.selected_variant_name
                        ? ci.selected_variant_name
                        : undefined
                    }
                  >
                    {ci.variant_portion || ci.selected_variant_name}
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

// ─── Filter Dropdown ─────────────────────────────────────────────────────────

function FilterDropdown({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const displayLabel = options.find((o) => o.value === value)?.label ?? 'All';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-standard text-sm text-fg-secondary hover:text-fg-primary transition-colors"
        style={{ border: '1px solid var(--divider)' }}
      >
        {label} <span className="font-semibold text-fg-primary">{displayLabel}</span>
        <ChevronDownIcon className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-standard py-1 min-w-[140px] z-50 shadow-lg"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)' }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`block w-full text-left px-3 py-2 text-sm transition-colors ${
                value === opt.value
                  ? 'text-brand-500 font-medium'
                  : 'text-fg-secondary hover:text-fg-primary'
              }`}
              style={value === opt.value ? { background: 'var(--surface-subtle)' } : undefined}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
