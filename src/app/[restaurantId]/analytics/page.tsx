'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getAnalyticsToday, getTopSellers, TodayStats, TopSeller } from '@/lib/api';

export default function AnalyticsPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);

  const [stats, setStats] = useState<TodayStats | null>(null);
  const [topSellers, setTopSellers] = useState<TopSeller[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getAnalyticsToday(rid).catch(() => null),
      getTopSellers(rid).catch(() => []),
    ]).then(([s, ts]) => {
      if (s) setStats(s);
      setTopSellers(ts);
    }).finally(() => setLoading(false));
  }, [rid]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>

      {/* Today summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Revenue today', value: stats ? `₪${(stats.total_revenue ?? 0).toFixed(0)}` : '—' },
          { label: 'Orders today', value: stats?.total_orders ?? '—' },
        ].map((s) => (
          <div key={s.label} className="card text-center">
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Top sellers table */}
      <div className="card">
        <h2 className="font-semibold text-gray-900 mb-4">Top Selling Items</h2>
        {topSellers.length === 0 ? (
          <p className="text-sm text-gray-400">No sales data yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-gray-500 font-medium">#</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Item</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Qty Sold</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {topSellers.map((item, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2.5 text-gray-400 font-bold">{i + 1}</td>
                    <td className="py-2.5 text-gray-900">{item.name}</td>
                    <td className="py-2.5 text-right text-gray-700">{item.quantity}</td>
                    <td className="py-2.5 text-right font-medium text-gray-900">₪{(item.revenue ?? 0).toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
