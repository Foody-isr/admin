'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getAnalyticsToday, getTopSellers, listOrders, TodayStats, TopSeller, Order } from '@/lib/api';
import {
  BanknotesIcon,
  ShoppingBagIcon,
} from '@heroicons/react/24/outline';

function StatCard({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="card flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <div className="text-2xl font-bold text-fg-primary">{value}</div>
        <div className="text-sm text-fg-secondary">{label}</div>
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  pending_review: 'badge-pending',
  accepted: 'badge-accepted',
  in_kitchen: 'badge-in-kitchen',
  ready: 'badge-ready',
  served: 'badge-served',
  rejected: 'badge-rejected',
};

export default function DashboardPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);

  const [stats, setStats] = useState<TodayStats | null>(null);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAnalyticsToday(rid).catch(() => null),
      getTopSellers(rid).catch(() => []),
      listOrders(rid).catch(() => []),
    ]).then(([s, ts, orders]) => {
      if (s) setStats(s);
      setTopSellers(ts.slice(0, 5));
      setRecentOrders(orders.slice(0, 10));
    }).finally(() => setLoading(false));
  }, [rid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-fg-primary">Dashboard</h1>
        <p className="text-sm text-fg-secondary mt-1">Today&apos;s overview</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Revenue today"
          value={stats ? `₪${(stats.total_revenue ?? 0).toFixed(0)}` : '—'}
          icon={BanknotesIcon}
          color="bg-brand-500"
        />
        <StatCard
          label="Orders today"
          value={stats?.total_orders ?? '—'}
          icon={ShoppingBagIcon}
          color="bg-blue-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top sellers */}
        <div className="card">
          <h2 className="font-semibold text-fg-primary mb-4">Top Sellers</h2>
          {topSellers.length === 0 ? (
            <p className="text-sm text-fg-secondary">No sales data yet</p>
          ) : (
            <div className="space-y-3">
              {topSellers.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-fg-secondary w-5">#{i + 1}</span>
                    <span className="text-sm text-fg-primary">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-fg-primary">₪{(item.revenue ?? 0).toFixed(0)}</div>
                    <div className="text-xs text-fg-secondary">{item.quantity} sold</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent orders */}
        <div className="card">
          <h2 className="font-semibold text-fg-primary mb-4">Recent Orders</h2>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-fg-secondary">No orders yet</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-fg-primary">
                      #{order.id} {order.customer_name && `— ${order.customer_name}`}
                    </div>
                    <div className="text-xs text-fg-secondary capitalize">{order.order_type.replace('_', ' ')}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">₪{(order.total_amount ?? 0).toFixed(0)}</div>
                    <span className={`badge ${STATUS_BADGE[order.status] ?? 'badge-neutral'}`}>
                      {order.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
