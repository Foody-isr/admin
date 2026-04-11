'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getDayComparison, getAnalyticsToday, type ComparisonResult, type TodayStats } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import AiPromptBar from './AiPromptBar';
import OrderVolumeChart from './OrderVolumeChart';
import PerformanceSection from './PerformanceSection';
import DashboardSidebar from './DashboardSidebar';

export default function DashboardPage() {
  const { restaurantId } = useParams();
  const rid = Number(restaurantId);
  const { t } = useI18n();

  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [stats, setStats] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getDayComparison(rid).catch(() => null),
      getAnalyticsToday(rid).catch(() => null),
    ]).then(([comp, s]) => {
      setComparison(comp);
      if (s) setStats(s);
    }).finally(() => setLoading(false));
  }, [rid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const currentLabel = t('today');
  const previousDate = comparison?.previous.date;
  const previousLabel = previousDate
    ? new Date(previousDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    : t('yesterday');

  return (
    <div>
      <h1 className="text-2xl font-bold text-fg-primary mb-6">{t('dashboardHome')}</h1>

      <AiPromptBar />

      <div className="dashboard-grid">
        <div className="space-y-6">
          <OrderVolumeChart
            hourly={comparison?.hourly ?? Array.from({ length: 24 }, (_, i) => ({ hour: i, current_amt: 0, previous_amt: 0, current_count: 0, previous_count: 0 }))}
            currentLabel={currentLabel}
            previousLabel={previousLabel}
          />
          <PerformanceSection
            comparison={comparison}
            currentLabel={currentLabel}
            previousLabel={previousLabel}
          />
        </div>

        <DashboardSidebar
          restaurantId={rid}
          todayRevenue={stats?.total_revenue ?? 0}
        />
      </div>
    </div>
  );
}
