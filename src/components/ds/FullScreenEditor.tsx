'use client';

import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';
import { useI18n } from '@/lib/i18n';

export interface FullScreenEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  status?: React.ReactNode;
  saveLabel?: string;
  onSave?: () => void | Promise<void>;
  saveDisabled?: boolean;
  /** Keep an in-flight save visible. */
  closeDisabled?: boolean;
  /** Initial focus inside the editor. */
  initialFocusRef?: React.RefObject<HTMLElement>;
  showCancel?: boolean;
  cancelLabel?: string;
  /** Optional left rail (280px column) — e.g. image + summary. */
  rail?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Specialized workspaces can provide their own contained scrolling panels. */
  bodyClassName?: string;
  contentClassName?: string;
}

/**
 * Full-screen editor — inset modal, 60px head, optional left rail.
 * Used for creating or modifying a record. See DESIGN_MIGRATION.md.
 */
export function FullScreenEditor({
  open,
  onOpenChange,
  title,
  subtitle,
  status,
  saveLabel,
  onSave,
  saveDisabled,
  closeDisabled = false,
  initialFocusRef,
  showCancel = true,
  cancelLabel,
  rail,
  footer,
  children,
  className,
  bodyClassName,
  contentClassName,
}: FullScreenEditorProps) {
  const focus = useDialogReturnFocus();
  const { t } = useI18n();
  return (
    <Dialog.Root open={open} onOpenChange={value => { if (value || !closeDisabled) onOpenChange(value); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content {...focus}
          onOpenAutoFocus={event => { focus.onOpenAutoFocus(event); if(initialFocusRef?.current){event.preventDefault();initialFocusRef.current.focus();} }}
          {...(!subtitle ? { 'aria-describedby': undefined } : {})}
          className={cn(
            // Edge-to-edge fullscreen on mobile, inset modal at md+ via
            // symmetric left/right insets so centering is direction-agnostic.
            // (left:50% + width:calc inverts in RTL — over-constrained CSS
            // makes right: win, and translateX(-50%) shifts off-screen.)
            'fixed z-50 inset-0',
            'md:top-[32px] md:bottom-[24px]',
            'md:left-[24px] md:right-[24px]',
            // Edge-to-edge on mobile means the head would sit under the status
            // bar / notch (viewport-fit=cover) — absorb the insets here.
            'pt-safe-t pb-safe-b',
            'flex flex-col overflow-hidden',
            'bg-[var(--bg)] text-[var(--fg)]',
            'md:border md:border-[var(--line)] md:rounded-r-xl md:shadow-3',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]',
            className,
          )}
        >
          {/* Head — close · title · actions. Cancel button collapses on mobile
              (the X icon already cancels) so the title has room to breathe. */}
          <div
            className={cn(
              'min-h-[64px] py-3 shrink-0 px-[var(--s-4)] md:px-[var(--s-5)]',
              'flex items-center gap-[var(--s-3)] md:gap-[var(--s-4)]',
              'bg-[var(--surface)] border-b border-[var(--line)]',
            )}
          >
            <Dialog.Close asChild>
              <Button variant="ghost" size="lg" disabled={closeDisabled} icon aria-label={t('close')}>
                <X />
              </Button>
            </Dialog.Close>

            <div className="flex-1 text-center min-w-0">
              <Dialog.Title className="text-fs-md font-semibold text-[var(--fg)] leading-snug">
                {title}
              </Dialog.Title>
              {subtitle && (
                <Dialog.Description className="sr-only md:not-sr-only text-fs-xs text-[var(--fg-muted)] leading-snug">
                  {subtitle}
                </Dialog.Description>
              )}
            </div>

            <div className="flex items-center gap-[var(--s-2)] shrink-0">
              {status}
              {showCancel && (
                <Dialog.Close asChild>
                  <Button variant="secondary" size="lg" disabled={closeDisabled} className="hidden md:inline-flex">
                    {cancelLabel ?? t('cancel')}
                  </Button>
                </Dialog.Close>
              )}
              {onSave && (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={onSave}
                  disabled={saveDisabled}
                >
                  <Save /> {saveLabel ?? t('save')}
                </Button>
              )}
            </div>
          </div>

          {/* Body — on mobile the rail stacks above the main content (so the
              image upload + summary stay reachable); on md+ it sits as a
              280px sidebar to the start of the main content. */}
          <div
            className={cn(
              'flex-1 min-h-0',
              rail
                ? 'flex flex-col overflow-y-auto md:grid md:overflow-hidden md:[grid-template-columns:280px_1fr]'
                : 'overflow-y-auto',
              bodyClassName,
            )}
          >
            {rail && (
              <div className="md:border-e border-[var(--line)] md:bg-[var(--surface)] p-[var(--s-4)] md:p-[var(--s-5)] md:overflow-y-auto md:max-w-[280px]">
                {rail}
              </div>
            )}
            <div
              className={cn(
                'p-[var(--s-4)] md:p-[var(--s-6)_var(--s-8)] min-w-0',
                rail && 'md:overflow-y-auto',
                contentClassName,
              )}
            >
              {children}
            </div>
          </div>

          {footer && (
            <div className="border-t border-[var(--line)] bg-[var(--surface)] px-[var(--s-4)] md:px-[var(--s-5)] py-[var(--s-3)] shrink-0">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Section header with 3px brand accent bar — used inside FullScreenEditor bodies. */
export function EditorSectionHead({
  title,
  desc,
  aside,
  className,
}: {
  title: React.ReactNode;
  desc?: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative ps-[var(--s-4)] pb-[var(--s-3)] mb-[var(--s-5)]',
        'border-b border-[var(--line)]',
        'before:absolute before:start-0 before:top-0 before:w-[3px] before:h-[28px]',
        'before:bg-[var(--brand-500)] before:rounded-e-md',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-[var(--s-3)]">
        <h2 className="text-fs-lg font-semibold text-[var(--fg)]">{title}</h2>
        {aside}
      </div>
      {desc && <p className="text-fs-xs text-[var(--fg-muted)] mt-1">{desc}</p>}
    </div>
  );
}
