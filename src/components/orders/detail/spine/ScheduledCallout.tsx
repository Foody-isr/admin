'use client';

// Prominent date/time callout for a scheduled order. Moved verbatim from
// OrderDetailDrawer.tsx (1237-1302).

import { ClockIcon } from 'lucide-react';
import type { Order } from '@/lib/api';
import {
  formatScheduledDateLong,
  formatScheduledTimeOnly,
  relativeDayLabel,
} from '@/lib/orders/order-time';

// ─── Scheduled banner — prominent date/time callout for scheduled orders ──────

export function ScheduledBanner({
  iso, windowStart, windowEnd, orderType, t,
}: {
  iso: string;
  windowStart?: string | null;
  windowEnd?: string | null;
  orderType?: Order['order_type'];
  t: (k: string) => string;
}) {
  const rel = relativeDayLabel(iso, t);
  // Prefer the fulfillment window (e.g. "14:00-18:00") over the raw scheduled_for
  // clock time — for batch orders that timestamp is a meaningless near-midnight
  // value, so a delivery/pickup window is what staff actually need to see.
  const win = windowStart && windowEnd ? `${windowStart}-${windowEnd}` : null;
  const typeLabel =
    orderType === 'delivery' ? t('delivery')
    : orderType === 'pickup' ? t('pickup')
    : null;
  const timeText = win
    ? (typeLabel ? `${typeLabel} · ${win}` : win)
    : formatScheduledTimeOnly(iso);
  return (
    <div
      className="flex items-center gap-[var(--s-4)] rounded-r-lg p-[var(--s-4)]"
      style={{
        background: 'color-mix(in oklab, var(--brand-500) 8%, var(--surface))',
        border: '1px solid color-mix(in oklab, var(--brand-500) 28%, var(--line))',
      }}
    >
      <div
        className="w-11 h-11 rounded-r-md grid place-items-center shrink-0"
        style={{
          background: 'color-mix(in oklab, var(--brand-500) 18%, transparent)',
          color: 'var(--brand-500)',
        }}
      >
        <ClockIcon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-[var(--s-2)] text-fs-xs uppercase tracking-[.06em] font-semibold text-[var(--brand-500)]">
          <span className="truncate">{t('scheduledForLabel') || 'Scheduled for'}</span>
          {rel && (
            <span
              className="inline-flex items-center px-1.5 h-[18px] rounded-r-sm text-[10px] tracking-[.04em] shrink-0"
              style={{
                background: 'color-mix(in oklab, var(--brand-500) 16%, transparent)',
                color: 'var(--brand-500)',
              }}
            >
              {rel}
            </span>
          )}
        </div>
        <div className="text-fs-lg sm:text-fs-xl font-semibold tracking-tight text-[var(--fg)] mt-0.5 break-words">
          {formatScheduledDateLong(iso)}
        </div>
        <div className="text-fs-sm tabular-nums text-[var(--fg-muted)] mt-0.5">
          {timeText}
        </div>
      </div>
    </div>
  );
}
