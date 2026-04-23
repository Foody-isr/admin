'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  listOrders, acceptOrder, rejectOrder, updateOrderStatus,
  Order, OrderItem, OrderStatus, ListOrdersParams,
} from '@/lib/api';
import { useWs, WsEvent } from '@/lib/ws-context';
import { useOrderSound } from '@/lib/use-order-sound';
import { useBrowserNotifications } from '@/lib/use-browser-notifications';
import { useI18n } from '@/lib/i18n';
import DateRangePicker, { DateRange } from '@/components/DateRangePicker';
import {
  SearchIcon, RefreshCwIcon, Volume2Icon, VolumeXIcon,
  BellIcon, BellOffIcon, ChevronLeftIcon, ChevronRightIcon,
  ChevronDownIcon, XIcon, PrinterIcon, MoreHorizontalIcon,
} from 'lucide-react';
import { Badge, Button, Drawer, PageHead, Section } from '@/components/ds';
import { CheckIcon, ClockIcon, GlobeIcon, UserIcon, EditIcon } from 'lucide-react';

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
  { key: 'completed', labelKey: 'completed', statuses: 'served,picked_up,delivered' },
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
  served: 'success',
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

function itemInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

// Simple hash to pick a muted color for item avatars
function itemColor(name: string): string {
  const colors = ['#F18A47', '#60A5FA', '#D89B35', '#77BA4B', '#A78BFA', '#F472B6', '#34D399', '#FB7185'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
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

  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const prevEvent = useRef<WsEvent | null>(null);

  // Filters
  const [activeTab, setActiveTab] = useState('active');
  const [search, setSearch] = useState('');
  const [searchSubmitted, setSearchSubmitted] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange);
  const [page, setPage] = useState(0);

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
        body: `${t('orderNumber').replace('{id}', String(wsOrder.id))} — ${wsOrder.order_type?.replace(/_/g, ' ') ?? 'order'}`,
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
          desc={`${total} commandes · ${activeCount} affichées`}
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
          <div className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-secondary tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                  <th className="py-3 px-4 font-normal">{t('name')}</th>
                  <th className="py-3 px-4 font-normal">{t('source')}</th>
                  <th className="py-3 px-4 font-normal">{t('type')}</th>
                  <th className="py-3 px-4 font-normal">{t('items')}</th>
                  <th className="py-3 px-4 font-normal">{t('status')}</th>
                  <th className="py-3 px-4 font-normal">{t('payment')}</th>
                  <th className="py-3 px-4 font-normal text-right">{t('total')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedId(selectedId === order.id ? null : order.id)}
                    className={`cursor-pointer transition-colors ${
                      selectedId === order.id
                        ? 'bg-blue-500/10'
                        : 'hover:bg-[var(--surface-subtle)]'
                    }`}
                    style={{ borderBottom: '1px solid var(--divider)' }}
                  >
                    <td className="py-3 px-4">
                      <span className="font-semibold text-fg-primary">{t('orderNumber').replace('{id}', String(order.id))}</span>
                    </td>
                    <td className="py-3 px-4 text-fg-secondary capitalize">
                      {(order.order_source ?? 'order').replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-4 text-fg-secondary capitalize">
                      {order.order_type.replace(/_/g, ' ')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        {(order.items ?? []).slice(0, 3).map((item) => (
                          <span
                            key={item.id}
                            className="w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                            style={{ background: itemColor(item.name) }}
                            title={item.name}
                          >
                            {itemInitials(item.name)}
                          </span>
                        ))}
                        {(order.items ?? []).length > 3 && (
                          <span className="text-[10px] text-fg-secondary ml-0.5">
                            +{order.items.length - 3}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Badge tone={STATUS_TONE[order.status] ?? 'neutral'} dot>
                        {order.status.replace(/_/g, ' ')}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <Badge tone={PAYMENT_TONE[order.payment_status] ?? 'neutral'}>
                        {order.payment_status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right font-medium text-fg-primary">
                      ₪{(order.total_amount ?? 0).toFixed(0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

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
          </div>
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
      />
    </div>
  );
}

// ─── Order Detail Drawer — 1060px, matches design-reference/order-details.jsx ────

const TIMELINE_STEPS = [
  { key: 'received', labelKey: 'orderReceived', statuses: [] as string[] },
  { key: 'accepted', labelKey: 'accepted', statuses: ['accepted'] },
  { key: 'in_kitchen', labelKey: 'inKitchen', statuses: ['in_kitchen'] },
  { key: 'ready', labelKey: 'ready', statuses: ['ready', 'ready_for_pickup', 'ready_for_delivery'] },
  { key: 'served', labelKey: 'served', statuses: ['served', 'picked_up', 'delivered'] },
];

function statusIndex(status: string) {
  // Map status to the furthest reached step (0..4)
  if (['served', 'picked_up', 'delivered'].includes(status)) return 4;
  if (['ready', 'ready_for_pickup', 'ready_for_delivery'].includes(status)) return 3;
  if (status === 'in_kitchen') return 2;
  if (status === 'accepted') return 1;
  if (['rejected', 'pending_review', 'scheduled'].includes(status)) return -1;
  return 0;
}

function OrderDetailDrawer({
  order, isLoading, onClose, onAccept, onReject, onSendToKitchen, onMarkReady, onMarkServed,
}: {
  order: Order | null;
  isLoading: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  onSendToKitchen: () => void;
  onMarkReady: () => void;
  onMarkServed: () => void;
}) {
  const { t } = useI18n();

  if (!order) {
    // Still render a closed Drawer so the transition works cleanly when toggling.
    return <Drawer open={false} onOpenChange={(v) => { if (!v) onClose(); }} title="" width={1060}> </Drawer>;
  }

  const currentStep = statusIndex(order.status);
  const isCancelled = order.status === 'rejected';
  const isActive = currentStep === 2;
  const bannerTone: 'warning' | 'success' | 'info' | 'danger' =
    isCancelled ? 'danger' : isActive ? 'warning' : currentStep >= 4 ? 'success' : 'info';

  const createdMins = Math.max(
    0,
    Math.round((Date.now() - new Date(order.created_at).getTime()) / 60000),
  );

  const subtotal = (order.items ?? []).reduce((s, i) => s + i.price * i.quantity, 0);
  const totalsLine =
    order.total_amount ?? subtotal;

  const primaryBtn = (() => {
    switch (order.status) {
      case 'pending_review':
        return { label: t('accept'), onClick: onAccept };
      case 'accepted':
        return { label: t('sendToKitchen') || 'En cuisine', onClick: onSendToKitchen };
      case 'in_kitchen':
        return { label: t('markReady') || 'Prête', onClick: onMarkReady };
      case 'ready':
      case 'ready_for_pickup':
      case 'ready_for_delivery':
        return { label: t('markServed') || 'Servie', onClick: onMarkServed };
      default:
        return null;
    }
  })();

  const customerInitials = order.customer_name
    ? order.customer_name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : 'C';

  return (
    <Drawer
      open={order != null}
      onOpenChange={(v) => { if (!v) onClose(); }}
      title={t('orderNumber').replace('{id}', String(order.id))}
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
          <Button variant="ghost" size="md" onClick={onReject} disabled={isLoading}>
            <XIcon /> {t('cancelOrder') || 'Annuler la commande'}
          </Button>
        </div>
      }
    >
      {/* Status banner */}
      <div
        className="p-[var(--s-4)_var(--s-5)] rounded-r-md grid grid-cols-[1fr_auto] gap-[var(--s-4)] items-center mb-[var(--s-4)]"
        style={{
          background: `color-mix(in oklab, var(--${bannerTone === 'warning' ? 'warning' : bannerTone === 'success' ? 'success' : bannerTone === 'danger' ? 'danger' : 'info'}-500) 10%, var(--surface))`,
          border: `1px solid color-mix(in oklab, var(--${bannerTone === 'warning' ? 'warning' : bannerTone === 'success' ? 'success' : bannerTone === 'danger' ? 'danger' : 'info'}-500) 30%, var(--line))`,
        }}
      >
        <div>
          <div className="flex items-center gap-[var(--s-2)] mb-1">
            <span
              className="relative inline-block w-2 h-2 rounded-full"
              style={{
                background: `var(--${bannerTone === 'warning' ? 'warning' : bannerTone === 'success' ? 'success' : bannerTone === 'danger' ? 'danger' : 'info'}-500)`,
              }}
            >
              {isActive && (
                <span
                  className="absolute inset-0 rounded-full opacity-60 animate-ping"
                  style={{ background: 'var(--warning-500)' }}
                />
              )}
            </span>
            <span
              className="text-fs-sm font-semibold"
              style={{
                color: `var(--${bannerTone === 'warning' ? 'warning' : bannerTone === 'success' ? 'success' : bannerTone === 'danger' ? 'danger' : 'info'}-500)`,
              }}
            >
              {order.status.replace(/_/g, ' ')} · {createdMins} min
            </span>
          </div>
          <div className="text-fs-xs text-[var(--fg-subtle)]">
            {order.order_type.replace(/_/g, ' ')}
            {order.table_number ? ` · Table ${order.table_number}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-[var(--s-2)]">
          {primaryBtn && (
            <Button variant="secondary" size="sm" onClick={primaryBtn.onClick} disabled={isLoading}>
              {primaryBtn.label}
            </Button>
          )}
        </div>
      </div>

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
                return (
                  <div key={step.key} className="text-center relative">
                    {i < TIMELINE_STEPS.length - 1 && (
                      <div
                        className="absolute top-[14px] start-1/2 end-[-50%] h-[2px]"
                        style={{ background: currentStep > i ? 'var(--brand-500)' : 'var(--line)' }}
                      />
                    )}
                    <div
                      className="w-7 h-7 rounded-full mx-auto mb-2 grid place-items-center relative z-[1]"
                      style={{
                        background: active
                          ? 'var(--brand-500)'
                          : reached
                          ? 'var(--success-500)'
                          : 'var(--surface-3)',
                        color: reached || active ? '#fff' : 'var(--fg-muted)',
                        boxShadow: active
                          ? '0 0 0 4px color-mix(in oklab, var(--brand-500) 20%, transparent)'
                          : undefined,
                      }}
                    >
                      {reached && !active ? <CheckIcon className="w-3.5 h-3.5" /> : null}
                    </div>
                    <div
                      className={`text-fs-xs font-medium ${reached || active ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)]'}`}
                    >
                      {t(step.labelKey)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {/* Items */}
          <Section
            title={`${(order.items ?? []).length} ${t('items')} · ${(order.items ?? []).reduce((s, i) => s + i.quantity, 0)} ${t('units') || 'unités'}`}
          >
            <div className="-mx-[var(--s-5)] -mb-[var(--s-5)]">
              {(order.items ?? []).map((item, i) => (
                <div
                  key={item.id}
                  className={`px-[var(--s-5)] py-[var(--s-3)] grid grid-cols-[44px_1fr_auto] gap-[var(--s-3)] items-start ${
                    i > 0 ? 'border-t border-[var(--line)]' : ''
                  }`}
                >
                  <div
                    className="w-11 h-11 rounded-r-md grid place-items-center text-white font-semibold text-fs-sm -tracking-[0.02em]"
                    style={{ background: itemColor(item.name) }}
                  >
                    {item.quantity}×
                  </div>
                  <div className="min-w-0">
                    <div className="text-fs-sm font-medium truncate">{item.name}</div>
                    {item.modifiers && item.modifiers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.modifiers.map((m) => (
                          <span
                            key={m.id}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-fs-xs bg-[var(--surface-2)] text-[var(--fg-muted)]"
                          >
                            {m.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <div className="flex items-center gap-1 mt-1.5 text-fs-xs text-[var(--fg-muted)] italic">
                        <EditIcon className="w-3 h-3" />
                        <span>&ldquo;{item.notes}&rdquo;</span>
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
              ))}
            </div>
          </Section>
        </div>

        {/* RIGHT — customer + totals + activity */}
        <div className="flex flex-col gap-[var(--s-4)]">
          {/* Customer card */}
          <div className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg shadow-1 p-[var(--s-5)]">
            <div className="flex items-center gap-[var(--s-3)] mb-[var(--s-4)]">
              <div
                className="w-12 h-12 rounded-full grid place-items-center text-white font-semibold"
                style={{ background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))' }}
              >
                {customerInitials}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-fs-md truncate">
                  {order.customer_name || t('guestCustomer') || 'Client'}
                </div>
                <div className="text-fs-xs text-[var(--fg-subtle)] mt-0.5">
                  {order.order_source?.replace(/_/g, ' ') || 'order'}
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
                <span className="capitalize">{order.order_type.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--fg-subtle)]">{t('source')}</span>
                <span className="inline-flex items-center gap-1 capitalize">
                  <GlobeIcon className="w-3 h-3" />
                  {(order.order_source ?? 'order').replace(/_/g, ' ')}
                </span>
              </div>
              {order.table_number && (
                <div className="flex items-center justify-between">
                  <span className="text-[var(--fg-subtle)]">Table</span>
                  <span>{order.table_number}</span>
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
              <div className="flex items-center justify-between text-fs-lg font-semibold">
                <span>{t('total')}</span>
                <span className="font-mono tabular-nums">₪{totalsLine.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between mt-[var(--s-2)]">
                <Badge tone={PAYMENT_TONE[order.payment_status] ?? 'neutral'} dot>
                  {order.payment_status}
                </Badge>
              </div>
            </div>
          </Section>

          {/* Activity */}
          <Section title={t('activity') || 'Activité'}>
            <div className="flex flex-col gap-[var(--s-3)] text-fs-xs">
              <div className="flex items-start gap-[var(--s-3)]">
                <span className="font-mono text-[var(--fg-subtle)] text-[11px] shrink-0">
                  {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div className="flex-1">
                  <span className="text-[var(--fg-subtle)]">
                    {t('createdFromSource') || 'Commande créée'}{' '}
                    {order.order_source ? `depuis ${order.order_source.replace(/_/g, ' ')}` : ''}
                  </span>
                </div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </Drawer>
  );
}

// Legacy OrderDetailPanel removed — replaced by OrderDetailDrawer above.

// ─── Order Item Row ─────────────────────────────────────────────────────────

function AdminOrderItemRow({ item }: { item: OrderItem }) {
  const { t } = useI18n();
  return (
    <div
      className="py-3"
      style={{ borderBottom: '1px solid var(--divider)' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
          style={{ background: itemColor(item.name) }}
        >
          {itemInitials(item.name)}
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-fg-primary">
            {item.name}{item.selected_variant_name ? ` - ${item.selected_variant_name}` : ''}
          </span>
          <span className="text-sm text-fg-secondary ml-1">x {item.quantity}</span>
        </div>
        <span className="text-sm text-fg-primary font-medium">
          ₪{(item.price * item.quantity).toFixed(2)}
        </span>
      </div>
      {item.modifiers && item.modifiers.length > 0 && (
        <div className="ml-12 mt-1 space-y-0.5">
          {item.modifiers.map((mod) => (
            <div key={mod.id} className="flex items-center justify-between text-xs text-fg-secondary">
              <span>{mod.action === 'remove' ? '−' : '+'} {mod.name}</span>
              {mod.price_delta !== 0 && (
                <span>{mod.price_delta > 0 ? '+' : ''}₪{mod.price_delta.toFixed(2)}</span>
              )}
            </div>
          ))}
        </div>
      )}
      {item.notes && (
        <div className="ml-12 mt-1 text-xs text-fg-secondary italic">
          {t('note')} {item.notes}
        </div>
      )}
    </div>
  );
}

// ─── Detail Row ──────────────────────────────────────────────────────────────

function DetailRow({ label, value, capitalize: cap }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
      <span className="text-sm font-semibold text-fg-primary">{label}</span>
      <span className={`text-sm text-fg-secondary ${cap ? 'capitalize' : ''}`}>{value}</span>
    </div>
  );
}

// ─── Panel Actions ───────────────────────────────────────────────────────────

function OrderPanelActions({
  status, isLoading, onAccept, onReject, onSendToKitchen, onMarkReady, onMarkServed,
}: {
  status: OrderStatus;
  isLoading: boolean;
  onAccept: () => void;
  onReject: () => void;
  onSendToKitchen: () => void;
  onMarkReady: () => void;
  onMarkServed: () => void;
}) {
  const { t } = useI18n();
  if (status === 'pending_review') {
    return (
      <div className="flex gap-2">
        <button disabled={isLoading} onClick={onAccept} className="btn-primary flex-1 py-2.5 disabled:opacity-50">
          {t('accept')}
        </button>
        <button
          disabled={isLoading}
          onClick={onReject}
          className="flex-1 py-2.5 rounded-standard font-medium disabled:opacity-50 text-status-rejected"
          style={{ background: 'rgba(247,56,56,0.1)' }}
        >
          {t('reject')}
        </button>
      </div>
    );
  }
  if (status === 'accepted') {
    return (
      <button disabled={isLoading} onClick={onSendToKitchen} className="btn-primary w-full py-2.5 disabled:opacity-50">
        {t('sendToKitchen')}
      </button>
    );
  }
  if (status === 'in_kitchen') {
    return (
      <button
        disabled={isLoading}
        onClick={onMarkReady}
        className="w-full py-2.5 rounded-standard font-medium disabled:opacity-50"
        style={{ background: 'rgba(119,186,75,0.15)', color: '#77BA4B' }}
      >
        {t('markReady')}
      </button>
    );
  }
  if (status === 'ready' || status === 'ready_for_pickup') {
    return (
      <button
        disabled={isLoading}
        onClick={onMarkServed}
        className="w-full py-2.5 rounded-standard font-medium disabled:opacity-50"
        style={{ background: 'rgba(52,211,153,0.15)', color: '#34D399' }}
      >
        {t('markServed')}
      </button>
    );
  }
  return null;
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
