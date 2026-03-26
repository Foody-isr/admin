'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getAnalyticsToday, getTopSellers, TodayStats, TopSeller } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function AnalyticsOverviewPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

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
      {/* Today summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { labelKey: 'revenueToday', value: stats ? `₪${(stats.total_revenue ?? 0).toFixed(0)}` : '—' },
          { labelKey: 'ordersToday', value: stats?.total_orders ?? '—' },
        ].map((s) => (
          <div key={s.labelKey} className="card text-center">
            <div className="text-2xl font-bold text-fg-primary">{s.value}</div>
            <div className="text-sm text-fg-secondary mt-1">{t(s.labelKey)}</div>
          </div>
        ))}
      </div>

      {/* Top sellers table */}
      <div className="card">
        <h2 className="font-semibold text-fg-primary mb-4">{t('topSellingItems')}</h2>
        {topSellers.length === 0 ? (
          <p className="text-sm text-fg-secondary">{t('noSalesDataYet')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-divider">
                  <th className="text-left py-2 text-fg-secondary font-medium">{t('qtyHeader')}</th>
                  <th className="text-left py-2 text-fg-secondary font-medium">{t('itemHeader')}</th>
                  <th className="text-right py-2 text-fg-secondary font-medium">{t('qtySold')}</th>
                  <th className="text-right py-2 text-fg-secondary font-medium">{t('revenue')}</th>
                </tr>
              </thead>
              <tbody>
                {topSellers.map((item, i) => (
                  <tr key={i} className="border-b border-divider">
                    <td className="py-2.5 text-fg-secondary font-bold">{i + 1}</td>
                    <td className="py-2.5 text-fg-primary">{item.name}</td>
                    <td className="py-2.5 text-right text-fg-secondary">{item.quantity}</td>
                    <td className="py-2.5 text-right font-medium text-fg-primary">₪{(item.revenue ?? 0).toFixed(0)}</td>
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
