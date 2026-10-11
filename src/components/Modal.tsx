'use client';

import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

const SIZE_CLASS = { md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl', '3xl': 'max-w-3xl', '5xl': 'max-w-6xl h-[90dvh]' };

/** Shared modal with contained scrolling, focus trapping and focus restoration. */
export default function Modal({ title, subtitle, icon, children, footer, bodyClassName = '', onClose, closeDisabled = false, initialFocusRef, size = 'md' }: {
  title: string;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  bodyClassName?: string;
  onClose: () => void;
  /** Keep an in-flight operation visible until its result is known. */
  closeDisabled?: boolean;
  /** Focus target for nested dialogs where native autoFocus runs too early. */
  initialFocusRef?: React.RefObject<HTMLElement>;
  size?: keyof typeof SIZE_CLASS;
}) {
  const focus = useDialogReturnFocus();
  const { t } = useI18n();
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !closeDisabled) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] animate-overlay-in" />
        <Dialog.Content {...focus}
          onOpenAutoFocus={event => { focus.onOpenAutoFocus(event); if (initialFocusRef?.current) { event.preventDefault(); initialFocusRef.current.focus(); } }}
          {...(!subtitle ? { 'aria-describedby': undefined } : {})}
          onInteractOutside={(event) => event.preventDefault()}
          className={`fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem-var(--safe-top)-var(--safe-bottom))] rounded-r-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--fg)] shadow-3 ${SIZE_CLASS[size]}`}
        >
          <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[var(--line)] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {icon && <span aria-hidden className="text-[var(--brand-ink)] shrink-0 [&_svg]:size-5">{icon}</span>}
              <div>
                <Dialog.Title className="text-lg font-semibold leading-snug">{title}</Dialog.Title>
                {subtitle && <Dialog.Description className="text-sm text-[var(--fg-muted)] mt-1">{subtitle}</Dialog.Description>}
              </div>
            </div>
            <Dialog.Close disabled={closeDisabled} className="size-11 shrink-0 grid place-items-center rounded-r-md hover:bg-[var(--surface-2)] text-[var(--fg-muted)] disabled:opacity-50 disabled:cursor-wait" aria-label={t('close')}>
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className={`min-h-0 flex-1 p-5 overflow-y-auto overscroll-contain ${bodyClassName}`}>{children}</div>
          {footer && <div className="px-5 py-4 border-t border-[var(--line)] shrink-0">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
