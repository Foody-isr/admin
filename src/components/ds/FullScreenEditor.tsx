'use client';

import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

export interface FullScreenEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  status?: React.ReactNode;
  saveLabel?: string;
  onSave?: () => void | Promise<void>;
  saveDisabled?: boolean;
  showCancel?: boolean;
  cancelLabel?: string;
  /** Optional left rail (280px column) — e.g. image + summary. */
  rail?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
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
  saveLabel = 'Enregistrer',
  onSave,
  saveDisabled,
  showCancel = true,
  cancelLabel = 'Annuler',
  rail,
  footer,
  children,
  className,
}: FullScreenEditorProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className={cn(
            // Horizontally centered via transform — immune to scrollbar-gutter
            // reservation that Radix applies to <html> on open (which made
            // inset-x anchoring look ~scrollbar-width off-center to the right).
            'fixed z-50 top-[32px] bottom-[24px]',
            'left-1/2 -translate-x-1/2',
            'w-[calc(100%-48px)]',
            'flex flex-col overflow-hidden',
            'bg-[var(--bg)] text-[var(--fg)]',
            'border border-[var(--line)] rounded-r-xl shadow-3',
            'focus:outline-none',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]',
            className,
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Head — close · title · actions */}
          <div
            className={cn(
              'h-[60px] shrink-0 px-[var(--s-5)]',
              'flex items-center gap-[var(--s-4)]',
              'bg-[var(--surface)] border-b border-[var(--line)]',
            )}
          >
            <Dialog.Close asChild>
              <Button variant="ghost" size="md" icon aria-label="Fermer">
                <X />
              </Button>
            </Dialog.Close>

            <div className="flex-1 text-center min-w-0">
              <Dialog.Title className="text-fs-md font-semibold text-[var(--fg)] truncate">
                {title}
              </Dialog.Title>
              {subtitle && (
                <Dialog.Description className="text-fs-xs text-[var(--fg-subtle)] truncate">
                  {subtitle}
                </Dialog.Description>
              )}
            </div>

            <div className="flex items-center gap-[var(--s-2)] shrink-0">
              {status}
              {showCancel && (
                <Dialog.Close asChild>
                  <Button variant="secondary" size="sm">
                    {cancelLabel}
                  </Button>
                </Dialog.Close>
              )}
              {onSave && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onSave}
                  disabled={saveDisabled}
                >
                  <Save /> {saveLabel}
                </Button>
              )}
            </div>
          </div>

          {/* Body — optional 280px rail + scrollable main */}
          <div
            className="flex-1 grid overflow-hidden min-h-0"
            style={{ gridTemplateColumns: rail ? '280px 1fr' : '1fr' }}
          >
            {rail && (
              <div className="border-r border-[var(--line)] bg-[var(--surface)] p-[var(--s-5)] overflow-y-auto">
                {rail}
              </div>
            )}
            <div className="overflow-y-auto p-[var(--s-6)_var(--s-8)] min-w-0">
              {children}
            </div>
          </div>

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
