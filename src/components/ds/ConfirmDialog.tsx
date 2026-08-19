'use client';

import * as React from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils';
import { buttonVariants } from './Button';

/**
 * Ask before doing something irreversible.
 *
 * Replaces the native `window.confirm()` calls the order surfaces still used.
 * A browser dialog punching through a token-styled takeover is jarring on its
 * own, but the real problem is that it is unstyleable, unreadable in Hebrew
 * (the OS decides its direction, not the app), and gives the destructive and
 * the harmless action identical weight.
 *
 * Built on the shadcn alert-dialog primitive — already installed and already
 * used by the deliveries dispatcher — restyled onto Foody tokens.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Destructive confirmations get the danger button. */
  danger?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  danger,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          className={cn(
            'fixed inset-0 z-[60] bg-black/55 backdrop-blur-[3px]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <AlertDialog.Content
          className={cn(
            // Symmetric insets rather than left:50% + translateX, so the box
            // stays centred in both directions.
            'fixed z-[60] top-1/2 -translate-y-1/2 start-[var(--s-4)] end-[var(--s-4)]',
            'sm:start-[calc(50%-220px)] sm:end-[calc(50%-220px)]',
            'flex flex-col gap-[var(--s-4)] p-[var(--s-5)]',
            'bg-[var(--surface)] text-[var(--fg)]',
            'border border-[var(--line)] rounded-r-lg shadow-3',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        >
          <div className="flex flex-col gap-[var(--s-2)]">
            <AlertDialog.Title className="text-fs-md font-semibold">{title}</AlertDialog.Title>
            {description && (
              <AlertDialog.Description className="text-fs-sm text-[var(--fg-muted)]">
                {description}
              </AlertDialog.Description>
            )}
          </div>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-[var(--s-2)]">
            <AlertDialog.Cancel
              className={cn(buttonVariants({ variant: 'secondary', size: 'md' }), 'justify-center')}
            >
              {cancelLabel}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              onClick={onConfirm}
              className={cn(
                buttonVariants({ variant: danger ? 'danger' : 'primary', size: 'md' }),
                'justify-center',
              )}
            >
              {confirmLabel}
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
