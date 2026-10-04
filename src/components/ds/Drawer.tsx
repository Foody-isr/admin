'use client';

import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { useI18n } from '@/lib/i18n';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** px width of the drawer. Defaults to 720. */
  width?: number;
  /** Primary action button in the head. Falls back to onSave/saveLabel combo. */
  primaryAction?: React.ReactNode;
  onSave?: () => void | Promise<void>;
  saveLabel?: string;
  saveDisabled?: boolean;
  /** Prevent dismissing an in-flight mutation. */
  closeDisabled?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Focus target after this drawer has entered the dialog stack. */
  initialFocusRef?: React.RefObject<HTMLElement>;
  /** Additional layout for specialized drawer content, such as a chat composer. */
  bodyClassName?: string;
}

/**
 * Drawer anchored to the reading direction’s end — used for "view + quick actions" patterns.
 * See DESIGN_MIGRATION.md for the when-to-use-this-vs-FullScreenEditor rules.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  subtitle,
  width = 720,
  primaryAction,
  onSave,
  saveLabel,
  saveDisabled,
  closeDisabled = false,
  footer,
  children,
  className,
  bodyClassName,
  initialFocusRef,
}: DrawerProps) {
  const focus = useDialogReturnFocus();
  const { t, direction } = useI18n();
  return (
    <Dialog.Root open={open} onOpenChange={value => { if (value || !closeDisabled) onOpenChange(value); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-[var(--overlay)]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <Dialog.Content {...focus}
          onOpenAutoFocus={event => { focus.onOpenAutoFocus(event); if (initialFocusRef?.current) { event.preventDefault(); initialFocusRef.current.focus(); } }}
          {...(!subtitle ? { 'aria-describedby': undefined } : {})}
          className={cn(
            'fixed z-50 top-0 bottom-0 end-0 max-w-full',
            // Full-height overlay — absorb the device insets (viewport-fit=cover).
            'pt-safe-t pb-safe-b',
            'flex flex-col',
            'bg-[var(--bg)] text-[var(--fg)]',
            'border-s border-[var(--line)] shadow-3',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            direction === 'rtl' ? 'data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left' : 'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
            className,
          )}
          style={{ width }}
        >
          {/* Head */}
          <div className="min-h-[64px] py-3 shrink-0 px-[var(--s-5)] flex items-center gap-[var(--s-4)] bg-[var(--surface)] border-b border-[var(--line)]">
            <Dialog.Close asChild>
              <Button variant="ghost" size="lg" icon disabled={closeDisabled} aria-label={t('close')}>
                <X />
              </Button>
            </Dialog.Close>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-fs-md font-semibold text-[var(--fg)] leading-snug">
                {title}
              </Dialog.Title>
              {subtitle && (
                <Dialog.Description className="text-fs-xs text-[var(--fg-muted)] leading-snug">
                  {subtitle}
                </Dialog.Description>
              )}
            </div>
            {primaryAction ||
              (onSave && (
                <Button
                  className="hidden sm:inline-flex"
                  variant="primary"
                  size="sm"
                  onClick={onSave}
                  disabled={saveDisabled}
                >
                  {saveLabel ?? t('save')}
                </Button>
              ))}
          </div>

          {/* Body */}
          <div className={cn("min-h-0 flex-1 overflow-auto p-[var(--s-5)]", bodyClassName)}>{children}</div>

          {onSave && !primaryAction && (
            <div className="shrink-0 border-t border-[var(--line)] bg-[var(--surface)] p-4 sm:hidden">
              <Button variant="primary" className="w-full" onClick={onSave} disabled={saveDisabled}>{saveLabel ?? t('save')}</Button>
            </div>
          )}
          {footer && (
            <div className="border-t border-[var(--line)] bg-[var(--surface)] px-[var(--s-5)] py-[var(--s-3)] shrink-0">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
