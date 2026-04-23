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

interface Kpi {
  key: string;
  title: string;
  value: string;
  icon: LucideIcon;
  change: string;
  positive: boolean;
}

/**
 * Articles KPI strip — icon-tile layout:
 * brand-gradient tile top-left, change-indicator top-right, label + big value
 * below. Tokenized. Preferred design — Stock mirrors this same layout via the
 * same component so the two pages look consistent.
 */
export default function ArticlesKpiRow({ items, categoriesCount, onKpiClick }: Props) {
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
      title: t('kpiTotalItems') || 'Total Articles',
      value: String(total),
      icon: ShoppingBag,
      change: `${categoriesCount}`,
      positive: true,
    },
    {
      key: 'disponibles',
      title: t('kpiActiveItems') || 'Disponibles',
      value: String(available),
      icon: CheckCircle,
      change: `${activePct}%`,
      positive: activePct >= 80,
    },
    {
      key: 'revenu-moyen',
      title: t('kpiAvgPrice') || 'Prix moyen',
      value: `₪${avgPrice.toFixed(2)}`,
      icon: DollarSign,
      change: '',
      positive: true,
    },
    {
      key: 'rupture-stock',
      title: t('kpiUnavailable') || 'Rupture Stock',
      value: String(unavailable),
      icon: AlertCircle,
      change: total > 0
        ? `${Math.round((unavailable / Math.max(total, 1)) * 100)}%`
        : '0%',
      positive: unavailable === 0,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)]">
      {kpis.map((kpi) => (
        <button
          key={kpi.key}
          type="button"
          onClick={() => onKpiClick(kpi.key)}
          title="Cliquez pour plus d'informations"
          className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg p-[var(--s-5)] text-left hover:border-[var(--line-strong)] hover:shadow-2 transition-all"
        >
          <div className="flex items-center justify-between mb-[var(--s-3)]">
            <div
              className="w-12 h-12 rounded-r-md grid place-items-center text-white"
              style={{
                background: 'linear-gradient(135deg, var(--brand-400), var(--brand-600))',
                boxShadow: '0 4px 12px color-mix(in oklab, var(--brand-500) 25%, transparent)',
              }}
            >
              <kpi.icon className="w-5 h-5" />
            </div>
            {kpi.change && (
              <span
                className="text-fs-sm font-semibold tabular-nums"
                style={{
                  color: kpi.positive
                    ? 'var(--success-500)'
                    : 'var(--danger-500)',
                }}
              >
                {kpi.change}
              </span>
            )}
          </div>
          <h3 className="text-fs-xs uppercase tracking-[.06em] text-[var(--fg-muted)] mb-1">
            {kpi.title}
          </h3>
          <p className="text-fs-3xl font-semibold text-[var(--fg)] tabular-nums leading-none">
            {kpi.value}
          </p>
        </button>
      ))}
    </div>
  );
}
