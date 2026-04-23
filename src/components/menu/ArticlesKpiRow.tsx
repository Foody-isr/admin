'use client';

import { useI18n } from '@/lib/i18n';
import type { MenuItem } from '@/lib/api';

interface Props {
  items: MenuItem[];
  categoriesCount: number;
  onKpiClick: (key: string) => void;
}

type Tone = 'neutral' | 'success' | 'warning' | 'danger';

interface Kpi {
  key: string;
  title: string;
  value: string;
  sub?: string;
  tone: Tone;
}

/**
 * Articles KPI strip — aligned with Stock's KpiCard layout:
 * minimal `label → big tabular number → subline`, optional warning/danger/
 * success tint for outlier metrics. No icon tiles, no deltas (the Library
 * doesn't have delta data, so the Stock-style minimalism applies cleanly).
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
      title: t('kpiTotalItems') || 'Total articles',
      value: String(total),
      sub: `${categoriesCount} ${t('categories') || 'catégories'}`,
      tone: 'neutral',
    },
    {
      key: 'disponibles',
      title: t('kpiActiveItems') || 'Disponibles',
      value: String(available),
      sub: unavailable > 0
        ? `${unavailable} ${t('hiddenLower') || 'masqués'}`
        : `${activePct}%`,
      tone: activePct >= 80 ? 'success' : 'neutral',
    },
    {
      key: 'revenu-moyen',
      title: t('kpiAvgPrice') || 'Prix moyen',
      value: `₪${avgPrice.toFixed(2)}`,
      sub: t('htShort') || 'HT',
      tone: 'neutral',
    },
    {
      key: 'rupture-stock',
      title: t('kpiUnavailable') || 'Rupture',
      value: String(unavailable),
      sub:
        unavailable > 0
          ? t('unavailableSub') || 'indisponible(s)'
          : t('allAvailable') || 'tous disponibles',
      tone: unavailable > 0 ? 'warning' : 'neutral',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)]">
      {kpis.map((kpi) => {
        const tintStyle: React.CSSProperties | undefined =
          kpi.tone === 'warning'
            ? {
                background: 'color-mix(in oklab, var(--warning-500) 8%, var(--surface))',
                borderColor: 'color-mix(in oklab, var(--warning-500) 30%, var(--line))',
              }
            : kpi.tone === 'danger'
            ? {
                background: 'color-mix(in oklab, var(--danger-500) 6%, var(--surface))',
                borderColor: 'color-mix(in oklab, var(--danger-500) 25%, var(--line))',
              }
            : undefined;
        const valueColor =
          kpi.tone === 'warning'
            ? 'var(--warning-500)'
            : kpi.tone === 'danger'
            ? 'var(--danger-500)'
            : kpi.tone === 'success'
            ? 'var(--success-500)'
            : 'var(--fg)';
        return (
          <button
            key={kpi.key}
            onClick={() => onKpiClick(kpi.key)}
            title="Cliquez pour plus d'informations"
            className="bg-[var(--surface)] border border-[var(--line)] rounded-r-lg p-[var(--s-5)] flex flex-col gap-[var(--s-3)] text-left hover:border-[var(--line-strong)] transition-colors"
            style={tintStyle}
          >
            <h3 className="text-fs-xs font-medium uppercase tracking-[.06em] text-[var(--fg-muted)]">
              {kpi.title}
            </h3>
            <p
              className="text-fs-3xl font-semibold leading-none tabular-nums"
              style={{ color: valueColor }}
            >
              {kpi.value}
            </p>
            {kpi.sub && (
              <p className="text-fs-xs text-[var(--fg-subtle)]">{kpi.sub}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}
