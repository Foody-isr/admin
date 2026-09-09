'use client';

import {
  CircleCheckIcon,
  PackageIcon,
  PackageXIcon,
  ReceiptTextIcon,
} from 'lucide-react';
import { useI18n, useCurrency } from '@/lib/i18n';
import type { MenuItem } from '@/lib/api';

interface Props {
  items: MenuItem[];
  categoriesCount: number;
  onKpiClick: (key: string) => void;
}

export default function ArticlesKpiRow({ items, categoriesCount, onKpiClick }: Props) {
  const { money } = useCurrency();
  const { t } = useI18n();

  const total = items.length;
  const available = items.filter((i) => i.is_active).length;
  const unavailable = total - available;
  const activePct = total > 0 ? Math.round((available / total) * 100) : 0;
  const avgPrice =
    total > 0 ? items.reduce((sum, i) => sum + (i.price ?? 0), 0) / total : 0;
  const unavailablePct = total > 0 ? Math.round((unavailable / total) * 100) : 0;

  const metrics = [
    {
      key: 'total-articles',
      label: t('kpiTotalItems') || 'Total Articles',
      value: String(total),
      detail: `${categoriesCount} ${t('categoriesCount') || 'catégories'}`,
      icon: PackageIcon,
      tone: 'text-[var(--brand-600)] bg-[var(--brand-50)]',
    },
    {
      key: 'disponibles',
      label: t('kpiActiveItems') || 'Disponibles',
      value: String(available),
      detail: `${activePct}% ${t('ofTotal') || 'du total'}`,
      icon: CircleCheckIcon,
      tone: 'text-[var(--success-600)] bg-[var(--success-50)]',
    },
    {
      key: 'revenu-moyen',
      label: t('kpiAvgPrice') || 'Prix moyen',
      value: money(avgPrice, { decimals: 2, grouped: true }),
      detail: t('perItem') || 'par article',
      icon: ReceiptTextIcon,
      tone: 'text-[var(--info-500)] bg-[var(--info-50)]',
    },
    {
      key: 'rupture-stock',
      label: t('kpiUnavailable') || 'Rupture Stock',
      value: String(unavailable),
      detail: total > 0
        ? `${unavailablePct}% ${t('ofTotal') || 'du total'}`
        : t('allAvailable') || 'Tout disponible',
      icon: PackageXIcon,
      tone: unavailable > 0
        ? 'text-[var(--danger-500)] bg-[var(--danger-50)]'
        : 'text-[var(--fg-muted)] bg-[var(--surface-2)]',
    },
  ];

  return (
      <div className="grid min-w-full grid-cols-2 overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1 md:flex">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <button
              key={metric.key}
              type="button"
              onClick={() => onKpiClick(metric.key)}
              className={`group flex min-w-0 items-center gap-2.5 px-3 py-3 text-start outline-none transition-colors hover:bg-[var(--surface-2)]/70 focus-visible:shadow-ring md:flex-1 md:gap-3 md:px-4 ${
                index % 2 === 1 ? 'border-s border-[var(--line)]' : ''
              } ${
                index > 1 ? 'border-t border-[var(--line)] md:border-t-0' : ''
              } ${
                index === 2 ? 'md:border-s md:border-[var(--line)]' : ''
              }`}
            >
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-r-md ${metric.tone}`}>
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-fs-xs font-medium text-[var(--fg-muted)]">
                  {metric.label}
                </span>
                <span className="flex items-baseline gap-2 whitespace-nowrap">
                  <span className="num text-fs-lg font-semibold leading-tight text-[var(--fg)] sm:text-fs-xl">
                    {metric.value}
                  </span>
                  <span className="hidden text-[11px] text-[var(--fg-subtle)] sm:inline">
                    {metric.detail}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
  );
}
