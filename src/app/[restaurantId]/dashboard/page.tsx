'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getAnalyticsToday, getTopSellers, listOrders, TodayStats, TopSeller, Order } from '@/lib/api';
import {
  BanknotesIcon,
  ShoppingBagIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
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
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm text-gray-500">{label}</div>
      </div>
    </div>
  );
}

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
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Today&apos;s overview</p>
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
          value={stats?.order_count ?? '—'}
          icon={ShoppingBagIcon}
          color="bg-blue-500"
        />
        <StatCard
          label="Avg order value"
          value={stats ? `₪${(stats.avg_order_value ?? 0).toFixed(0)}` : '—'}
          icon={ArrowTrendingUpIcon}
          color="bg-green-500"
        />
        <StatCard
          label="Pending orders"
          value={stats?.pending_orders ?? '—'}
          icon={ClockIcon}
          color="bg-yellow-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top sellers */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Top Sellers</h2>
          {topSellers.length === 0 ? (
            <p className="text-sm text-gray-400">No sales data yet</p>
          ) : (
            <div className="space-y-3">
              {topSellers.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                    <span className="text-sm text-gray-700">{item.item_name}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">₪{(item.revenue ?? 0).toFixed(0)}</div>
                    <div className="text-xs text-gray-400">{item.quantity_sold} sold</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent orders */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 mb-4">Recent Orders</h2>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-gray-400">No orders yet</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      #{order.id} {order.customer_name && `— ${order.customer_name}`}
                    </div>
                    <div className="text-xs text-gray-400 capitalize">{order.order_type.replace('_', ' ')}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">₪{(order.total_amount ?? 0).toFixed(0)}</div>
                    <StatusBadge status={order.status} />
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending_review: 'bg-yellow-100 text-yellow-700',
    accepted: 'bg-blue-100 text-blue-700',
    in_kitchen: 'bg-orange-100 text-orange-700',
    ready: 'bg-green-100 text-green-700',
    served: 'bg-gray-100 text-gray-600',
    rejected: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`badge ${colors[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
