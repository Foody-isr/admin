'use client';

// Record references plus rare and destructive actions. Activity and invoices
// live here so they never add height to the fixed order workspace.
//
// Rebuilt on ds/Menu, same reasons as the other two. Radix gives the danger
// group a real separator and roving keyboard focus.
//
import {
  MoreHorizontalIcon, RotateCcwIcon, BanknoteIcon, CreditCardIcon,
  ClipboardListIcon, XIcon, Trash2Icon, HistoryIcon, FileTextIcon,
  AlertTriangleIcon,
} from 'lucide-react';
import {
  Button,
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
} from '@/components/ds';
import { useI18n } from '@/lib/i18n';

export function OrderOverflowMenu({
  activityCount, activityPending, activityFailed, onViewActivity,
  invoiceCount, onViewInvoice,
  canCorrect, canCorrectPayment, canCorrectPaymentMethod, canForceProduction, forceProductionActive,
  forceProductionRevives, canCancel, canDelete, onCorrect, onCorrectPayment, onCorrectPaymentMethod,
  onToggleForceProduction, onCancel, onDelete, disabled,
}: {
  activityCount?: number;
  activityPending?: boolean;
  activityFailed?: boolean;
  onViewActivity?: () => void;
  invoiceCount?: number;
  onViewInvoice?: () => void;
  canCorrect?: boolean;
  canCorrectPayment?: boolean;
  canCorrectPaymentMethod?: boolean;
  canForceProduction?: boolean;
  forceProductionActive?: boolean;
  /** Pinning this dead order restores it before adding it to production. */
  forceProductionRevives?: boolean;
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

  const hasManagement =
    (canCorrect && !!onCorrect) ||
    (canCorrectPayment && !!onCorrectPayment) ||
    (canCorrectPaymentMethod && !!onCorrectPaymentMethod);
  const hasProduction = canForceProduction && !!onToggleForceProduction;
  const hasDanger = canCancel || (canDelete && !!onDelete);
  const hasReferences = !!onViewActivity || (!!invoiceCount && !!onViewInvoice);
  const hasActions = hasManagement || hasProduction || hasDanger;

  return (
    <Menu>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="md"
          icon
          disabled={disabled}
          aria-label={t('moreActions') || 'More'}
          title={t('moreActions') || 'More'}
          className="h-10 w-10 flex-none justify-center"
        >
          <MoreHorizontalIcon />
        </Button>
      </MenuTrigger>
      <MenuContent side="bottom" align="end" className="order-detail-menu">
        {hasReferences && <MenuLabel>{t('details')}</MenuLabel>}
        {onViewActivity && (
          <MenuItem onSelect={onViewActivity}>
            <HistoryIcon />
            <span className="flex-1">{t('activity') || 'Activité'}</span>
            {activityCount != null && (
              <span className="tabular-nums text-fs-xs text-[var(--fg-subtle)]">
                {activityCount}{activityPending ? '…' : ''}
              </span>
            )}
            {activityFailed && (
              <AlertTriangleIcon aria-label={t('activityLoadError')} className="text-[var(--warning-500)]" />
            )}
          </MenuItem>
        )}
        {!!invoiceCount && onViewInvoice && (
          <MenuItem onSelect={onViewInvoice}>
            <FileTextIcon />
            <span className="flex-1">{t('invoiceHeading') || 'Facture'}</span>
            <span className="tabular-nums text-fs-xs text-[var(--fg-subtle)]">{invoiceCount}</span>
          </MenuItem>
        )}

        {hasReferences && hasActions && <MenuSeparator />}
        {hasManagement && <MenuLabel>{t('manage')}</MenuLabel>}
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

        {hasManagement && hasProduction && <MenuSeparator />}
        {hasProduction && <MenuLabel>{t('productionTitle')}</MenuLabel>}
        {canForceProduction && onToggleForceProduction && (
          <MenuItem onSelect={onToggleForceProduction}>
            <ClipboardListIcon />
            {forceProductionActive
              ? t('removeFromProduction') || 'Retirer du plan de production'
              : forceProductionRevives
                ? t('restoreAndAddToProduction') || 'Réactiver et ajouter au plan de production'
                : t('addToProduction') || 'Ajouter au plan de production'}
          </MenuItem>
        )}

        {(hasManagement || hasProduction) && hasDanger && <MenuSeparator />}
        {hasDanger && <MenuLabel>{t('dangerZone')}</MenuLabel>}

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
