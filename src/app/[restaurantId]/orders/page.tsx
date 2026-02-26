'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { listOrders, acceptOrder, rejectOrder, Order } from '@/lib/api';

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'pending_review' },
  { label: 'Accepted', value: 'accepted' },
  { label: 'In Kitchen', value: 'in_kitchen' },
  { label: 'Ready', value: 'ready' },
];

const STATUS_COLORS: Record<string, string> = {
  pending_review: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-blue-100 text-blue-700',
  in_kitchen: 'bg-orange-100 text-orange-700',
  ready: 'bg-green-100 text-green-700',
  ready_for_pickup: 'bg-green-100 text-green-700',
  served: 'bg-gray-100 text-gray-600',
  picked_up: 'bg-gray-100 text-gray-600',
  delivered: 'bg-gray-100 text-gray-600',
  rejected: 'bg-red-100 text-red-700',
};

export default function OrdersPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);

  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await listOrders(rid, filter ? { status: filter } : undefined);
      setOrders(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, [rid, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccept = async (orderId: number) => {
    setActionLoading(orderId);
    try {
      await acceptOrder(rid, orderId);
      await fetchOrders();
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (orderId: number) => {
    if (!confirm('Reject this order?')) return;
    setActionLoading(orderId);
    try {
      await rejectOrder(rid, orderId);
      await fetchOrders();
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <button onClick={fetchOrders} className="btn-secondary">Refresh</button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.value
                ? 'bg-brand-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-500'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
        </div>
      ) : orders.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">No orders found</div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold text-gray-900">Order #{order.id}</span>
                    <span className={`badge ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                    <span className="badge bg-gray-100 text-gray-500 capitalize">
                      {order.order_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {order.customer_name && (
                    <p className="text-sm text-gray-600">{order.customer_name} · {order.customer_phone}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(order.items ?? []).map((item) => (
                      <span key={item.id} className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1">
                        {item.quantity}× {item.name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold text-gray-900">₪{order.total_amount.toFixed(2)}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(order.created_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  {order.status === 'pending_review' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        disabled={actionLoading === order.id}
                        onClick={() => handleAccept(order.id)}
                        className="btn-primary text-xs px-3 py-1 disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        disabled={actionLoading === order.id}
                        onClick={() => handleReject(order.id)}
                        className="btn-secondary text-xs px-3 py-1 disabled:opacity-50 text-red-600"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
