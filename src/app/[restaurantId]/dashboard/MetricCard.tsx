'use client';

import { useI18n } from '@/lib/i18n';

interface MetricCardProps {
  label: string;
  value: string;
  change: number | null;
}

export default function MetricCard({ label, value, change }: MetricCardProps) {
  const { t } = useI18n();

  let badgeClass = 'comparison-badge neutral';
  let badgeText = t('notAvailable');

  if (change !== null && isFinite(change)) {
    if (change > 0) {
      badgeClass = 'comparison-badge up';
      badgeText = `\u25B2 ${change.toFixed(1)}%`;
    } else if (change < 0) {
      badgeClass = 'comparison-badge down';
      badgeText = `\u25BC ${Math.abs(change).toFixed(1)}%`;
    } else {
      badgeText = '0%';
    }
  }

  return (
    <div className="py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
      <div className="text-xs text-fg-secondary mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold text-fg-primary">{value}</span>
        <span className={badgeClass}>{badgeText}</span>
      </div>
    </div>
  );
}
