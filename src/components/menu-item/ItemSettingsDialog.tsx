'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';

/** Square-style item settings dialog. Apply updates the item draft only. */
export function ItemSettingsDialog({
  title,
  description,
  children,
  onApply,
  onClose,
  applyDisabled = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onApply: () => void;
  onClose: () => void;
  applyDisabled?: boolean;
}) {
  const { t, direction } = useI18n();
  const focus = useDialogReturnFocus();
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="item-settings-overlay" />
        <Dialog.Content
          {...focus}
          {...(!description ? { 'aria-describedby': undefined } : {})}
          dir={direction}
          className="item-editor item-settings-dialog"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="item-settings-toolbar">
            <Dialog.Close
              className="item-settings-close"
              aria-label={t('cancel')}
            >
              <X size={24} />
            </Dialog.Close>
            <button
              type="button"
              className="item-settings-primary"
              disabled={applyDisabled}
              onClick={onApply}
            >
              {t('apply')}
            </button>
          </div>
          <div className="item-settings-body">
            <Dialog.Title className="item-settings-title">{title}</Dialog.Title>
            {description && (
              <Dialog.Description className="item-settings-description">
                {description}
              </Dialog.Description>
            )}
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
