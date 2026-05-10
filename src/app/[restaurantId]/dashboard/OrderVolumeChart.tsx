'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import type { HourlyPair } from '@/lib/api';
import HourlyChart from './HourlyChart';

interface OrderVolumeChartProps {
  hourly: HourlyPair[];
  currentLabel: string;
  previousLabel: string;
}

export default function OrderVolumeChart({ hourly, currentLabel, previousLabel }: OrderVolumeChartProps) {
  const { restaurantId } = useParams();
  const { t } = useI18n();

  const chartData = hourly.map((h) => ({
    hour: h.hour,
    current: h.current_count,
    previous: h.previous_count,
  }));

  const totalToday = hourly.reduce((sum, h) => sum + h.current_count, 0);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-fg-primary">{t('orderVolume')}</h2>
        <Link
          href={`/${restaurantId}/orders`}
          className="text-xs font-medium text-brand-500 hover:underline"
        >
          {t('viewOrders')}
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-fg-secondary">{t('newOrders')}</span>
        <span className="text-sm font-semibold text-fg-primary">{totalToday}</span>
      </div>

      {totalToday === 0 && hourly.every((h) => h.previous_count === 0) ? (
        <div className="flex items-center justify-center py-8 text-sm text-fg-secondary">
          {t('noActivityYet')}
        </div>
      ) : (
        <HourlyChart
          data={chartData}
          height={140}
          labelCurrent={currentLabel}
          labelPrevious={previousLabel}
        />
      )}
    </div>
  );
}
