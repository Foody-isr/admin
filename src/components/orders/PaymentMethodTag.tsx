'use client';

import { BanknoteIcon, CreditCardIcon } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Order } from '@/lib/api';
import { settledPaymentMethod } from '@/lib/orders/payment';

interface PaymentMethodTagProps {
  order: Order;
  // 'compact' → short "Espèces" / "Carte" chip (order list). 'full' → the
  // sentence form ("Payé en espèces", "À encaisser par carte") for the detail.
  variant?: 'compact' | 'full';
  className?: string;
}

// PaymentMethodTag says how an order was settled, so staff can tell a deliberate
// cash order (collect on hand-off) from one whose online payment simply did not
// complete, and a card collection from a cash one.
//
// It reads the SETTLED method, never the raw payment_method column: the column
// only records what the customer said at ordering time, so an order created as
// cash and later collected by card used to keep claiming "Payé en espèces"
// forever. Renders nothing for a payment Foody processed itself (PayPlus,
// Summit) — those carry an invoice and a provider trail of their own.
export function PaymentMethodTag({ order, variant = 'compact', className }: PaymentMethodTagProps) {
  const { t } = useI18n();
  const method = settledPaymentMethod(order).toLowerCase();
  if (method !== 'cash' && method !== 'credit_card') return null;

  const isCash = method === 'cash';
  const paid = order.payment_status === 'paid';
  const Icon = isCash ? BanknoteIcon : CreditCardIcon;
  const label =
    variant === 'full'
      ? isCash
        ? paid ? t('paidInCash') : t('cashToCollect')
        : paid ? t('paidByCard') : t('cardToCollect')
      : isCash ? t('cash') : t('creditCard');

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-r-md border border-[var(--line)] px-2 py-0.5 text-fs-xs font-medium text-[var(--fg-muted)] whitespace-nowrap',
        className,
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
    </span>
  );
}
