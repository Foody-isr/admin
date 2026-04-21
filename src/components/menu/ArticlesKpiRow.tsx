'use client';

import {
  ShoppingBag,
  CheckCircle,
  DollarSign,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import type { MenuItem } from '@/lib/api';

interface Props {
  items: MenuItem[];
  categoriesCount: number;
}

export default function ArticlesKpiRow({ items, categoriesCount }: Props) {
  const { t } = useI18n();

  const total = items.length;
  const available = items.filter((i) => i.is_active).length;
  const unavailable = total - available;
  const avgPrice =
    total > 0
      ? items.reduce((sum, i) => sum + (i.price ?? 0), 0) / total
      : 0;

  const kpis: Array<{ title: string; value: string; icon: LucideIcon }> = [
    {
      title: t('kpiTotalItems'),
      value: String(total),
      icon: ShoppingBag,
    },
    {
      title: t('kpiActiveItems'),
      value: String(available),
      icon: CheckCircle,
    },
    {
      title: t('kpiCategories'),
      value: String(categoriesCount),
      icon: DollarSign,
    },
    {
      title: t('kpiUnavailable'),
      value: String(unavailable),
      icon: AlertCircle,
    },
  ];

  // Hint to show the avg price as a secondary metric on the 3rd card
  kpis[2] = {
    ...kpis[2],
    value: `₪${avgPrice.toFixed(2)}`,
    title: t('kpiAvgPrice'),
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.title}
          className="bg-gradient-to-br from-[var(--surface)] to-[var(--surface-subtle)] dark:from-neutral-800 dark:to-neutral-900 border border-[var(--divider)] rounded-xl p-4 hover:shadow-lg transition-all"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="size-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/25">
              <kpi.icon size={22} />
            </div>
          </div>
          <h3 className="text-[var(--text-secondary)] text-sm mb-1">{kpi.title}</h3>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{kpi.value}</p>
        </div>
      ))}
    </div>
  );
}
