'use client';

import { EditIcon, ScaleIcon, CreditCardIcon, CheckCircle2Icon } from 'lucide-react';
import { Button } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import type { Order } from '@/lib/api';
import type { TicketKind } from '@/lib/print-ticket';
import type { OrderCapabilities, PrimaryAction } from '@/lib/orders/order-actions';
import { PrintTicketMenu } from './menus/PrintTicketMenu';
import { SendToCustomerMenu } from './menus/SendToCustomerMenu';
import { OrderOverflowMenu } from './menus/OrderOverflowMenu';

/**
 * The command bar.
 *
 * Start cluster: quiet utilities that are always available (edit, print, send).
 * End cluster: a contextual secondary, the overflow, and ONE dominant primary —
 * the order's next step. That single-primary rule is the whole point of the bar:
 * whatever else is on screen, there is exactly one obvious thing to do next.
 *
 * Mobile stacks the end cluster with the primary on top (col-reverse) and every
 * button full-width, so labels never truncate.
 */
export interface CommandBarProps {
  order: Order;
  caps: OrderCapabilities;
  canManage: boolean;
  isLoading: boolean;
  onEdit: () => void;
  onPrint: (kind: TicketKind) => void;
  onSendConfirmation: () => void;
  onConfirmWeights?: () => void;
  onTakePayment: () => void;
  onCloseOrder: () => void;
  onOverride?: () => void;
  onCorrectPayment?: () => void;
  onCorrectPaymentMethod?: () => void;
  onToggleForceProduction?: () => void;
  onReject: () => void;
  onDelete?: () => void;
  onPrimary: (action: PrimaryAction) => void;
}

export function CommandBar({
  order, caps, canManage, isLoading,
  onEdit, onPrint, onSendConfirmation, onConfirmWeights, onTakePayment, onCloseOrder,
  onOverride, onCorrectPayment, onCorrectPaymentMethod, onToggleForceProduction,
  onReject, onDelete, onPrimary,
}: CommandBarProps) {
  const { t } = useI18n();

  // Literal t() calls so the i18n checker can see every key. Resolving
  // t(caps.primary) instead would be the dynamic-key trap it cannot follow.
  const PRIMARY_LABEL: Record<PrimaryAction, string> = {
    accept: t('accept'),
    sendToKitchen: t('sendToKitchen'),
    markReady: t('markReady'),
    markServed: t('markServed'),
    markOutForDelivery: t('markOutForDelivery'),
    markDelivered: t('markDelivered'),
  };

  return (
    <div className="flex flex-col-reverse gap-[var(--s-2)] md:flex-row md:items-center md:justify-between md:gap-[var(--s-3)]">
      {/* Start — quiet utilities */}
      <div className="flex flex-wrap items-center gap-[var(--s-2)]">
        {canManage && caps.canEditOrder && (
          <Button
            variant="secondary"
            size="md"
            onClick={onEdit}
            className="flex-1 md:flex-none justify-center"
          >
            <EditIcon /> {t('edit') || 'Modifier'}
          </Button>
        )}
        <PrintTicketMenu onSelect={onPrint} />
        <SendToCustomerMenu order={order} onSendConfirmation={onSendConfirmation} />
      </div>

      {/* End — contextual secondary · overflow · single primary */}
      <div className="flex flex-col-reverse gap-[var(--s-2)] md:flex-row md:flex-nowrap md:items-center">
        {canManage && caps.canConfirmWeights && onConfirmWeights && (
          <Button
            variant="secondary"
            size="md"
            onClick={onConfirmWeights}
            disabled={isLoading}
            style={{
              color: 'var(--brand-500)',
              borderColor: 'color-mix(in oklab, var(--brand-500) 45%, var(--line-strong))',
            }}
            className="flex-1 md:flex-none justify-center"
          >
            <ScaleIcon /> {t('confirmWeights') || 'Confirm weights'}
          </Button>
        )}

        {canManage && caps.canTakePayment && (
          <Button
            variant="secondary"
            size="md"
            onClick={onTakePayment}
            disabled={isLoading}
            style={{
              // --success-600 does not exist in globals.css; the previous code
              // asked for it and the declaration was silently dropped.
              color: 'var(--success-500)',
              borderColor: 'color-mix(in oklab, var(--success-500) 45%, var(--line-strong))',
            }}
            className="flex-1 md:flex-none justify-center"
          >
            <CreditCardIcon /> {t('takePayment')}
          </Button>
        )}

        {canManage && caps.canCloseOrder && (
          <Button
            variant="secondary"
            size="md"
            onClick={onCloseOrder}
            disabled={isLoading}
            className="flex-1 md:flex-none justify-center"
          >
            <CheckCircle2Icon /> {t('closeOrder')}
          </Button>
        )}

        {canManage && caps.hasOverflow && (
          <OrderOverflowMenu
            canCorrect={caps.canCorrectStatus && !!onOverride}
            canCorrectPayment={caps.canCorrectPayment && !!onCorrectPayment}
            canCorrectPaymentMethod={caps.canCorrectPaymentMethod && !!onCorrectPaymentMethod}
            canForceProduction={caps.canForceProduction}
            forceProductionActive={!!order.force_production}
            canCancel={caps.canCancelOrder}
            canDelete={caps.canDelete}
            onCorrect={onOverride}
            onCorrectPayment={onCorrectPayment}
            onCorrectPaymentMethod={onCorrectPaymentMethod}
            onToggleForceProduction={onToggleForceProduction}
            onCancel={onReject}
            onDelete={onDelete}
            disabled={isLoading}
          />
        )}

        {canManage && caps.primary && (
          <Button
            variant="primary"
            size="md"
            onClick={() => onPrimary(caps.primary!)}
            disabled={isLoading}
            className="flex-1 md:flex-none justify-center"
          >
            {PRIMARY_LABEL[caps.primary]}
          </Button>
        )}
      </div>
    </div>
  );
}
