'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';

/** Item settings dialog with optional locking while an explicit save is pending. */
export function ItemSettingsDialog({
  title,
  description,
  children,
  onApply,
  onClose,
  applyDisabled = false,
  busy = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onApply: () => void | Promise<void>;
  onClose: () => void;
  applyDisabled?: boolean;
  busy?: boolean;
}) {
  const { t, direction } = useI18n();
  const focus = useDialogReturnFocus();
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="item-settings-overlay" />
        <Dialog.Content
          {...focus}
          {...(!description ? { 'aria-describedby': undefined } : {})}
          dir={direction}
          className="item-editor item-settings-dialog"
          aria-busy={busy}
          onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <div className="item-settings-toolbar">
            <Dialog.Close
              className="item-settings-close"
              aria-label={t('cancel')}
              disabled={busy}
            >
              <X size={24} />
            </Dialog.Close>
            <button
              type="button"
              className="item-settings-primary"
              disabled={applyDisabled || busy}
              onClick={() => void onApply()}
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
