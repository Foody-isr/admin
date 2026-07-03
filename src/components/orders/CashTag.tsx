'use client';

import { BanknoteIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface CashTagProps {
  paymentMethod?: string | null;
  paymentStatus?: string;
  // 'compact' → short "Espèces" chip (order list). 'full' → "À encaisser en
  // espèces" / "Payé en espèces" (order detail).
  variant?: 'compact' | 'full';
  className?: string;
}

// CashTag flags an order the customer chose to pay for in cash, so staff can
// tell a deliberate cash order (collect on hand-off) from one whose online
// payment simply didn't complete — both otherwise read only as "Non payé".
// Renders nothing unless payment_method is "cash".
export function CashTag({ paymentMethod, paymentStatus, variant = 'compact', className }: CashTagProps) {
  const { t } = useI18n();
  if (paymentMethod !== 'cash') return null;

  const paid = paymentStatus === 'paid';
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
