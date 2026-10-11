'use client';

import type { ReactNode } from 'react';
import { useI18n, useCurrency } from '@/lib/i18n';
import { comparableDelta } from '@/lib/dashboard-comparison';
import type { DaySummary, PeriodComparison } from '@/lib/api';
import HourlyChart from './HourlyChart';

/** Performance totals and comparison bars use the same selected date and revenue scope. */
export default function PerformanceSection({ period, series, previousSeries, controls, comparisonLabel, comparable, chartNote, loading,
  serieMode = false, serieDate, previousSerieDate, comparisonNote }: {
  period: PeriodComparison | null; series: DaySummary[] | null; previousSeries: DaySummary[] | null; controls: ReactNode;
  comparisonLabel: string; comparable: boolean; chartNote?: string; loading: boolean;
  serieMode?: boolean; serieDate?: string; previousSerieDate?: string; comparisonNote?: string;
}) {
  const { t, locale } = useI18n();
  const { code: currency } = useCurrency();
  const money = (value: number) => new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).format(value);
  const current = period?.current;
  const previous = comparable ? period?.previous : undefined;
  const delta = comparableDelta(current?.total_revenue, previous?.total_revenue);
  const chartUnavailable = !period || !series;
  const showComparison = comparable && !!previous && !!previousSeries;
  const previousByDate = new Map((previousSeries ?? []).map(row => [row.date, row.gross_sales]));
  const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86_400_000;
  const fullDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const data = (series ?? []).map((row, i) => {
    const priorDate = serieMode && serieDate && previousSerieDate
      ? new Date((dayNumber(row.date) - dayNumber(serieDate) + dayNumber(previousSerieDate)) * 86_400_000).toISOString().slice(0, 10)
      : previousSeries?.[i]?.date;
    return {
      label: new Date(`${row.date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      currentPeriodLabel: fullDate(row.date), previousPeriodLabel: priorDate ? fullDate(priorDate) : t('dashboardPreviousPeriod'),
      current: row.gross_sales, previous: serieMode ? previousByDate.get(priorDate ?? '') ?? 0 : previousSeries?.[i]?.gross_sales ?? 0,
    };
  });
  const metrics = [
    { label: t('orders'), value: current?.total_orders, prior: previous?.total_orders },
    { label: t('avgTicket'), value: current?.avg_ticket, prior: previous?.avg_ticket, currency: true },
    { label: t('itemsSold'), value: current?.items_sold, prior: previous?.items_sold },
  ];
  const change = (value: number | null) => value === null || !comparable ? null : <span className="dashboard-change" title={comparisonLabel}>
    <span aria-hidden="true">{value < 0 ? '↘' : '↗'}</span>{`${new Intl.NumberFormat(locale, { maximumFractionDigits: 1, signDisplay: 'exceptZero' }).format(value)} %`}<span>{comparisonLabel}</span>
  </span>;
  return <section className="dashboard-card dashboard-performance">
    <div className="dashboard-section-heading"><h2>{t(serieMode ? 'dashboardSerieOverview' : 'performance')}</h2></div>
    <div className="dashboard-revenue"><span>{t('grossSales')}</span><strong>{current ? money(current.total_revenue) : '—'}</strong>{change(delta)}</div>
    <div className="dashboard-metrics">{metrics.map((metric) => <div key={metric.label}>
      <span>{metric.label}</span><strong>{metric.value == null ? '—' : metric.currency ? money(metric.value) : new Intl.NumberFormat(locale).format(metric.value)}</strong>
      {change(comparableDelta(metric.value, metric.prior))}
    </div>)}</div>
    <div className="dashboard-performance-body">
      <div className="dashboard-section-heading"><div><h3>{t(serieMode ? 'dashboardOrderIntake' : 'dashboardSalesTrend')}</h3><p>{t(serieMode ? 'dashboardOrderIntakeHint' : 'dashboardSalesTrendHint')}</p></div>
        <div className="dashboard-chart-legend"><span><i className="dashboard-chart-current" />{t(serieMode ? 'dateBasisSerieShort' : 'dashboardCurrentPeriod')}</span>
          {showComparison && <span><i className="dashboard-chart-previous" />{t('dashboardPreviousPeriod')}</span>}</div></div>
      <HourlyChart data={data} ariaLabel={t(serieMode ? 'dashboardOrderIntake' : 'performance')} unavailable={chartUnavailable} formatValue={money} showComparison={showComparison}
        metricLabel={t('grossSales')} direction={locale === 'he' ? 'rtl' : 'ltr'}
        emptyLabel={chartUnavailable ? t(loading ? 'loading' : 'couldNotLoad') : t('dashboardNoPeriodData')} />
      {chartNote && <p className="dashboard-chart-note">{chartNote}</p>}
      {comparisonNote && <p className="dashboard-chart-note">{comparisonNote}</p>}
    </div>
    <div className="dashboard-filters">{controls}</div>
  </section>;
}
