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
  onKpiClick: (key: string) => void;
}

type Kpi = {
  key: string;
  title: string;
  value: string;
  icon: LucideIcon;
  change: string;
  positive: boolean;
};

export default function ArticlesKpiRow({ items, categoriesCount: _c, onKpiClick }: Props) {
  const { t } = useI18n();

  const total = items.length;
  const available = items.filter((i) => i.is_active).length;
  const unavailable = total - available;
  const activePct = total > 0 ? Math.round((available / total) * 100) : 0;
  const avgPrice =
    total > 0 ? items.reduce((sum, i) => sum + (i.price ?? 0), 0) / total : 0;

  const kpis: Kpi[] = [
    {
      key: 'total-articles',
      title: t('kpiTotalItems'),
      value: String(total),
      icon: ShoppingBag,
      change: total > 0 ? `${total}` : '0',
      positive: true,
    },
    {
      key: 'disponibles',
      title: t('kpiActiveItems'),
      value: String(available),
      icon: CheckCircle,
      change: `${activePct}%`,
      positive: activePct >= 80,
    },
    {
      key: 'revenu-moyen',
      title: t('kpiAvgPrice'),
      value: `₪${avgPrice.toFixed(2)}`,
      icon: DollarSign,
      change: '',
      positive: true,
    },
    {
      key: 'rupture-stock',
      title: t('kpiUnavailable'),
      value: String(unavailable),
      icon: AlertCircle,
      change: unavailable === 0 ? '0%' : `${Math.round((unavailable / Math.max(total, 1)) * 100)}%`,
      positive: unavailable === 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <button
          key={kpi.key}
          onClick={() => onKpiClick(kpi.key)}
          title="Cliquez pour plus d'informations"
          className="bg-gradient-to-br from-neutral-50 to-neutral-100 dark:from-neutral-800 dark:to-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 hover:shadow-lg hover:border-orange-500 dark:hover:border-orange-500 transition-all cursor-pointer text-left"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="size-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-500/25">
              <kpi.icon size={22} />
            </div>
            {kpi.change && (
              <span
                className={`text-sm font-semibold ${
                  kpi.positive
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {kpi.change}
              </span>
            )}
          </div>
          <h3 className="text-neutral-600 dark:text-neutral-400 text-sm mb-1">
            {kpi.title}
          </h3>
          <p className="text-2xl font-bold text-neutral-900 dark:text-white">
            {kpi.value}
          </p>
        </button>
      ))}
    </div>
  );
}
