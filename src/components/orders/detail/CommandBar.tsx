'use client';

import type { ReactNode } from 'react';
import { EditIcon, ScaleIcon, CreditCardIcon, CheckCircle2Icon, MessageCircleIcon } from 'lucide-react';
import { Button, MenuItem, MenuLabel, MenuSeparator } from '@/components/ds';
import { useI18n } from '@/lib/i18n';
import type { Order } from '@/lib/api';
import type { OrderCapabilities, PrimaryAction } from '@/lib/orders/order-actions';
import { SendToCustomerItems } from './menus/SendToCustomerMenu';
import styles from './order-detail.module.css';

export interface CommandBarProps {
  order: Order;
  caps: OrderCapabilities;
  canManage: boolean;
  isLoading: boolean;
  onEdit: () => void;
  actions: (utilities: ReactNode) => ReactNode;
  onSendConfirmation: () => void;
  onSendDeliveryReminder?: () => void;
  onConfirmWeights?: () => void;
  onTakePayment: () => void;
  onCloseOrder: () => void;
  onPrimary: (action: PrimaryAction) => void;
}

/** Toolbar action group, preserving Foody capability gates and callbacks. */
export function CommandBar({
  order, caps, canManage, isLoading,
  onEdit, actions, onSendConfirmation, onSendDeliveryReminder, onConfirmWeights, onTakePayment, onCloseOrder,
  onPrimary,
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

  const utilities = <>
    {canManage && caps.canEditOrder && <MenuItem onSelect={onEdit}><EditIcon />{t('edit')}</MenuItem>}
    {canManage && onSendDeliveryReminder && <MenuItem disabled={isLoading} onSelect={onSendDeliveryReminder}><MessageCircleIcon />{t('sendDeliveryReminder')}</MenuItem>}
    {canManage && caps.canConfirmWeights && onConfirmWeights && <MenuItem disabled={isLoading} onSelect={onConfirmWeights}><ScaleIcon />{t('confirmWeights')}</MenuItem>}
    {canManage && caps.canTakePayment && <MenuItem disabled={isLoading} onSelect={onTakePayment}><CreditCardIcon />{t('takePayment')}</MenuItem>}
    {canManage && caps.canCloseOrder && <MenuItem disabled={isLoading} onSelect={onCloseOrder}><CheckCircle2Icon />{t('closeOrder')}</MenuItem>}
    <MenuSeparator />
    <MenuLabel>{t('sendToCustomer')}</MenuLabel>
    <SendToCustomerItems order={order} onSendConfirmation={onSendConfirmation} />
  </>;
  return <>
    {actions(utilities)}
    {canManage && caps.primary && (
      <Button variant="primary" size="md" className={styles.primaryButton}
        onClick={() => onPrimary(caps.primary!)} disabled={isLoading}>
        {PRIMARY_LABEL[caps.primary]}
      </Button>
    )}
  </>;
}
