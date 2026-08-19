'use client';

// Rare and destructive actions: the after-the-fact corrections, the production
// override, cancel and delete. Deliberately behind an overflow rather than on
// the command bar — none of them is a step in an order's normal life.
//
// Rebuilt on ds/Menu, same reasons as the other two. Radix gives the danger
// group a real separator and roving keyboard focus.
//
// The caller renders this only when capabilities.hasOverflow is true, so the
// button never opens an empty menu on the production page, whose reduced prop
// set supplies none of these handlers.

import {
  MoreHorizontalIcon, RotateCcwIcon, BanknoteIcon, CreditCardIcon,
  ClipboardListIcon, XIcon, Trash2Icon,
} from 'lucide-react';
import { Button, Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from '@/components/ds';
import { useI18n } from '@/lib/i18n';

export function OrderOverflowMenu({
  canCorrect, canCorrectPayment, canCorrectPaymentMethod, canForceProduction, forceProductionActive,
  canCancel, canDelete, onCorrect, onCorrectPayment, onCorrectPaymentMethod,
  onToggleForceProduction, onCancel, onDelete, disabled,
}: {
  canCorrect?: boolean;
  canCorrectPayment?: boolean;
  canCorrectPaymentMethod?: boolean;
  canForceProduction?: boolean;
  forceProductionActive?: boolean;
  canCancel: boolean;
  canDelete: boolean;
  onCorrect?: () => void;
  onCorrectPayment?: () => void;
  onCorrectPaymentMethod?: () => void;
  onToggleForceProduction?: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();

  const hasCorrections =
    (canCorrect && !!onCorrect) ||
    (canCorrectPayment && !!onCorrectPayment) ||
    (canCorrectPaymentMethod && !!onCorrectPaymentMethod) ||
    (canForceProduction && !!onToggleForceProduction);

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="md"
          disabled={disabled}
          aria-label={t('moreActions') || 'More'}
          className="flex-1 md:flex-none justify-center"
        >
          <MoreHorizontalIcon />
        </Button>
      </MenuTrigger>
      <MenuContent side="top" align="end">
        {canCorrect && onCorrect && (
          <MenuItem onSelect={onCorrect}>
            <RotateCcwIcon /> {t('correctStatus') || 'Corriger le statut'}
          </MenuItem>
        )}
        {canCorrectPayment && onCorrectPayment && (
          <MenuItem onSelect={onCorrectPayment}>
            <BanknoteIcon /> {t('correctPayment') || 'Corriger le paiement'}
          </MenuItem>
        )}
        {canCorrectPaymentMethod && onCorrectPaymentMethod && (
          <MenuItem onSelect={onCorrectPaymentMethod}>
            <CreditCardIcon /> {t('correctPaymentMethod')}
          </MenuItem>
        )}
        {canForceProduction && onToggleForceProduction && (
          <MenuItem onSelect={onToggleForceProduction}>
            <ClipboardListIcon />
            {forceProductionActive
              ? t('removeFromProduction') || 'Retirer du plan de production'
              : t('addToProduction') || 'Ajouter au plan de production'}
          </MenuItem>
        )}

        {hasCorrections && (canCancel || canDelete) && <MenuSeparator />}

        {canCancel && (
          <MenuItem danger onSelect={onCancel}>
            <XIcon /> {t('cancelOrder') || 'Annuler la commande'}
          </MenuItem>
        )}
        {canDelete && onDelete && (
          <MenuItem danger onSelect={onDelete}>
            <Trash2Icon /> {t('deleteOrder') || 'Supprimer la commande'}
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}
