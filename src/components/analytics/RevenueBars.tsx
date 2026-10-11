'use client';

import { useCurrency, useI18n } from '@/lib/i18n';

interface RevenuePoint {
  date: string;
  revenue: number;
  quantity?: number;
}

/** Compact revenue chart with the complete values available in a keyboard-accessible table. */
export function RevenueBars({ data }: { data: RevenuePoint[] }) {
  const { t } = useI18n();
  const { money } = useCurrency();
  if (!data.length) return <p className="text-sm text-[var(--fg-muted)]">{t('noData')}</p>;
  const max = Math.max(...data.map(point => point.revenue), 1);
  const interval = Math.max(1, Math.ceil(data.length / 6));
  const showQuantity = data.some(point => point.quantity !== undefined);
  return (
    <div>
      <div aria-hidden="true" dir="ltr" className="flex items-end gap-1 border-b border-[var(--line)] pt-3">
        {data.map((point, index) => (
          <div key={point.date} className="min-w-0 flex-1 flex flex-col justify-end items-center gap-2">
            <div className="w-full max-w-12 rounded-t-sm bg-[var(--brand-ink)]" style={{ height: point.revenue > 0 ? Math.max(2, point.revenue / max * 100) : 0 }} />
            <span className="h-6 text-xs text-[var(--fg-muted)] whitespace-nowrap">
              {index % interval === 0 ? point.date.slice(point.date.length === 7 ? 5 : 8) : ''}
            </span>
          </div>
        ))}
      </div>
      <details className="mt-2 text-sm">
        <summary className="min-h-10 cursor-pointer py-2 text-[var(--fg-muted)]">{t('chartData')}</summary>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="border-b border-[var(--line)] text-[var(--fg-muted)]"><th scope="col" className="py-2 text-start font-medium">{t('date')}</th><th scope="col" className="py-2 text-end font-medium">{t('revenue')}</th>{showQuantity && <th scope="col" className="py-2 text-end font-medium">{t('quantitySold')}</th>}</tr></thead>
            <tbody>{data.map(point => <tr key={point.date} className="border-b border-[var(--line)] last:border-0"><th scope="row" className="py-2 text-start font-normal"><bdi>{point.date}</bdi></th><td className="py-2 text-end">{money(point.revenue, { decimals: 0 })}</td>{showQuantity && <td className="py-2 text-end">{point.quantity ?? '—'}</td>}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
