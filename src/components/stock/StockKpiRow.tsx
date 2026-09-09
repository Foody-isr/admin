'use client';

import {
  CircleCheckIcon,
  PackageIcon,
  PackageXIcon,
  WalletCardsIcon,
} from 'lucide-react';
import { HorizontalScrollRail } from '@/components/common/HorizontalScrollRail';
import { useCurrency, useI18n } from '@/lib/i18n';

interface Props {
  total: number;
  categoriesCount: number;
  okCount: number;
  lowCount: number;
  totalValue: number;
  vatDisplayMode: 'ex' | 'inc';
  onStatusChange: (status: 'low' | 'ok' | null) => void;
}

/** Compact operational stock summary shared with the Articles workspace pattern. */
export default function StockKpiRow({
  total,
  categoriesCount,
  okCount,
  lowCount,
  totalValue,
  vatDisplayMode,
  onStatusChange,
}: Props) {
  const { money } = useCurrency();
  const { t } = useI18n();
  const okPct = total > 0 ? Math.round((okCount / total) * 100) : 0;
  const lowPct = total > 0 ? Math.round((lowCount / total) * 100) : 0;

  const metrics = [
    {
      key: 'total',
      label: t('itemsInStock') || 'Articles en stock',
      value: String(total),
      detail: `${categoriesCount} ${t('categoriesCount') || 'catégories'}`,
      icon: PackageIcon,
      tone: 'text-[var(--brand-600)] bg-[var(--brand-50)]',
      onClick: () => onStatusChange(null),
    },
    {
      key: 'ok',
      label: t('statusOk') || 'Statut OK',
      value: String(okCount),
      detail: total > 0 ? `${okPct}% ${t('ofTotal') || 'du total'}` : '—',
      icon: CircleCheckIcon,
      tone: 'text-[var(--success-600)] bg-[var(--success-50)]',
      onClick: () => onStatusChange('ok'),
    },
    {
      key: 'value',
      label: t('totalValue') || 'Valeur totale',
      value: money(totalValue, { decimals: 2, grouped: true }),
      detail: vatDisplayMode === 'inc' ? (t('incVat') || 'TTC') : (t('exVat') || 'HT'),
      icon: WalletCardsIcon,
      tone: 'text-[var(--info-500)] bg-[var(--info-50)]',
    },
    {
      key: 'low',
      label: t('stockAlerts') || 'Alertes stock',
      value: String(lowCount),
      detail: lowCount > 0
        ? `${lowPct}% ${t('ofTotal') || 'du total'}`
        : t('statusOk') || 'OK',
      icon: PackageXIcon,
      tone: lowCount > 0
        ? 'text-[var(--danger-500)] bg-[var(--danger-50)]'
        : 'text-[var(--fg-muted)] bg-[var(--surface-2)]',
      onClick: () => onStatusChange('low'),
    },
  ];

  return (
    <HorizontalScrollRail edgeFlush>
      <div className="inline-flex min-w-full overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          const className = `group flex min-w-[210px] flex-1 items-center gap-3 px-4 py-3 text-start outline-none transition-colors md:min-w-0 ${
            metric.onClick ? 'hover:bg-[var(--surface-2)]/70 focus-visible:shadow-ring' : ''
          } ${index > 0 ? 'border-s border-[var(--line)]' : ''}`;
          const content = (
            <>
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-r-md ${metric.tone}`}>
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-fs-xs font-medium text-[var(--fg-muted)]">
                  {metric.label}
                </span>
                <span className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="num text-fs-xl font-semibold leading-tight text-[var(--fg)]">
                    {metric.value}
                  </span>
                  <span className="text-[11px] text-[var(--fg-subtle)]">
                    {metric.detail}
                  </span>
                </span>
              </span>
            </>
          );

          return metric.onClick ? (
            <button key={metric.key} type="button" onClick={metric.onClick} className={className}>
              {content}
            </button>
          ) : (
            <div key={metric.key} className={className}>
              {content}
            </div>
          );
        })}
      </div>
    </HorizontalScrollRail>
  );
}
