'use client';

import {
  ActivityIcon,
  BikeIcon,
  ChefHatIcon,
  ClipboardCheckIcon,
  PackageCheckIcon,
} from 'lucide-react';
import { HorizontalScrollRail } from '@/components/common/HorizontalScrollRail';
import { useI18n } from '@/lib/i18n';
import {
  OPERATIONS_QUEUES,
  type OperationsQueueKey,
} from '@/lib/orders/operations-board';

const ICONS = {
  active: ActivityIcon,
  review: ClipboardCheckIcon,
  kitchen: ChefHatIcon,
  ready: PackageCheckIcon,
  delivery: BikeIcon,
};

const TONE_CLASSES = {
  brand: 'text-[var(--brand-600)] bg-[var(--brand-50)]',
  danger: 'text-[var(--danger-500)] bg-[var(--danger-50)]',
  warning: 'text-[var(--warning-600)] bg-[var(--warning-50)]',
  success: 'text-[var(--success-600)] bg-[var(--success-50)]',
  info: 'text-[var(--info-500)] bg-[var(--info-50)]',
};

interface OrdersOperationsRailProps {
  activeKey: OperationsQueueKey | null;
  counts: Partial<Record<OperationsQueueKey, number>>;
  loading?: boolean;
  onSelect: (key: OperationsQueueKey) => void;
}

/** Connected, real-time queue selector for the live order workflow. */
export function OrdersOperationsRail({
  activeKey,
  counts,
  loading = false,
  onSelect,
}: OrdersOperationsRailProps) {
  const { t } = useI18n();

  return (
    <HorizontalScrollRail activeKey={activeKey ?? undefined} edgeFlush>
      <div
        className="inline-flex min-w-full overflow-hidden rounded-r-lg border border-[var(--line)] bg-[var(--surface)] shadow-1"
        role="tablist"
        aria-label={t('ordersLiveQueues')}
      >
        {OPERATIONS_QUEUES.map((queue, index) => {
          const selected = activeKey === queue.key;
          const Icon = ICONS[queue.key];
          const count = counts[queue.key];
          return (
            <button
              key={queue.key}
              type="button"
              role="tab"
              aria-selected={selected}
              data-rail-active={selected ? '' : undefined}
              onClick={() => onSelect(queue.key)}
              className={`group relative flex min-w-[150px] flex-1 items-center gap-3 px-4 py-3 text-start outline-none transition-colors focus-visible:shadow-ring md:min-w-0 ${
                index > 0 ? 'border-s border-[var(--line)]' : ''
              } ${selected ? 'bg-[var(--surface-2)]' : 'hover:bg-[var(--surface-2)]/70'}`}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-r-md ${TONE_CLASSES[queue.tone]}`}
              >
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block whitespace-nowrap text-fs-xs font-medium text-[var(--fg-muted)]">
                  {t(queue.labelKey)}
                </span>
                {loading && count === undefined ? (
                  <span className="mt-1 block h-5 w-8 animate-pulse rounded bg-[var(--surface-3)]" />
                ) : (
                  <span className="num block text-fs-xl font-semibold leading-tight text-[var(--fg)]">
                    {count ?? 0}
                  </span>
                )}
              </span>
              {selected && (
                <span
                  className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-[var(--brand-500)]"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </HorizontalScrollRail>
  );
}
