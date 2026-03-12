'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  listOrders, acceptOrder, rejectOrder, updateOrderStatus,
  Order, OrderStatus, ListOrdersParams,
} from '@/lib/api';
import { useWs, WsEvent } from '@/lib/ws-context';
import { useOrderSound } from '@/lib/use-order-sound';
import { useBrowserNotifications } from '@/lib/use-browser-notifications';
import {
  MagnifyingGlassIcon, ArrowPathIcon, SpeakerWaveIcon, SpeakerXMarkIcon,
  BellIcon, BellSlashIcon, ChevronLeftIcon, ChevronRightIcon,
  ChevronDownIcon, XMarkIcon, PrinterIcon, EllipsisHorizontalIcon,
} from '@heroicons/react/24/outline';

// ─── Tab config ────────────────────────────────────────────────────────────

interface Tab {
  key: string;
  label: string;
  statuses?: string;
  active?: boolean;
}

const TABS: Tab[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active', active: true },
  { key: 'scheduled', label: 'Scheduled', statuses: 'scheduled' },
  { key: 'completed', label: 'Completed', statuses: 'served,picked_up,delivered' },
  { key: 'canceled', label: 'Canceled', statuses: 'rejected' },
];

const STATUS_BADGE: Record<string, string> = {
  pending_review: 'badge-pending',
  accepted: 'badge-accepted',
  in_kitchen: 'badge-in-kitchen',
  ready: 'badge-ready',
  ready_for_pickup: 'badge-ready',
  ready_for_delivery: 'badge-ready',
  served: 'badge-served',
  picked_up: 'badge-served',
  delivered: 'badge-served',
  rejected: 'badge-rejected',
  scheduled: 'badge-neutral',
};

const ORDER_TYPE_BADGE: Record<string, string> = {
  dine_in: 'badge-dine-in',
  pickup: 'badge-pickup',
  delivery: 'badge-delivery',
};

const PAYMENT_BADGE: Record<string, string> = {
  paid: 'badge-ready',
  pending: 'badge-in-kitchen',
  unpaid: 'badge-pending',
  refunded: 'badge-neutral',
};

const PAGE_SIZE = 25;

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function defaultDateRange(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
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
  const [dateRange] = useState(defaultDateRange);
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
      notify('New Order!', {
        body: `Order #${wsOrder.id} — ${wsOrder.order_type?.replace(/_/g, ' ') ?? 'order'}`,
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
    if (!confirm('Reject this order?')) return;
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

  return (
    <div className="flex gap-0" style={{ minHeight: 'calc(100vh - 120px)' }}>
      {/* Left: table list */}
      <div className={`flex-1 min-w-0 space-y-5 transition-all ${selectedOrder ? 'pr-0' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-fg-primary">All orders</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { const next = toggleSound(); setSoundOn(next); }}
              className="p-2 rounded-standard text-fg-secondary hover:text-fg-primary transition-colors"
              title={soundOn ? 'Mute sound' : 'Unmute sound'}
            >
              {soundOn ? <SpeakerWaveIcon className="w-5 h-5" /> : <SpeakerXMarkIcon className="w-5 h-5" />}
            </button>
            <button
              onClick={requestPermission}
              className={`p-2 rounded-standard transition-colors ${
                permission === 'granted' ? 'text-status-ready' : 'text-fg-secondary hover:text-fg-primary'
              }`}
              title={
                permission === 'granted' ? 'Notifications enabled'
                : permission === 'denied' ? 'Notifications blocked'
                : 'Enable browser notifications'
              }
            >
              {permission === 'granted' ? <BellIcon className="w-5 h-5" /> : <BellSlashIcon className="w-5 h-5" />}
            </button>
            {wsStatus === 'connected' && (
              <span className="badge badge-ready text-[10px] uppercase tracking-wider font-bold">Live</span>
            )}
            {wsStatus === 'connecting' && (
              <span className="badge badge-in-kitchen text-[10px] uppercase tracking-wider font-bold animate-pulse">Connecting</span>
            )}
            {wsStatus === 'disconnected' && (
              <span className="badge badge-rejected text-[10px] uppercase tracking-wider font-bold">Offline</span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-divider">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => switchTab(tab.key)}
              className={`pb-3 text-sm font-medium transition-colors relative ${
                activeTab === tab.key ? 'text-fg-primary' : 'text-fg-secondary hover:text-fg-primary'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-fg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-secondary" />
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="input pl-9 pr-3 py-2 text-sm w-48"
              />
            </div>
            <button onClick={handleSearch} className="btn-secondary text-sm py-2 px-4 ml-2">
              Search
            </button>
          </div>

          <div
            className="flex items-center gap-2 px-3 py-2 rounded-standard text-sm text-fg-secondary"
            style={{ border: '1px solid var(--divider)' }}
          >
            {formatDate(dateRange.from)} - {formatDate(dateRange.to)}
          </div>

          <FilterDropdown
            label="Type"
            value={typeFilter}
            onChange={(v) => { setTypeFilter(v); setPage(0); }}
            options={[
              { value: '', label: 'All' },
              { value: 'dine_in', label: 'Dine In' },
              { value: 'pickup', label: 'Pickup' },
              { value: 'delivery', label: 'Delivery' },
            ]}
          />

          <FilterDropdown
            label="Payment status"
            value={paymentFilter}
            onChange={(v) => { setPaymentFilter(v); setPage(0); }}
            options={[
              { value: '', label: 'All' },
              { value: 'paid', label: 'Paid' },
              { value: 'pending', label: 'Pending' },
              { value: 'unpaid', label: 'Unpaid' },
              { value: 'refunded', label: 'Refunded' },
            ]}
          />
        </div>

        {/* Last updated */}
        <div className="flex items-center justify-between text-xs text-fg-secondary">
          {lastUpdated && (
            <span>Last updated: {lastUpdated.toLocaleString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric',
              hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
            })}</span>
          )}
          <button onClick={fetchOrders} className="flex items-center gap-1.5 text-fg-secondary hover:text-fg-primary transition-colors">
            <ArrowPathIcon className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
          </div>
        ) : orders.length === 0 ? (
          <div className="card text-center py-16 space-y-3">
            <p className="text-lg font-semibold text-fg-primary">We couldn&apos;t find a match</p>
            <p className="text-sm text-fg-secondary">Try searching across all orders.</p>
            <button
              onClick={() => { switchTab('all'); setSearch(''); setSearchSubmitted(''); setTypeFilter(''); setPaymentFilter(''); }}
              className="btn-primary mx-auto"
            >
              Search all orders
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-secondary uppercase tracking-wider" style={{ borderBottom: '1px solid var(--divider)' }}>
                  <th className="py-3 px-4 font-medium">Name</th>
                  <th className="py-3 px-4 font-medium">Source</th>
                  <th className="py-3 px-4 font-medium">Type</th>
                  <th className="py-3 px-4 font-medium">Items</th>
                  <th className="py-3 px-4 font-medium">Status</th>
                  <th className="py-3 px-4 font-medium">Payment</th>
                  <th className="py-3 px-4 font-medium text-right">Total</th>
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
                      <span className="font-semibold text-fg-primary">Order #{order.id}</span>
                    </td>
                    <td className="py-3 px-4 text-fg-secondary">Order</td>
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
                      <span className={`badge text-[10px] ${STATUS_BADGE[order.status] ?? 'badge-neutral'}`}>
                        {order.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge text-[10px] ${PAYMENT_BADGE[order.payment_status] ?? 'badge-neutral'}`}>
                        {order.payment_status}
                      </span>
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
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
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
                    Page {page + 1} of {totalPages}
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
      {selectedOrder && (
        <OrderDetailPanel
          order={selectedOrder}
          isLoading={actionLoading === selectedOrder.id}
          onClose={() => setSelectedId(null)}
          onAccept={() => handleAccept(selectedOrder.id)}
          onReject={() => handleReject(selectedOrder.id)}
          onSendToKitchen={() => handleSendToKitchen(selectedOrder.id)}
          onMarkReady={() => handleMarkReady(selectedOrder.id)}
          onMarkServed={() => handleMarkServed(selectedOrder.id)}
        />
      )}
    </div>
  );
}

// ─── Order Detail Panel (right side) ─────────────────────────────────────────

function OrderDetailPanel({
  order, isLoading, onClose, onAccept, onReject, onSendToKitchen, onMarkReady, onMarkServed,
}: {
  order: Order;
  isLoading: boolean;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  onSendToKitchen: () => void;
  onMarkReady: () => void;
  onMarkServed: () => void;
}) {
  return (
    <div
      className="w-[420px] flex-shrink-0 overflow-y-auto ml-5"
      style={{ borderLeft: '1px solid var(--divider)', background: 'var(--surface)' }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full flex items-center justify-center text-fg-secondary hover:text-fg-primary transition-colors"
          style={{ border: '1px solid var(--divider)' }}
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center text-fg-secondary hover:text-fg-primary transition-colors"
            style={{ border: '1px solid var(--divider)' }}
            title="Print receipt"
          >
            <PrinterIcon className="w-5 h-5" />
          </button>
          <button
            className="w-9 h-9 rounded-full flex items-center justify-center text-fg-secondary hover:text-fg-primary transition-colors"
            style={{ border: '1px solid var(--divider)' }}
            title="More options"
          >
            <EllipsisHorizontalIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Title */}
        <div>
          <h2 className="text-xl font-bold text-fg-primary">Order #{order.id}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className={`badge text-[10px] ${STATUS_BADGE[order.status] ?? 'badge-neutral'}`}>
              {order.status.replace(/_/g, ' ')}
            </span>
            <span className={`badge text-[10px] ${PAYMENT_BADGE[order.payment_status] ?? 'badge-neutral'}`}>
              {order.payment_status}
            </span>
          </div>
        </div>

        {/* Actions */}
        <OrderPanelActions
          status={order.status}
          isLoading={isLoading}
          onAccept={onAccept}
          onReject={onReject}
          onSendToKitchen={onSendToKitchen}
          onMarkReady={onMarkReady}
          onMarkServed={onMarkServed}
        />

        {/* Details section */}
        <div>
          <h3 className="text-base font-bold text-fg-primary mb-4">Details</h3>
          <div className="space-y-0">
            <DetailRow label="Created" value={
              new Date(order.created_at).toLocaleString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
              })
            } />
            <DetailRow label="Type" value={order.order_type.replace(/_/g, ' ')} capitalize />
            {order.customer_name && <DetailRow label="Customer" value={order.customer_name} />}
            {order.customer_phone && <DetailRow label="Phone" value={order.customer_phone} />}
            {order.table_number && <DetailRow label="Table" value={order.table_number} />}
            <DetailRow label="Order" value={`#${order.id}`} />
          </div>
        </div>

        {/* Items section */}
        <div>
          <h3 className="text-base font-bold text-fg-primary mb-4">Items</h3>
          <div className="space-y-0">
            {(order.items ?? []).map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 py-3"
                style={{ borderBottom: '1px solid var(--divider)' }}
              >
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                  style={{ background: itemColor(item.name) }}
                >
                  {itemInitials(item.name)}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-fg-primary">{item.name}</span>
                  <span className="text-sm text-fg-secondary ml-1">x {item.quantity}</span>
                </div>
                <span className="text-sm text-fg-primary font-medium">
                  ₪{(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-fg-primary">Subtotal</span>
            <span className="text-sm text-fg-primary">₪{(order.total_amount ?? 0).toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-fg-primary">Total</span>
            <span className="text-sm font-bold text-fg-primary">₪{(order.total_amount ?? 0).toFixed(2)}</span>
          </div>
        </div>
      </div>
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
  if (status === 'pending_review') {
    return (
      <div className="flex gap-2">
        <button disabled={isLoading} onClick={onAccept} className="btn-primary flex-1 py-2.5 disabled:opacity-50">
          Accept
        </button>
        <button
          disabled={isLoading}
          onClick={onReject}
          className="flex-1 py-2.5 rounded-standard font-medium disabled:opacity-50 text-status-rejected"
          style={{ background: 'rgba(247,56,56,0.1)' }}
        >
          Reject
        </button>
      </div>
    );
  }
  if (status === 'accepted') {
    return (
      <button disabled={isLoading} onClick={onSendToKitchen} className="btn-primary w-full py-2.5 disabled:opacity-50">
        Send to Kitchen
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
        Mark Ready
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
        Mark Served
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
