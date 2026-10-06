'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { usePermissions } from '@/lib/permissions-context';
import type { HourlyPair } from '@/lib/api';
import HourlyChart from './HourlyChart';

/** Today's hourly activity stays independent from the performance date selection. */
export default function OrderVolumeChart({ hourly, currentLabel, previousLabel, loading }: {
  hourly: HourlyPair[] | null; currentLabel: string; previousLabel: string; loading: boolean;
}) {
  const { restaurantId } = useParams();
  const { t, locale } = useI18n();
  const { hasAnyPermission } = usePermissions();
  // Include every hour with activity; an empty day uses the same nine-hour view as Square.
  const active = hourly?.filter((row) => row.current_count > 0 || row.previous_count > 0) ?? [];
  const start = Math.min(11, ...active.map((row) => row.hour));
  const end = Math.max(19, ...active.map((row) => row.hour));
  const data = Array.from({ length: end - start + 1 }, (_, i) => {
    const hour = start + i;
    const row = hourly?.find((item) => item.hour === hour);
    return { label: new Date(2000, 0, 1, hour).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }),
      current: row?.current_count ?? 0, previous: row?.previous_count ?? 0 };
  });
  return <section className="dashboard-card dashboard-volume">
    <h2>{t('orderVolume')}</h2>
    <div className="dashboard-volume-caption">
      <div className="dashboard-chart-legend"><strong>{t('newOrders')}</strong>
        <span><i className="dashboard-chart-current" />{currentLabel}</span>
        <span><i className="dashboard-chart-previous" />{previousLabel}</span>
      </div>
      {hasAnyPermission('orders.view', 'orders.manage') && <Link href={`/${restaurantId}/orders/all`} className="dashboard-text-link">{t('viewOrders')}</Link>}
    </div>
    <HourlyChart data={data} ariaLabel={t('orderVolume')} unavailable={!hourly}
      emptyLabel={!hourly ? t(loading ? 'loading' : 'couldNotLoad') : t('noActivityYet')} />
  </section>;
}
