'use client';

import { useI18n } from '@/lib/i18n';

/** Which date a range filters/buckets by: 'created' = when the order was placed
 *  (created_at); 'serie' = its série/fulfillment date (scheduled_for, falling
 *  back to the creation day for immediate orders). Mirrors the server's
 *  common.DateBasis* constants. */
export type DateBasis = 'created' | 'serie';

/** Compact segmented toggle shared by the dashboard and the orders list so both
 *  reconcile revenue against the same date basis. Styled to match the app's
 *  segmented-pill tabs (see MenuItemTabBar). */
export default function DateBasisToggle({
  value,
  onChange,
  className = '',
}: {
  value: DateBasis;
  onChange: (basis: DateBasis) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const options: { key: DateBasis; label: string }[] = [
    { key: 'created', label: t('orderDate') },
    { key: 'serie', label: t('dateBasisSerie') },
  ];
  return (
    <div
      role="tablist"
      aria-label={t('dateBasisAria')}
      className={`inline-flex gap-0.5 bg-[var(--surface-2)] p-1 rounded-r-md ${className}`}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={`inline-flex items-center h-[30px] px-[var(--s-3)] rounded-r-sm text-fs-sm font-medium transition-colors duration-fast ease-out ${
              active
                ? 'bg-[var(--surface)] text-[var(--fg)] shadow-1'
                : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
