'use client';

import { useCallback, useEffect, useState } from 'react';
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
  const [errors, setErrors] = useState<string[]>([]);

  const loadDashboard = useCallback(() => {
    setLoading(true);
    setErrors([]);
    Promise.allSettled([getDayComparison(rid), getAnalyticsToday(rid)])
      .then(([compRes, statsRes]) => {
        const errs: string[] = [];
        if (compRes.status === 'fulfilled') {
          setComparison(compRes.value);
        } else {
          setComparison(null);
          errs.push(`${t('performance')}: ${compRes.reason?.message ?? String(compRes.reason)}`);
        }
        if (statsRes.status === 'fulfilled') {
          setStats(statsRes.value);
        } else {
          setStats(null);
          errs.push(`${t('money')}: ${statsRes.reason?.message ?? String(statsRes.reason)}`);
        }
        setErrors(errs);
      })
      .finally(() => setLoading(false));
  }, [rid, t]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

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

      {errors.length > 0 && (
        <div
          className="mb-6 rounded-standard px-4 py-3 text-sm"
          style={{
            background: 'rgba(247,56,56,0.08)',
            border: '1px solid rgba(247,56,56,0.3)',
            color: 'var(--status-rejected, #F73838)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">{t('failedToLoad') || 'Failed to load dashboard data'}</div>
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
            <button
              onClick={loadDashboard}
              className="text-xs font-medium underline whitespace-nowrap hover:opacity-80"
            >
              {t('retry') || 'Retry'}
            </button>
          </div>
        </div>
      )}

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
