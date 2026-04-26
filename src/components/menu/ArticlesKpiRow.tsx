'use client';

import { useI18n } from '@/lib/i18n';
import { Kpi } from '@/components/ds';
import type { MenuItem } from '@/lib/api';

interface Props {
  items: MenuItem[];
  categoriesCount: number;
  onKpiClick: (key: string) => void;
}

export default function ArticlesKpiRow({ items, categoriesCount, onKpiClick }: Props) {
  const { t } = useI18n();

  const total = items.length;
  const available = items.filter((i) => i.is_active).length;
  const unavailable = total - available;
  const activePct = total > 0 ? Math.round((available / total) * 100) : 0;
  const avgPrice =
    total > 0 ? items.reduce((sum, i) => sum + (i.price ?? 0), 0) / total : 0;
  const unavailablePct = total > 0 ? Math.round((unavailable / total) * 100) : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--s-4)]">
      <Kpi
        label={t('kpiTotalItems') || 'Total Articles'}
        value={total}
        sub={`${categoriesCount} ${t('categoriesCount') || 'catégories'}`}
        onClick={() => onKpiClick('total-articles')}
      />
      <Kpi
        label={t('kpiActiveItems') || 'Disponibles'}
        value={available}
        sub={`${activePct}% ${t('ofTotal') || 'du total'}`}
        onClick={() => onKpiClick('disponibles')}
      />
      <Kpi
        label={t('kpiAvgPrice') || 'Prix moyen'}
        value={
          <>
            ₪{Math.round(avgPrice).toLocaleString()}
            <span className="text-fs-lg text-[var(--fg-muted)] font-medium">
              .{String(Math.round((avgPrice % 1) * 100)).padStart(2, '0')}
            </span>
          </>
        }
        sub={t('perItem') || 'par article'}
        onClick={() => onKpiClick('revenu-moyen')}
      />
      <Kpi
        tone={unavailable === 0 ? 'default' : 'danger'}
        label={t('kpiUnavailable') || 'Rupture Stock'}
        value={unavailable}
        sub={total > 0 ? `${unavailablePct}% ${t('ofTotal') || 'du total'}` : t('allAvailable') || 'Tout disponible'}
        onClick={() => onKpiClick('rupture-stock')}
      />
    </div>
  );
}
