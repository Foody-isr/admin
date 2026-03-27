'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getAnalyticsToday, getTopSellers, listOrders, TodayStats, TopSeller, Order } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

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
  const { t } = useI18n();

  const [stats, setStats] = useState<TodayStats | null>(null);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAnalyticsToday(rid).catch(() => null),
      getTopSellers(rid).catch(() => []),
      listOrders(rid).then((r) => r.orders).catch(() => []),
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
      {/* Key Metrics — Square style: simple label + value pairs */}
      <div>
        <h2 className="text-xs font-medium text-fg-secondary uppercase tracking-wider mb-4">
          {t('todaysOverview')}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
          <div>
            <div className="text-xs text-fg-secondary mb-1">{t('revenueToday')}</div>
            <div className="text-2xl font-bold text-fg-primary">
              {stats ? `₪${(stats.total_revenue ?? 0).toFixed(0)}` : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-fg-secondary mb-1">{t('ordersToday')}</div>
            <div className="text-2xl font-bold text-fg-primary">
              {stats?.total_orders ?? '—'}
            </div>
          </div>
        </div>
      </div>

      <div style={{ borderTop: '1px solid var(--divider)' }} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top sellers — bar-style */}
        <div>
          <h2 className="text-xs font-medium text-fg-secondary uppercase tracking-wider mb-4">
            {t('topSellers')}
          </h2>
          {topSellers.length === 0 ? (
            <p className="text-sm text-fg-secondary">{t('noSalesDataYet')}</p>
          ) : (
            <div className="space-y-3">
              {topSellers.map((item, i) => {
                const maxRevenue = topSellers[0]?.revenue ?? 1;
                const pct = ((item.revenue ?? 0) / maxRevenue) * 100;
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-fg-primary">{item.name}</span>
                      <span className="text-sm font-medium text-fg-primary">₪{(item.revenue ?? 0).toFixed(0)}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface-subtle)' }}>
                      <div
                        className="h-full rounded-full bg-brand-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-xs text-fg-secondary mt-0.5">{item.quantity} {t('sold')}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent orders — clean rows */}
        <div>
          <h2 className="text-xs font-medium text-fg-secondary uppercase tracking-wider mb-4">
            {t('recentOrders')}
          </h2>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-fg-secondary">{t('noOrdersYet')}</p>
          ) : (
            <div>
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between py-3"
                  style={{ borderBottom: '1px solid var(--divider)' }}
                >
                  <div>
                    <div className="text-sm font-medium text-fg-primary">
                      #{order.id} {order.customer_name && `— ${order.customer_name}`}
                    </div>
                    <div className="text-xs text-fg-secondary capitalize">{order.order_type.replace('_', ' ')}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-fg-primary">₪{(order.total_amount ?? 0).toFixed(0)}</div>
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
