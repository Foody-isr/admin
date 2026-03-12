'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { listOrders, acceptOrder, rejectOrder, updateOrderStatus, Order, OrderStatus } from '@/lib/api';
import { useWs, WsEvent } from '@/lib/ws-context';
import { useOrderSound } from '@/lib/use-order-sound';
import { useBrowserNotifications } from '@/lib/use-browser-notifications';
import { ArrowPathIcon, SpeakerWaveIcon, SpeakerXMarkIcon, BellIcon, BellSlashIcon } from '@heroicons/react/24/outline';

// ─── Column config ──────────────────────────────────────────────────────────

interface Column {
  key: string;
  label: string;
  statuses: OrderStatus[];
  color: string;
}

const COLUMNS: Column[] = [
  { key: 'incoming', label: 'Incoming', statuses: ['pending_review'], color: '#F18A47' },
  { key: 'in_progress', label: 'In Progress', statuses: ['accepted', 'in_kitchen'], color: '#D89B35' },
  { key: 'ready', label: 'Ready', statuses: ['ready', 'ready_for_pickup', 'ready_for_delivery'], color: '#77BA4B' },
  { key: 'completed', label: 'Completed', statuses: ['served', 'picked_up', 'delivered'], color: '#34D399' },
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
};

const ORDER_TYPE_BADGE: Record<string, string> = {
  dine_in: 'badge-dine-in',
  pickup: 'badge-pickup',
  delivery: 'badge-delivery',
};

// ─── Main ───────────────────────────────────────────────────────────────────

export default function OrdersPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { status: wsStatus, lastEvent, addProcessingGuard, removeProcessingGuard, isProcessing } = useWs();

  const { play: playSound, isEnabled: isSoundEnabled, toggle: toggleSound } = useOrderSound();
  const { permission, requestPermission, notify } = useBrowserNotifications();
  const [soundOn, setSoundOn] = useState(true);

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const prevEvent = useRef<WsEvent | null>(null);

  // Sync sound state from hook
  useEffect(() => { setSoundOn(isSoundEnabled()); }, [isSoundEnabled]);

  // ─── Initial fetch ────────────────────────────────────────────────

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listOrders(rid);
      setOrders(data);
    } finally {
      setLoading(false);
    }
  }, [rid]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ─── WebSocket event handler ──────────────────────────────────────

  useEffect(() => {
    if (!lastEvent || lastEvent === prevEvent.current) return;
    prevEvent.current = lastEvent;

    const { type, payload } = lastEvent;
    if (!type.startsWith('order.')) return;

    const wsOrder = payload as unknown as Order;
    if (!wsOrder?.id) return;

    // Skip if we're currently performing an action on this order
    if (isProcessing(wsOrder.id)) return;

    // Play sound + browser notification on new order
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
        if (idx >= 0) return prev; // already have it
        return [wsOrder, ...prev];
      }
      if (idx < 0) return prev; // unknown order
      // order.updated or order.paid — update in-place
      const next = [...prev];
      next[idx] = { ...next[idx], ...wsOrder };
      return next;
    });
  }, [lastEvent, isProcessing, playSound, notify]);

  // ─── Actions with optimistic updates ──────────────────────────────

  const runAction = async (orderId: number, action: () => Promise<void | Order>, optimisticStatus?: OrderStatus) => {
    setActionLoading(orderId);
    addProcessingGuard(orderId);

    // Optimistic update
    if (optimisticStatus) {
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: optimisticStatus } : o));
    }

    try {
      await action();
    } catch {
      // Revert on failure
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

  // ─── Bucket orders into columns ───────────────────────────────────

  const getColumnOrders = (col: Column) =>
    orders.filter((o) => col.statuses.includes(o.status)).sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-fg-primary">Orders</h1>
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
        <div className="flex items-center gap-2">
          {/* Sound toggle */}
          <button
            onClick={() => { const next = toggleSound(); setSoundOn(next); }}
            className="p-2 rounded-standard text-fg-secondary hover:text-fg-primary transition-colors"
            title={soundOn ? 'Mute sound' : 'Unmute sound'}
          >
            {soundOn ? <SpeakerWaveIcon className="w-5 h-5" /> : <SpeakerXMarkIcon className="w-5 h-5" />}
          </button>
          {/* Browser notification toggle */}
          <button
            onClick={requestPermission}
            className={`p-2 rounded-standard transition-colors ${
              permission === 'granted' ? 'text-status-ready' : 'text-fg-secondary hover:text-fg-primary'
            }`}
            title={
              permission === 'granted' ? 'Notifications enabled'
              : permission === 'denied' ? 'Notifications blocked — update in browser settings'
              : 'Enable browser notifications'
            }
          >
            {permission === 'granted' ? <BellIcon className="w-5 h-5" /> : <BellSlashIcon className="w-5 h-5" />}
          </button>
          <button onClick={fetchOrders} className="btn-secondary flex items-center gap-2">
            <ArrowPathIcon className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4" style={{ minHeight: 'calc(100vh - 200px)' }}>
          {COLUMNS.map((col) => {
            const colOrders = getColumnOrders(col);
            return (
              <div key={col.key} className="flex flex-col">
                {/* Column header */}
                <div className="flex items-center gap-2 mb-3 px-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                  <span className="text-sm font-semibold text-fg-primary">{col.label}</span>
                  <span
                    className="text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center"
                    style={{ background: `${col.color}20`, color: col.color }}
                  >
                    {colOrders.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex-1 space-y-2 overflow-y-auto rounded-card p-2" style={{ background: 'var(--surface-subtle)' }}>
                  {colOrders.length === 0 ? (
                    <p className="text-xs text-fg-secondary text-center py-8">No orders</p>
                  ) : (
                    colOrders.map((order) => (
                      <OrderCard
                        key={order.id}
                        order={order}
                        isLoading={actionLoading === order.id}
                        onAccept={() => handleAccept(order.id)}
                        onReject={() => handleReject(order.id)}
                        onSendToKitchen={() => handleSendToKitchen(order.id)}
                        onMarkReady={() => handleMarkReady(order.id)}
                        onMarkServed={() => handleMarkServed(order.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Order Card ─────────────────────────────────────────────────────────────

function OrderCard({
  order,
  isLoading,
  onAccept,
  onReject,
  onSendToKitchen,
  onMarkReady,
  onMarkServed,
}: {
  order: Order;
  isLoading: boolean;
  onAccept: () => void;
  onReject: () => void;
  onSendToKitchen: () => void;
  onMarkReady: () => void;
  onMarkServed: () => void;
}) {
  return (
    <div className="card p-3 space-y-2 transition-all">
      {/* Top row: ID + badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-bold text-fg-primary">#{order.id}</span>
        <span className={`badge text-[10px] ${ORDER_TYPE_BADGE[order.order_type] ?? 'badge-neutral'} capitalize`}>
          {order.order_type.replace(/_/g, ' ')}
        </span>
        <span className={`badge text-[10px] ${STATUS_BADGE[order.status] ?? 'badge-neutral'}`}>
          {order.status.replace(/_/g, ' ')}
        </span>
      </div>

      {/* Customer */}
      {order.customer_name && (
        <p className="text-xs text-fg-secondary truncate">{order.customer_name}</p>
      )}

      {/* Items */}
      <div className="flex flex-wrap gap-1">
        {(order.items ?? []).slice(0, 4).map((item) => (
          <span key={item.id} className="text-[10px] rounded px-1.5 py-0.5" style={{ background: 'var(--surface-subtle)', color: 'var(--text-secondary)' }}>
            {item.quantity}x {item.name}
          </span>
        ))}
        {(order.items ?? []).length > 4 && (
          <span className="text-[10px] text-fg-secondary">+{order.items.length - 4} more</span>
        )}
      </div>

      {/* Footer: time + total */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-fg-secondary">
          {new Date(order.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className="text-sm font-bold text-fg-primary">₪{(order.total_amount ?? 0).toFixed(0)}</span>
      </div>

      {/* Actions */}
      {order.status === 'pending_review' && (
        <div className="flex gap-2 pt-1">
          <button
            disabled={isLoading}
            onClick={onAccept}
            className="btn-primary flex-1 text-xs py-1.5 disabled:opacity-50"
          >
            Accept
          </button>
          <button
            disabled={isLoading}
            onClick={onReject}
            className="flex-1 text-xs py-1.5 rounded-standard font-medium disabled:opacity-50 text-status-rejected"
            style={{ background: 'rgba(247,56,56,0.1)' }}
          >
            Reject
          </button>
        </div>
      )}
      {order.status === 'accepted' && (
        <button
          disabled={isLoading}
          onClick={onSendToKitchen}
          className="btn-primary w-full text-xs py-1.5 disabled:opacity-50"
        >
          Send to Kitchen
        </button>
      )}
      {order.status === 'in_kitchen' && (
        <button
          disabled={isLoading}
          onClick={onMarkReady}
          className="w-full text-xs py-1.5 rounded-standard font-medium disabled:opacity-50"
          style={{ background: 'rgba(119,186,75,0.15)', color: '#77BA4B' }}
        >
          Mark Ready
        </button>
      )}
      {(order.status === 'ready' || order.status === 'ready_for_pickup') && (
        <button
          disabled={isLoading}
          onClick={onMarkServed}
          className="w-full text-xs py-1.5 rounded-standard font-medium disabled:opacity-50"
          style={{ background: 'rgba(52,211,153,0.15)', color: '#34D399' }}
        >
          Mark Served
        </button>
      )}
    </div>
  );
}
