'use client';

import { useI18n } from '@/lib/i18n';
import type { ComparisonResult } from '@/lib/api';
import HourlyChart from './HourlyChart';
import MetricCard from './MetricCard';

interface PerformanceSectionProps {
  comparison: ComparisonResult | null;
  currentLabel: string;
  previousLabel: string;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatCurrency(val: number): string {
  return `\u20AA${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PerformanceSection({ comparison, currentLabel, previousLabel }: PerformanceSectionProps) {
  const { t } = useI18n();

  const cur = comparison?.current;
  const prev = comparison?.previous;

  const chartData = (comparison?.hourly ?? []).map((h) => ({
    hour: h.hour,
    current: h.current_amt,
    previous: h.previous_amt,
  }));

  // Date filter pills (display only for now)
  const dateLabel = cur?.date
    ? new Date(cur.date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : '—';

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-fg-primary mb-4">{t('performance')}</h2>

      {/* Filter pills */}
      <div className="flex items-center gap-2 mb-6">
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: 'var(--surface-subtle)', color: 'var(--text-primary)' }}>
          Date <span className="font-bold ml-1">{dateLabel}</span>
        </span>
        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium" style={{ background: 'var(--surface-subtle)', color: 'var(--text-primary)' }}>
          vs <span className="font-bold ml-1">{previousLabel}</span>
        </span>
      </div>

      {/* Net Sales headline */}
      <div className="mb-1">
        <div className="text-xs text-fg-secondary mb-1">{t('netSales')}</div>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-fg-primary">
            {cur ? formatCurrency(cur.net_sales) : '—'}
          </span>
          {cur && prev && (
            <span className={`comparison-badge ${pctChange(cur.net_sales, prev.net_sales) === null ? 'neutral' : (pctChange(cur.net_sales, prev.net_sales)! >= 0 ? 'up' : 'down')}`}>
              {pctChange(cur.net_sales, prev.net_sales) === null
                ? t('notAvailable')
                : `${pctChange(cur.net_sales, prev.net_sales)! >= 0 ? '\u25B2' : '\u25BC'} ${Math.abs(pctChange(cur.net_sales, prev.net_sales)!).toFixed(1)}%`}
            </span>
          )}
          {(!cur || !prev) && <span className="comparison-badge neutral">{t('notAvailable')}</span>}
        </div>
      </div>

      {/* No data placeholder or chart */}
      {!comparison || (cur && cur.net_sales === 0 && prev && prev.net_sales === 0) ? (
        <div className="flex items-center justify-center py-6 text-sm text-fg-secondary mb-4">
          {t('noActivityYet')}
        </div>
      ) : (
        <div className="mb-6 mt-4">
          <HourlyChart
            data={chartData}
            height={100}
            labelCurrent={currentLabel}
            labelPrevious={previousLabel}
          />
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-8">
        <MetricCard
          label={t('grossSales')}
          value={cur ? formatCurrency(cur.gross_sales) : '—'}
          change={cur && prev ? pctChange(cur.gross_sales, prev.gross_sales) : null}
        />
        <MetricCard
          label={t('transactions')}
          value={cur ? String(cur.transactions) : '—'}
          change={cur && prev ? pctChange(cur.transactions, prev.transactions) : null}
        />
        <MetricCard
          label={t('laborPercent')}
          value={cur ? `${cur.labor_percent.toFixed(2)}%` : '—'}
          change={null}
        />
        <MetricCard
          label={t('avgSale')}
          value={cur ? formatCurrency(cur.avg_sale) : '—'}
          change={cur && prev ? pctChange(cur.avg_sale, prev.avg_sale) : null}
        />
        <MetricCard
          label={t('compsAndDiscounts')}
          value={cur ? formatCurrency(cur.discounts) : '—'}
          change={null}
        />
        <MetricCard
          label={t('tips')}
          value={cur ? formatCurrency(cur.tips) : '—'}
          change={null}
        />
      </div>
    </div>
  );
}
