'use client';

import type { ReactNode } from 'react';
import { useI18n, useCurrency } from '@/lib/i18n';
import { comparableDelta } from '@/lib/dashboard-comparison';
import type { DaySummary, PeriodComparison } from '@/lib/api';
import HourlyChart from './HourlyChart';

/** Performance totals and comparison bars use the same selected date and revenue scope. */
export default function PerformanceSection({ period, series, previousSeries, controls, comparisonLabel, comparable, chartNote, loading }: {
  period: PeriodComparison | null; series: DaySummary[] | null; previousSeries: DaySummary[] | null; controls: ReactNode;
  comparisonLabel: string; comparable: boolean; chartNote?: string; loading: boolean;
}) {
  const { t, locale } = useI18n();
  const { code: currency } = useCurrency();
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(value);
  const current = period?.current;
  const previous = comparable ? period?.previous : undefined;
  const delta = comparableDelta(current?.total_revenue, previous?.total_revenue);
  const chartUnavailable = !period || !series || !previousSeries;
  const data = (series ?? []).map((row, i) => ({
    label: new Date(`${row.date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
    current: row.gross_sales, previous: previousSeries?.[i]?.gross_sales ?? 0,
  }));
  const metrics = [
    { label: t('orders'), value: current?.total_orders, prior: previous?.total_orders },
    { label: t('avgTicket'), value: current?.avg_ticket, prior: previous?.avg_ticket, currency: true },
    { label: t('itemsSold'), value: current?.items_sold, prior: previous?.items_sold },
  ];
  const change = (value: number | null) => <span className="dashboard-change" title={comparisonLabel}>
    <span aria-hidden="true">{value !== null && value < 0 ? '▼' : '▲'}</span>{value === null ? t('notAvailable') : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(value)} %`}
  </span>;
  return <section className="dashboard-card dashboard-performance">
    <h2>{t('performance')}</h2>
    <div className="dashboard-filters">{controls}</div>
    {chartNote && <p className="dashboard-chart-note">{chartNote}</p>}
    <div className="dashboard-performance-body">
      <div className="dashboard-revenue"><span>{t('grossSales')}</span><strong>{current ? money(current.total_revenue) : '—'}</strong>{change(delta)}</div>
      <HourlyChart data={data} ariaLabel={t('performance')} unavailable={chartUnavailable} formatValue={money}
        emptyLabel={chartUnavailable ? t(loading ? 'loading' : 'couldNotLoad') : t('dashboardNoPeriodData')} />
    </div>
    <div className="dashboard-metrics">{metrics.map((metric) => <div key={metric.label}>
      <span>{metric.label}</span><strong>{metric.value == null ? '—' : metric.currency ? money(metric.value) : new Intl.NumberFormat(locale).format(metric.value)}</strong>
      {change(comparableDelta(metric.value, metric.prior))}
    </div>)}</div>
  </section>;
}
