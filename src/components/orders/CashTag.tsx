'use client';

import { BanknoteIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Order } from '@/lib/api';
import { settledPaymentMethod } from '@/lib/orders/payment';

interface CashTagProps {
  order: Order;
  // 'compact' → short "Espèces" chip (order list). 'full' → "À encaisser en
  // espèces" / "Payé en espèces" (order detail).
  variant?: 'compact' | 'full';
  className?: string;
}

// CashTag flags an order settled in cash, so staff can tell a deliberate cash
// order (collect on hand-off) from one whose online payment simply did not
// complete — both otherwise read only as "Non payé". Card is the ordinary case
// and carries no badge: tagging it would put a chip on nearly every row without
// telling anyone anything.
//
// It reads the SETTLED method, never the raw payment_method column: the column
// only records what the customer said at ordering time, so an order created as
// cash and later collected by card used to keep claiming "Payé en espèces"
// forever. That order now shows no badge, which is the truth.
export function CashTag({ order, variant = 'compact', className }: CashTagProps) {
  const { t } = useI18n();
  if (settledPaymentMethod(order).toLowerCase() !== 'cash') return null;

  const paid = order.payment_status === 'paid';
  const label =
    variant === 'full'
      ? paid ? t('paidInCash') : t('cashToCollect')
      : t('cash');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-r-md border border-[var(--line)] px-2 py-0.5 text-fs-xs font-medium text-[var(--fg-muted)] whitespace-nowrap',
        className,
      )}
    >
      <BanknoteIcon className="w-3.5 h-3.5 shrink-0" />
      {label}
    </span>
  );
}
