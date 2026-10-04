'use client';

import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';

import { X } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useI18n } from '@/lib/i18n';

/** Shared editable dialog; persistence and unsaved-change decisions belong to its caller. */

export type FormModalProps = {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saveLabel?: string;
  cancelLabel?: string;
  saveDisabled?: boolean;
  saving?: boolean;
  showCancelButton?: boolean;
  sidebar?: React.ReactNode;
  sidebarPosition?: 'left' | 'right';
  stickySidebar?: boolean;
  maxWidthClass?: string;
  children: React.ReactNode;
};

export default function FormModal({
  title,
  onClose,
  onSave,
  saveLabel,
  cancelLabel,
  saveDisabled = false,
  saving = false,
  showCancelButton = true,
  sidebar,
  sidebarPosition = 'right',
  stickySidebar = false,
  maxWidthClass = 'max-w-6xl',
  children,
}: FormModalProps) {
  const focus = useDialogReturnFocus();
  const { t } = useI18n();

  const sidebarNode = sidebar && (
    <div
      className={`hidden lg:block w-72 shrink-0 space-y-4 ${
        stickySidebar ? 'sticky top-0 self-start max-h-[calc(100dvh-12rem)] overflow-y-auto' : ''
      }`}
    >
      {sidebar}
    </div>
  );

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
      {/* The wrapper carries the safe-area insets so the card can simply be
          max-h-full — on a notched phone it never slides under the status bar. */}
      <Dialog.Content {...focus} aria-describedby={undefined} className="fixed inset-3 sm:inset-x-6 sm:inset-y-8 z-50 flex items-center justify-center pointer-events-none focus:outline-none">
        <div
          className={`pointer-events-auto relative bg-[var(--surface)] text-[var(--fg)] rounded-r-xl shadow-3 border border-[var(--line)] w-full ${maxWidthClass} max-h-full overflow-hidden flex flex-col`}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-8 sm:py-6 border-b border-[var(--line)] shrink-0">
            <button
              onClick={onClose}
              aria-label={cancelLabel ?? t('cancel')}
              className="size-10 rounded-xl bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center transition-colors shrink-0"
            >
              <X size={20} className="text-[var(--fg-muted)]" />
            </button>
            <Dialog.Title className="min-w-0 flex-1 text-base sm:text-xl font-semibold text-[var(--fg)] leading-snug">
              {title}
            </Dialog.Title>
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* The X already cancels on mobile — the text button only earns its
                  width from sm: up. */}
              {showCancelButton && (
                <button
                  type="button"
                  onClick={onClose}
                  className="hidden sm:block px-6 py-2.5 text-[var(--fg-muted)] hover:bg-[var(--surface-2)] rounded-lg transition-colors font-medium"
                >
                  {cancelLabel ?? t('cancel')}
                </button>
              )}
              <button
                type="button"
                onClick={onSave}
                disabled={saveDisabled || saving}
                className="px-4 py-2 sm:px-6 sm:py-2.5 bg-[var(--action)] text-[var(--action-fg)] rounded-r-md hover:bg-[var(--action-hover)] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? t('saving') : (saveLabel ?? t('save'))}
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-4 sm:px-8 sm:py-6 flex gap-8">
              {sidebarPosition === 'left' && sidebarNode}
              <div className="flex-1 min-w-0 space-y-5">{children}</div>
              {sidebarPosition === 'right' && sidebarNode}
            </div>
          </div>
        </div>
      </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
